// Brain (MRI): a labelled MRI slice viewer, shown over the 3D viewer like the
// Visual Pathway diagram. Data from tools/extract-brain-mri.py:
//   models/brain-mri/{cor,sag,ax}/NNN.jpg     the slices
//   models/brain-mri/{cor,sag,ax}.json.gz     per slice, the outlined structures
// The dock at the bottom works like the Sliceable Brain's: pick the plane,
// drag the slider. Labels can be turned off; with them on, hovering (or
// tapping) a coloured region names it.

const NS = 'http://www.w3.org/2000/svg';

// The slider runs like the Sliceable Brain's: right = anterior / patient's
// left / superior. The files run front-to-back (coronal) and top-to-bottom
// (axial), so those two are reversed.
const PLANES = [
  { id: 'cor', label: 'Coronal', title: 'Coronal: front / back', icon: 'M12 4v16', reverse: true },
  { id: 'sag', label: 'Sagittal', title: 'Sagittal: left / right', icon: 'M6 15 18 9', reverse: false },
  { id: 'ax', label: 'Transverse', title: 'Transverse: top / bottom', icon: 'M4 12h16', reverse: true },
];

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
      <svg class="mri-svg" role="img" aria-label="MRI slice"></svg>
      <div class="mri-tip" hidden></div>
      <p class="mri-status" aria-live="polite">Loading the scan…</p>
    </div>
    <div class="mri-dock" role="group" aria-label="MRI slices">
      <div class="dock-row">
        <div class="dock-seg mri-planes" role="group" aria-label="Plane">
          ${PLANES.map((p, i) => `<button type="button" data-plane="${p.id}" aria-pressed="${i === 0}" title="${p.title}"><svg class="plane-ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="${p.icon}"/></svg><span>${p.label}</span></button>`).join('')}
        </div>
        <button type="button" class="mri-labels" aria-pressed="true" title="Show or hide the labelled structures">Labels</button>
      </div>
      <div class="dock-row">
        <input type="range" class="mri-pos" min="0" max="0" value="0" aria-label="Slice">
        <output class="mri-pos-val"></output>
      </div>
    </div>
    <p class="mri-credit"></p>`;
  const svg = host.querySelector('.mri-svg');
  const tip = host.querySelector('.mri-tip');
  const status = host.querySelector('.mri-status');
  const pos = host.querySelector('.mri-pos');
  const posVal = host.querySelector('.mri-pos-val');
  const labelsBtn = host.querySelector('.mri-labels');
  host.querySelector('.mri-credit').textContent = credit;

  const cache = {};          // plane id -> data (or a promise of it)
  const state = { plane: 'cor', index: {}, labels: true };
  let alive = true;
  let hovered = null;

  const planeOf = id => PLANES.find(p => p.id === id);
  // slider value <-> slice index (0-based, file order)
  const toSlice = (p, v, n) => (p.reverse ? n - 1 - v : v);

  function load(id) {
    if (!cache[id]) {
      cache[id] = fetchJson(`${base}${id}.json.gz`).then(d => (cache[id] = d));
      cache[id].catch(() => { delete cache[id]; });
    }
    return Promise.resolve(cache[id]);
  }

  function draw() {
    const d = cache[state.plane];
    if (!d || d instanceof Promise) return;
    const p = planeOf(state.plane);
    const n = d.slices.length;
    const v = state.index[state.plane] ?? Math.floor(n / 2);
    pos.max = String(n - 1);
    pos.value = String(v);
    const k = toSlice(p, v, n);
    posVal.textContent = `${v + 1} / ${n}`;
    svg.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`);
    svg.textContent = '';
    el('image', { href: `${base}${state.plane}/${String(k + 1).padStart(3, '0')}.jpg`, width: d.w, height: d.h }, svg);
    if (state.labels) {
      for (const [li, parts] of d.slices[k]) {
        const g = el('g', { class: 'mri-st', 'data-name': d.names[li] }, svg);
        for (const [kind, color, val, path] of parts) {
          if (kind === 'f') el('path', { d: path, fill: `#${color}`, 'fill-opacity': val }, g);
          else el('path', { d: path, fill: 'none', stroke: `#${color}`, 'stroke-width': val }, g);
        }
      }
    }
    hovered = null;
    hideTip();
    // Warm up the neighbouring slices so dragging stays smooth.
    for (const dv of [-2, -1, 1, 2]) {
      const kk = toSlice(p, Math.min(n - 1, Math.max(0, v + dv)), n);
      new Image().src = `${base}${state.plane}/${String(kk + 1).padStart(3, '0')}.jpg`;
    }
  }

  async function setPlane(id) {
    state.plane = id;
    host.querySelectorAll('[data-plane]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.plane === id)));
    if (!cache[id] || cache[id] instanceof Promise) {
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

  svg.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const g = e.target.closest?.('g.mri-st');
    highlight(g);
    if (g) showTip(g.dataset.name, e.clientX, e.clientY); else hideTip();
  });
  svg.addEventListener('pointerleave', () => { highlight(null); hideTip(); });
  // Touch: tap a region to name it; tap elsewhere to clear.
  svg.addEventListener('click', e => {
    const g = e.target.closest?.('g.mri-st');
    highlight(g);
    if (g) showTip(g.dataset.name, e.clientX, e.clientY); else hideTip();
  });

  pos.addEventListener('input', () => { state.index[state.plane] = Number(pos.value); draw(); });
  host.querySelectorAll('[data-plane]').forEach(b => b.addEventListener('click', () => setPlane(b.dataset.plane)));
  labelsBtn.addEventListener('click', () => {
    state.labels = !state.labels;
    labelsBtn.setAttribute('aria-pressed', String(state.labels));
    draw();
  });

  // The first plane, then the other two in the background.
  setPlane(state.plane).then(() => {
    if (alive) PLANES.forEach(p => load(p.id).catch(() => {}));
  });

  return { destroy() { alive = false; host.innerHTML = ''; } };
}
