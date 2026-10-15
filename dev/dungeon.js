// Unwip - dungeon floor plans. A map section of kind "dungeon" is a grid of floor and rock: draw rooms, carve
// corridors, fill back to rock, and drop in stairs, doors, chests, traps and the rest. Each floor of a dungeon is its
// own section (the tabs along the top), so "Floor 1", "Floor 2" sit side by side.
// 🎲 Random dungeon rolls rooms joined by corridors, with an entrance, stairs down, a boss room and some loot, from
// fixed rules and random numbers. No AI.
window.UnwipDungeonFactory = function (M) {
  'use strict';
  const { W, H } = M;
  const CS = 25, GW = Math.floor(W / CS), GH = Math.floor(H / CS);
  const st = () => M.st;
  const ICON = (d, c = '#3a3a3a') => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const TOOLS = [
    ['select', '✋', 'Move & select: drag stairs, doors and labels around; R turns the selected one. Drag empty space to pan; scroll to zoom'],
    ['room', ICON('<rect x="4" y="5" width="16" height="14" fill="#d9cba8"/><path d="M4 9h16M8 5v14" stroke-width="1" stroke-dasharray="1 2"/>'), 'Room: drag out a rectangle of floor'],
    ['corridor', ICON('<path d="M3 18h7V7h11" stroke-width="5" stroke="#d9cba8"/><path d="M3 18h7V7h11" stroke-width="1"/>'), 'Corridor: drag to carve a passage. Width below'],
    ['rock', ICON('<path d="M4 18 8 9l5 4 3-7 4 12z" fill="#8a8172"/>'), 'Fill with rock: drag over floor to turn it back into solid rock'],
    ['feature', ICON('<path d="M5 19h14M7 19v-4h10v4M9 15v-3h6v3M11 12V9h2v3" />'), 'Features: stairs, doors, chests, traps, a boss, an altar… Pick one above, then click'],
    ['mark', ICON('<path d="M12 3 20 12 12 21 4 12z" fill="#ffd36b"/><circle cx="12" cy="12" r="2.5" fill="#3a3a3a" stroke="none"/>'), 'Markers: waypoint, quest, safe zone, boss, shop, respawn. Pick one above, then click'],
    ['fog', ICON('<path d="M3 10c3-3 6-3 9 0s6 3 9 0M3 15c3-3 6-3 9 0s6 3 9 0" stroke-width="2.2"/>'), 'Fog of war: cover what hasn’t been explored, or reveal it again. Brush size below'],
    ['frame', ICON('<rect x="3" y="5" width="18" height="14"/><rect x="6" y="8" width="12" height="8" stroke-width="1"/>'), 'Frame: drag out a box for the map edge or a title box'],
    ['pin', '📍', 'Pin: mark a place. You can link it to a Places sheet'],
    ['label', '🔤', 'Label: name a room or a passage']
  ];
  const FEATURES = [['stairs-down', 'Stairs down'], ['stairs-up', 'Stairs up'], ['door', 'Door'], ['secret', 'Secret door'], ['chest', 'Chest'], ['trap', 'Trap'], ['boss', 'Boss'], ['entrance', 'Entrance'], ['altar', 'Altar'], ['pillar', 'Pillar'], ['pool', 'Pool'], ['bones', 'Bones']];
  const OPTS = {
    corridor: { key: 'corW', def: '1', items: [['1', 'Narrow'], ['2', 'Wide']] },
    feature: { key: 'featK', def: 'stairs-down', items: FEATURES }
  };
  const opt = { corW: '1', featK: 'stairs-down' };
  const COL = {
    parchment: { rock: '#d8c9a6', hatch: '#6b5537', floor: '#f6eedb', grid: '#c9b896', wall: '#3a2a19', feat: '#3a2a19', fill: '#e2d3ae', water: '#9bb5b8', danger: '#9a3b2b' },
    atlas: { rock: '#c9c6bd', hatch: '#6d6a62', floor: '#fbf9f3', grid: '#d6d2c6', wall: '#2c2f2a', feat: '#2c2f2a', fill: '#e6e1d4', water: '#a9cfe0', danger: '#b0413e' },
    night: { rock: '#10141c', hatch: '#3a465c', floor: '#2a3242', grid: '#3b465b', wall: '#c9b98f', feat: '#e6dcc2', fill: '#3a4356', water: '#30506e', danger: '#ef7b57' },
    ink: { rock: '#ffffff', hatch: '#111111', floor: '#ffffff', grid: '#cfcfcf', wall: '#111111', feat: '#111111', fill: '#eeeeee', water: '#ffffff', danger: '#111111' },
    holo: { rock: '#070d18', hatch: '#123050', floor: '#0e2036', grid: '#1d4a72', wall: '#5fd0ff', feat: '#bfe8ff', fill: '#14304c', water: '#1a5c86', danger: '#ff6b9a' }
  };
  const C = P => COL[Object.keys(M.STYLES).find(k => M.STYLES[k] === P)] || COL.parchment;

  // ---- the grid (kept as a string of 0/1 in the saved map; worked on as numbers here)
  let cache = null, cacheStr = null;
  function grid() {
    const s = st(); if (!s.cells || s.cells.length !== GW * GH) s.cells = '0'.repeat(GW * GH);
    if (cacheStr !== s.cells) { cache = new Uint8Array(GW * GH); for (let i = 0; i < cache.length; i++) cache[i] = s.cells.charCodeAt(i) === 49 ? 1 : 0; cacheStr = s.cells; }
    return cache;
  }
  const commit = () => { const gd = grid(); let s = ''; for (let i = 0; i < gd.length; i++) s += gd[i] ? '1' : '0'; st().cells = s; cacheStr = s; };
  const at = (gd, x, y) => x >= 0 && y >= 0 && x < GW && y < GH ? gd[y * GW + x] : 0;
  const set = (gd, x, y, v) => { if (x >= 1 && y >= 1 && x < GW - 1 && y < GH - 1) gd[y * GW + x] = v; };
  const cell = p => [Math.floor(p.x / CS), Math.floor(p.y / CS)];

  // ---- drawing
  function renderBase(g, P) {
    const c = C(P), gd = grid(), holo = c === COL.holo;
    g.fillStyle = c.rock; g.fillRect(0, 0, W, H);
    // hatching on the rock next to the floor, the way dungeon maps are drawn by hand
    const r = M.rng((st().seed || 1) + 5);
    g.strokeStyle = c.hatch; g.lineWidth = 1; g.globalAlpha = holo ? 0.5 : 0.55;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (gd[y * GW + x]) continue;
      let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (at(gd, x + dx, y + dy)) { near = true; break; }
      if (!near) continue;
      const x0 = x * CS, y0 = y * CS, a = r() * 0.6 + 0.6, n = 3 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) { const o = (k + 0.5) * CS / n + (r() - 0.5) * 3; g.beginPath(); g.moveTo(x0 + o - Math.cos(a) * 6, y0 + CS / 2 - Math.sin(a) * 9 + (r() - 0.5) * 6); g.lineTo(x0 + o + Math.cos(a) * 6, y0 + CS / 2 + Math.sin(a) * 9 + (r() - 0.5) * 6); g.stroke(); }
    }
    g.globalAlpha = 1;
    // floor, then its grid, then the walls along every edge where floor meets rock
    g.fillStyle = c.floor;
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (gd[y * GW + x]) g.fillRect(x * CS, y * CS, CS, CS);
    g.strokeStyle = c.grid; g.lineWidth = 1; g.globalAlpha = st().noGrid ? 0 : holo ? 0.8 : 0.7; g.beginPath();
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (gd[y * GW + x]) { if (at(gd, x + 1, y)) { g.moveTo((x + 1) * CS, y * CS); g.lineTo((x + 1) * CS, (y + 1) * CS); } if (at(gd, x, y + 1)) { g.moveTo(x * CS, (y + 1) * CS); g.lineTo((x + 1) * CS, (y + 1) * CS); } }
    g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = c.wall; g.lineWidth = holo ? 2.5 : 4; g.lineCap = 'round';
    if (holo) { g.shadowColor = c.wall; g.shadowBlur = 8; }
    g.beginPath();
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      if (!gd[y * GW + x]) continue; const x0 = x * CS, y0 = y * CS;
      if (!at(gd, x, y - 1)) { g.moveTo(x0, y0); g.lineTo(x0 + CS, y0); }
      if (!at(gd, x, y + 1)) { g.moveTo(x0, y0 + CS); g.lineTo(x0 + CS, y0 + CS); }
      if (!at(gd, x - 1, y)) { g.moveTo(x0, y0); g.lineTo(x0, y0 + CS); }
      if (!at(gd, x + 1, y)) { g.moveTo(x0 + CS, y0); g.lineTo(x0 + CS, y0 + CS); }
    }
    g.stroke(); g.shadowBlur = 0; g.lineCap = 'butt';
  }
  function renderUnder() {}
  function stamp(g, s, P) {
    if (!/^d-/.test(s.k)) return false;
    const c = C(P), k = s.k.slice(2), z = s.s || 1, h = CS / 2;
    g.save(); g.translate(s.x, s.y); g.rotate(s.rot || 0); g.scale(z, z); g.strokeStyle = c.feat; g.fillStyle = c.fill; g.lineWidth = 1.6; g.lineJoin = 'round';
    if (k === 'stairs-down' || k === 'stairs-up') { g.fillRect(-h, -h, CS, CS); g.strokeRect(-h, -h, CS, CS); for (let i = 1; i < 5; i++) { const x = -h + i * CS / 5; g.beginPath(); g.moveTo(x, -h); g.lineTo(x, h); g.lineWidth = k === 'stairs-down' ? 2.6 - i * 0.4 : 1 + i * 0.4; g.stroke(); } g.lineWidth = 1.6; }
    else if (k === 'door' || k === 'secret') { g.fillStyle = k === 'secret' ? 'transparent' : c.fill; g.beginPath(); g.rect(-h * 0.8, -4, CS * 0.8, 8); g.fill(); if (k === 'secret') g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); if (k === 'secret') { g.font = `bold 11px Bookhaven, Georgia, serif`; g.textAlign = 'center'; g.fillStyle = c.feat; g.fillText('S', 0, 4); } }
    else if (k === 'chest') { g.beginPath(); g.rect(-8, -6, 16, 12); g.fill(); g.stroke(); g.beginPath(); g.moveTo(-8, -1); g.lineTo(8, -1); g.stroke(); g.beginPath(); g.rect(-2, -2, 4, 3); g.fillStyle = c.feat; g.fill(); }
    else if (k === 'trap') { g.strokeStyle = c.danger; g.beginPath(); g.rect(-8, -8, 16, 16); g.stroke(); g.beginPath(); g.moveTo(-8, -8); g.lineTo(8, 8); g.moveTo(8, -8); g.lineTo(-8, 8); g.stroke(); }
    else if (k === 'boss') { g.strokeStyle = c.danger; g.lineWidth = 2.2; g.beginPath(); g.arc(0, 0, 10, 0, 7); g.stroke(); g.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.moveTo(Math.cos(a) * 12, Math.sin(a) * 12); g.lineTo(Math.cos(a) * 16, Math.sin(a) * 16); } g.stroke(); g.fillStyle = c.danger; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); }
    else if (k === 'entrance') { g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -10); g.lineTo(0, 8); g.moveTo(-6, 2); g.lineTo(0, 9); g.lineTo(6, 2); g.stroke(); g.beginPath(); g.moveTo(-10, -11); g.lineTo(10, -11); g.stroke(); }
    else if (k === 'altar') { g.beginPath(); g.rect(-10, -6, 20, 12); g.fill(); g.stroke(); g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 4); g.moveTo(-3, -1); g.lineTo(3, -1); g.stroke(); }
    else if (k === 'pillar') { g.fillStyle = c.feat; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); }
    else if (k === 'pool') { g.fillStyle = c.water; g.beginPath(); g.ellipse(0, 0, 18, 11, 0.3, 0, 7); g.fill(); g.stroke(); }
    else if (k === 'bones') { g.lineWidth = 2; g.beginPath(); g.moveTo(-8, -6); g.lineTo(8, 6); g.moveTo(-8, 6); g.lineTo(8, -6); g.stroke(); for (const [x, y] of [[-8, -6], [8, 6], [-8, 6], [8, -6]]) { g.beginPath(); g.arc(x, y, 2, 0, 7); g.fillStyle = c.feat; g.fill(); } }
    g.restore();
    return true;
  }
  const stampBounds = s => { const z = s.s || 1, h = (/stairs|pool/.test(s.k) ? 16 : 13) * z; return { x: s.x - h, y: s.y - h, w: h * 2, h: h * 2 }; };

  // ---- tools
  const LISTS = {};
  let td = null;
  const rectCells = (a, b) => ({ x0: Math.min(a[0], b[0]), y0: Math.min(a[1], b[1]), x1: Math.max(a[0], b[0]), y1: Math.max(a[1], b[1]) });
  function carve(gd, cx, cy, v, wide) { set(gd, cx, cy, v); if (wide) { set(gd, cx + 1, cy, v); set(gd, cx, cy + 1, v); set(gd, cx + 1, cy + 1, v); } }
  function line(gd, a, b, v, wide) {   // a corridor that follows the drag in straight steps
    let [x, y] = a; const [x1, y1] = b;
    while (x !== x1 || y !== y1) { carve(gd, x, y, v, wide); if (Math.abs(x1 - x) >= Math.abs(y1 - y)) x += Math.sign(x1 - x); else y += Math.sign(y1 - y); }
    carve(gd, x1, y1, v, wide);
  }
  function pointerDown(p, tool) {
    const gd = grid();
    if (tool === 'room') { const c = cell(p); td = { room: { a: c, b: c } }; return true; }
    if (tool === 'corridor' || tool === 'rock') { const c = cell(p); td = { cut: tool === 'corridor' ? 1 : 0, last: c, wide: tool === 'corridor' ? opt.corW === '2' : true }; carve(gd, c[0], c[1], td.cut, td.wide); M.landDirty(); M.redraw(); return true; }
    if (tool === 'feature') {
      const [cx, cy] = cell(p), k = opt.featK, s = { k: 'd-' + k, x: cx * CS + CS / 2, y: cy * CS + CS / 2, s: 1 };
      if (k === 'door' || k === 'secret') {   // doors sit on the edge between two cells, across the passage
        const fx = p.x / CS - cx, fy = p.y / CS - cy, dx = Math.min(fx, 1 - fx), dy = Math.min(fy, 1 - fy);
        if (dx < dy) { s.x = (fx < 0.5 ? cx : cx + 1) * CS; s.rot = Math.PI / 2; } else s.y = (fy < 0.5 ? cy : cy + 1) * CS;
      }
      st().stamps.push(s); M.select({ type: 'stamp', i: st().stamps.length - 1 }); M.changed(); M.schedule(); return true;
    }
    return false;
  }
  function pointerMove(p) {
    if (!td) return false;
    if (td.room) { td.room.b = cell(p); M.redraw(); return true; }
    if (td.last) { const c = cell(p); if (c[0] !== td.last[0] || c[1] !== td.last[1]) { line(grid(), td.last, c, td.cut, td.wide); td.last = c; M.landDirty(); M.redraw(); } return true; }
    return true;
  }
  function pointerUp() {
    const d = td; td = null; if (!d) return;
    if (d.room) { const r = rectCells(d.room.a, d.room.b), gd = grid(); for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) set(gd, x, y, 1); }
    commit(); M.landDirty(); M.changed(); M.schedule(); M.redraw();
  }
  function drawPreview(g, P) {
    if (!td || !td.room) return;
    const r = rectCells(td.room.a, td.room.b), c = C(P);
    g.save(); g.globalAlpha = 0.6; g.fillStyle = c.floor; g.fillRect(r.x0 * CS, r.y0 * CS, (r.x1 - r.x0 + 1) * CS, (r.y1 - r.y0 + 1) * CS);
    g.globalAlpha = 1; g.strokeStyle = c.wall; g.lineWidth = 2; g.setLineDash([6, 4]); g.strokeRect(r.x0 * CS, r.y0 * CS, (r.x1 - r.x0 + 1) * CS, (r.y1 - r.y0 + 1) * CS); g.restore();
  }
  const brushy = () => false;
  function optionsBar(tool, el) {
    const o = OPTS[tool];
    if (!o) { el.innerHTML = ''; el.classList.add('hidden'); return false; }
    el.classList.remove('hidden');
    el.innerHTML = o.items.map(([v, l]) => `<button type="button" class="chip ${opt[o.key] === v ? 'on' : ''}" data-k="${o.key}" data-v="${v}">${l}</button>`).join('');
    el.querySelectorAll('.chip[data-k]').forEach(b => b.onclick = () => { opt[b.dataset.k] = b.dataset.v; optionsBar(tool, el); });
    return true;
  }

  // ---- 🎲 a random floor
  function generate(size) {
    const S2 = st(), seed = Math.floor(Math.random() * 1e9), r = M.rng(seed); S2.seed = seed;
    const gd = grid(); gd.fill(0);
    S2.stamps = S2.stamps.filter(s => !/^d-/.test(s.k)); S2.labels = []; S2.pins = [];
    const target = { small: 6, medium: 10, large: 15 }[size] || 10;
    const rooms = [];
    for (let tries = 0; tries < 600 && rooms.length < target; tries++) {
      const w = 3 + Math.floor(r() * (size === 'small' ? 5 : 7)), h = 3 + Math.floor(r() * 5);
      const x = 2 + Math.floor(r() * (GW - w - 4)), y = 3 + Math.floor(r() * (GH - h - 5));
      if (rooms.some(o => x < o.x + o.w + 2 && x + w + 2 > o.x && y < o.y + o.h + 2 && y + h + 2 > o.y)) continue;
      rooms.push({ x, y, w, h, cx: x + Math.floor(w / 2), cy: y + Math.floor(h / 2) });
    }
    for (const o of rooms) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) set(gd, x, y, 1);
    // join the rooms: each to its nearest already-joined room (a tree), then a couple of loops so it isn't a maze of dead ends
    const joined = [rooms[0]], left = rooms.slice(1), links = [];
    while (left.length) {
      let best = null; for (const a of left) for (const b of joined) { const d = Math.abs(a.cx - b.cx) + Math.abs(a.cy - b.cy); if (!best || d < best.d) best = { a, b, d }; }
      links.push([best.a, best.b]); joined.push(best.a); left.splice(left.indexOf(best.a), 1);
    }
    for (let i = 0; i < Math.max(1, Math.floor(rooms.length / 5)); i++) { const a = rooms[Math.floor(r() * rooms.length)], b = rooms[Math.floor(r() * rooms.length)]; if (a !== b) links.push([a, b]); }
    for (const [a, b] of links) { const bend = r() < 0.5 ? [a.cx, b.cy] : [b.cx, a.cy]; line(gd, [a.cx, a.cy], bend, 1, false); line(gd, bend, [b.cx, b.cy], 1, false); }
    commit();
    // what's in it
    const P = c => ({ x: c[0] * CS + CS / 2, y: c[1] * CS + CS / 2 });
    const spot = (o, edge) => { const x = o.x + (edge ? 0 : 1 + Math.floor(r() * Math.max(1, o.w - 2))), y = o.y + (edge ? 0 : 1 + Math.floor(r() * Math.max(1, o.h - 2))); return P([x, y]); };
    const start = rooms[0], far = rooms.slice().sort((a, b) => (Math.abs(b.cx - start.cx) + Math.abs(b.cy - start.cy)) - (Math.abs(a.cx - start.cx) + Math.abs(a.cy - start.cy)))[0];
    const big = rooms.filter(o => o !== start && o !== far).sort((a, b) => b.w * b.h - a.w * a.h)[0] || far;
    const add = (k, p, extra) => S2.stamps.push({ k: 'd-' + k, x: p.x, y: p.y, s: 1, ...(extra || {}) });
    add('entrance', P([start.cx, start.cy]));
    add('stairs-down', P([far.cx, far.cy]));
    add('boss', P([big.cx, big.cy]));
    if (big.w >= 5 && big.h >= 5) for (const [dx, dy] of [[1, 1], [big.w - 2, 1], [1, big.h - 2], [big.w - 2, big.h - 2]]) add('pillar', P([big.x + dx, big.y + dy]));
    rooms.filter(o => o !== start && o !== big).slice(0, 2 + Math.floor(r() * 3)).forEach(o => add('chest', spot(o)));
    if (rooms.length > 4) add(r() < 0.5 ? 'altar' : 'pool', spot(rooms[1 + Math.floor(r() * (rooms.length - 1))]));
    rooms.filter(o => o !== start).slice(0, 1 + Math.floor(r() * 2)).forEach(o => add('bones', spot(o)));
    // traps in the corridors: floor cells that aren't in a room
    const inRoom = (x, y) => rooms.some(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h), corr = [];
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (gd[y * GW + x] && !inRoom(x, y)) corr.push([x, y]);
    for (let i = 0; i < Math.min(corr.length, 2 + Math.floor(r() * 3)); i++) add('trap', P(corr[Math.floor(r() * corr.length)]));
    // doors where a corridor meets a room
    let doors = 0;
    for (const o of rooms) for (let x = o.x; x < o.x + o.w && doors < rooms.length * 2; x++) for (const [y, side] of [[o.y - 1, -1], [o.y + o.h, 1]]) if (at(gd, x, y) && !inRoom(x, y) && r() < 0.6) { S2.stamps.push({ k: 'd-door', x: x * CS + CS / 2, y: (side < 0 ? o.y : o.y + o.h) * CS, s: 1 }); doors++; }
    // room numbers, like a module's key
    rooms.forEach((o, i) => S2.labels.push({ x: o.x * CS + 14, y: o.y * CS + 18, text: String(i + 1), size: 16 }));
    const nm = S2.name && !/^(Main map|Section \d+|Map \d+)$/i.test(S2.name.trim()) ? S2.name.trim() : 'Floor 1';
    S2.labels.push({ x: W / 2, y: 46, text: nm.toUpperCase(), k: 'region', size: 34 });
    M.landDirty(); M.changed(); M.schedule();
    return { rooms: rooms.length };
  }
  async function randomDialog() {
    const size = await M.U.modal({ title: '🎲 Random dungeon floor', body: '<p>Rolls rooms joined by corridors, with an entrance, stairs down, a boss room, chests, traps and doors, from fixed rules and random numbers (no AI). It replaces this floor; Undo brings back what was there. Everything can be changed after.</p>',
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Small', value: 'small', kind: 'ghost' }, { label: 'Medium', value: 'medium', kind: 'ghost' }, { label: 'Large', value: 'large', kind: 'primary' }] });
    if (size) { M.push(); generate(size); }
  }
  const hit = () => null;
  return { TOOLS, LISTS, renderBase, renderUnder, stamp, stampBounds, hit, bounds: () => null, moveBy: () => {}, drawOne: () => {}, pointerDown, pointerMove, pointerUp, drawPreview, optionsBar, brushy, generate, randomDialog,
    blank: () => ({ cells: '0'.repeat(GW * GH), dungeon: true, compass: false }), get busy() { return !!td; }, cancel: () => { td = null; } };
};
