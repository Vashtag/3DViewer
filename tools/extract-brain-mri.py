#!/usr/bin/env python3
"""Extract the labelled brain MRI from the old Flash viewer (Brain_MRI.swf).

The SWF holds a T1 head MRI in three planes (129 axial, 133 coronal, 80
sagittal slices, as JPEGs) and, for every slice, hand-traced outlines of 92
named structures (one timeline per structure, its instance name giving the
structure, e.g. "corPutamen"). This reads the file as data (no Flash player)
and writes, for models/brain-mri/:

  {ax,cor,sag}/NNN.jpg        the slices, as stored in the SWF
  {ax,cor,sag}.json.gz        per slice: the structures on it, as SVG paths in
                              the slice image's own pixel coordinates

  python3 tools/extract-brain-mri.py Brain_MRI.swf models/brain-mri

Source credit (keep with the data): images and outlines bmy (c)
headneckbrainspine.com; scan from OASIS (oasis-brains.org).
"""
import gzip, json, os, re, struct, sys, zlib

# ── SWF container and tags ────────────────────────────────────────────────
def load(path):
    raw = open(path, 'rb').read()
    sig = raw[:3]
    if sig == b'FWS': return raw[8:]
    if sig == b'CWS': return zlib.decompress(raw[8:])
    raise SystemExit('Unsupported SWF (%r)' % sig)

def rect_len(b, pos):
    return (5 + 4 * (b[pos] >> 3) + 7) // 8

def tags(b, pos, end):
    while pos < end:
        cl = struct.unpack('<H', b[pos:pos + 2])[0]; pos += 2
        code, ln = cl >> 6, cl & 0x3f
        if ln == 0x3f: ln = struct.unpack('<I', b[pos:pos + 4])[0]; pos += 4
        yield code, b[pos:pos + ln]
        pos += ln
        if code == 0: break

class Bits:
    def __init__(s, b, pos=0): s.b, s.byte, s.bit = b, pos, 0
    def u(s, n):
        v = 0
        for _ in range(n):
            v = (v << 1) | ((s.b[s.byte] >> (7 - s.bit)) & 1); s.bit += 1
            if s.bit == 8: s.bit = 0; s.byte += 1
        return v
    def sgn(s, n):
        v = s.u(n); return v - (1 << n) if n and v & (1 << (n - 1)) else v
    def align(s):
        if s.bit: s.bit = 0; s.byte += 1
    def u8(s): s.align(); v = s.b[s.byte]; s.byte += 1; return v
    def u16(s): s.align(); v = struct.unpack('<H', s.b[s.byte:s.byte + 2])[0]; s.byte += 2; return v

def rect(bt):
    n = bt.u(5); r = [bt.sgn(n) for _ in range(4)]; bt.align(); return r

# Matrices as (a, b, c, d, tx, ty): x' = a x + c y + tx, y' = b x + d y + ty.
def matrix(bt):
    a = d = 1.0; b = c = 0.0
    if bt.u(1): n = bt.u(5); a = bt.sgn(n) / 65536; d = bt.sgn(n) / 65536
    if bt.u(1): n = bt.u(5); b = bt.sgn(n) / 65536; c = bt.sgn(n) / 65536
    n = bt.u(5); tx = bt.sgn(n); ty = bt.sgn(n); bt.align()
    return (a, b, c, d, tx, ty)
def mul(m, n):  # m ∘ n
    a, b, c, d, e, f = m; A, B, C, D, E, F = n
    return (a * A + c * B, b * A + d * B, a * C + c * D, b * C + d * D, a * E + c * F + e, b * E + d * F + f)
def inv(m):
    a, b, c, d, e, f = m; det = a * d - b * c
    return (d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det)
