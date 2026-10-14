// Unwip - town and city maps. A map section of kind "town" has its own short set of tools (streets, buildings,
// walls, water, areas, landmarks) on the same canvas, undo, labels, pins and frames as world maps.
// Options for a tool (street width, area type…) only appear once that tool is picked, so the tool column stays short.
// 🎲 Random town rolls a village, town or city from fixed rules and random numbers. No AI.
// Top-down only for now; buildings keep room for a "floor plan" link later (b.plan).
window.UnwipTownFactory = function (M) {
  'use strict';
  const { W, H, MW, MH, K } = M;
  const ICON = (d, c = '#3a3a3a') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const TOOLS = [
    ['select', '✋', 'Move & select: drag things around, double-click a label or pin to edit it, Delete removes it. Drag empty space to pan; scroll to zoom'],
    ['street', ICON('<path d="M4 20 C8 13 12 11 20 4" stroke-width="5" stroke="#a08560"/><path d="M4 20 C8 13 12 11 20 4" stroke-width="1.5" stroke="#fff" stroke-dasharray="2 3"/>'), 'Street: drag to draw. Streets join up where they meet. Pick alley, street or main road above'],
    ['building', ICON('<rect x="4" y="9" width="7" height="10" fill="#c79a6b"/><rect x="13" y="5" width="7" height="14" fill="#b98a5e"/>'), 'Building: drag to draw one, or click inside a block of streets to fill it with buildings'],
    ['wall', ICON('<path d="M3 17 L12 7 L21 12" stroke-width="3.5"/><circle cx="3" cy="17" r="2.6" fill="#fff"/><circle cx="12" cy="7" r="2.6" fill="#fff"/><circle cx="21" cy="12" r="2.6" fill="#fff"/>'), 'Town wall: drag to draw. Towers appear along it and gates where streets cross. Finish near the start to close it'],
    ['water', '🌊', 'Water: paint rivers, a harbour or canals. Brush size below'],
    ['land', '🟫', 'Land: paint ground over water, for a coast, a riverbank or an island town. To start from open sea, use “Flood the map with water” above'],
    ['area', ICON('<path d="M4 8 L10 4 L20 7 L18 18 L7 19 Z" fill="#b9c48a"/>'), 'Area: paint a park, market square, fields or a graveyard with the brush (or switch to “Draw around”)'],
    ['landmark', '🏰', 'Landmark: castle, temple, tower, gate, well, market stalls, statue or bridge. Pick one above, then click'],
    ['frame', ICON('<rect x="3" y="5" width="18" height="14"/><rect x="6" y="8" width="12" height="8" stroke-width="1"/>'), 'Frame: drag out a box for your map edge, an inset or a title box'],
    ['pin', '📍', 'Pin: mark a place. You can link it to a Places sheet'],
    ['label', '🔤', 'Label: name a district, street, river or place']
  ];
  const OPTS = {
    street: { key: 'streetW', def: 'street', items: [['alley', 'Alley'], ['street', 'Street'], ['main', 'Main road']] },
    building: { key: 'density', def: 'normal', label: 'Block fill', items: [['sparse', 'Sparse'], ['normal', 'Normal'], ['dense', 'Dense']], hint: 'Drag for one building · click inside streets to fill the block' },
    area: { key: 'areaK', def: 'park', items: [['park', 'Park'], ['market', 'Market square'], ['field', 'Fields'], ['grave', 'Graveyard']],
      more: { key: 'areaMode', def: 'paint', items: [['paint', 'Paint'], ['around', 'Draw around']] } },
    land: { key: 'landMode', def: 'paint', items: [['paint', 'Paint land']], acts: [['flood', 'Flood the map with water'], ['dry', 'Clear all water']], hint: 'Brush size below' },
    landmark: { key: 'markK', def: 'castle', items: [['castle', 'Castle'], ['temple', 'Temple'], ['tower', 'Tower'], ['gate', 'Gate'], ['well', 'Well'], ['stalls', 'Market stalls'], ['statue', 'Statue'], ['bridge', 'Bridge']] },
    water: { key: 'waterOn', def: 'paint', items: [['paint', 'Paint water'], ['dry', 'Rub out water']] }
  };
  const opt = {}; for (const [t, o] of Object.entries(OPTS)) { opt[o.key] = o.def; if (o.more) opt[o.more.key] = o.more.def; }
  const WIDTH = { alley: 8, street: 14, main: 24 };
  const COL = {
    parchment: { ground: '#efe2c4', street: '#e2cfa6', bld: '#b98a5e', bld2: '#9c6b45', park: '#b9c48a', field: '#dccd95', plaza: '#e9dcbc', grave: '#c9caa6', wall: '#5a4632', water: '#a9bcb8' },
    atlas: { ground: '#ece7d6', street: '#fbf8f1', bld: '#c98f6d', bld2: '#a96d4e', park: '#a8cf8e', field: '#e5dca2', plaza: '#f3eee2', grave: '#c4d1b0', wall: '#4b4b4b', water: '#a9cfe0' },
    night: { ground: '#262d3b', street: '#3c4559', bld: '#5d6780', bld2: '#727c96', park: '#3a5845', field: '#4b4a3a', plaza: '#343c4e', grave: '#3d4a44', wall: '#c9b98f', water: '#1c2433' },
    ink: { ground: '#ffffff', street: '#ffffff', bld: '#ffffff', bld2: '#ffffff', park: '#ffffff', field: '#ffffff', plaza: '#ffffff', grave: '#ffffff', wall: '#111111', water: '#ffffff' }
  };
  const C = P => COL[Object.keys(M.STYLES).find(k => M.STYLES[k] === P)] || COL.parchment;
  const st = () => M.st;
  const r1 = v => Math.round(v * 10) / 10;

  // ---------------------------------------------------------------- geometry
  const bbox = pts => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }; };
  function pip(x, y, pts) { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
  function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
  function lineDist(px, py, pts) { let d = 1e9; for (let i = 1; i < pts.length; i++) d = Math.min(d, segDist(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1])); return d; }
  function simplify(pts, eps) {
    if (pts.length < 3) return pts;
    let dmax = 0, idx = 0; const [a, b] = [pts[0], pts[pts.length - 1]];
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > dmax) { dmax = d; idx = i; } }
    if (dmax <= eps) return [a, b];
    return simplify(pts.slice(0, idx + 1), eps).slice(0, -1).concat(simplify(pts.slice(idx), eps));
  }
  function segX(a, b, c, d) {   // where segment ab crosses cd
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0]; if (Math.abs(den) < 1e-9) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * r[0], a[1] + t * r[1], Math.atan2(r[1], r[0])] : null;
  }
  // the nearest point on any street (for joining streets up, and lining buildings along them)
  function nearestStreet(x, y, maxD) {
    let best = null;
    for (const s of st().streets) for (let i = 1; i < s.pts.length; i++) {
      const [ax, ay] = s.pts[i - 1], [bx, by] = s.pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx, qy = ay + t * dy, d = Math.hypot(x - qx, y - qy);
      if (d < maxD && (!best || d < best.d)) best = { d, x: qx, y: qy, ang: Math.atan2(dy, dx), s };
    }
    return best;
  }
  const rect = (cx, cy, w, h, a) => { const c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [r1(cx + x * c - y * s), r1(cy + x * s + y * c)]); };

  // ---------------------------------------------------------------- drawing
  function renderBase(g, P) {
    const c = C(P);
    g.fillStyle = c.ground; g.fillRect(0, 0, W, H);
    const r = M.rng((st().seed || 1) + 11); g.fillStyle = P.ink; g.globalAlpha = 0.05; for (let i = 0; i < 7000; i++) g.fillRect(r() * W, r() * H, 1.4, 1.4); g.globalAlpha = 1;
    // water from the painted mask, with a soft bank and a few ripples
    const a = document.createElement('canvas'); a.width = W; a.height = H; const ag = a.getContext('2d', { willReadFrequently: true });
    ag.filter = 'blur(4px)'; ag.imageSmoothingEnabled = true; ag.drawImage(M.mask, 0, 0, W, H); ag.filter = 'none';
    const id = ag.getImageData(0, 0, W, H), d = id.data; for (let i = 3; i < d.length; i += 4) d[i] = d[i] > 120 ? 255 : 0; ag.putImageData(id, 0, 0);
    const tint = col => { const t = document.createElement('canvas'); t.width = W; t.height = H; const x = t.getContext('2d'); x.drawImage(a, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, W, H); return t; };
    const bank = tint(P.coast); for (const [dx, dy] of [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]]) g.drawImage(bank, dx, dy);
    const w = tint(c.water); g.drawImage(w, 0, 0);
    const rip = document.createElement('canvas'); rip.width = W; rip.height = H; const rg = rip.getContext('2d');
    rg.strokeStyle = P.seaLine; rg.globalAlpha = 0.5; rg.lineWidth = 1; const rr = M.rng(77);
    for (let i = 0; i < 260; i++) { const x = rr() * W, y = rr() * H; rg.beginPath(); rg.moveTo(x, y); rg.quadraticCurveTo(x + 6, y - 3, x + 12, y); rg.quadraticCurveTo(x + 18, y + 3, x + 24, y); rg.stroke(); }
    rg.globalCompositeOperation = 'destination-in'; rg.globalAlpha = 1; rg.drawImage(a, 0, 0); g.drawImage(rip, 0, 0);
    if (st().grid) { g.strokeStyle = P.ink; g.globalAlpha = 0.1; g.lineWidth = 1; for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } for (let y = 0; y < H; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } g.globalAlpha = 1; }
  }
  function poly(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); }
  function drawArea(g, a, P, i, noEdge, mode) {
    const c = C(P), col = { park: c.park, market: c.plaza, field: c.field, grave: c.grave }[a.k] || c.park;
    if (mode === 'fill') { poly(g, a.pts); g.fillStyle = col; g.fill(); return; }
    g.save();
    if (mode === 'tex') { if (a.k === 'field') { poly(g, a.pts); g.clip(); } }   // (the caller has already clipped to the whole shape)
    else { poly(g, a.pts); g.fillStyle = col; g.fill(); g.clip(); }
    const b = bbox(a.pts), r = M.rng(i * 97 + 5 + Math.round(b.x));
    g.strokeStyle = P.ink; g.fillStyle = P.ink; g.lineWidth = 1;
    if (a.k === 'park') { g.globalAlpha = 0.9; for (let k = 0; k < b.w * b.h / 500; k++) { const x = b.x + r() * b.w, y = b.y + r() * b.h, s = 4 + r() * 4; g.beginPath(); g.arc(x, y, s, 0, 7); g.fillStyle = M.shade(c.park, -0.18); g.fill(); g.stroke(); } }
    else if (a.k === 'field') { g.globalAlpha = 0.35; const ang = (r() - 0.5) * 1.2; g.translate(b.x + b.w / 2, b.y + b.h / 2); g.rotate(ang); const R = Math.hypot(b.w, b.h); for (let y = -R; y < R; y += 7) { g.beginPath(); g.moveTo(-R, y); g.lineTo(R, y); g.stroke(); } }
    else if (a.k === 'grave') { g.globalAlpha = 0.6; for (let y = b.y + 8; y < b.y + b.h; y += 12) for (let x = b.x + 8; x < b.x + b.w; x += 12) { g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x, y + 3); g.moveTo(x - 2, y - 1); g.lineTo(x + 2, y - 1); g.stroke(); } }
    else if (a.k === 'market') { g.globalAlpha = 0.25; for (let k = 0; k < b.w * b.h / 120; k++) g.fillRect(b.x + r() * b.w, b.y + r() * b.h, 1.5, 1.5); }
    g.restore();
    if (!noEdge) { g.save(); poly(g, a.pts); g.strokeStyle = P.ink; g.lineWidth = a.k === 'market' ? 1 : 1.3; g.globalAlpha = a.k === 'market' ? 0.4 : 0.7; if (a.k === 'field') g.setLineDash([4, 3]); g.stroke(); g.restore(); }
  }
  // Painted areas of the same kind that overlap become one shape: only their outside edge gets a line (no lines
  // criss-crossing where two strokes of park or field meet).
  function areaEdges(g, list, P, k) {
    const sc = Math.max(1, Math.abs(g.getTransform().a) || 1), o = document.createElement('canvas'); o.width = Math.ceil(W * sc); o.height = Math.ceil(H * sc);
    const x = o.getContext('2d'); x.scale(sc, sc);
    x.strokeStyle = P.ink; x.lineWidth = (k === 'market' ? 1 : 1.3) * 2; x.lineJoin = 'round'; if (k === 'field') x.setLineDash([4, 3]);
    for (const a of list) { poly(x, a.pts); x.stroke(); }
    x.setLineDash([]); x.globalCompositeOperation = 'destination-out'; x.fillStyle = '#000';
    for (const a of list) { poly(x, a.pts); x.fill(); }
    g.save(); g.globalAlpha = k === 'market' ? 0.4 : 0.7; g.drawImage(o, 0, 0, W, H); g.restore();
  }
  function line(g, pts) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); }
  function drawStreets(g, P, list) {
    const c = C(P);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    for (const s of list) { g.strokeStyle = P.ink; g.globalAlpha = 0.75; g.lineWidth = WIDTH[s.w || 'street'] + 3; line(g, s.pts); g.stroke(); }
    g.globalAlpha = 1;
    for (const s of list) { g.strokeStyle = c.street; g.lineWidth = WIDTH[s.w || 'street']; line(g, s.pts); g.stroke(); }
    g.restore();
  }
  function drawBuilding(g, b, P, i) {
    const c = C(P), ink = Object.keys(M.STYLES).find(k => M.STYLES[k] === P) === 'ink';
    g.save();
    if (!ink) { g.globalAlpha = 0.22; g.fillStyle = '#000'; poly(g, b.pts.map(([x, y]) => [x + 2.2, y + 2.2])); g.fill(); g.globalAlpha = 1; }
    poly(g, b.pts); g.fillStyle = b.big ? c.bld2 : M.shade(c.bld, ((i * 37) % 9 - 4) * 0.02); g.fill();
    g.strokeStyle = P.ink; g.lineWidth = 1.1; g.stroke();
    if (ink || b.big) { // a roof ridge line
      const [p0, p1, p2, p3] = b.pts, long = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= Math.hypot(p3[0] - p0[0], p3[1] - p0[1]);
      const m = (a, b2) => [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2], [a1, a2] = long ? [m(p0, p3), m(p1, p2)] : [m(p0, p1), m(p3, p2)];
      g.globalAlpha = 0.5; g.beginPath(); g.moveTo(a1[0], a1[1]); g.lineTo(a2[0], a2[1]); g.stroke();
    }
    g.restore();
  }
  function wallTowers(pts) {
    const out = [pts[0]]; let acc = 0;
    for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay); let t = 70 - acc;
      while (t < L) { out.push([ax + (bx - ax) * t / L, ay + (by - ay) * t / L]); t += 70; } acc = (acc + L) % 70; }
    return out;
  }
  function gates(w) {   // where streets cross this wall
    const out = [];
    for (const s of st().streets) for (let i = 1; i < s.pts.length; i++) for (let j = 1; j < w.pts.length; j++) { const x = segX(s.pts[i - 1], s.pts[i], w.pts[j - 1], w.pts[j]); if (x) out.push([x[0], x[1], x[2], WIDTH[s.w || 'street']]); }
    return out;
  }
  function drawWall(g, w, P) {
    const c = C(P);
    g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
    line(g, w.pts); g.strokeStyle = P.ink; g.lineWidth = 9; g.stroke(); g.strokeStyle = c.wall; g.lineWidth = 6; g.stroke();
    const gs = gates(w);
    for (const [x, y, ang, sw] of gs) { // a gap for the road, flanked by two square towers
      g.save(); g.translate(x, y); g.rotate(ang);
      g.fillStyle = C(P).street; g.fillRect(-sw / 2 - 1, -7, sw + 2, 14);
      for (const sx of [-sw / 2 - 7, sw / 2 + 7]) { g.fillStyle = c.wall; g.strokeStyle = P.ink; g.lineWidth = 1.4; g.fillRect(sx - 6, -9, 12, 18); g.strokeRect(sx - 6, -9, 12, 18); }
      g.restore();
    }
    for (const [x, y] of wallTowers(w.pts)) { if (gs.some(([gx, gy]) => Math.hypot(gx - x, gy - y) < 26)) continue; g.beginPath(); g.arc(x, y, 8, 0, 7); g.fillStyle = c.wall; g.fill(); g.strokeStyle = P.ink; g.lineWidth = 1.5; g.stroke(); }
    g.restore();
  }
  function renderUnder(g, P, skip) {
    const S2 = st(), sk = (t, i) => skip && skip.type === t && skip.i === i;
    // overlapping areas of one kind are drawn as one shape: all the colour, then the trees or marks across the whole
    // shape (so none are cut in half where two strokes meet), then one outline round the outside
    const kinds = {};
    S2.areas.forEach((a, i) => { if (!sk('area', i)) (kinds[a.k] = kinds[a.k] || []).push([a, i]); });
    const ccw = pts => { let s = 0; for (let j = 0; j < pts.length; j++) { const [x1, y1] = pts[j], [x2, y2] = pts[(j + 1) % pts.length]; s += x1 * y2 - x2 * y1; } return s < 0 ? pts.slice().reverse() : pts; };
    for (const [k, list] of Object.entries(kinds)) {
      for (const [a, i] of list) drawArea(g, a, P, i, true, 'fill');
      g.save(); g.beginPath();
      for (const [a] of list) { const q = ccw(a.pts); g.moveTo(q[0][0], q[0][1]); for (let j = 1; j < q.length; j++) g.lineTo(q[j][0], q[j][1]); g.closePath(); }
      g.clip('nonzero');
      if (k === 'field') for (const [a, i] of list) drawArea(g, a, P, i, true, 'tex');   // each field keeps its own furrows
      else {   // trees and marks spread once over the whole joined shape (overlaps don't get twice as many)
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const [a] of list) for (const [x, y] of a.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        drawArea(g, { k, pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }, P, list[0][1], true, 'tex');
      }
      g.restore();
      areaEdges(g, list.map(x => x[0]), P, k);
    }
    drawStreets(g, P, S2.streets.filter((_, i) => !sk('street', i)));
    S2.buildings.forEach((b, i) => { if (!sk('building', i)) drawBuilding(g, b, P, i); });
    S2.walls.forEach((w, i) => { if (!sk('wall', i)) drawWall(g, w, P); });
  }
  // landmarks
  function stamp(g, s, P) {
    if (!/^t-/.test(s.k)) return false;
    const c = C(P), k = s.k.slice(2), z = s.s || 1;
    g.save(); g.translate(s.x, s.y); g.rotate(s.rot || 0); g.scale(z, z); g.strokeStyle = P.ink; g.lineWidth = 1.5; g.lineJoin = 'round';
    const box = (x, y, w, h, f) => { g.fillStyle = f; g.fillRect(x, y, w, h); g.strokeRect(x, y, w, h); };
    if (k === 'castle') { box(-26, -22, 52, 44, c.bld2); for (const [x, y] of [[-26, -22], [26, -22], [-26, 22], [26, 22]]) { g.beginPath(); g.arc(x, y, 9, 0, 7); g.fillStyle = c.wall; g.fill(); g.stroke(); } box(-10, -10, 20, 20, c.wall); }
    else if (k === 'temple') { box(-9, -24, 18, 48, c.bld2); box(-22, -8, 44, 16, c.bld2); g.beginPath(); g.arc(0, 0, 8, 0, 7); g.fillStyle = c.plaza; g.fill(); g.stroke(); }
    else if (k === 'tower') { g.beginPath(); g.arc(0, 0, 11, 0, 7); g.fillStyle = c.wall; g.fill(); g.stroke(); g.beginPath(); g.arc(0, 0, 5, 0, 7); g.stroke(); }
    else if (k === 'gate') { box(-18, -7, 12, 14, c.wall); box(6, -7, 12, 14, c.wall); g.beginPath(); g.moveTo(-6, -7); g.lineTo(6, -7); g.moveTo(-6, 7); g.lineTo(6, 7); g.stroke(); }
    else if (k === 'well') { g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fillStyle = c.water; g.fill(); g.lineWidth = 2.2; g.stroke(); }
    else if (k === 'stalls') { const r = M.rng(Math.round(s.x * 7 + s.y)); for (let n = 0; n < 7; n++) { const x = (r() - 0.5) * 50, y = (r() - 0.5) * 34; g.save(); g.translate(x, y); g.rotate((r() - 0.5) * 0.6); box(-5, -4, 10, 8, n % 2 ? c.bld : c.field); g.restore(); } }
    else if (k === 'statue') { g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fillStyle = c.plaza; g.fill(); g.stroke(); g.fillStyle = P.ink; g.beginPath(); for (let n = 0; n < 10; n++) { const a = n * Math.PI / 5 - Math.PI / 2, rr = n % 2 ? 2 : 4.5; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.fill(); }
    else if (k === 'bridge') { const L = s.len || 60; g.fillStyle = c.street; g.fillRect(-L / 2, -8, L, 16); g.beginPath(); g.moveTo(-L / 2, -8); g.lineTo(L / 2, -8); g.moveTo(-L / 2, 8); g.lineTo(L / 2, 8); g.lineWidth = 2.2; g.stroke(); }
    g.restore();
    return true;
  }
  const stampBounds = s => { const k = s.k.slice(2), z = s.s || 1, h = { castle: 34, temple: 26, stalls: 30, bridge: (s.len || 60) / 2, gate: 20 }[k] || 12; return { x: s.x - h * z, y: s.y - h * z, w: h * 2 * z, h: h * 2 * z }; };

  // ---------------------------------------------------------------- selecting and moving
  const LISTS = { street: 'streets', building: 'buildings', wall: 'walls', area: 'areas' };
  function hit(x, y) {
    const S2 = st();
    for (let i = S2.buildings.length - 1; i >= 0; i--) if (pip(x, y, S2.buildings[i].pts)) return { type: 'building', i };
    for (let i = S2.walls.length - 1; i >= 0; i--) if (lineDist(x, y, S2.walls[i].pts) < 8) return { type: 'wall', i };
    for (let i = S2.streets.length - 1; i >= 0; i--) if (lineDist(x, y, S2.streets[i].pts) < WIDTH[S2.streets[i].w || 'street'] / 2 + 3) return { type: 'street', i };
    for (let i = S2.areas.length - 1; i >= 0; i--) if (pip(x, y, S2.areas[i].pts)) return { type: 'area', i };
    return null;
  }
  function bounds(s) { const o = LISTS[s.type] && st()[LISTS[s.type]][s.i]; return o ? bbox(o.pts) : null; }
  function moveBy(s, dx, dy) { const o = st()[LISTS[s.type]][s.i]; if (o) o.pts.forEach(p => { p[0] += dx; p[1] += dy; }); }
  function drawOne(g, s, P) {
    const o = LISTS[s.type] && st()[LISTS[s.type]][s.i]; if (!o) return;
    if (s.type === 'street') drawStreets(g, P, [o]); else if (s.type === 'building') drawBuilding(g, o, P, s.i); else if (s.type === 'wall') drawWall(g, o, P); else if (s.type === 'area') drawArea(g, o, P, s.i);
  }

  // ---------------------------------------------------------------- tools
  let td = null;
  function pointerDown(p, tool) {
    const S2 = st();
    if (tool === 'street') { const n = nearestStreet(p.x, p.y, 18); td = { street: { w: opt.streetW, pts: [n ? [r1(n.x), r1(n.y)] : [r1(p.x), r1(p.y)]] } }; return true; }
    if (tool === 'wall') { td = { wall: { pts: [[r1(p.x), r1(p.y)]] } }; return true; }
    if (tool === 'area' && opt.areaMode === 'paint') { td = { areaPaint: { k: opt.areaK, w: Math.max(6, M.brush * K), pts: [[r1(p.x), r1(p.y)]] } }; M.redraw(); return true; }
    if (tool === 'area') { td = { area: { k: opt.areaK, pts: [[r1(p.x), r1(p.y)]] } }; return true; }
    if (tool === 'land') { td = { brush: true, on: false, last: p }; M.paint(p.x, p.y, false); M.redraw(); return true; }
    if (tool === 'building') { const n = nearestStreet(p.x, p.y, 70); td = { bld: { x0: p.x, y0: p.y, x1: p.x, y1: p.y, ang: n ? n.ang : 0 } }; return true; }
    if (tool === 'water') { td = { brush: true, on: opt.waterOn === 'paint', last: p }; M.paint(p.x, p.y, td.on); M.redraw(); return true; }
    if (tool === 'landmark') {
      const k = opt.markK, s = { k: 't-' + k, x: r1(p.x), y: r1(p.y), s: 1 };
      const n = nearestStreet(p.x, p.y, 60); if (n && ['gate', 'bridge', 'stalls'].includes(k)) s.rot = r1(k === 'bridge' ? n.ang : n.ang + Math.PI / 2);
      if (k === 'gate' && n) { s.x = r1(n.x); s.y = r1(n.y); }
      S2.stamps.push(s); M.select({ type: 'stamp', i: S2.stamps.length - 1 }); M.changed(); M.schedule(); return true;
    }
    return false;
  }
  function pointerMove(p) {
    if (!td) return false;
    if (td.brush) { M.paint(p.x, p.y, td.on, td.last); td.last = p; M.redraw(); return true; }
    if (td.areaPaint) { const l = td.areaPaint.pts[td.areaPaint.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 3) { td.areaPaint.pts.push([r1(p.x), r1(p.y)]); M.redraw(); } return true; }
    const path = td.street || td.wall || td.area;
    if (path) { const l = path.pts[path.pts.length - 1]; if (Math.hypot(p.x - l[0], p.y - l[1]) > 8) { path.pts.push([r1(p.x), r1(p.y)]); M.redraw(); } return true; }
    if (td.bld) { td.bld.x1 = p.x; td.bld.y1 = p.y; M.redraw(); return true; }
    return true;
  }
  function bldRect(b) {
    const c = Math.cos(-b.ang), s = Math.sin(-b.ang), dx = b.x1 - b.x0, dy = b.y1 - b.y0, u = dx * c - dy * s, v = dx * s + dy * c;
    const cx = b.x0 + dx / 2, cy = b.y0 + dy / 2;
    return rect(cx, cy, Math.abs(u), Math.abs(v), b.ang);
  }
  function pointerUp() {
    if (!td) return false;
    const d = td, S2 = st(); td = null;
    if (d.brush) { M.landDirty(); M.changed(); M.schedule(); return true; }
    if (d.street) {
      let pts = simplify(d.street.pts, 2.5);
      if (pts.length < 2 || Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 6 && pts.length < 3) { M.undoPop(); M.redraw(); return true; }
      const end = pts[pts.length - 1], n = nearestStreet(end[0], end[1], 18); if (n) pts[pts.length - 1] = [r1(n.x), r1(n.y)];
      S2.streets.push({ w: d.street.w, pts }); M.select({ type: 'street', i: S2.streets.length - 1 });
    } else if (d.wall) {
      let pts = simplify(d.wall.pts, 3); if (pts.length < 2) { M.undoPop(); M.redraw(); return true; }
      const a = pts[0], b = pts[pts.length - 1]; if (pts.length > 3 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 30) pts[pts.length - 1] = [a[0], a[1]];
      S2.walls.push({ pts }); M.select({ type: 'wall', i: S2.walls.length - 1 });
    } else if (d.areaPaint) {
      const pts = strokeOutline(d.areaPaint.pts, d.areaPaint.w);
      if (!pts || pts.length < 3) { M.undoPop(); M.redraw(); return true; }
      S2.areas.push({ k: d.areaPaint.k, pts }); M.select({ type: 'area', i: S2.areas.length - 1 });
    } else if (d.area) {
      const pts = simplify(d.area.pts, 2.5); if (pts.length < 3 || bbox(pts).w * bbox(pts).h < 300) { M.undoPop(); M.redraw(); return true; }
      S2.areas.push({ k: d.area.k, pts }); M.select({ type: 'area', i: S2.areas.length - 1 });
    } else if (d.bld) {
      const moved = Math.hypot(d.bld.x1 - d.bld.x0, d.bld.y1 - d.bld.y0);
      if (moved < 8) { const n = fillBlock(d.bld.x0, d.bld.y0, opt.density); if (!n) M.undoPop(); else M.toast(`${n} building${n === 1 ? '' : 's'} added. Undo (Ctrl+Z) takes them away again.`); }
      else { const pts = bldRect(d.bld); const bb = bbox(pts); if (bb.w > 5 && bb.h > 5) { S2.buildings.push({ pts, big: bb.w * bb.h > 2200 }); M.select({ type: 'building', i: S2.buildings.length - 1 }); } else M.undoPop(); }
    }
    M.changed(); M.schedule(); return true;
  }
  function drawPreview(g, P) {
    if (!td) return;
    if (td.street && td.street.pts.length > 1) drawStreets(g, P, [td.street]);
    if (td.wall && td.wall.pts.length > 1) drawWall(g, td.wall, P);
    if (td.area && td.area.pts.length > 2) { g.save(); g.globalAlpha = 0.7; drawArea(g, td.area, P, 0); g.restore(); }
    if (td.areaPaint) { const c = C(P), a = td.areaPaint; g.save(); g.globalAlpha = 0.75; g.strokeStyle = { park: c.park, market: c.plaza, field: c.field, grave: c.grave }[a.k] || c.park; g.lineWidth = a.w; g.lineCap = 'round'; g.lineJoin = 'round';
      if (a.pts.length === 1) { g.beginPath(); g.arc(a.pts[0][0], a.pts[0][1], a.w / 2, 0, 7); g.fillStyle = g.strokeStyle; g.fill(); } else { line(g, a.pts); g.stroke(); } g.restore(); }
    if (td.bld && Math.hypot(td.bld.x1 - td.bld.x0, td.bld.y1 - td.bld.y0) >= 8) drawBuilding(g, { pts: bldRect(td.bld) }, P, 0);
  }
  const brushy = tool => tool === 'water' || tool === 'land' || (tool === 'area' && opt.areaMode === 'paint');
  // a painted brush stroke becomes an ordinary area shape: drawn onto a small grid, then its outline traced
  function strokeOutline(pts, w) {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), pad = w / 2 + 3;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, bw = Math.max(...xs) + pad - x0, bh = Math.max(...ys) + pad - y0;
    const sc = Math.max(1, Math.max(bw, bh) / 360), gw = Math.ceil(bw / sc) + 2, gh = Math.ceil(bh / sc) + 2;
    const cnv = document.createElement('canvas'); cnv.width = gw; cnv.height = gh; const g = cnv.getContext('2d');
    g.fillStyle = g.strokeStyle = '#000'; g.lineWidth = w / sc; g.lineCap = 'round'; g.lineJoin = 'round';
    const X = q => (q[0] - x0) / sc + 1, Y = q => (q[1] - y0) / sc + 1;
    if (pts.length === 1) { g.beginPath(); g.arc(X(pts[0]), Y(pts[0]), w / sc / 2, 0, 7); g.fill(); }
    else { g.beginPath(); g.moveTo(X(pts[0]), Y(pts[0])); for (const q of pts.slice(1)) g.lineTo(X(q), Y(q)); g.stroke(); }
    const d = g.getImageData(0, 0, gw, gh).data, on = (x, y) => x >= 0 && y >= 0 && x < gw && y < gh && d[(y * gw + x) * 4 + 3] > 100;
    let sx = -1, sy = -1; for (let y = 0; y < gh && sx < 0; y++) for (let x = 0; x < gw; x++) if (on(x, y)) { sx = x; sy = y; break; }
    if (sx < 0) return null;
    // Moore-neighbour tracing round the outside of the shape
    const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
    const out = [[sx, sy]]; let cx = sx, cy = sy, bx = sx - 1, by = sy;
    for (let n = 0; n < 40000; n++) {
      let k = D.findIndex(([dx, dy]) => cx + dx === bx && cy + dy === by), found = false;
      for (let j = 1; j <= 8; j++) { const [dx, dy] = D[(k + j) % 8]; const nx = cx + dx, ny = cy + dy;
        if (on(nx, ny)) { const [pdx, pdy] = D[(k + j - 1) % 8]; bx = cx + pdx; by = cy + pdy; cx = nx; cy = ny; found = true; break; } }
      if (!found || (cx === sx && cy === sy)) break;
      out.push([cx, cy]);
    }
    const world = out.map(([x, y]) => [r1((x - 1 + 0.5) * sc + x0), r1((y - 1 + 0.5) * sc + y0)]);
    return simplify(world, Math.max(1.2, sc * 0.8));
  }
  // one-click helpers for the Land tool
  const ACTS = {
    flood: () => { M.push(); M.mctx.globalCompositeOperation = 'source-over'; M.mctx.fillStyle = '#000'; M.mctx.fillRect(0, 0, MW, MH); M.landDirty(); M.changed(); M.schedule(); M.toast('The map is all water now. Paint land with the Land brush. Undo (Ctrl+Z) brings it back.'); },
    dry: () => { M.push(); M.mctx.clearRect(0, 0, MW, MH); M.landDirty(); M.changed(); M.schedule(); M.toast('All water cleared. Undo (Ctrl+Z) brings it back.'); }
  };
  function optionsBar(tool, el) {
    const o = OPTS[tool];
    if (!o) { el.innerHTML = ''; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const chips = (key, items) => items.map(([v, l]) => `<button type="button" class="chip ${opt[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${l}</button>`).join('');
    el.innerHTML = (o.label ? `<span class="mp-opt-l">${o.label}</span>` : '') + chips(o.key, o.items)
      + (o.more ? `<span class="mp-opt-sep"></span>${chips(o.more.key, o.more.items)}` : '')
      + (o.acts ? `<span class="mp-opt-sep"></span>${o.acts.map(([a, l]) => `<button type="button" class="chip act" data-a="${a}">${l}</button>`).join('')}` : '')
      + (o.hint ? `<span class="mp-opt-h">${o.hint}</span>` : '');
    el.querySelectorAll('.chip[data-k]').forEach(b => b.onclick = () => { opt[b.dataset.k] = b.dataset.v; optionsBar(tool, el); M.redraw(); });
    el.querySelectorAll('.chip[data-a]').forEach(b => b.onclick = () => ACTS[b.dataset.a] && ACTS[b.dataset.a]());
  }

  // ---------------------------------------------------------------- filling a block with buildings
  const GS = 2;                               // the fill works on a grid of 2×2 map units
  const GW = Math.ceil(W / GS), GH = Math.ceil(H / GS);
  function obstacles(extra) {
    const c = document.createElement('canvas'); c.width = GW; c.height = GH; const g = c.getContext('2d', { willReadFrequently: true });
    g.scale(1 / GS, 1 / GS); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#000'; g.fillStyle = '#000';
    const S2 = st();
    for (const s of S2.streets) { g.lineWidth = WIDTH[s.w || 'street'] + 5; line(g, s.pts); g.stroke(); }
    for (const w of S2.walls) { g.lineWidth = 16; line(g, w.pts); g.stroke(); }
    for (const b of S2.buildings) { g.lineWidth = 3; poly(g, b.pts); g.fill(); g.stroke(); }
    for (const a of S2.areas) if (a.k !== 'field') { poly(g, a.pts); g.fill(); }
    for (const s of S2.stamps) if (/^t-/.test(s.k)) { const b = stampBounds(s); g.fillRect(b.x, b.y, b.w, b.h); }
    g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(M.mask, 0, 0, GW, GH);
    if (extra) extra(g);
    const d = g.getImageData(0, 0, GW, GH).data, out = new Uint8Array(GW * GH);
    for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3] > 40 ? 1 : 0;
    return out;
  }
  function flood(block, sx, sy, limit) {
    const reg = new Uint8Array(GW * GH), q = [sy * GW + sx]; let n = 0, edge = false; reg[q[0]] = 1;
    while (q.length) { const i = q.pop(); n++; if (n > limit) return null; const x = i % GW, y = (i / GW) | 0;
      if (x === 0 || y === 0 || x === GW - 1 || y === GH - 1) edge = true;
      for (const j of [i - 1, i + 1, i - GW, i + GW]) if (j >= 0 && j < reg.length && !reg[j] && !block[j] && Math.abs((j % GW) - x) <= 1) { reg[j] = 1; q.push(j); } }
    return { reg, n, edge };
  }
  function distance(reg) {
    const D = new Float32Array(GW * GH);
    for (let i = 0; i < D.length; i++) D[i] = reg[i] ? 1e6 : 0;
    for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) { const i = y * GW + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i - 1] + 1, D[i - GW] + 1, D[i - GW - 1] + 1.414, D[i - GW + 1] + 1.414); }
    for (let y = GH - 2; y > 0; y--) for (let x = GW - 2; x > 0; x--) { const i = y * GW + x; if (!D[i]) continue; D[i] = Math.min(D[i], D[i + 1] + 1, D[i + GW] + 1, D[i + GW + 1] + 1.414, D[i + GW - 1] + 1.414); }
    for (let i = 0; i < D.length; i++) if (D[i] >= 1e6) D[i] = 0;
    return D;
  }
  // buildings face the streets around the block, in a row (and a second row inside big blocks), leaving yards behind
  function placeIn(reg, density, r, opts = {}) {
    const D = distance(reg), occ = new Uint8Array(GW * GH), S2 = st();
    const dens = { sparse: 0.45, normal: 0.85, dense: 1 }[density] || 0.85;
    const depth = (opts.depth || 20) / GS, gapF = 1.2;
    let maxD = 0; for (let i = 0; i < D.length; i++) if (D[i] > maxD) maxD = D[i];
    // rows of buildings working inward from the streets, with a narrow lane or yard between every second row
    const rings = [], most = { sparse: 1, normal: 2, dense: 12 }[density] || 2;
    for (let t = gapF + depth / 2, k = 0; k < most && t < maxD - depth * 0.35; k++) { rings.push(t); t += depth + (k % 2 ? 4 : 1.2); }
    let added = 0;
    for (const target of rings) {
      const cand = []; for (let i = 0; i < D.length; i++) if (reg[i] && Math.abs(D[i] - target) < 0.75) cand.push(i);
      for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(r() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
      for (const i of cand) {
        if (occ[i]) continue;
        const x = i % GW, y = (i / GW) | 0;
        let nx = D[i + 1] - D[i - 1], ny = D[i + GW] - D[i - GW]; const L = Math.hypot(nx, ny); if (!L) continue; nx /= L; ny /= L;
        const wid = (opts.minW || 12) / GS + r() * ((opts.varW || 14) / GS), dep = depth * (0.85 + r() * 0.3);
        const ang = Math.atan2(nx, -ny);     // the frontage runs along the street
        const ca = Math.cos(ang), sa = Math.sin(ang), corners = [];
        let ok = true;
        for (let u = -0.5; u <= 0.5 && ok; u += 0.25) for (let v = -0.5; v <= 0.5; v += 0.25) {
          const px = Math.round(x + u * wid * ca - v * dep * sa), py = Math.round(y + u * wid * sa + v * dep * ca), j = py * GW + px;
          if (px < 1 || py < 1 || px >= GW - 1 || py >= GH - 1 || !reg[j] || D[j] < 0.7 || occ[j]) { ok = false; break; }
        }
        if (!ok) continue;
        // keep a small gap to the neighbours
        const pad = 0.8, w2 = wid / 2 + pad, d2 = dep / 2 + pad;
        for (let u = -w2; u <= w2; u += 0.5) for (let v = -d2; v <= d2; v += 0.5) { const px = Math.round(x + u * ca - v * sa), py = Math.round(y + u * sa + v * ca); if (px >= 0 && py >= 0 && px < GW && py < GH) occ[py * GW + px] = 1; }
        if (r() > dens) continue;
        S2.buildings.push({ pts: rect(x * GS, y * GS, wid * GS, dep * GS, ang), big: wid * dep * GS * GS > 900 && r() < 0.3 });
        added++;
      }
    }
    return added;
  }
  function fillBlock(x, y, density) {
    const block = obstacles(), gx = Math.floor(x / GS), gy = Math.floor(y / GS);
    if (block[gy * GW + gx]) { M.toast('Click in the space between streets to fill that block with buildings.'); return 0; }
    let f = flood(block, gx, gy, GW * GH * 0.5);
    if (!f || f.edge) {   // an open space: build round the click instead of the whole map
      const circ = obstacles(g => { g.save(); g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, GW, GH); g.arc(gx, gy, 160 / GS, 0, 7, true); g.fill('evenodd'); g.restore(); });
      f = flood(circ, gx, gy, GW * GH);
    }
    if (!f || f.n < 40) { M.toast('That space is too small for buildings.'); return 0; }
    return placeIn(f.reg, density, M.rng(Math.floor(Math.random() * 1e9)));
  }

  // ---------------------------------------------------------------- 🎲 random village, town or city
  function generate(size) {
    const S2 = st(); M.push();
    const seed = Math.floor(Math.random() * 1e9); S2.seed = seed;
    const r = M.rng(seed), n = M.noise2(seed + 1);
    S2.streets = []; S2.buildings = []; S2.walls = []; S2.areas = []; S2.stamps = []; S2.labels = []; S2.pins = [];
    M.mctx.clearRect(0, 0, MW, MH);
    const cfg = { village: { R: 190, roads: 3 + Math.floor(r() * 2), rings: [], wall: false, dens: 'normal' }, town: { R: 300, roads: 4 + Math.floor(r() * 2), rings: [0.55], wall: r() < 0.7, dens: 'normal' }, city: { R: 430, roads: 6 + Math.floor(r() * 2), rings: [0.38, 0.68], wall: true, dens: 'dense' } }[size];
    const cx = W / 2 + (r() - 0.5) * 120, cy = H / 2 + (r() - 0.5) * 60;
    const RR = a => cfg.R * (0.88 + M.fbm(n, Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, 3) * 0.3);

    // water: a river through the middle, or the sea along one side (a harbour town)
    const water = r(); let river = null;
    if (water < 0.55) {
      const horiz = r() < 0.5, pts = [];
      for (let t = -0.05; t <= 1.05; t += 0.02) { const off = (M.fbm(n, t * 3, 9.5, 3) - 0.5) * 320 + (r() - 0.5) * 6; pts.push(horiz ? [t * W, cy + 120 + off] : [cx + 160 + off, t * H]); }
      const wid = size === 'village' ? 9 : 13;
      M.mctx.strokeStyle = '#000'; M.mctx.lineCap = 'round'; M.mctx.lineJoin = 'round'; M.mctx.lineWidth = wid; M.mctx.beginPath(); pts.forEach(([x, y], i) => i ? M.mctx.lineTo(x / K, y / K) : M.mctx.moveTo(x / K, y / K)); M.mctx.stroke();
      river = pts;
    } else if (water < 0.8 && size !== 'village') {
      const side = Math.floor(r() * 4); M.mctx.fillStyle = '#000'; M.mctx.beginPath();
      for (let t = 0; t <= 1.001; t += 0.01) { const o = 0.16 + M.fbm(n, t * 4, 3.3, 3) * 0.12; const p = side === 0 ? [t * MW, MH * (1 - o)] : side === 1 ? [t * MW, MH * o] : side === 2 ? [MW * o, t * MH] : [MW * (1 - o), t * MH]; t ? M.mctx.lineTo(p[0], p[1]) : M.mctx.moveTo(p[0], p[1]); }
      if (side === 0) { M.mctx.lineTo(MW, MH); M.mctx.lineTo(0, MH); } else if (side === 1) { M.mctx.lineTo(MW, 0); M.mctx.lineTo(0, 0); } else if (side === 2) { M.mctx.lineTo(0, MH); M.mctx.lineTo(0, 0); } else { M.mctx.lineTo(MW, MH); M.mctx.lineTo(MW, 0); }
      M.mctx.fill();
    }
    const mdata = M.mctx.getImageData(0, 0, MW, MH).data;
    const wet = (x, y) => { const mx = Math.floor(x / K), my = Math.floor(y / K); return mx >= 0 && my >= 0 && mx < MW && my < MH && mdata[(my * MW + mx) * 4 + 3] > 100; };
    // keep the middle of town on dry land
    let ox = cx, oy = cy; for (let t = 0; t < 60 && wet(ox, oy); t++) { ox = cx + (r() - 0.5) * 400; oy = cy + (r() - 0.5) * 300; }

    // the square in the middle
    const sqR = size === 'village' ? 34 : size === 'town' ? 46 : 62, sq = [];
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + r() * 0.3; sq.push([r1(ox + Math.cos(a) * sqR * (0.85 + r() * 0.3)), r1(oy + Math.sin(a) * sqR * (0.75 + r() * 0.3))]); }
    S2.areas.push({ k: size === 'village' ? 'park' : 'market', pts: sq });

    // main roads from the square out to the edge of the map
    const a0 = r() * Math.PI * 2, ends = [];
    for (let k = 0; k < cfg.roads; k++) {
      let a = a0 + k / cfg.roads * Math.PI * 2 + (r() - 0.5) * 0.4, x = ox + Math.cos(a) * sqR * 0.9, y = oy + Math.sin(a) * sqR * 0.9;
      const pts = [[r1(x), r1(y)]]; let wetRun = 0;
      for (let step = 0; step < 120 && x > -20 && y > -20 && x < W + 20 && y < H + 20; step++) {
        a += (M.fbm(n, x / 180 + k * 3, y / 180, 2) - 0.5) * 0.32; x += Math.cos(a) * 26; y += Math.sin(a) * 26;
        if (wet(x, y)) wetRun++; else wetRun = 0;
        if (wetRun > (river ? 3 : 0)) { pts.splice(pts.length - (wetRun - 1)); break; }       // a road crosses a river on a bridge, but stops at the sea or a long stretch of water
        pts.push([r1(x), r1(y)]);
      }
      if (pts.length > 2) { S2.streets.push({ w: 'main', pts: simplify(pts, 2) }); ends.push(pts); }
    }
    // ring streets joining the main roads, and cross streets between them
    for (const f of cfg.rings) {
      const pts = []; for (let k = 0; k <= 48; k++) { const a = k / 48 * Math.PI * 2; const rr = RR(a) * f; pts.push([r1(ox + Math.cos(a) * rr * 1.15), r1(oy + Math.sin(a) * rr * 0.92)]); }
      // break the ring where it would run through water
      let cur = [];
      for (const p of pts) { if (wet(p[0], p[1])) { if (cur.length > 2) S2.streets.push({ w: 'street', pts: simplify(cur, 2) }); cur = []; } else cur.push(p); }
      if (cur.length > 2) S2.streets.push({ w: 'street', pts: simplify(cur, 2) });
    }
    const lanes = size === 'village' ? 2 : size === 'town' ? 8 : 18;
    for (let k = 0; k < lanes; k++) {
      const a = r() * Math.PI * 2, f0 = size === 'village' ? 0.2 : 0.18 + r() * 0.3, f1 = f0 + 0.25 + r() * 0.35;
      const p0 = [ox + Math.cos(a) * RR(a) * f0 * 1.15, oy + Math.sin(a) * RR(a) * f0 * 0.92], a2 = a + (r() - 0.5) * 0.5, p1 = [ox + Math.cos(a2) * RR(a2) * f1 * 1.15, oy + Math.sin(a2) * RR(a2) * f1 * 0.92];
      if (wet(p0[0], p0[1]) || wet(p1[0], p1[1]) || wet((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)) continue;
      S2.streets.push({ w: size === 'city' && r() < 0.5 ? 'alley' : 'street', pts: [[r1(p0[0]), r1(p0[1])], [r1((p0[0] + p1[0]) / 2 + (r() - 0.5) * 30), r1((p0[1] + p1[1]) / 2 + (r() - 0.5) * 30)], [r1(p1[0]), r1(p1[1])]] });
    }
    // the wall
    let wallPts = null;
    if (cfg.wall) {
      wallPts = []; for (let k = 0; k <= 30; k++) { const a = k / 30 * Math.PI * 2; const rr = RR(a) * (cfg.rings.length ? 0.95 : 0.85); wallPts.push([r1(ox + Math.cos(a) * rr * 1.15), r1(oy + Math.sin(a) * rr * 0.92)]); }
      wallPts[wallPts.length - 1] = [...wallPts[0]];
      // no wall through the sea or river: break it there
      let cur = [];
      for (const p of wallPts) { if (wet(p[0], p[1])) { if (cur.length > 1) S2.walls.push({ pts: cur }); cur = []; } else cur.push(p); }
      if (cur.length > 1) S2.walls.push({ pts: cur });
    }
    // bridges where roads cross the river
    if (river) for (const s of S2.streets) for (let i = 1; i < s.pts.length; i++) for (let j = 1; j < river.length; j++) { const x = segX(s.pts[i - 1], s.pts[i], river[j - 1], river[j]); if (x && S2.stamps.filter(q => q.k === 't-bridge').every(q => Math.hypot(q.x - x[0], q.y - x[1]) > 40)) S2.stamps.push({ k: 't-bridge', x: r1(x[0]), y: r1(x[1]), rot: r1(x[2]), s: 1, len: size === 'village' ? 52 : 70 }); }

    // landmarks
    S2.stamps.push({ k: 't-well', x: r1(ox + (r() - 0.5) * 16), y: r1(oy + (r() - 0.5) * 16), s: 1 });
    const spot = (minR, maxR) => { for (let t = 0; t < 200; t++) { const a = r() * Math.PI * 2, d = minR + r() * (maxR - minR), x = ox + Math.cos(a) * d, y = oy + Math.sin(a) * d * 0.8; if (!wet(x, y) && !nearestStreet(x, y, 34)) return [r1(x), r1(y)]; } return null; };
    if (size !== 'village') { const p = spot(sqR + 30, sqR + 90); if (p) S2.stamps.push({ k: 't-temple', x: p[0], y: p[1], s: 1, rot: r1(r() * 0.6 - 0.3) }); S2.stamps.push({ k: 't-stalls', x: r1(ox + (r() - 0.5) * 30), y: r1(oy + 14), s: 1 }); }
    else { const p = spot(sqR + 20, sqR + 60); if (p) S2.stamps.push({ k: 't-temple', x: p[0], y: p[1], s: 0.7 }); }
    if (size === 'city') { const p = spot(cfg.R * 0.45, cfg.R * 0.75); if (p) S2.stamps.push({ k: 't-castle', x: p[0], y: p[1], s: 1.2 }); const q = spot(cfg.R * 0.3, cfg.R * 0.6); if (q) S2.areas.push({ k: 'park', pts: [...Array(6)].map((_, k) => { const a = k / 6 * Math.PI * 2; return [r1(q[0] + Math.cos(a) * 34), r1(q[1] + Math.sin(a) * 28)]; }) }); }

    // the blocks, filled with buildings: inside the wall (or near the roads in a village)
    const reach = cfg.R * (cfg.rings.length ? 1.0 : 0.95);
    const limitTo = g => { g.save(); g.fillStyle = '#000'; g.beginPath(); g.rect(0, 0, GW, GH);
      if (wallPts) { g.moveTo(wallPts[0][0] / GS, wallPts[0][1] / GS); for (const p of wallPts) g.lineTo(p[0] / GS, p[1] / GS); g.closePath(); }
      else g.ellipse(ox / GS, oy / GS, reach * 1.15 / GS, reach * 0.92 / GS, 0, 0, 7, true);
      g.fill('evenodd'); g.restore();
      if (size === 'village') { // only a strip along the roads
        const keep = document.createElement('canvas'); keep.width = GW; keep.height = GH; const k = keep.getContext('2d');
        k.fillStyle = '#000'; k.fillRect(0, 0, GW, GH); k.globalCompositeOperation = 'destination-out'; k.lineCap = 'round'; k.lineJoin = 'round'; k.scale(1 / GS, 1 / GS); k.lineWidth = 120;
        for (const s of S2.streets) { line(k, s.pts); k.stroke(); }
        g.drawImage(keep, 0, 0);
      }
    };
    const block = obstacles(limitTo), seen = new Uint8Array(GW * GH);
    for (let y = 2; y < GH - 2; y += 3) for (let x = 2; x < GW - 2; x += 3) {
      const i = y * GW + x; if (block[i] || seen[i]) continue;
      const f = flood(block, x, y, GW * GH); if (!f) continue;
      for (let j = 0; j < f.reg.length; j++) if (f.reg[j]) seen[j] = 1;
      if (f.n < 60) continue;
      placeIn(f.reg, cfg.dens, r, { depth: size === 'city' ? 18 : size === 'village' ? 16 : 20, minW: size === 'village' ? 12 : 11, varW: size === 'city' ? 10 : 12 });
    }
    // fields and farms outside town
    if (size !== 'city' || r() < 0.6) {
      const nf = size === 'village' ? 14 : 10;
      for (let k = 0, made = 0; k < 400 && made < nf; k++) {
        const a = r() * Math.PI * 2, d = reach * (1.15 + r() * 0.9), x = ox + Math.cos(a) * d * 1.15, y = oy + Math.sin(a) * d * 0.92;
        const w = 70 + r() * 90, h = 50 + r() * 70, ang = r() * Math.PI, pts = rect(x, y, w, h, ang);
        if (pts.some(([px, py]) => px < 20 || py < 20 || px > W - 20 || py > H - 20 || wet(px, py) || nearestStreet(px, py, 16))) continue;
        const nb = bbox(pts);
        if (S2.areas.some(ar => { const o = bbox(ar.pts); return nb.x < o.x + o.w + 8 && o.x < nb.x + nb.w + 8 && nb.y < o.y + o.h + 8 && o.y < nb.y + nb.h + 8; })) continue;
        if (S2.buildings.some(b => { const o = bbox(b.pts); return nb.x < o.x + o.w && o.x < nb.x + nb.w && nb.y < o.y + o.h && o.y < nb.y + nb.h; })) continue;
        if ([[x, y], [(pts[0][0] + pts[2][0]) / 2, pts[0][1]], [x, (pts[1][1] + pts[3][1]) / 2]].some(([px, py]) => wet(px, py) || nearestStreet(px, py, 20))) continue;
        S2.areas.push({ k: 'field', pts }); made++;
        if (r() < 0.35) S2.buildings.push({ pts: rect(x + Math.cos(ang) * (w / 2 + 14), y + Math.sin(ang) * (w / 2 + 14), 18, 12, ang) });
      }
    }
    // names
    const nm = S2.name && !/^(Main map|Section \d+|Map \d+)$/i.test(S2.name.trim()) ? S2.name.trim() : M.name(r);
    S2.labels.push({ x: W / 2, y: 70, text: nm.toUpperCase(), k: 'region', size: size === 'city' ? 46 : 40 });
    if (river) { const p = river[Math.floor(river.length * 0.18)]; S2.labels.push({ x: r1(p[0]), y: r1(p[1] - 22), text: 'River ' + M.name(r), k: 'sea', size: 22 }); }
    S2.stamps.sort((a, b) => a.y - b.y);
    M.landDirty(); M.changed(); M.schedule();
    return { buildings: S2.buildings.length, streets: S2.streets.length };
  }
  async function randomDialog() {
    const size = await M.U.modal({ title: '🎲 Random town', body: `<p>Rolls a new town from fixed rules and random numbers, like dice (no AI): streets, a market square, buildings, a wall, a river or harbour, and a name. It replaces this map section; Undo brings back what was there. Everything can be edited after.</p>`,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Village', value: 'village', kind: 'ghost' }, { label: 'Town', value: 'town', kind: 'ghost' }, { label: 'City', value: 'city', kind: 'primary' }] });
    if (size) generate(size);
  }

  return { TOOLS, LISTS, renderBase, renderUnder, stamp, stampBounds, hit, bounds, moveBy, drawOne, pointerDown, pointerMove, pointerUp, drawPreview, optionsBar, brushy, fillBlock, generate, randomDialog,
    blank: () => ({ streets: [], buildings: [], walls: [], areas: [] }), get busy() { return !!td; }, cancel: () => { td = null; } };
};
