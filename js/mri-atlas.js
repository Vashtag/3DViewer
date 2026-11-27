// Brain (MRI): a labelled MRI slice viewer, shown over the 3D viewer like the
// Visual Pathway diagram. Data from tools/extract-brain-mri.py:
//   models/brain-mri/{cor,sag,ax}/NNN.jpg     the slices
//   models/brain-mri/{cor,sag,ax}.json.gz     per slice, the outlined structures
// The dock at the bottom works like the Brain (3D)'s: pick the plane,
// drag the slider. Labels can be turned off; with them on, hovering (or
// tapping) a coloured region names it.
//
// "All views" shows the transverse, sagittal and coronal slices side by side
// with coloured lines where the other two planes cut. Clicking a point moves
// the other two views to the slices through it; clicking a structure also
// picks it, so only that structure is outlined, in all three views.

const NS = 'http://www.w3.org/2000/svg';

// The slider runs like the Brain (3D)'s: right = anterior / patient's
// left / superior. The files run front-to-back (coronal) and top-to-bottom
// (axial), so those two are reversed.
const PLANES = [
  { id: 'cor', label: 'Coronal', title: 'Coronal: front / back', icon: 'M12 4v16', reverse: true, color: '#f2d14b' },
  { id: 'sag', label: 'Sagittal', title: 'Sagittal: left / right', icon: 'M6 15 18 9', reverse: false, color: '#3fd0e0' },
  { id: 'ax', label: 'Transverse', title: 'Transverse: top / bottom', icon: 'M4 12h16', reverse: true, color: '#ff6a5c' },
];
const PANEL_ORDER = ['ax', 'sag', 'cor']; // as in the original viewer

// Where each plane's slice k (0-based, file order) falls in the other two
// planes' images (pixels). Measured from the scan itself: the sagittal and
// left-right lines match exactly; the others to within half a pixel.
const MAP = {
  sag: { ax: ['x', -4, 319], cor: ['x', -4, 319] },
  cor: { ax: ['y', 2.99533, 87.956], sag: ['x', 3, 87] },
  ax: { cor: ['y', 2.98864, 91.061], sag: ['y', 3, 90] },
};

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  let buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] === 0x1f && buf[1] === 0x8b) { // gzip, unless the server already unpacked it
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    buf = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return JSON.parse(new TextDecoder().decode(buf));
}

const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  parent?.appendChild(e);
  return e;
};

