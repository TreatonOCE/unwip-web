// Unwip - the symbols Build pieces share (coats of arms, sigils, insignia), sorted into sections: the hand-drawn
// heraldic shapes (registered by buildarms.js), animals and objects from game-icons.net (symbols-data.js, CC BY 3.0),
// and Roman numerals I to XX drawn here. One picker window, with a search box, is used everywhere.
window.UnwipSymbols = (function () {
  'use strict';
  const U = window.__unwip;
  const SECTIONS = [['shapes', 'Shapes'], ['beasts', 'Beasts'], ['birds', 'Birds'], ['dragons', 'Dragons & monsters'], ['creatures', 'Creatures'],
    ['plants', 'Plants'], ['sky', 'Sun, moon & stars'], ['weapons', 'Weapons & tools'], ['things', 'Places & things'], ['dark', 'Death & dark'], ['numerals', 'Numerals']];
  const DEFS = {};   // key -> { label, section, b1, b2, paths, box (512: game-icons; 0: drawn around 0,0 about 84 across), evenodd, cut }
  // from game-icons.net
  for (const [k, [label, section, b1, b2, d, by]] of Object.entries(window.UnwipSymbolData || {})) DEFS[k] = { label, section, b1, b2, paths: [d], box: 512, by };

  // ---- Roman numerals, drawn as shapes (no font needed, so they look the same in every picture and export)
  const GLYPH = {
    I: [22, x => `M${x} -30H${x + 22}V-24H${x + 16}V24H${x + 22}V30H${x}V24H${x + 6}V-24H${x}Z`],
    V: [36, x => `M${x} -30H${x + 16}V-24H${x + 12}L${x + 19} 14L${x + 28} -24H${x + 24}V-30H${x + 36}V-24H${x + 33}L${x + 21} 30H${x + 16}L${x + 4} -24H${x}Z`],
    X: [36, x => `M${x} -30H${x + 16}V-24H${x + 13}L${x + 18} -6L${x + 23} -24H${x + 20}V-30H${x + 36}V-24H${x + 31}L${x + 22} 0L${x + 31} 24H${x + 36}V30H${x + 20}V24H${x + 23}L${x + 18} 6L${x + 13} 24H${x + 16}V30H${x}V24H${x + 5}L${x + 14} 0L${x + 5} -24H${x}Z`]
  };
  const roman = n => { let s = '', r = n; for (const [v, t] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) while (r >= v) { s += t; r -= v; } return s; };
  for (let n = 1; n <= 20; n++) {
    const r = roman(n), gap = 3, W = [...r].reduce((a, ch) => a + GLYPH[ch][0], 0) + gap * (r.length - 1);
    let x = -W / 2, d = '';
    for (const ch of r) { d += GLYPH[ch][1](x); x += GLYPH[ch][0] + gap; }
    const k = Math.min(1.4, 84 / W);   // long numbers shrink to fit
    DEFS['num' + n] = { label: r, section: 'numerals', b1: `numeral ${r}`, b2: `numerals ${r}`, paths: [d], box: 0, scale: k };
  }

  function register(key, def) { DEFS[key] = Object.assign({ box: 0 }, def); }
  const get = key => DEFS[key] || null;
  const inSection = s => Object.keys(DEFS).filter(k => DEFS[k].section === s);

  // a symbol as SVG, centred on 0,0 and about 84 across; fill, and an optional outline (width in those units)
  function g(key, fill, line, lineW) {
    const D = DEFS[key]; if (!D) return '';
    const k = D.box ? 84 / D.box : (D.scale || 1), sw = line ? (lineW || 2.2) / k : 0;
    const paths = D.paths.map(p => `<path d="${p}" fill="${fill}"${D.evenodd ? ' fill-rule="evenodd"' : ''}${line ? ` stroke="${line}" stroke-width="${sw.toFixed(2)}" stroke-linejoin="round"` : ''}/>`).join('') + (D.cut ? `<path d="${D.cut}" fill="${line || '#1d1d1f'}"/>` : '');
    if (D.box) return `<g transform="scale(${k.toFixed(4)}) translate(${-D.box / 2} ${-D.box / 2})">${paths}</g>`;
    return D.scale && D.scale !== 1 ? `<g transform="scale(${D.scale.toFixed(3)})">${paths}</g>` : paths;
  }
  const icon = (key, col) => `<svg viewBox="-50 -50 100 100" width="34" height="34">${g(key, col || 'currentColor')}</svg>`;

  // ---- the picker: sections, a search box; resolves with the key picked (or null)
  // (the Build tools use the shared chooser in buildkit.js: a dropdown of sections with Recent and All)
  async function pick(opts = {}) {
    const K = window.UnwipKit;
    if (K) return K.pickSymbol({ id: opts.id || 'lib', title: opts.title, current: opts.current, cats: K.libCats(opts.sections), note: 'The animals and objects are by artists at game-icons.net: free to use, even commercially, with a short credit when you publish (Build shows the line).' });
    const body = document.createElement('div'); body.className = 'sym-pick';
    const only = opts.sections ? SECTIONS.filter(([s]) => opts.sections.includes(s)) : SECTIONS;
    body.innerHTML = `<input class="sym-search" type="search" placeholder="Find a symbol: lion, crow, skull, IV…" aria-label="Find a symbol">
      <p class="sym-note">The animals and objects are by artists at game-icons.net: free to use, even commercially, with a short credit when you publish (Build shows the line).</p><div class="sym-sections">${only.map(([s, name]) => { const keys = inSection(s); return keys.length ? `<section data-sec="${s}"><h4>${name}</h4><div class="sym-grid">${keys.map(k => `<button type="button" class="sym-b ${opts.current === k ? 'on' : ''}" data-sym="${k}" title="${U.esc(DEFS[k].label)}">${icon(k)}<span>${U.esc(DEFS[k].label)}</span></button>`).join('')}</div></section>` : ''; }).join('')}</div>`;
    let chosen = null;
    const p = U.modal({ title: opts.title || 'Pick a symbol', body, wide: true, buttons: [{ label: 'Cancel', value: null, kind: 'ghost' }],
      onOpen: () => setTimeout(() => { const s = body.querySelector('.sym-search'); if (s && !matchMedia('(pointer: coarse)').matches) s.focus(); }, 50) });
    const close = () => { const back = body.closest('.modal-back'); const b = back && back.querySelector('.m-foot .btn'); if (b) b.click(); };
    body.addEventListener('click', e => { const b = e.target.closest('[data-sym]'); if (!b) return; chosen = b.dataset.sym; close(); });
    // whole words from their start: "crow" finds the crow, not crowns
    body.querySelector('.sym-search').addEventListener('input', e => {
      const q = e.target.value.trim().toLowerCase();
      const words = b => `${DEFS[b.dataset.sym].label} ${DEFS[b.dataset.sym].b1} ${DEFS[b.dataset.sym].section}`.toLowerCase().split(/[^a-z0-9]+/);
      const all = [...body.querySelectorAll('[data-sym]')], exact = all.filter(b => words(b).includes(q));
      all.forEach(b => { b.hidden = !!q && !(exact.length ? exact.includes(b) : words(b).some(w => w.startsWith(q))); });
      body.querySelectorAll('section[data-sec]').forEach(s => { s.hidden = ![...s.querySelectorAll('[data-sym]')].some(b => !b.hidden); });
    });
    await p;
    return chosen;
  }
  // the credit a picture needs when it uses game-icons.net symbols (CC BY 3.0 asks for the artist's name), or null
  function credit(keys) {
    const by = [...new Set((keys || []).map(k => DEFS[k] && DEFS[k].by).filter(Boolean))].sort();
    if (!by.length) return null;
    const names = by.length === 1 ? by[0] : by.slice(0, -1).join(', ') + ' and ' + by[by.length - 1];
    return { by, line: `Symbols by ${names}, game-icons.net, CC BY 3.0` };
  }
  return { SECTIONS, register, get, g, icon, pick, inSection, roman, credit, keys: () => Object.keys(DEFS) };
})();
