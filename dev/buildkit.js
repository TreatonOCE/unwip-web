// Unwip - the parts Build's drawing tools share, so coats of arms, sigils, insignia, runes and magic pictures work
// the same way:
//   symbols()   a symbol chooser: a dropdown of categories (Recent first, then each section, then All) over a grid
//   pickSymbol() the same chooser in a window, for "+ Add a symbol"
//   swatches()  a row of round colour swatches (heraldic tinctures use it as is)
//   colours()   black, white, yellow, red, blue, green and a custom dial (colour field, hue, hex, recent colours and
//               a pipette that takes a colour from the picture by tapping it)
//   handles()   select a placed symbol on the picture: a box with a square corner handle (size) and a round handle
//               (turn), like the map maker's, for mouse and fingers. The side panel's sliders stay and follow along.
// Recent symbols and colours are remembered on this device only (browser storage, wrapped in try).
window.UnwipKit = (function () {
  'use strict';
  const U = window.__unwip;
  const esc = s => U.esc(String(s == null ? '' : s));
  const coarse = () => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // ================================================================== SYMBOLS
  const RECENT = 'unwip-recent-symbols', CATS = 'unwip-symbol-cat';
  const recentSyms = () => { const r = load(RECENT, []); return Array.isArray(r) ? r.filter(k => typeof k === 'string') : []; };
  function useSym(key) { if (!key || key === 'none') return; keep(RECENT, [key, ...recentSyms().filter(k => k !== key)].slice(0, 24)); }
  // the shared library's sections as categories (optionally only some of them)
  function libCats(only) {
    const S = window.UnwipSymbols; if (!S) return [];
    return S.SECTIONS.filter(([s]) => !only || only.includes(s)).map(([id, name]) => ({ id, name, items: S.inSection(id).map(k => ({ key: k, title: S.get(k).label, icon: S.icon(k), words: `${S.get(k).label} ${S.get(k).b1 || ''} ${name}` })) })).filter(c => c.items.length);
  }
  // host: an element to fill. opts: { id (remembers the category), cats, current, onPick(key, item), none (label for a
  // "no symbol" button), grid ('small' in a side panel) }
  function symbols(host, opts) {
    const cats = (opts.cats || libCats()).filter(c => c.items.length);
    const byKey = new Map(); for (const c of cats) for (const it of c.items) if (!byKey.has(it.key)) byKey.set(it.key, it);
    const recent = () => recentSyms().filter(k => byKey.has(k));
    const saved = load(CATS, {}) || {};
    // the category last used here; else Recent; else the one the current symbol is in
    const home = (cats.find(c => c.items.some(x => x.key === opts.current)) || cats[0] || {}).id || 'all';
    let cat = saved[opts.id] && (saved[opts.id] === 'recent' || saved[opts.id] === 'all' || cats.some(c => c.id === saved[opts.id])) ? saved[opts.id] : (recent().length ? 'recent' : home);
    let current = opts.current, q = '';
    host.classList.add('kit-sym');
    host.innerHTML = `<div class="kit-sym-top">${opts.none ? `<button type="button" class="chip kit-none ${current === 'none' ? 'on' : ''}" data-kit-none>${esc(opts.none)}</button>` : ''}
      <select class="kit-cat" aria-label="Kind of symbol"><option value="recent">Recent</option>${cats.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="all">All</option></select></div>
      <input class="kit-find" type="search" placeholder="Find a symbol: lion, crow, skull, IV…" aria-label="Find a symbol" hidden>
      <div class="kit-grid ${opts.grid === 'big' ? 'big' : ''}"></div>`;
    const sel = host.querySelector('.kit-cat'), grid = host.querySelector('.kit-grid'), find = host.querySelector('.kit-find');
    sel.value = cat;
    const words = it => (it.words || it.title || '').toLowerCase().split(/[^a-z0-9]+/);
    function fill() {
      find.hidden = cat !== 'all';
      let list = cat === 'recent' ? recent().map(k => byKey.get(k)) : cat === 'all' ? [...byKey.values()] : ((cats.find(c => c.id === cat) || {}).items || []);
      if (cat === 'all' && q) { const exact = list.filter(it => words(it).includes(q)); list = exact.length ? exact : list.filter(it => words(it).some(w => w.startsWith(q))); }
      grid.classList.toggle('all', cat === 'all');
      grid.innerHTML = list.length ? list.map(it => `<button type="button" class="kit-s ${it.key === current ? 'on' : ''}" data-kit-sym="${esc(it.key)}" title="${esc(it.title)}" aria-label="${esc(it.title)}">${it.icon}</button>`).join('')
        : `<p class="kit-empty">${cat === 'recent' ? 'Symbols you pick show up here.' : 'Nothing matches.'}</p>`;
    }
    sel.onchange = () => { cat = sel.value; const s = load(CATS, {}) || {}; s[opts.id] = cat; keep(CATS, s); fill(); };
    find.oninput = () => { q = find.value.trim().toLowerCase(); fill(); };
    host.onclick = e => {
      if (e.target.closest('[data-kit-none]')) { current = 'none'; if (opts.onPick) opts.onPick('none', null); return; }
      const b = e.target.closest('[data-kit-sym]'); if (!b) return;
      current = b.dataset.kitSym; useSym(current);
      grid.querySelectorAll('.kit-s').forEach(x => x.classList.toggle('on', x === b));
      if (opts.onPick) opts.onPick(current, byKey.get(current));
    };
    fill();
    return { set(k) { current = k; fill(); }, refresh: fill };
  }
  // the chooser in a window; resolves with the key picked, or null
  async function pickSymbol(opts = {}) {
    const body = document.createElement('div'); body.className = 'kit-pick';
    let chosen = null, close = () => {};
    symbols(body, { id: opts.id || 'pick', cats: opts.cats, current: opts.current, grid: 'big', onPick: k => { chosen = k; close(); } });
    if (opts.note) body.insertAdjacentHTML('afterbegin', `<p class="sym-note">${opts.note}</p>`);
    await U.modal({ title: opts.title || 'Pick a symbol', body, wide: true, buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }],
      onOpen: back => { close = () => { const b = back.querySelector('.m-foot .btn'); if (b) b.click(); }; } });
    return chosen;
  }

  // ================================================================== COLOURS
  // the same six everywhere, then the custom dial
  const MAIN = [['#1a1a1a', 'Black'], ['#ffffff', 'White'], ['#f2c230', 'Yellow'], ['#c62828', 'Red'], ['#1f5fbf', 'Blue'], ['#2e8b3e', 'Green']];
  const RCOL = 'unwip-recent-colours';
  const hexOK = h => /^#[0-9a-f]{6}$/i.test(String(h || ''));
  const norm = h => { h = String(h || '').trim().toLowerCase(); if (/^#[0-9a-f]{3}$/.test(h)) h = '#' + [...h.slice(1)].map(c => c + c).join(''); return hexOK(h) ? h : ''; };
  const recentCols = () => { const r = load(RCOL, []); return Array.isArray(r) ? r.map(norm).filter(Boolean) : []; };
  function useCol(h) { h = norm(h); if (!h || MAIN.some(([m]) => m === h)) return; keep(RCOL, [h, ...recentCols().filter(x => x !== h)].slice(0, 12)); }
  function hsv2hex(h, s, v) {
    const f = n => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  function hex2hsv(hex) {
    const n = parseInt(norm(hex).slice(1) || '000000', 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }
  // a row of round swatches. items: [{ v, col, title }]; value; onPick(v). Returns { set(v) }.
  function swatches(host, opts) {
    host.classList.add('kit-row');
    const draw = () => {
      host.innerHTML = opts.items.map(it => `<button type="button" class="kit-c ${it.v === opts.value ? 'on' : ''}" data-kit-c="${esc(it.v)}" style="--c:${esc(it.col)}" title="${esc(it.title || '')}" aria-label="${esc(it.title || it.v)}"></button>`).join('')
        + (opts.label ? `<span class="kit-name">${esc(opts.label(opts.value) || '')}</span>` : '');
    };
    draw();
    host.onclick = e => { const b = e.target.closest('[data-kit-c]'); if (!b) return; opts.value = b.dataset.kitC; draw(); if (opts.onPick) opts.onPick(opts.value); };
    return { set(v) { opts.value = v; draw(); } };
  }
  // the shared colour chooser. opts: { value (hex), onPick(hex, live), picture: () => element to take colours from,
  // label, reset: label for a "use the style's colour" button (value '' means that) }
  let openPanel = null;
  function colours(host, opts) {
    host.classList.add('kit-colours');
    let value = norm(opts.value), panelOn = false, hsv = hex2hsv(value || '#7a5c2e');
    const isMain = () => MAIN.some(([m]) => m === value);
    function row() {
      const custom = value && !isMain();
      return `${opts.label ? `<span class="kit-lab">${esc(opts.label)}</span>` : ''}<div class="kit-row">${MAIN.map(([c, n]) => `<button type="button" class="kit-c ${value === c ? 'on' : ''}" data-kit-c="${c}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}
        <button type="button" class="kit-c kit-dial ${custom ? 'on' : ''} ${panelOn ? 'open' : ''}" data-kit-dial title="Any colour" aria-label="Any colour" aria-expanded="${panelOn}" style="--c:${custom ? value : 'transparent'}"></button>
        ${opts.reset ? `<button type="button" class="link-btn kit-reset ${value ? '' : 'on'}" data-kit-reset>${esc(opts.reset)}</button>` : ''}</div>`;
    }
    function panel() {
      const rec = recentCols();
      return `<div class="kit-panel">
        <div class="kit-sv" style="--h:${Math.round(hsv[0])}"><i style="left:${(hsv[1] * 100).toFixed(1)}%;top:${((1 - hsv[2]) * 100).toFixed(1)}%"></i></div>
        <input type="range" class="kit-hue" min="0" max="359" step="1" value="${Math.round(hsv[0])}" aria-label="Hue">
        <div class="kit-pr"><span class="kit-now" style="--c:${value || '#7a5c2e'}"></span><input class="kit-hex" value="${esc(value)}" maxlength="7" spellcheck="false" aria-label="Colour code">
          ${opts.picture ? '<button type="button" class="btn small ghost kit-pip" data-kit-pip title="Take a colour from the picture"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4l6 6M17 7l-9.5 9.5L5 19l-1 1M7 15l2 2"/><path d="M13.5 4.5l2-2a2.1 2.1 0 0 1 3 3l-2 2"/></svg> From picture</button>' : ''}</div>
        <p class="kit-pip-hint" hidden>Tap the picture to take its colour.</p>
        <div class="kit-recent">${rec.length ? `<span>Recent</span>${rec.map(c => `<button type="button" class="kit-c small" data-kit-c="${c}" style="--c:${c}" title="${c}" aria-label="${c}"></button>`).join('')}` : '<span>Colours you make show up here.</span>'}</div></div>`;
    }
    function draw() { host.innerHTML = row() + (panelOn ? panel() : ''); if (panelOn) wirePanel(); }
    function set(h, live) {
      h = norm(h); if (!h) return;
      value = h;
      if (!live) { draw(); }
      else { const n = host.querySelector('.kit-now'); if (n) n.style.setProperty('--c', h); const x = host.querySelector('.kit-hex'); if (x && document.activeElement !== x) x.value = h; const d = host.querySelector('.kit-dial'); if (d) { d.style.setProperty('--c', h); d.classList.add('on'); } host.querySelectorAll('.kit-row .kit-c:not(.kit-dial)').forEach(b => b.classList.remove('on')); }
      if (opts.onPick) opts.onPick(h, !!live);
    }
    const close = () => { stopPip(); panelOn = false; if (openPanel === api) openPanel = null; draw(); };
    function wirePanel() {
      const sv = host.querySelector('.kit-sv'), dot = sv.querySelector('i'), hue = host.querySelector('.kit-hue'), hex = host.querySelector('.kit-hex');
      let raf = 0;
      const live = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; set(hsv2hex(hsv[0], hsv[1], hsv[2]), true); }); };
      const at = e => { const r = sv.getBoundingClientRect(); hsv[1] = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); hsv[2] = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)); dot.style.left = hsv[1] * 100 + '%'; dot.style.top = (1 - hsv[2]) * 100 + '%'; live(); };
      let down = null;
      sv.onpointerdown = e => { e.preventDefault(); down = e.pointerId; try { sv.setPointerCapture(e.pointerId); } catch {} at(e); };
      sv.onpointermove = e => { if (down === e.pointerId) at(e); };
      sv.onpointerup = sv.onpointercancel = e => { if (down !== e.pointerId) return; down = null; cancelAnimationFrame(raf); raf = 0; set(hsv2hex(hsv[0], hsv[1], hsv[2]), true); useCol(value); };
      hue.oninput = () => { hsv[0] = +hue.value; sv.style.setProperty('--h', hue.value); live(); };
      hue.onchange = () => useCol(value);
      hex.onchange = () => { const h = norm(hex.value.startsWith('#') ? hex.value : '#' + hex.value); if (!h) { hex.value = value; return; } hsv = hex2hsv(h); useCol(h); set(h); };
    }
    // ---- the pipette: tap the picture (rendered to a canvas, then read) to take the colour under your finger
    let pip = null;
    function stopPip() { if (!pip) return; document.removeEventListener('pointerdown', pip, true); document.removeEventListener('keydown', pip.key, true); pip = null; document.body.classList.remove('kit-pipetting'); const h = host.querySelector('.kit-pip-hint'); if (h) h.hidden = true; const b = host.querySelector('[data-kit-pip]'); if (b) b.classList.remove('on'); }
    function startPip() {
      const pics = () => [].concat((opts.picture && opts.picture()) || []).filter(Boolean);   // one picture, or a few
      if (!pics().length) return;
      stopPip();
      document.body.classList.add('kit-pipetting'); host.querySelector('.kit-pip-hint').hidden = false; host.querySelector('[data-kit-pip]').classList.add('on');
      pip = async e => {
        if (e.target.closest && e.target.closest('[data-kit-pip]')) return;   // the button itself stops it
        const pic = pics().find(p => p.contains(e.target));
        if (!pic) { stopPip(); return; }
        e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
        swallowClick();
        stopPip();
        try { const h = await sampleAt(pic, e.clientX, e.clientY); if (h) { hsv = hex2hsv(h); useCol(h); set(h); } else U.toast('Nothing there to take a colour from.'); } catch { U.toast('Couldn’t take a colour here.', 'warn'); }
      };
      pip.key = e => { if (e.key === 'Escape') { e.stopPropagation(); stopPip(); } };
      document.addEventListener('pointerdown', pip, true); document.addEventListener('keydown', pip.key, true);
    }
    host.onclick = e => {
      if (e.target.closest('[data-kit-pip]')) { if (pip) stopPip(); else startPip(); return; }
      if (e.target.closest('[data-kit-reset]')) { value = ''; if (panelOn) close(); else draw(); if (opts.onPick) opts.onPick('', false); return; }
      if (e.target.closest('[data-kit-dial]')) {
        if (panelOn) return close();
        if (openPanel && openPanel !== api) openPanel.close();
        panelOn = true; openPanel = api; if (value) hsv = hex2hsv(value); draw(); return;
      }
      const b = e.target.closest('[data-kit-c]'); if (!b) return;
      const h = b.dataset.kitC; hsv = hex2hsv(h); if (b.closest('.kit-recent')) useCol(h); set(h);
    };
    const api = { set(h) { value = norm(h); if (value) hsv = hex2hsv(value); draw(); }, close, get value() { return value; } };
    draw();
    return api;
  }
  // after a pipette tap, the click that follows mustn't open or change anything
  function swallowClick() {
    const stop = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    document.addEventListener('click', stop, true);
    setTimeout(() => document.removeEventListener('click', stop, true), 600);
  }
  // the colour of the picture under a point on screen: an <img>, <canvas> or <svg> (drawn to a canvas first)
  async function sampleAt(el, cx, cy) {
    if (!(el instanceof HTMLImageElement || el instanceof HTMLCanvasElement || el instanceof SVGSVGElement)) el = el.querySelector('canvas, svg, img') || el;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null;
    let c, k;
    if (el instanceof HTMLCanvasElement) { c = el; k = c.width / r.width; }
    else if (el instanceof HTMLImageElement) {
      k = 2; c = document.createElement('canvas'); c.width = Math.round(r.width * k); c.height = Math.round(r.height * k);
      if (!el.complete) await el.decode().catch(() => {});
      c.getContext('2d').drawImage(el, 0, 0, c.width, c.height);
    } else {
      k = 2; const clone = el.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', Math.round(r.width)); clone.setAttribute('height', Math.round(r.height));
      clone.querySelectorAll('.kit-ov, .sg-guides').forEach(n => n.remove());
      c = await window.UnwipBuild.svgCanvas(new XMLSerializer().serializeToString(clone), Math.round(r.width * k), Math.round(r.height * k));
    }
    const x = Math.max(0, Math.min(c.width - 1, Math.round((cx - r.left) * k))), y = Math.max(0, Math.min(c.height - 1, Math.round((cy - r.top) * k)));
    const p = c.getContext('2d').getImageData(x, y, 1, 1).data;
    if (p[3] < 16) return null;
    return '#' + [p[0], p[1], p[2]].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  // ================================================================== HANDLES ON THE PICTURE
  // The picture can be an <svg> or an <img> of one; either way a point in the picture's own units (its viewBox) maps
  // to the screen the same way (the whole viewBox is shown, centred, keeping its shape).
  function mapOf(el, vb) {
    const r = el.getBoundingClientRect();
    if (!vb) { const b = el.viewBox && el.viewBox.baseVal; vb = b && b.width ? [b.x, b.y, b.width, b.height] : [0, 0, r.width || 1, r.height || 1]; }
    const k = Math.min(r.width / vb[2], r.height / vb[3]) || 1, ox = r.left + (r.width - vb[2] * k) / 2, oy = r.top + (r.height - vb[3] * k) / 2;
    return { k, toScreen: (x, y) => [ox + (x - vb[0]) * k, oy + (y - vb[1]) * k], toUser: (sx, sy) => [(sx - ox) / k + vb[0], (sy - oy) / k + vb[1]] };
  }
  // host: an element (position: relative) holding the picture. opts:
  //   picture() -> the <svg> or <img>; viewBox() -> [x, y, w, h] when it's an <img>
  //   items() -> [{ id, x, y, r, s, rot, min, max }] in picture units; r * s is how far the symbol reaches
  //   sel() -> the selected id (or null); select(id | null)
  //   change(id, { x, y, s, rot }, done) while dragging (done false) and at the end (done true)
  //   active() -> false to stand aside (another drawing tool is in use); body: true to let the kit move symbols
  //   bounds: [minX, minY, maxX, maxY] to keep moved symbols inside
  function handles(host, opts) {
    const ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('class', 'kit-ov'); ov.setAttribute('aria-hidden', 'true');
    host.classList.add('kit-host');
    const active = () => !opts.active || opts.active();
    const pic = () => opts.picture();
    const map = () => { const p = pic(); return p ? mapOf(p, opts.viewBox && opts.viewBox()) : null; };
    const find = id => (opts.items() || []).find(i => i.id === id) || null;
    // where the box and the two handles are on screen, relative to the host
    function geo(it) {
      const m = map(); if (!m || !it) return null;
      const hr = host.getBoundingClientRect(), [cx, cy] = m.toScreen(it.x, it.y), c = [cx - hr.left, cy - hr.top];
      const half = Math.max(14, it.r * it.s * m.k) + 6, a = (it.rot || 0) * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
      const P = (dx, dy) => [c[0] + dx * cos - dy * sin, c[1] + dx * sin + dy * cos];
      return { c, half, corners: [P(-half, -half), P(half, -half), P(half, half), P(-half, half)], size: P(half, half), turn: P(0, -half - 26), top: P(0, -half), m };
    }
    function refresh() {
      if (!ov.isConnected) host.appendChild(ov);
      const id = opts.sel(), it = active() && id != null ? find(id) : null, g = it && geo(it);
      if (!g) { ov.innerHTML = ''; return; }
      const big = coarse(), hs = big ? 16 : 11, rr = big ? 11 : 8;
      ov.innerHTML = `<polygon points="${g.corners.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" class="kit-box"/>
        <line x1="${g.top[0].toFixed(1)}" y1="${g.top[1].toFixed(1)}" x2="${g.turn[0].toFixed(1)}" y2="${g.turn[1].toFixed(1)}" class="kit-stem"/>
        <rect x="${(g.size[0] - hs / 2).toFixed(1)}" y="${(g.size[1] - hs / 2).toFixed(1)}" width="${hs}" height="${hs}" class="kit-h" data-h="size"/>
        <circle cx="${g.turn[0].toFixed(1)}" cy="${g.turn[1].toFixed(1)}" r="${rr}" class="kit-h" data-h="turn"/>
        <path d="M${(g.turn[0] - rr / 2).toFixed(1)} ${(g.turn[1] + 1).toFixed(1)}a${rr / 2} ${rr / 2} 0 1 1 ${(rr / 2).toFixed(1)} ${(rr / 2).toFixed(1)}" class="kit-turn-ic"/>`;
    }
    // what's under a point: a handle of the selected symbol, or a symbol
    function hit(e) {
      const hr = host.getBoundingClientRect(), x = e.clientX - hr.left, y = e.clientY - hr.top, near = coarse() ? 26 : 14;
      const id = opts.sel(), it = id != null ? find(id) : null, g = it && geo(it);
      if (g) {
        if (Math.hypot(x - g.size[0], y - g.size[1]) < near) return { h: 'size', it, g };
        if (Math.hypot(x - g.turn[0], y - g.turn[1]) < near) return { h: 'turn', it, g };
      }
      const m = map(); if (!m) return null;
      const [ux, uy] = m.toUser(e.clientX, e.clientY), list = (opts.items() || []).slice().reverse();
      if (it) list.unshift(it);   // the selected one wins where symbols overlap
      for (const s of list) if (Math.hypot(ux - s.x, uy - s.y) * m.k < Math.max(near, s.r * s.s * m.k)) return { h: 'body', it: s, m, ux, uy };
      return null;
    }
    let drag = null; const downs = new Set();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    function down(e) {
      if (!active() || (e.button && e.button !== 0)) return;
      downs.add(e.pointerId);
      if (downs.size > 1) { if (drag) { opts.change(drag.it.id, drag.start, true); drag = null; } return; }   // a second finger cancels
      const h = hit(e);
      if (!h) { if (opts.sel() != null) { opts.select(null); refresh(); } return; }
      if (h.h === 'body' && !opts.body) { if (opts.sel() !== h.it.id) { opts.select(h.it.id); refresh(); } return; }   // the tool moves it itself
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      if (opts.sel() !== h.it.id) { opts.select(h.it.id); }
      const it = find(h.it.id) || h.it, g = geo(it);
      drag = { h: h.h, it, start: { x: it.x, y: it.y, s: it.s, rot: it.rot || 0 }, id: e.pointerId, sx: e.clientX, sy: e.clientY, live: h.h !== 'body', g };
      if (h.h === 'body') { const m = map(); const [ux, uy] = m.toUser(e.clientX, e.clientY); drag.off = [it.x - ux, it.y - uy]; }
      if (h.h === 'size') { const hr = host.getBoundingClientRect(); drag.d0 = Math.max(6, Math.hypot(e.clientX - hr.left - g.c[0], e.clientY - hr.top - g.c[1])); }
      try { host.setPointerCapture(e.pointerId); } catch {}
      refresh();
    }
    let raf = 0, lastE = null;
    function move(e) {
      if (!drag || e.pointerId !== drag.id) { if (!drag && active() && e.pointerType === 'mouse') { const h = hit(e); host.style.cursor = h ? (h.h === 'size' ? 'nwse-resize' : h.h === 'turn' ? 'grab' : (opts.body ? 'move' : 'pointer')) : ''; } return; }
      e.preventDefault();
      lastE = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey };
      if (!raf) raf = requestAnimationFrame(step);
    }
    function step() {
      raf = 0; if (!drag || !lastE) return;
      const e = lastE, it = drag.it, v = { ...drag.start };
      if (!drag.live) { if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < (coarse() ? 8 : 4)) return; drag.live = true; }
      const hr = host.getBoundingClientRect(), g = drag.g;
      if (drag.h === 'size') v.s = +clamp(drag.start.s * Math.hypot(e.clientX - hr.left - g.c[0], e.clientY - hr.top - g.c[1]) / drag.d0, it.min || 0.1, it.max || 5).toFixed(3);
      else if (drag.h === 'turn') { let a = Math.atan2(e.clientY - hr.top - g.c[1], e.clientX - hr.left - g.c[0]) * 180 / Math.PI + 90; if (!e.shiftKey) a = Math.round(a / 15) * 15; a = ((a + 540) % 360) - 180; v.rot = a === -180 ? 180 : Math.round(a); }
      else { const m = map(); if (!m) return; const [ux, uy] = m.toUser(e.clientX, e.clientY), b = opts.bounds || [-Infinity, -Infinity, Infinity, Infinity]; v.x = +clamp(ux + drag.off[0], b[0], b[2]).toFixed(1); v.y = +clamp(uy + drag.off[1], b[1], b[3]).toFixed(1); }
      opts.change(it.id, v, false);
      drag.it = { ...it, ...v, r: (find(it.id) || it).r };
      refresh();
    }
    function up(e) {
      downs.delete(e.pointerId);
      if (!drag || e.pointerId !== drag.id) return;
      cancelAnimationFrame(raf); if (lastE) step(); raf = 0; lastE = null;
      const d = drag; drag = null;
      if (d.live) opts.change(d.it.id, { x: d.it.x, y: d.it.y, s: d.it.s, rot: d.it.rot || 0 }, true);
      refresh();
    }
    // fingers: a drag that starts on a symbol or a handle moves it, never the page
    const touch = e => { if (!active() || e.touches.length !== 1) return; const t = e.touches[0], h = hit({ clientX: t.clientX, clientY: t.clientY }); if (h && (h.h !== 'body' || opts.body)) e.preventDefault(); };
    host.addEventListener('pointerdown', down, true); host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up);
    host.addEventListener('touchstart', touch, { passive: false });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => refresh()) : null; if (ro) ro.observe(host);
    host.appendChild(ov);
    return {
      refresh, get busy() { return !!drag; },
      destroy() { host.removeEventListener('pointerdown', down, true); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up); host.removeEventListener('touchstart', touch); if (ro) ro.disconnect(); ov.remove(); }
    };
  }

  return { symbols, pickSymbol, libCats, useSym, recentSyms, swatches, colours, MAIN, useCol, recentCols, sampleAt, handles, mapOf, hsv2hex, hex2hsv };
})();