def ap(m, x, y): return (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
I = (1, 0, 0, 1, 0, 0)

# ── Shapes ────────────────────────────────────────────────────────────────
def parse_shape(code, d):
    bt = Bits(d, 2); rect(bt)
    if code == 83: rect(bt); bt.u8()
    alpha = code in (32, 83)
    def styles():
        fills = []; n = bt.u8()
        if n == 0xff: n = bt.u16()
        for _ in range(n):
            t = bt.u8()
            if t == 0:
                c = d[bt.byte:bt.byte + (4 if alpha else 3)]; bt.byte += 4 if alpha else 3
                fills.append(('solid', c[:3].hex(), round(c[3] / 255, 2) if alpha else 1))
            elif t in (0x10, 0x12, 0x13):
                matrix(bt); g = d[bt.byte]; bt.byte += 1; first = None
                for _ in range(g & 15):
                    c = d[bt.byte + 1:bt.byte + 1 + (4 if alpha else 3)]; bt.byte += 1 + (4 if alpha else 3)
                    first = first or c[:3].hex()
                if t == 0x13: bt.byte += 2
                fills.append(('solid', first or '888888', 1))
            elif t in (0x40, 0x41, 0x42, 0x43):
                bid = bt.u16(); fills.append(('bitmap', bid, matrix(bt)))
            else: raise ValueError('fill type %x' % t)
        lines = []; n = bt.u8()
        if n == 0xff: n = bt.u16()
        for _ in range(n):
            w = bt.u16()
            if code == 83:
                f1 = bt.u8(); f2 = bt.u8()
                if (f1 >> 4) & 3 == 2: bt.u16()
                if f2 & 0x08: raise ValueError('filled line')
                c = d[bt.byte:bt.byte + 4]; bt.byte += 4
            else:
                c = d[bt.byte:bt.byte + (4 if alpha else 3)]; bt.byte += 4 if alpha else 3
            lines.append((w, c[:3].hex(), round(c[3] / 255, 2) if len(c) > 3 else 1))
        return fills, lines, bt.u(4), bt.u(4)
    fills, lines, nf, nl = styles()
    allf, alll = list(fills), list(lines)
    fe, le = {}, {}
    x = y = 0; f0 = f1 = ln = 0; fo = lo = 0
    while True:
        if bt.u(1) == 0:
            fl = bt.u(5)
            if fl == 0: break
            if fl & 1: n = bt.u(5); x = bt.sgn(n); y = bt.sgn(n)
            if fl & 2: f0 = bt.u(nf); f0 = f0 + fo if f0 else 0
            if fl & 4: f1 = bt.u(nf); f1 = f1 + fo if f1 else 0
            if fl & 8: ln = bt.u(nl); ln = ln + lo if ln else 0
            if fl & 16:
                fo, lo = len(allf), len(alll)
                a, b, nf, nl = styles(); allf += a; alll += b
        else:
            if bt.u(1):
                n = bt.u(4) + 2
                if bt.u(1): dx = bt.sgn(n); dy = bt.sgn(n)
                elif bt.u(1): dx = 0; dy = bt.sgn(n)
                else: dx = bt.sgn(n); dy = 0
                e = ((x, y), None, (x + dx, y + dy))
            else:
                n = bt.u(4) + 2
                cx = x + bt.sgn(n); cy = y + bt.sgn(n); ax = cx + bt.sgn(n); ay = cy + bt.sgn(n)
                e = ((x, y), (cx, cy), (ax, ay))
            if f1: fe.setdefault(f1, []).append(e)
            if f0: fe.setdefault(f0, []).append((e[2], e[1], e[0]))
            if ln: le.setdefault(ln, []).append(e)
            x, y = e[2]
    return allf, alll, fe, le

def fmt(v): return ('%.1f' % v).rstrip('0').rstrip('.')
def path_d(edges, m, closed):
    """Edges -> SVG path data in the target space (m applied)."""
    starts = {}
    for i, e in enumerate(edges): starts.setdefault(e[0], []).append(i)
    used = [False] * len(edges); out = []
    def P(p): q = ap(m, *p); return fmt(q[0]) + ' ' + fmt(q[1])
    for i in range(len(edges)):
        if used[i]: continue
        used[i] = True; cur = edges[i]; seg = ['M' + P(cur[0])]
        while True:
            seg.append(('Q' + P(cur[1]) + ' ' + P(cur[2])) if cur[1] else ('L' + P(cur[2])))
            nxt = next((j for j in starts.get(cur[2], []) if not used[j]), None)
            if nxt is None: break
            used[nxt] = True; cur = edges[nxt]
        out.append(''.join(seg) + ('Z' if closed else ''))
    return ''.join(out)

# ── Timelines ─────────────────────────────────────────────────────────────
class SWF:
    def __init__(s, body):
        s.body = body; s.chars = {}
        pos = rect_len(body, 0) + 4
        for code, d in tags(body, pos, len(body)):
            if len(d) < 2: continue
            cid = struct.unpack('<H', d[:2])[0]
            if code in (2, 22, 32, 83): s.chars[cid] = ('shape', code, d)
            elif code == 39: s.chars[cid] = ('sprite', d)
            elif code == 21:
                jpg = d[2:]
                if jpg[:4] == b'\xff\xd9\xff\xd8': jpg = jpg[4:]
                s.chars[cid] = ('jpeg', jpg)
        s.shapes = {}
    def nframes(s, sid):
        d = s.chars[sid][1]; return sum(1 for c, _ in tags(d, 4, len(d)) if c == 1)
    def display(s, sid, frame):
        d = s.chars[sid][1]; dl = {}; f = 0
        for code, t in tags(d, 4, len(d)):
            if code == 1:
                if f == frame: break
                f += 1; continue
            if code == 26:
                bt = Bits(t, 0); fl = bt.u8(); depth = bt.u16()
                cid = bt.u16() if fl & 0x02 else None
                m = matrix(bt) if fl & 0x04 else None
                if fl & 0x08:  # colour transform: skip
                    ha, hm = bt.u(1), bt.u(1); n = bt.u(4)
                    for _ in range((4 if hm else 0) + (4 if ha else 0)): bt.sgn(n)
                    bt.align()
                if fl & 0x10: bt.u16()
                name = None
                if fl & 0x20:
                    e = t.index(b'\0', bt.byte); name = t[bt.byte:e].decode('latin1')
                old = dl.get(depth)
                if fl & 0x01 and old: dl[depth] = (cid or old[0], m or old[1], name or old[2])
                else: dl[depth] = (cid, m or I, name)
            elif code == 28: dl.pop(struct.unpack('<H', t[:2])[0], None)
        return dl
    def shape(s, cid):
        if cid not in s.shapes:
            _, code, d = s.chars[cid]
            try: s.shapes[cid] = parse_shape(code, d)
            except Exception: s.shapes[cid] = None
        return s.shapes[cid]
    def collect(s, cid, frame, m, out):
        """Walk a character at `frame`, appending ('shape', cid, matrix) leaves."""
        k = s.chars.get(cid)
        if not k: return
        if k[0] == 'shape': out.append((cid, m)); return
        if k[0] == 'sprite':
            nf = s.nframes(cid)
            for depth, (c, mm, _) in sorted(s.display(cid, min(frame, nf - 1) if nf > 1 else 0).items()):
                s.collect(c, frame, mul(m, mm), out)

PLANES = {'ax': 2566, 'cor': 7749, 'sag': 5017}

def pretty(name, plane):
    n = name[len(plane):]
    n = re.sub(r'(?<!^)(?=[A-Z])', ' ', n)
    n = n.replace(' Of ', ' of ').replace('Parieto Occipital', 'Parieto-occipital').replace('Postero ', 'Postero-')
    words = n.split(' ')
    return ' '.join([words[0]] + [w if w in ('of',) else w.lower() for w in words[1:]]).replace('monro', 'Monro').replace('magendie', 'Magendie').replace('luschka', 'Luschka')

def main(swf_path, out_dir):
    s = SWF(load(swf_path))
    for plane, root in PLANES.items():
        os.makedirs(f'{out_dir}/{plane}', exist_ok=True)
        top = s.display(root, 0)
        img = next(v for v in top.values() if v[2] == f'{plane}_mov')
        layers = [(v[0], v[1], pretty(v[2], plane)) for d, v in sorted(top.items())
                  if v[2] and v[2].startswith(plane) and not v[2].endswith('_mov')]
        names = [l[2] for l in layers]
        n = s.nframes(img[0])
        slices = []; size = None
        for f in range(n):
            # The slice image: a shape with a bitmap fill. Its fill matrix maps
            # image pixels to shape space; everything is redrawn in pixels.
            leaves = []; s.collect(img[0], f, img[1], leaves)
            P = None
            for cid, m in leaves:
                sh = s.shape(cid)
                if not sh: continue
                for fill in sh[0]:
                    if fill[0] == 'bitmap' and fill[1] in s.chars and s.chars[fill[1]][0] == 'jpeg':
                        P = mul(m, fill[2]); jpg = s.chars[fill[1]][1]
                        break
                if P: break
            open(f'{out_dir}/{plane}/{f + 1:03d}.jpg', 'wb').write(jpg)
            if size is None:
                sof = re.search(rb'\xff[\xc0\xc2]..\x08(..)(..)', jpg, re.S)
                size = (struct.unpack('>H', sof.group(2))[0], struct.unpack('>H', sof.group(1))[0])
            toPx = inv(P); scale = (abs(toPx[0] * toPx[3] - toPx[1] * toPx[2])) ** 0.5
            entries = []
            for li, (cid, m, name) in enumerate(layers):
                leaves = []; s.collect(cid, f, m, leaves)
                parts = []
                for scid, sm in leaves:
                    sh = s.shape(scid)
                    if not sh: continue
                    fills, lines, fe, le = sh
                    M = mul(toPx, sm)
                    for idx, edges in fe.items():
                        fill = fills[idx - 1]
                        if fill[0] == 'solid': parts.append(['f', fill[1], fill[2], path_d(edges, M, True)])
                    for idx, edges in le.items():
                        w, c, a = lines[idx - 1]
                        parts.append(['s', c, round(max(w * scale, 0.6), 2), path_d(edges, M, False)])
                if parts: entries.append([li, parts])
            slices.append(entries)
        data = {'plane': plane, 'w': size[0], 'h': size[1], 'names': names, 'slices': slices,
                'credit': 'Images and outlines: bmy (c) headneckbrainspine.com. Scan: OASIS.'}
        raw = json.dumps(data, separators=(',', ':')).encode()
        with gzip.open(f'{out_dir}/{plane}.json.gz', 'wb', compresslevel=9) as fh: fh.write(raw)
        print(plane, n, 'slices', size, len(names), 'structures,',
              '%.1f MB json, %.1f MB gz' % (len(raw) / 1e6, os.path.getsize(f'{out_dir}/{plane}.json.gz') / 1e6))

if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    main(sys.argv[1], sys.argv[2])
