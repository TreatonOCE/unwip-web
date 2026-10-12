// Unwip - map maker. Maps live in the binder (usually under Places) like documents.
// A map is saved as JSON in its document file: a low-resolution land mask (painted or generated) plus
// lists of stamps (forests, mountains, towns…), paths (roads, rivers, borders), labels and pins.
// Pins can point at a Places sheet; double-click a pin to open it.
window.UnwipMaps = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, S, api, I } = U;
  const W = 1600, H = 1100, MW = 400, MH = 275, K = W / MW;   // world size, mask size, mask scale

  const STYLES = {
    parchment: { name: 'Parchment', paper: '#eadcbf', sea: '#d8c59c', seaLine: '#b9a477', land: '#f1e5c9', coast: '#4e3b26', ink: '#3a2a19', forest: '#8a9a5b', mountain: '#b59a72', river: '#5f7f96', road: '#5c4630', border: '#9a3b2b', label: '#3a2a19', pin: '#c0492b' },
    atlas: { name: 'Atlas', paper: '#f4f1ea', sea: '#a9cfe0', seaLine: '#7fb3cc', land: '#dfe7c0', coast: '#3f5f47', ink: '#2c2f2a', forest: '#5f8f4e', mountain: '#a58c6a', river: '#3c7fb0', road: '#6b5640', border: '#b0413e', label: '#23262a', pin: '#d2462b' },
    night: { name: 'Night', paper: '#151a24', sea: '#1c2433', seaLine: '#2c3a52', land: '#2a3242', coast: '#c9b98f', ink: '#d8cfb4', forest: '#56705a', mountain: '#7d7262', river: '#6d9cc7', road: '#bfae86', border: '#d0675a', label: '#efe6c8', pin: '#ef7b57' },
    ink: { name: 'Ink sketch', paper: '#ffffff', sea: '#ffffff', seaLine: '#9a9a9a', land: '#ffffff', coast: '#111111', ink: '#111111', forest: '#ffffff', mountain: '#ffffff', river: '#111111', road: '#111111', border: '#111111', label: '#111111', pin: '#111111' }
  };
  const BORDER_ICON = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M3 17 C8 5, 14 21, 21 7" fill="none" stroke="#b0413e" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="1 4.5"/></svg>';
  const FRAMES = { double: 'Double line', simple: 'Single line', ornate: 'Ornate corners', none: 'No frame' };
  const TOOLS = [
    ['select', '✋', 'Move & select: drag things around, double-click a label or pin to edit it, Delete removes it. Drag empty space to pan; scroll to zoom'],
    ['land', '🟫', 'Paint land'], ['water', '🌊', 'Paint water (rub out land)'],
    ['forest', '🌲', 'Forest: drag to scatter trees'], ['mountain', '⛰️', 'Mountains: drag to place a range'], ['hill', '🏔️', 'Hills: drag to scatter'],
    ['town', '🏠', 'Town: click to place'], ['city', '🏰', 'City or castle: click to place'], ['tower', '🗼', 'Tower: click to place'], ['ruin', '🏚️', 'Ruins: click to place'],
    ['road', '〰️', 'Road or path: drag to draw'], ['border', BORDER_ICON, 'Border: drag to draw a dotted border between lands or kingdoms. (For rivers and lakes, paint with 🌊 water)'],
    ['pin', '📍', 'Pin: click to mark a place. You can link it to a Places sheet'], ['label', '🔤', 'Label: click to name a region, sea or place']
  ];

  let st = null, nodeId = null, tool = 'select', brush = 18, cam = { x: 0, y: 0, z: 1 }, sel = null, undo = [], redo = [];
  let mask = null, mctx = null, landCache = null, landDirty = true, saveT = null, view = null, cv = null, ctx = null, drawing = null;

  // ================================================================== DATA
  function blank(style = 'parchment') { return { v: 1, style, land: null, stamps: [], paths: [], labels: [], pins: [], grid: false, compass: true, frame: 'double', seed: 1 }; }
  // a map document holds one or more sections (the whole world, a region, a city…), each a full map of its own
  let docData = null;
  async function load(id) {
    let data = null;
    try { data = JSON.parse(await api.loadDoc(S.slug, id) || 'null'); } catch {}
    st = null;
    if (data && Array.isArray(data.sections)) docData = data;
    else docData = { v: 2, active: 0, sections: [{ name: 'Main map', ...Object.assign(blank(), data || {}) }] };
    docData.sections = docData.sections.map(x => Object.assign(blank(), x));
    docData.active = Math.min(docData.active || 0, docData.sections.length - 1);
    mask = document.createElement('canvas'); mask.width = MW; mask.height = MH; mctx = mask.getContext('2d', { willReadFrequently: true });
    await useSection(docData.active);
  }
  async function useSection(i) {
    if (st && mask) st.land = maskData();
    docData.active = i; st = docData.sections[i];
    mctx.clearRect(0, 0, MW, MH);
    if (st.land) { const im = new Image(); im.src = st.land; await im.decode().catch(() => {}); mctx.drawImage(im, 0, 0); }
    landDirty = true; itemsDirty = true; undo = []; redo = []; sel = null;
  }
  const maskData = () => { const d = mctx.getImageData(0, 0, MW, MH).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return mask.toDataURL('image/png'); return null; };
  function snapshot() { return JSON.stringify({ ...st, land: mask.toDataURL('image/png') }); }
  let itemsDirty = true;
  function push() { undo.push(snapshot()); if (undo.length > 40) undo.shift(); redo = []; }
  async function restore(json) { const d = JSON.parse(json); Object.keys(st).forEach(k => delete st[k]); Object.assign(st, d); itemsDirty = true; const im = new Image(); im.src = d.land; await im.decode().catch(() => {}); mctx.clearRect(0, 0, MW, MH); mctx.drawImage(im, 0, 0); landDirty = true; itemsDirty = true; sel = null; baseKey = ''; redraw(); schedule(); }
  function schedule() { clearTimeout(saveT); saveT = setTimeout(saveNow, 700); $('#mp-saved') && ($('#mp-saved').textContent = 'Saving…'); }
  async function saveNow() {
    clearTimeout(saveT); if (!st || !nodeId) return;
    st.land = maskData();
    await api.saveDoc(S.slug, nodeId, JSON.stringify(docData));
    const f = U.findNode(nodeId); if (f) { f.node.mod = Date.now(); f.node.dev = S.device || ''; U.scheduleMeta(); }
    const el = $('#mp-saved'); if (el) el.textContent = 'Saved';
  }

  // ================================================================== GENERATION (no AI: value noise)
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1e6) / 1e6; }; }
  function noise2(seed) {
    const r = rng(seed), P = 256, g = new Float32Array(P * P); for (let i = 0; i < g.length; i++) g[i] = r();
    const at = (x, y) => g[((y & 255) * P) + (x & 255)];
    const sm = t => t * t * (3 - 2 * t);
    return (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
      const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; };
  }
  function fbm(n, x, y, oct = 5) { let v = 0, a = 1, f = 1, t = 0; for (let o = 0; o < oct; o++) { v += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; } return v / t; }
  const SYL = ['ash', 'bel', 'cor', 'dun', 'el', 'fen', 'gar', 'hal', 'ith', 'kar', 'lor', 'mar', 'nor', 'or', 'pel', 'quen', 'ros', 'sel', 'tor', 'ul', 'vel', 'wyn', 'yr', 'zan', 'bri', 'dra', 'ka', 'mo', 'thal', 'eth'];
  const END = ['', 'a', 'ia', 'or', 'en', 'heim', 'mere', 'ford', 'hold', 'wick', 'mouth', 'reach', 'vale', 'gate', 'spire'];
  function name(r) { const n = SYL[Math.floor(r() * SYL.length)] + SYL[Math.floor(r() * SYL.length)] + END[Math.floor(r() * END.length)]; return n[0].toUpperCase() + n.slice(1); }
  // kind: island | continent | archipelago ; add: keep what's there and put new land in the emptiest stretch of sea
  function generate(kind, add = false) {
    push();
    const seed = Math.floor(Math.random() * 1e9); if (!add) st.seed = seed;
    const n = noise2(seed), n2 = noise2(seed + 7), r = rng(seed + 3);
    const old = mctx.getImageData(0, 0, MW, MH).data;
    const img = mctx.createImageData(MW, MH), elev = new Float32Array(MW * MH), fresh = new Uint8Array(MW * MH);
    let centres = kind === 'archipelago' ? [...Array(7)].map(() => [0.15 + r() * 0.7, 0.15 + r() * 0.7, 0.10 + r() * 0.12]) : kind === 'continent' ? [[0.5, 0.5, 0.62]] : [[0.5, 0.5, 0.40]];
    if (add) {
      // the point of open sea furthest from any land
      let best = null;
      for (let t = 0; t < 500; t++) {
        const cx = 0.18 + r() * 0.64, cy = 0.22 + r() * 0.56; let dmin = 1e9;
        for (let y = 0; y < MH; y += 5) for (let x = 0; x < MW; x += 5) if (old[(y * MW + x) * 4 + 3]) { const d = Math.hypot((x / MW - cx) * 1.45, y / MH - cy); if (d < dmin) dmin = d; }
        if (!best || dmin > best[2]) best = [cx, cy, dmin];
      }
      const rad = Math.max(0.07, Math.min(0.24, (best ? best[2] : 0.3) * (kind === 'continent' ? 0.95 : 0.7)));
      centres = kind === 'archipelago' ? [...Array(4)].map(() => [best[0] + (r() - 0.5) * rad * 1.6, best[1] + (r() - 0.5) * rad * 1.6, rad * 0.45]) : [[best[0], best[1], rad]];
    }
    const thr = kind === 'archipelago' ? 0.5 : kind === 'continent' ? 0.47 : 0.5;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const nx = x / MW, ny = y / MH;
      let fall = 0; for (const [cx, cy, rad] of centres) { const d = Math.hypot((nx - cx) * 1.25, ny - cy) / rad; fall = Math.max(fall, 1 - d * d); }
      const e = fbm(n, nx * 6, ny * 6) * 0.65 + Math.max(0, fall) * 0.55 - 0.08 - (add && fall <= 0 ? 1 : 0);
      elev[y * MW + x] = e;
      const was = add && old[(y * MW + x) * 4 + 3] > 0;
      const on = e > thr && x > 3 && y > 3 && x < MW - 4 && y < MH - 4;
      if (on && !was) fresh[y * MW + x] = 1;
      img.data[(y * MW + x) * 4 + 3] = on || was ? 255 : 0;
    }
    mctx.putImageData(img, 0, 0); landDirty = true; itemsDirty = true;
    // scatter: mountains on the highest ground, forests on middle ground, towns near coasts
    if (!add) { st.stamps = []; st.paths = []; st.labels = []; st.pins = []; }
    const isLand = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && (add ? fresh[y * MW + x] === 1 : img.data[(y * MW + x) * 4 + 3] > 0);
    for (let i = 0; i < 2600; i++) {
      const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (!isLand(x, y)) continue;
      const e = elev[y * MW + x], f = fbm(n2, x / 40, y / 40, 3);
      if (e > thr + 0.21 && r() < 0.32) st.stamps.push({ k: 'mountain', x: x * K, y: y * K, s: 0.8 + r() * 0.6 });
      else if (e > thr + 0.14 && r() < 0.18) st.stamps.push({ k: 'hill', x: x * K, y: y * K, s: 0.8 + r() * 0.4 });
      else if (f > 0.5 && e < thr + 0.16 && r() < 0.7) st.stamps.push({ k: 'tree', x: x * K, y: y * K, s: 0.8 + r() * 0.4 });
    }
    // rivers: start high, walk downhill to the sea
    for (let k = 0; k < 4; k++) {
      let best = null; for (let t = 0; t < 400; t++) { const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (isLand(x, y) && (!best || elev[y * MW + x] > best[2])) best = [x, y, elev[y * MW + x]]; }
      if (!best) break;
      let [x, y] = best; const pts = [[x * K, y * K]];
      for (let step = 0; step < 300 && isLand(x, y); step++) {
        let nx = x, ny = y, low = elev[y * MW + x] + 0.02;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const xx = x + dx * 2, yy = y + dy * 2; if (xx < 0 || yy < 0 || xx >= MW || yy >= MH) continue; const e = elev[yy * MW + xx] + r() * 0.012; if (e < low) { low = e; nx = xx; ny = yy; } }
        if (nx === x && ny === y) break; x = nx; y = ny; pts.push([x * K, y * K]);
      }
      if (pts.length > 8) st.paths.push({ k: 'river', pts: pts.filter((_, i) => i % 2 === 0) });
    }
    // towns near the coast and a capital inland, with made-up names
    const towns = [];
    for (let t = 0; t < 3000 && towns.length < 6; t++) {
      const x = Math.floor(r() * MW), y = Math.floor(r() * MH); if (!isLand(x, y)) continue;
      const coast = !isLand(x + 6, y) || !isLand(x - 6, y) || !isLand(x, y + 6) || !isLand(x, y - 6);
      if ((coast || towns.length === 0) && towns.every(([a, b]) => Math.hypot(a - x, b - y) > 45)) towns.push([x, y]);
    }
    towns.forEach(([x, y], i) => { const nm = name(r); st.stamps.push({ k: i === 0 ? 'city' : 'town', x: x * K, y: y * K, s: 1 }); st.labels.push({ x: x * K, y: y * K + 34, text: nm, k: 'place' }); });
    for (let i = 0; i + 1 < towns.length; i += 2) { const [a, b] = towns[i], [c, d] = towns[i + 1]; st.paths.push({ k: 'road', pts: [[a * K, b * K], [(a + c) / 2 * K + (r() - 0.5) * 60, (b + d) / 2 * K + (r() - 0.5) * 60], [c * K, d * K]] }); }
    if (add) {
      // name the new land just above it (or below, if that would sit on another label)
      let x0 = MW, x1 = 0, y0 = MH, y1 = 0;
      for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (fresh[y * MW + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 >= x0) {
        const text = (kind === 'archipelago' ? 'The ' + name(r) + ' Isles' : name(r)).toUpperCase(), size = 30, wpx = text.length * size * 0.85;
        const cx = Math.min(W - wpx / 2 - 40, Math.max(wpx / 2 + 40, (x0 + x1) / 2 * K));
        const clash = y => st.labels.some(l => Math.abs(l.y - y) < 46 && Math.abs(l.x - cx) < (wpx + (l.text || '').length * (l.size || 30) * 0.7) / 2);
        const tries = [[cx, y0 * K - 34], [cx, y1 * K + 40], [cx, (y0 + y1) / 2 * K]];
        let pos = tries.find(([, y]) => y > 70 && y < H - 110 && !clash(y)) || tries[2];
        const [lx, y] = pos;
        st.labels.push({ x: lx, y, text, k: 'region', size });
      }
    } else {
      st.labels.push({ x: W / 2, y: 120, text: (kind === 'archipelago' ? 'The ' + name(r) + ' Isles' : name(r)).toUpperCase(), k: 'region' });
      st.labels.push({ x: 180, y: H - 140, text: 'The ' + name(r) + ' Sea', k: 'sea' });
    }
    st.stamps.sort((a, b) => a.y - b.y);
    changed(); schedule();
  }

  // ================================================================== RENDERING
  function renderLand(P) {
    // smooth the blocky mask into a natural coastline: scale up blurred, then cut at half
    const a = document.createElement('canvas'); a.width = W; a.height = H; const g = a.getContext('2d', { willReadFrequently: true });
    g.filter = 'blur(5px)'; g.imageSmoothingEnabled = true; g.drawImage(mask, 0, 0, W, H); g.filter = 'none';
    const id = g.getImageData(0, 0, W, H), d = id.data;
    for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 120 ? 255 : 0;
    g.putImageData(id, 0, 0);
    const tint = (src, col) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return c; };
    const out = document.createElement('canvas'); out.width = W; out.height = H; const o = out.getContext('2d');
    // ripples in the sea, then a dark coastline, then the land
    const rip = tint(a, P.seaLine);
    for (const [blur, alpha] of [[26, 0.35], [14, 0.45]]) { o.globalAlpha = alpha; o.filter = `blur(${blur}px)`; o.drawImage(rip, 0, 0); }
    o.filter = 'none'; o.globalAlpha = 1;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, 2], [-2, 2], [2, -2]]) o.drawImage(tint(a, P.coast), dx, dy);
    o.drawImage(tint(a, P.land), 0, 0);
    // a little paper grain on the land
    o.globalCompositeOperation = 'source-atop'; o.globalAlpha = 0.08;
    const r = rng(st.seed || 1); o.fillStyle = P.coast; for (let i = 0; i < 9000; i++) o.fillRect(r() * W, r() * H, 1.4, 1.4);
    o.globalAlpha = 1; o.globalCompositeOperation = 'source-over';
    return out;
  }
  function stamp(g, s, P) {
    const z = s.s || 1; g.save(); g.translate(s.x, s.y); g.scale(z, z); g.lineWidth = 1.6; g.strokeStyle = P.ink; g.lineJoin = 'round';
    if (s.k === 'tree') { g.fillStyle = P.forest; g.beginPath(); g.moveTo(0, -12); g.quadraticCurveTo(9, -9, 7, 0); g.quadraticCurveTo(0, 4, -7, 0); g.quadraticCurveTo(-9, -9, 0, -12); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, 1); g.lineTo(0, 6); g.stroke(); }
    else if (s.k === 'mountain') { g.fillStyle = P.mountain; g.beginPath(); g.moveTo(-18, 8); g.lineTo(-2, -20); g.lineTo(18, 8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-2, -20); g.lineTo(3, -6); g.lineTo(0, 8); g.stroke(); g.globalAlpha = 0.35; g.fillStyle = P.ink; g.beginPath(); g.moveTo(-2, -20); g.lineTo(18, 8); g.lineTo(3, 8); g.lineTo(3, -6); g.closePath(); g.fill(); }
    else if (s.k === 'hill') { g.beginPath(); g.moveTo(-14, 4); g.quadraticCurveTo(0, -12, 14, 4); g.stroke(); }
    else if (s.k === 'town') { g.fillStyle = P.land; g.beginPath(); g.rect(-7, -6, 14, 10); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-9, -6); g.lineTo(0, -14); g.lineTo(9, -6); g.closePath(); g.fillStyle = P.pin; g.fill(); g.stroke(); }
    else if (s.k === 'city') { g.fillStyle = P.land; g.beginPath(); g.rect(-14, -10, 28, 16); g.fill(); g.stroke(); for (const x of [-14, -4, 6]) { g.beginPath(); g.rect(x, -22, 8, 12); g.fill(); g.stroke(); g.beginPath(); for (let k = 0; k < 2; k++) g.rect(x + k * 5, -26, 3, 4); g.stroke(); } g.fillStyle = P.pin; g.beginPath(); g.moveTo(0, -30); g.lineTo(0, -40); g.lineTo(8, -36); g.lineTo(0, -33); g.fill(); g.stroke(); }
    else if (s.k === 'tower') { g.fillStyle = P.land; g.beginPath(); g.moveTo(-6, 8); g.lineTo(-4, -18); g.lineTo(4, -18); g.lineTo(6, 8); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-6, -18); g.lineTo(0, -28); g.lineTo(6, -18); g.closePath(); g.fillStyle = P.pin; g.fill(); g.stroke(); }
    else if (s.k === 'ruin') { g.beginPath(); g.moveTo(-12, 6); g.lineTo(-12, -8); g.lineTo(-8, -12); g.lineTo(-6, -2); g.moveTo(-2, 6); g.lineTo(-2, -14); g.lineTo(3, -10); g.moveTo(6, 6); g.lineTo(6, -4); g.lineTo(11, -6); g.lineTo(12, 6); g.moveTo(-14, 6); g.lineTo(14, 6); g.stroke(); }
    g.restore();
  }
  function smoothPath(g, pts) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
    const l = pts[pts.length - 1]; g.lineTo(l[0], l[1]);
  }
  // the map is drawn in two cached layers (sea + land, then everything on top) so dragging and painting stay smooth
  function renderBase(g, P) {
    g.fillStyle = P.sea; g.fillRect(0, 0, W, H);
    g.strokeStyle = P.seaLine; g.globalAlpha = 0.25; g.lineWidth = 1;
    const r = rng(42); for (let i = 0; i < 140; i++) { const x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.quadraticCurveTo(x + 24, y + 5, x + 32, y); g.stroke(); }
    g.globalAlpha = 1;
    if (landDirty || !landCache) { landCache = renderLand(P); landDirty = false; }
    g.drawImage(landCache, 0, 0);
    if (st.grid) { g.strokeStyle = P.ink; g.globalAlpha = 0.12; g.lineWidth = 1; const s = 40, h = s * Math.sqrt(3); for (let y = 0; y < H + h; y += h / 2) for (let x = ((y / (h / 2)) % 2) * s * 1.5; x < W + s * 3; x += s * 3) { g.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 3 * k; g.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); } g.closePath(); g.stroke(); } g.globalAlpha = 1; }
  }
  function drawPath(g, p, P) {
    if (p.pts.length < 2) return;
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    if (p.k === 'river') { g.strokeStyle = P.river; g.lineWidth = 3.2; }
    else if (p.k === 'road') { g.strokeStyle = P.road; g.lineWidth = 2; g.setLineDash([7, 6]); }
    else { g.strokeStyle = P.border; g.lineWidth = 2.6; g.setLineDash([2, 7]); g.globalAlpha = 0.85; }
    smoothPath(g, p.pts); g.stroke(); g.restore();
  }
  function drawLabel(g, l, P) {
    g.save(); g.fillStyle = P.label; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (l.k === 'region') { g.font = `600 ${l.size || 44}px Georgia, serif`; g.letterSpacing = '10px'; }
    else if (l.k === 'sea') { g.font = `italic ${l.size || 30}px Georgia, serif`; g.letterSpacing = '3px'; g.fillStyle = P.seaLine === P.sea ? P.label : P.coast; }
    else { g.font = `${l.size || 20}px Georgia, serif`; }
    g.lineWidth = 4; g.strokeStyle = P.land; g.globalAlpha = 0.85; if (l.k !== 'sea') g.strokeText(l.text, l.x, l.y); g.globalAlpha = 1; g.fillText(l.text, l.x, l.y); g.restore();
  }
  function drawPin(g, p, P) {
    g.save(); g.translate(p.x, p.y); g.fillStyle = P.pin; g.strokeStyle = P.ink; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-10, -14, -10, -26, 0, -28); g.bezierCurveTo(10, -26, 10, -14, 0, 0); g.fill(); g.stroke();
    g.fillStyle = P.land; g.beginPath(); g.arc(0, -19, 4, 0, 7); g.fill();
    if (p.label) { g.font = '600 17px Georgia, serif'; g.textAlign = 'center'; g.lineWidth = 4; g.strokeStyle = P.land; g.strokeText(p.label, 0, 18); g.fillStyle = P.label; g.fillText(p.label, 0, 18); }
    g.restore();
  }
  function drawFrame(g, P) {
    const f = st.frame || 'double';
    if (f === 'none') return;
    g.save(); g.strokeStyle = P.ink;
    if (f === 'simple') { g.lineWidth = 3; g.strokeRect(16, 16, W - 32, H - 32); }
    else { g.lineWidth = 3; g.strokeRect(14, 14, W - 28, H - 28); g.lineWidth = 1; g.strokeRect(22, 22, W - 44, H - 44); }
    if (f === 'ornate') {
      g.fillStyle = P.ink; g.lineWidth = 1.5;
      for (const [cx, cy, sx, sy] of [[22, 22, 1, 1], [W - 22, 22, -1, 1], [22, H - 22, 1, -1], [W - 22, H - 22, -1, -1]]) {
        g.save(); g.translate(cx, cy); g.scale(sx, sy);
        g.beginPath(); g.moveTo(0, 0); g.lineTo(46, 0); g.moveTo(0, 0); g.lineTo(0, 46); g.stroke();
        g.beginPath(); g.arc(18, 18, 10, 0, 7); g.stroke(); g.beginPath(); g.arc(18, 18, 3.5, 0, 7); g.fill();
        g.beginPath(); g.moveTo(30, 6); g.quadraticCurveTo(44, 10, 52, 4); g.moveTo(6, 30); g.quadraticCurveTo(10, 44, 4, 52); g.stroke();
        g.restore();
      }
      // a scale bar along the bottom
      g.lineWidth = 1.5; const x0 = 70, y0 = H - 54; for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? P.paper : P.ink; g.fillRect(x0 + k * 40, y0, 40, 7); } g.strokeRect(x0, y0, 160, 7);
      g.fillStyle = P.ink; g.font = '14px Georgia, serif'; g.textAlign = 'center'; g.fillText('0', x0, y0 - 6); g.fillText('100 leagues', x0 + 160, y0 - 6);
    }
    g.restore();
  }
  // skip: an item being dragged, drawn separately on top
  function renderItems(g, P, skip) {
    st.paths.forEach((p, i) => { if (!(skip && skip.type === 'path' && skip.i === i)) drawPath(g, p, P); });
    st.stamps.map((s, i) => [s, i]).sort((a, b) => a[0].y - b[0].y).forEach(([s, i]) => { if (!(skip && skip.type === 'stamp' && skip.i === i)) stamp(g, s, P); });
    st.labels.forEach((l, i) => { if (!(skip && skip.type === 'label' && skip.i === i)) drawLabel(g, l, P); });
    st.pins.forEach((p, i) => { if (!(skip && skip.type === 'pin' && skip.i === i)) drawPin(g, p, P); });
    if (st.compass) { g.save(); g.translate(W - 110, H - 120); g.strokeStyle = P.ink; g.fillStyle = P.ink; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, 44, 0, 7); g.stroke(); for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -58); g.lineTo(9, 0); g.lineTo(0, 9); g.lineTo(-9, 0); g.closePath(); k % 2 ? g.stroke() : g.fill(); } g.font = 'bold 18px Georgia, serif'; g.textAlign = 'center'; g.fillText('N', 0, -64); g.restore(); }
    drawFrame(g, P);
  }
  function drawOne(g, s, P) {
    if (!s) return;
    if (s.type === 'stamp' && st.stamps[s.i]) stamp(g, st.stamps[s.i], P);
    if (s.type === 'path' && st.paths[s.i]) drawPath(g, st.paths[s.i], P);
    if (s.type === 'label' && st.labels[s.i]) drawLabel(g, st.labels[s.i], P);
    if (s.type === 'pin' && st.pins[s.i]) drawPin(g, st.pins[s.i], P);
  }
  // for saving a picture
  function renderAll(g, P) { renderBase(g, P); renderItems(g, P); }

  let baseCache = null, itemsCache = null, baseKey = '', quick = null, seaCache = null;
  const layer = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  // while painting: a quick soft-edged land preview instead of the full coastline treatment
  function quickLand(P) {
    if (!quick) { quick = document.createElement('canvas'); quick.width = W / 2; quick.height = H / 2; }   // half size: four times less work per frame
    const g = quick.getContext('2d'), w = quick.width, h = quick.height;
    g.clearRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; g.imageSmoothingEnabled = true;
    g.drawImage(mask, 0, 0, w, h);
    g.globalCompositeOperation = 'source-in'; g.fillStyle = P.land; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
    return quick;
  }
  function draw() {
    if (!cv) return;
    const P = STYLES[st.style] || STYLES.parchment, dpr = window.devicePixelRatio || 1;
    const key = `${st.style}|${st.grid}`;
    const painting = drawing && drawing.brush;
    if (!baseCache || landDirty && !painting || key !== baseKey) {
      if (!baseCache) baseCache = layer(); const g = baseCache.getContext('2d'); g.clearRect(0, 0, W, H); renderBase(g, P); baseKey = key;
      if (!seaCache) seaCache = layer(); const sg = seaCache.getContext('2d'); sg.fillStyle = P.sea; sg.fillRect(0, 0, W, H);
    }
    const moving = drawing && drawing.move && sel ? sel : null;
    if (!itemsCache || itemsDirty) { if (!itemsCache) itemsCache = layer(); const g = itemsCache.getContext('2d'); g.clearRect(0, 0, W, H); renderItems(g, P, moving); itemsDirty = false; itemsSkip = moving; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.paper; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, cam.x * dpr, cam.y * dpr);
    if (painting) {
      // plain sea with the live land on top; the full coastline is drawn again when you let go
      ctx.drawImage(seaCache, 0, 0); ctx.drawImage(quickLand(P), 0, 0, W, H);
    } else ctx.drawImage(baseCache, 0, 0);
    ctx.drawImage(itemsCache, 0, 0);
    if (itemsSkip) drawOne(ctx, itemsSkip, P);
    // selection and brush outline
    if (sel) {
      if (sel.type === 'path' && st.paths[sel.i]) { ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.globalAlpha = 0.35; ctx.lineWidth = 10; ctx.lineCap = 'round'; smoothPath(ctx, st.paths[sel.i].pts); ctx.stroke(); ctx.restore(); }
      else { const b = bounds(sel); if (b) { ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8); ctx.restore(); } }
    }
    if (drawing && drawing.path) drawPath(ctx, drawing.path, P);
    if (BRUSHY.includes(tool) && hover) { ctx.save(); ctx.strokeStyle = '#3d7bd9'; ctx.lineWidth = 1.5 / cam.z; ctx.beginPath(); ctx.arc(hover.x, hover.y, brush * K / 2, 0, 7); ctx.stroke(); ctx.restore(); }
  }
  let itemsSkip = null, raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  let hover = null;
  const BRUSHY = ['land', 'water', 'forest', 'mountain', 'hill'];

  // ================================================================== HIT TESTING
  function bounds(s) {
    if (s.type === 'stamp') { const o = st.stamps[s.i]; if (!o) return null; const z = (o.s || 1) * (o.k === 'city' ? 26 : 18); return { x: o.x - z, y: o.y - z * 1.4, w: z * 2, h: z * 1.8 }; }
    if (s.type === 'pin') { const o = st.pins[s.i]; if (!o) return null; return { x: o.x - 12, y: o.y - 30, w: 24, h: 52 }; }
    if (s.type === 'label') { const o = st.labels[s.i]; if (!o) return null; const sz = o.size || (o.k === 'region' ? 44 : o.k === 'sea' ? 30 : 20); const w = o.text.length * sz * (o.k === 'region' ? 0.85 : 0.55); return { x: o.x - w / 2, y: o.y - sz * 0.6, w, h: sz * 1.2 }; }
    return null;
  }
  function hit(x, y) {
    const inB = b => b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
    for (let i = st.pins.length - 1; i >= 0; i--) if (inB(bounds({ type: 'pin', i }))) return { type: 'pin', i };
    for (let i = st.labels.length - 1; i >= 0; i--) if (inB(bounds({ type: 'label', i }))) return { type: 'label', i };
    for (let i = st.stamps.length - 1; i >= 0; i--) if (inB(bounds({ type: 'stamp', i }))) return { type: 'stamp', i };
    for (let i = st.paths.length - 1; i >= 0; i--) if (st.paths[i].pts.some(p => Math.hypot(p[0] - x, p[1] - y) < 10)) return { type: 'path', i };
    return null;
  }

  // ================================================================== EDITING
  const world = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left - cam.x) / cam.z, y: (e.clientY - r.top - cam.y) / cam.z }; };
  function paint(x, y, on, from) {
    mctx.globalCompositeOperation = on ? 'source-over' : 'destination-out';
    mctx.fillStyle = '#000'; mctx.strokeStyle = '#000'; mctx.lineCap = 'round'; mctx.lineWidth = brush;
    if (from) { mctx.beginPath(); mctx.moveTo(from.x / K, from.y / K); mctx.lineTo(x / K, y / K); mctx.stroke(); }   // no gaps when you move fast
    mctx.beginPath(); mctx.arc(x / K, y / K, brush / 2, 0, 7); mctx.fill();
    mctx.globalCompositeOperation = 'source-over';
  }
  const changed = () => { itemsDirty = true; redraw(); };
  function pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    const p = world(e);
    if (e.button === 1 || (tool === 'select' && !hit(p.x, p.y)) || e.altKey) { drawing = { pan: true, sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y }; sel = null; redraw(); return; }
    cv.setPointerCapture(e.pointerId);
    if (tool === 'select') { sel = hit(p.x, p.y); push(); drawing = { move: true, last: p }; itemsDirty = true; redraw(); return; }
    push();
    if (tool === 'land' || tool === 'water') { drawing = { brush: true, on: tool === 'land', last: p }; paint(p.x, p.y, drawing.on); redraw(); return; }
    if (['forest', 'mountain', 'hill'].includes(tool)) { drawing = { scatter: tool === 'forest' ? 'tree' : tool, last: p }; scatter(p); changed(); return; }
    if (['town', 'city', 'tower', 'ruin'].includes(tool)) { st.stamps.push({ k: tool, x: p.x, y: p.y, s: 1 }); sel = { type: 'stamp', i: st.stamps.length - 1 }; changed(); schedule(); return; }
    if (['road', 'border'].includes(tool)) { drawing = { path: { k: tool, pts: [[p.x, p.y]] } }; return; }
    if (tool === 'pin') { addPin(p); return; }
    if (tool === 'label') { addLabel(p); return; }
  }
  function scatter(p) {
    const k = drawing.scatter, n = k === 'tree' ? 3 : 1, spread = brush * 1.8;
    for (let i = 0; i < n; i++) { const x = p.x + (Math.random() - 0.5) * spread, y = p.y + (Math.random() - 0.5) * spread; if (st.stamps.some(s => s.k === k && Math.hypot(s.x - x, s.y - y) < (k === 'mountain' ? 26 : 14))) continue; st.stamps.push({ k, x, y, s: 0.8 + Math.random() * 0.5 }); }
  }
  function pointerMove(e) {
    const p = world(e); hover = p;
    if (!drawing) { if (BRUSHY.includes(tool)) redraw(); return; }
    if (drawing.pan) { cam.x = drawing.cx + e.clientX - drawing.sx; cam.y = drawing.cy + e.clientY - drawing.sy; redraw(); return; }
    if (drawing.move && sel) {
      const dx = p.x - drawing.last.x, dy = p.y - drawing.last.y; drawing.last = p;
      const o = sel.type === 'path' ? null : st[sel.type === 'stamp' ? 'stamps' : sel.type === 'pin' ? 'pins' : 'labels'][sel.i];
      if (o) { o.x += dx; o.y += dy; } else if (sel.type === 'path') st.paths[sel.i].pts.forEach(q => { q[0] += dx; q[1] += dy; });
      redraw(); return;                      // the dragged item is drawn on its own layer, so nothing else is redrawn
    }
    if (drawing.brush) { paint(p.x, p.y, drawing.on, drawing.last); drawing.last = p; redraw(); return; }
    if (drawing.scatter) { if (Math.hypot(p.x - drawing.last.x, p.y - drawing.last.y) > (drawing.scatter === 'mountain' ? 22 : 10)) { drawing.last = p; scatter(p); changed(); } return; }
    if (drawing.path) { const l = drawing.path.pts[drawing.path.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 10) { drawing.path.pts.push([p.x, p.y]); redraw(); } }
  }
  function pointerUp() {
    if (!drawing) return;
    const d = drawing; drawing = null;
    if (d.brush) landDirty = true;
    if (d.path) { if (d.path.pts.length >= 2) st.paths.push(d.path); else undo.pop(); }
    if (d.move && !sel) undo.pop();
    itemsDirty = true; itemsSkip = null; redraw(); if (!d.pan) schedule();
  }
  function wheel(e) {
    e.preventDefault();
    const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const z = Math.min(4, Math.max(0.25, cam.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    cam.x = mx - (mx - cam.x) * z / cam.z; cam.y = my - (my - cam.y) * z / cam.z; cam.z = z; redraw();
  }
  function places() { const out = []; const r = S.project.binder.find(n => n.root && n.kind === 'places'); if (r) U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); }); return out; }
  async function addPin(p, existing) {
    const pl = places();
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Name on the map</label><input type="text" id="pn-name" value="${esc(existing ? existing.label || '' : '')}" placeholder="e.g. Ashfall Keep"></div>
      <div class="field" style="margin-top:10px"><label>Link to a Places sheet (optional)</label><select id="pn-link"><option value="">— none —</option>${pl.map(n => `<option value="${n.id}" ${existing && existing.placeId === n.id ? 'selected' : ''}>${esc(n.title)}</option>`).join('')}</select></div>`;
    $('#pn-link', body).onchange = e => { const n = pl.find(x => x.id === e.target.value); if (n && !$('#pn-name', body).value) $('#pn-name', body).value = n.title; };
    const ok = await U.modal({ title: existing ? 'Edit pin' : 'New pin', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: existing ? 'Save' : 'Add pin', value: true, kind: 'primary' }] });
    if (!ok) { if (!existing) undo.pop(); return; }
    const data = { label: $('#pn-name', body).value.trim(), placeId: $('#pn-link', body).value || null };
    if (existing) Object.assign(existing, data); else { st.pins.push({ x: p.x, y: p.y, ...data }); sel = { type: 'pin', i: st.pins.length - 1 }; }
    changed(); schedule();
  }
  async function addLabel(p, existing) {
    const body = document.createElement('div');
    body.innerHTML = `<div class="field"><label>Text</label><input type="text" id="lb-t" value="${esc(existing ? existing.text : '')}" placeholder="e.g. The Ashen Coast"></div>
      <div class="field" style="margin-top:10px"><label>Kind</label><div class="chip-row" id="lb-k">${[['region', 'Region (big, spaced capitals)'], ['place', 'Place'], ['sea', 'Sea or river (italic)']].map(([v, l]) => `<button type="button" class="chip ${(existing ? existing.k : 'place') === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:10px"><label>Size</label><input type="range" id="lb-s" min="12" max="80" value="${existing ? existing.size || (existing.k === 'region' ? 44 : existing.k === 'sea' ? 30 : 20) : 20}"></div>`;
    let k = existing ? existing.k : 'place';
    $$('#lb-k .chip', body).forEach(c => c.onclick = () => { $$('#lb-k .chip', body).forEach(x => x.classList.remove('on')); c.classList.add('on'); k = c.dataset.v; $('#lb-s', body).value = k === 'region' ? 44 : k === 'sea' ? 30 : 20; });
    const ok = await U.modal({ title: existing ? 'Edit label' : 'New label', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'OK', value: true, kind: 'primary' }] });
    const text = $('#lb-t', body).value.trim();
    if (!ok || !text) { if (!existing) undo.pop(); return; }
    const data = { text: k === 'region' ? text.toUpperCase() : text, k, size: +$('#lb-s', body).value };
    if (existing) Object.assign(existing, data); else { st.labels.push({ x: p.x, y: p.y, ...data }); sel = { type: 'label', i: st.labels.length - 1 }; }
    changed(); schedule();
  }
  function dblclick(e) {
    const p = world(e), h = hit(p.x, p.y); if (!h) return;
    if (h.type === 'label') { push(); addLabel(null, st.labels[h.i]); }
    if (h.type === 'pin') { const pin = st.pins[h.i]; if (pin.placeId && U.findNode(pin.placeId)) { close().then(() => U.openDoc(pin.placeId)); } else { push(); addPin(null, pin); } }
  }
  function removeSel() {
    if (!sel) return; push();
    const list = { stamp: 'stamps', pin: 'pins', label: 'labels', path: 'paths' }[sel.type];
    st[list].splice(sel.i, 1); sel = null; changed(); schedule();
  }

  // ================================================================== SCREEN
  async function exportPNG(copy) {
    const c = document.createElement('canvas'); c.width = W * 2; c.height = H * 2; const g = c.getContext('2d'); g.scale(2, 2);
    renderAll(g, STYLES[st.style] || STYLES.parchment);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (copy) { try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); U.toast('Map copied. Paste it into any chapter with Ctrl+V.'); } catch { U.toast('Couldn’t copy the picture.', 'warn'); } return; }
    const f = U.findNode(nodeId);
    await api.exportBinary(new Uint8Array(await blob.arrayBuffer()), (f && f.node.title) || 'Map', 'png', 'PNG picture');
  }
  function fit() { const r = view.querySelector('.mp-stage').getBoundingClientRect(); const z = Math.min(r.width / W, r.height / H) * 0.96; cam = { z, x: (r.width - W * z) / 2, y: (r.height - H * z) / 2 }; }
  function resize() { if (!cv) return; const r = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px'; draw(); }
  function setTool(t) { tool = t; $$('.mp-tool', view).forEach(b => b.classList.toggle('on', b.dataset.t === t)); cv.style.cursor = t === 'select' ? 'default' : 'crosshair'; $('.mp-brush', view).classList.toggle('dim', !['land', 'water', 'forest', 'mountain', 'hill'].includes(t)); }
  async function open(id) {
    await close(true);
    nodeId = id; await load(id);
    const f = U.findNode(id);
    view = document.createElement('div'); view.className = 'mp-view';
    view.innerHTML = `<div class="mp-top">
        <button class="icon-btn" id="mp-close" data-tip="Close the map">${I.back}</button><b class="mp-title">${esc(f ? f.node.title : 'Map')}</b><span class="mp-saved" id="mp-saved">Saved</span>
        <span class="mp-sp"></span>
        <button class="btn small" id="mp-gen" data-tip="Make a new random coastline, mountains, forests, rivers and towns. You can edit everything after">✨ Generate…</button>
        <select id="mp-style" data-tip="Map style">${Object.entries(STYLES).map(([k, v]) => `<option value="${k}" ${st.style === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
        <button class="btn small ghost ${st.grid ? 'on' : ''}" id="mp-grid" data-tip="Hex grid">⬡ Grid</button>
        <button class="btn small ghost ${st.compass ? 'on' : ''}" id="mp-compass" data-tip="Compass rose">🧭</button>
        <select id="mp-frame" data-tip="The border around the edge of the map">${Object.entries(FRAMES).map(([k, v]) => `<option value="${k}" ${(st.frame || 'double') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <button class="btn small ghost" id="mp-clear" data-tip="Start this map section again from empty sea">Clear</button>
        <button class="icon-btn small" id="mp-undo" data-tip="Undo (Ctrl+Z)">↶</button><button class="icon-btn small" id="mp-redo" data-tip="Redo (Ctrl+Y)">↷</button>
        <button class="btn small" id="mp-copy" data-tip="Copy the map as a picture, ready to paste into a chapter">Copy picture</button>
        <button class="btn small" id="mp-png" data-tip="Save as a PNG picture (high resolution)">Save PNG…</button>
      </div>
      <div class="mp-tabs" id="mp-tabs"></div>
      <div class="mp-body"><div class="mp-tools">${TOOLS.map(([t, ic, tip]) => `<button class="mp-tool" data-t="${t}" data-tip="${esc(tip)}">${ic}</button>`).join('')}
        <div class="mp-brush" data-tip="Brush size: how big the land, water, forest and mountain brushes paint"><span class="mp-brush-ic">🖌️</span><input type="range" id="mp-size" min="4" max="60" value="${brush}" orient="vertical"><span class="mp-brush-n" id="mp-size-n">${brush}</span></div></div>
        <div class="mp-stage"><canvas></canvas><div class="mp-hint">Scroll to zoom · drag empty space to move around · double-click a pin or label to edit it</div></div></div>`;
    const ew = $('#editor-wrap'); ew.classList.add('hidden'); ew.after(view);
    cv = $('canvas', view); ctx = cv.getContext('2d');
    resize(); fit(); setTool('select'); draw();
    cv.addEventListener('pointerdown', pointerDown); cv.addEventListener('pointermove', pointerMove); window.addEventListener('pointerup', pointerUp);
    cv.addEventListener('wheel', wheel, { passive: false }); cv.addEventListener('dblclick', dblclick);
    let autoFit = true;
    new ResizeObserver(() => { if (!view) return; if (autoFit) fit(); resize(); }).observe($('.mp-stage', view));
    cv.addEventListener('pointerdown', () => { autoFit = false; }); cv.addEventListener('wheel', () => { autoFit = false; });
    $$('.mp-tool', view).forEach(b => b.onclick = () => setTool(b.dataset.t));
    $('#mp-size', view).oninput = e => { brush = +e.target.value; $('#mp-size-n', view).textContent = brush; redraw(); };
    $('#mp-close', view).onclick = () => close();
    $('#mp-style', view).onchange = e => { push(); st.style = e.target.value; landDirty = true; changed(); schedule(); };
    $('#mp-grid', view).onclick = e => { push(); st.grid = !st.grid; e.currentTarget.classList.toggle('on', st.grid); redraw(); schedule(); };
    $('#mp-compass', view).onclick = e => { push(); st.compass = !st.compass; e.currentTarget.classList.toggle('on', st.compass); changed(); schedule(); };
    $('#mp-frame', view).onchange = e => { push(); st.frame = e.target.value; changed(); schedule(); };
    $('#mp-clear', view).onclick = async () => {
      if (!await U.confirmBox('Clear this map?', 'Removes all land, forests, towns, roads, labels and pins from this section. Undo (Ctrl+Z) brings it back.', 'Clear the map')) return;
      push(); const keep = { name: st.name, style: st.style, grid: st.grid, compass: st.compass, frame: st.frame };
      Object.keys(st).forEach(k => delete st[k]); Object.assign(st, blank(keep.style), keep);
      mctx.clearRect(0, 0, MW, MH); landDirty = true; sel = null; changed(); schedule();
    };
    renderTabs();
    $('#mp-undo', view).onclick = () => { if (undo.length) { redo.push(snapshot()); restore(undo.pop()); } };
    $('#mp-redo', view).onclick = () => { if (redo.length) { undo.push(snapshot()); restore(redo.pop()); } };
    $('#mp-copy', view).onclick = () => exportPNG(true);
    $('#mp-png', view).onclick = () => exportPNG(false);
    $('#mp-gen', view).onclick = async () => {
      let el;
      const hasLand = !!maskData();
      const kind = await U.modal({ title: 'Generate land', onOpen: x => { el = x; },
        body: `<p>Makes random land with mountains, forests, rivers, towns and made-up names. Undo brings back what was there.</p>
          <div class="chip-row" id="mp-gen-mode" style="margin-top:8px"><button type="button" class="chip ${hasLand ? 'on' : ''}" data-v="add">Add it to this map (keep what’s here)</button><button type="button" class="chip ${hasLand ? '' : 'on'}" data-v="replace">Replace this map</button></div>`,
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Islands', value: 'archipelago', kind: 'ghost' }, { label: 'Continent', value: 'continent', kind: 'ghost' }, { label: 'One island', value: 'island', kind: 'primary' }] });
      if (!kind) return;
      const mode = el && el.querySelector('#mp-gen-mode .chip.on');
      generate(kind, !!(mode && mode.dataset.v === 'add' && hasLand));
    };
    document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('#mp-gen-mode .chip'); if (c) { c.parentElement.querySelectorAll('.chip').forEach(x => x.classList.remove('on')); c.classList.add('on'); } });
    document.addEventListener('keydown', keys, true);
    if (!st.land && !st.stamps.length) U.toast('A blank map. Try ✨ Generate… for a starting point, or paint land with 🟫.', '', 6000);
  }
  // ---- sections: several maps inside one (the world, a region, a city…)
  function renderTabs() {
    const box = $('#mp-tabs', view); if (!box) return;
    box.innerHTML = docData.sections.map((x, i) => `<button class="mp-tab ${i === docData.active ? 'on' : ''}" data-i="${i}" data-tip="Double-click to rename, right-click for more">${esc(x.name || 'Map ' + (i + 1))}</button>`).join('') +
      `<button class="mp-tab add" id="mp-add-sec" data-tip="Add another map section: a region close-up, a city, another continent…">+ Section</button>`;
    $$('.mp-tab[data-i]', box).forEach(b => {
      const i = +b.dataset.i;
      b.onclick = async () => { if (i === docData.active) return; await switchTo(i); };
      b.ondblclick = () => renameSection(i);
      b.oncontextmenu = e => { e.preventDefault(); U.showMenu(e.clientX, e.clientY, [
        { label: 'Rename…', action: () => renameSection(i) },
        { label: 'Duplicate', action: () => addSection('copy', i) },
        { label: 'Move left', action: () => moveSection(i, -1) }, { label: 'Move right', action: () => moveSection(i, 1) },
        { sep: true }, { label: 'Delete this section…', action: () => deleteSection(i) }]); };
    });
    $('#mp-add-sec', box).onclick = () => addSection();
  }
  async function switchTo(i) { await useSection(i); syncControls(); renderTabs(); baseKey = ''; changed(); schedule(); }
  function syncControls() {
    const v = view; if (!v) return;
    $('#mp-style', v).value = st.style; $('#mp-frame', v).value = st.frame || 'double';
    $('#mp-grid', v).classList.toggle('on', !!st.grid); $('#mp-compass', v).classList.toggle('on', !!st.compass);
  }
  async function renameSection(i) {
    const name = await U.promptText('Rename section', 'Name', docData.sections[i].name || ''); if (!name) return;
    docData.sections[i].name = name.trim(); renderTabs(); schedule();
  }
  function moveSection(i, d) {
    const j = i + d; if (j < 0 || j >= docData.sections.length) return;
    st.land = maskData();
    const [x] = docData.sections.splice(i, 1); docData.sections.splice(j, 0, x);
    docData.active = docData.sections.indexOf(st); renderTabs(); schedule();
  }
  async function deleteSection(i) {
    if (docData.sections.length === 1) { U.toast('A map needs at least one section. Use Clear to empty it instead.'); return; }
    if (!await U.confirmBox('Delete this section?', `“${esc(docData.sections[i].name)}” and everything on it will be removed.`, 'Delete section')) return;
    docData.sections.splice(i, 1);
    st = null; await useSection(Math.min(i, docData.sections.length - 1)); syncControls(); renderTabs(); baseKey = ''; changed(); schedule();
  }
  async function addSection(how, from) {
    let el;
    if (how !== 'copy') {
      how = await U.modal({ title: 'New map section', onOpen: x => { el = x; },
        body: `<div class="field"><label>Name</label><input id="ms-name" placeholder="e.g. The Northern Reach, City of Kael"></div><p class="hint" style="margin-top:8px">Start it empty, or generate land to work from.</p>`,
        buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Empty', value: 'blank', kind: 'ghost' }, { label: 'Islands', value: 'archipelago', kind: 'ghost' }, { label: 'Continent', value: 'continent', kind: 'ghost' }, { label: 'One island', value: 'island', kind: 'primary' }] });
      if (!how) return;
    }
    st.land = maskData();
    const name = how === 'copy' ? `${docData.sections[from].name} (copy)` : ((el && el.querySelector('#ms-name').value.trim()) || `Section ${docData.sections.length + 1}`);
    const sec = how === 'copy' ? JSON.parse(JSON.stringify(docData.sections[from])) : blank(st.style);
    sec.name = name;
    docData.sections.push(sec);
    await useSection(docData.sections.length - 1); syncControls(); renderTabs(); baseKey = '';
    if (how !== 'copy' && how !== 'blank') generate(how); else { changed(); schedule(); }
    undo = [];
  }
  function keys(e) {
    if (!view || document.querySelector('.modal-back')) return;
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); $('#mp-undo', view).click(); }
    else if (ctrl && e.key.toLowerCase() === 'y') { e.preventDefault(); e.stopPropagation(); $('#mp-redo', view).click(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); e.stopPropagation(); removeSel(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (sel) { sel = null; redraw(); } else close(); }
  }
  async function close(quiet) {
    if (!view) return;
    await saveNow();
    document.removeEventListener('keydown', keys, true); window.removeEventListener('pointerup', pointerUp);
    view.remove(); view = null; cv = null; ctx = null; nodeId = null;
    $('#editor-wrap').classList.remove('hidden');
  }
  async function create(parentId) {
    const title = await U.promptText('New map', 'Name of the map', 'Map of the world'); if (!title) return;
    const home = S.project.binder.find(n => n.root && n.kind === 'places') || S.project.binder.find(n => n.root && n.kind === 'notes') || S.project.binder[0];
    const f = U.findNode(parentId) || U.findNode(home.id);
    const node = { id: U.uid(), type: 'doc', title, words: 0, map: true, icon: '🗺️' };
    (f.node.children = f.node.children || []).push(node); f.node.open = true;
    await api.saveDoc(S.slug, node.id, JSON.stringify(blank()));
    U.scheduleMeta(); U.renderBinder();
    U.openDoc(node.id);
  }
  U.on('leave', () => close(true)); U.on('doc', () => close(true)); U.on('view', () => close(true));
  return { open, create, close, generate: (k, add) => generate(k, add), addSection, switchTo, get state() { return st; }, get doc() { return docData; } };
})();