export function mountMriAtlas(host, { base = 'models/brain-mri/', credit = '' } = {}) {
  host.innerHTML = `
    <div class="mri-stage">
      <div class="mri-views">
        ${PANEL_ORDER.map(id => {
          const p = PLANES.find(x => x.id === id);
          return `<figure class="mri-view" data-view="${id}" style="--plane:${p.color}"><figcaption><span class="mri-view-name">${p.label}</span> <span class="mri-view-n"></span></figcaption><svg class="mri-svg" role="img" aria-label="${p.label} MRI slice"></svg></figure>`;
        }).join('')}
      </div>
      <div class="mri-tip" hidden></div>
      <button type="button" class="mri-picked" hidden title="Show all structures again"></button>
      <p class="mri-status" aria-live="polite">Loading the scan…</p>
    </div>
    <div class="mri-dock" role="group" aria-label="MRI slices">
      <div class="dock-row">
        <div class="dock-seg mri-planes" role="group" aria-label="Plane">
          ${PLANES.map((p, i) => `<button type="button" data-plane="${p.id}" aria-pressed="${i === 0}" title="${p.title}"><svg class="plane-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="${p.icon}"/></svg><span>${p.label}</span></button>`).join('')}
        </div>
        <button type="button" class="mri-labels" aria-pressed="true" title="Show or hide the labelled structures">Labels</button>
        <button type="button" class="mri-all" aria-pressed="false" title="Show all three planes; click a structure to see it in each">All views</button>
      </div>
      <div class="dock-row">
        <input type="range" class="mri-pos" min="0" max="0" value="0" aria-label="Slice">
        <output class="mri-pos-val"></output>
        <button type="button" class="mri-sweep" aria-pressed="false" title="Play through the slices">Sweep</button>
      </div>
    </div>
    <p class="mri-credit"></p>`;
  const views = host.querySelector('.mri-views');
  const svgs = Object.fromEntries(PANEL_ORDER.map(id => [id, host.querySelector(`[data-view="${id}"] svg`)]));
  const tip = host.querySelector('.mri-tip');
  const status = host.querySelector('.mri-status');
  const pos = host.querySelector('.mri-pos');
  const posVal = host.querySelector('.mri-pos-val');
  const labelsBtn = host.querySelector('.mri-labels');
  const allBtn = host.querySelector('.mri-all');
  const pickedBtn = host.querySelector('.mri-picked');
  host.querySelector('.mri-credit').textContent = credit;
  // Keep the views clear of the dock, however tall it wraps (phones).
  const dock = host.querySelector('.mri-dock');
  const fitDock = () => host.style.setProperty('--mri-dock', `${dock.offsetHeight + (parseFloat(getComputedStyle(dock).bottom) || 0) + 8}px`);
  const dockObs = new ResizeObserver(fitDock);
  dockObs.observe(dock);
  fitDock();

  const cache = {};          // plane id -> data (or a promise of it)
  const state = { plane: 'cor', index: {}, labels: true, all: false, picked: null };
  let alive = true;
  let hovered = null;

  const planeOf = id => PLANES.find(p => p.id === id);
  const ready = id => cache[id] && !(cache[id] instanceof Promise);
  // slider value <-> slice index (0-based, file order)
  const count = id => cache[id].slices.length;
  const sliderOf = id => state.index[id] ?? Math.floor(count(id) / 2);
  const sliceOf = id => (planeOf(id).reverse ? count(id) - 1 - sliderOf(id) : sliderOf(id));
  const setSlice = (id, k) => {
    const n = count(id); k = Math.max(0, Math.min(n - 1, Math.round(k)));
    state.index[id] = planeOf(id).reverse ? n - 1 - k : k;
  };

  function load(id) {
    if (!cache[id]) {
      cache[id] = fetchJson(`${base}${id}.json.gz`).then(d => (cache[id] = d));
      cache[id].catch(() => { delete cache[id]; });
    }
    return Promise.resolve(cache[id]);
  }
  const jpg = (id, k) => `${base}${id}/${String(k + 1).padStart(3, '0')}.jpg`;

  // Draws one view. The picture and outlines are rebuilt only when that view's
  // slice (or what is shown) changed; the crosshair lines are always updated.
  function drawView(id) {
    if (!ready(id)) return;
    const d = cache[id], svg = svgs[id];
    const k = sliceOf(id);
    const key = `${k}|${state.labels}|${state.picked}`;
    if (svg.dataset.key !== key) {
      svg.dataset.key = key;
      svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`);
      svg.textContent = '';
      el('image', { href: jpg(id, k), width: d.w, height: d.h }, svg);
      if (state.labels) {
        for (const [li, parts] of d.slices[k]) {
          const name = d.names[li];
          if (state.picked && name !== state.picked) continue;
          const g = el('g', { class: 'mri-st' + (state.picked ? ' picked' : ''), 'data-name': name }, svg);
          for (const [kind, color, val, path] of parts) {
            if (kind === 'f') el('path', { d: path, fill: `#${color}`, 'fill-opacity': val }, g);
            else el('path', { d: path, fill: 'none', stroke: `#${color}`, 'stroke-width': val }, g);
          }
        }
      }
      el('g', { class: 'mri-crosses' }, svg);
      // Warm up the neighbouring slices so dragging stays smooth.
      for (const dk of [-2, -1, 1, 2]) new Image().src = jpg(id, Math.min(count(id) - 1, Math.max(0, k + dk)));
    }
    // Where the other two planes cut this one.
    const crosses = svg.querySelector('.mri-crosses');
    crosses.textContent = '';
    if (state.all) {
      for (const other of PANEL_ORDER) {
        if (other === id || !ready(other)) continue;
        const [axis, a, b] = MAP[other][id];
        const v = a * sliceOf(other) + b;
        const c = planeOf(other).color;
        if (axis === 'x') el('line', { x1: v, y1: 0, x2: v, y2: d.h, stroke: c, class: 'mri-cross' }, crosses);
        else el('line', { x1: 0, y1: v, x2: d.w, y2: v, stroke: c, class: 'mri-cross' }, crosses);
      }
    }
    const n = count(id);
    host.querySelector(`[data-view="${id}"] .mri-view-n`).textContent = `${sliderOf(id) + 1} / ${n}`;
  }

  function draw() {
    if (!ready(state.plane)) return;
    views.classList.toggle('all', state.all);
    host.querySelectorAll('.mri-view').forEach(f => {
      f.hidden = !state.all && f.dataset.view !== state.plane;
      f.classList.toggle('active', state.all && f.dataset.view === state.plane);
    });
    for (const id of PANEL_ORDER) if (state.all || id === state.plane) drawView(id);
    const n = count(state.plane);
    pos.max = String(n - 1);
    pos.value = String(sliderOf(state.plane));
    posVal.textContent = `${sliderOf(state.plane) + 1} / ${n}`;
    pickedBtn.hidden = !state.picked;
    if (state.picked) pickedBtn.textContent = `${state.picked}  ✕`;
    hovered = null;
    hideTip();
  }

  async function setPlane(id) {
    state.plane = id;
    host.querySelectorAll('[data-plane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plane === id)));
    if (!ready(id)) {
      status.hidden = false;
      status.textContent = 'Loading the scan…';
      try { await load(id); } catch (e) {
        if (alive) status.textContent = 'Could not load the scan. Check your connection and try again.';
        return;
      }
      if (!alive || state.plane !== id) return;
    }
    status.hidden = true;
    draw();
  }

  async function setAll(on) {
    state.all = on;
    allBtn.setAttribute('aria-pressed', String(on));
    if (!on) state.picked = null;
    if (on) {
      status.hidden = false; status.textContent = 'Loading the scan…';
      try { await Promise.all(PLANES.map(p => load(p.id))); } catch (e) {
        if (alive) status.textContent = 'Could not load the scan. Check your connection and try again.';
        return;
      }
      if (!alive) return;
      status.hidden = true;
    }
    draw();
  }

  function showTip(name, x, y) {
    const r = host.querySelector('.mri-stage').getBoundingClientRect();
    tip.hidden = false;
    tip.textContent = name;
    tip.style.left = `${x - r.left}px`;
    tip.style.top = `${y - r.top}px`;
  }
  function hideTip() { tip.hidden = true; }
  function highlight(g) {
    if (hovered === g) return;
    hovered?.classList.remove('hl');
    hovered = g;
    g?.classList.add('hl');
  }

  for (const id of PANEL_ORDER) {
    const svg = svgs[id];
    svg.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const g = e.target.closest?.('g.mri-st');
      highlight(g);
      if (g) showTip(g.dataset.name, e.clientX, e.clientY); else hideTip();
    });
    svg.addEventListener('pointerleave', () => { highlight(null); hideTip(); });
    svg.addEventListener('click', e => {
      const g = e.target.closest?.('g.mri-st');
      if (!state.all) { // one view: tap a region to name it
        highlight(g);
        if (g) showTip(g.dataset.name, e.clientX, e.clientY); else hideTip();
        return;
      }
      // All views: move the other two planes through the clicked point, and
      // pick the structure under it (or show everything again).
      setSweep(false);
      const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(svg.getScreenCTM().inverse());
      for (const other of PANEL_ORDER) {
        if (other === id || !ready(other)) continue;
        const [axis, a, b] = MAP[other][id];
        setSlice(other, ((axis === 'x' ? p.x : p.y) - b) / a);
      }
      state.picked = g ? g.dataset.name : null;
      state.plane = id;
      host.querySelectorAll('[data-plane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plane === id)));
      draw();
      if (g) showTip(g.dataset.name, e.clientX, e.clientY);
    });
  }

  // In All views the mouse wheel over a view scrubs it; that view becomes the
  // one the dock controls.
  function scrubView(id, v) {
    if (!ready(id)) return;
    setSweep(false);
    state.index[id] = Math.max(0, Math.min(count(id) - 1, v));
    if (state.plane !== id) {
      state.plane = id;
      host.querySelectorAll('[data-plane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plane === id)));
    }
    draw();
  }
  for (const id of PANEL_ORDER) {
    svgs[id].addEventListener('wheel', e => {
      if (!state.all || !ready(id)) return;
      e.preventDefault();
      scrubView(id, sliderOf(id) + (e.deltaY > 0 ? -1 : 1));
    }, { passive: false });
  }

  // Sweep: one pass from here to the end in about 6 s (from the start if
  // already at the end), like the Brain (3D) slice dock. Any manual change stops it.
  const sweepBtn = host.querySelector('.mri-sweep');
  let sweep = null;
  function setSweep(on) {
    if (sweep) cancelAnimationFrame(sweep.raf);
    sweep = null;
    sweepBtn.setAttribute('aria-pressed', String(on));
    if (!on || !ready(state.plane)) { sweepBtn.setAttribute('aria-pressed', 'false'); return; }
    const id = state.plane, n = count(id);
    let v = sliderOf(id);
    if (v >= n - 1) v = 0;
    const s0 = { v, t0: performance.now(), raf: 0 };
    sweep = s0;
    const step = now => {
      if (sweep !== s0 || !alive) return;
      const nv = Math.min(n - 1, Math.floor(s0.v + ((now - s0.t0) / 6000) * n));
      if (nv !== state.index[id]) { state.index[id] = nv; draw(); }
      if (nv >= n - 1) { setSweep(false); return; }
      s0.raf = requestAnimationFrame(step);
    };
    state.index[id] = v; draw();
    s0.raf = requestAnimationFrame(step);
  }
  sweepBtn.addEventListener('click', () => setSweep(!sweep));
  pos.addEventListener('input', () => { setSweep(false); state.index[state.plane] = Number(pos.value); draw(); });
  host.querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', () => { setSweep(false); setPlane(b.dataset.plane); }));
  labelsBtn.addEventListener('click', () => {
    state.labels = !state.labels;
    labelsBtn.setAttribute('aria-pressed', String(state.labels));
    draw();
  });
  allBtn.addEventListener('click', () => { setSweep(false); setAll(!state.all); });
  pickedBtn.addEventListener('click', () => { state.picked = null; draw(); });

  // The first plane, then the other two in the background.
  setPlane(state.plane).then(() => {
    if (alive) PLANES.forEach(p => load(p.id).catch(() => {}));
  });

  return { destroy() { alive = false; setSweep(false); dockObs.disconnect(); host.innerHTML = ''; } };
}
