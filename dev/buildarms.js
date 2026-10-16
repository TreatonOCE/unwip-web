// Unwip - Build › Coat of arms. Pick a shield, divide the field, add a band (an "ordinary") and symbols
// ("charges", which can be one of your own runes or sigils), and a motto. Unwip writes the herald's description
// (the blazon) as you go, and points out where the heralds' rule of colour is broken. Plain rules, no AI.
(function () {
  'use strict';
  const B = window.UnwipBuild; if (!B) return;
  const U = window.__unwip;
  const { $, $$, esc } = U;
  const rnd = n => Math.floor(Math.random() * n), pick = a => a[rnd(a.length)];

  const T = {
    or: ['Or', 'gold', '#e2b13c', 'metal'], argent: ['Argent', 'silver', '#f2f1ec', 'metal'],
    gules: ['Gules', 'red', '#c22630', 'colour'], azure: ['Azure', 'blue', '#1f58a3', 'colour'], vert: ['Vert', 'green', '#1f7a3e', 'colour'],
    purpure: ['Purpure', 'purple', '#6b2f7d', 'colour'], sable: ['Sable', 'black', '#1d1d1f', 'colour'],
    tenne: ['Tenné', 'orange', '#c96a1d', 'stain'], sanguine: ['Sanguine', 'blood red', '#7e1b22', 'stain']
  };
  const SHAPES = {
    heater: ['Heater', 'M10 10H190V112C190 170 150 206 100 232C50 206 10 170 10 112Z'],
    french: ['French', 'M10 10H190V190Q190 214 166 214H122Q102 214 100 232Q98 214 78 214H34Q10 214 10 190Z'],
    kite: ['Kite', 'M100 8C158 8 190 38 190 84C190 140 132 198 100 234C68 198 10 140 10 84C10 38 42 8 100 8Z'],
    round: ['Round', 'M100 24A98 98 0 1 1 99.99 24Z'],
    banner: ['Banner', 'M14 10H186V232L100 206L14 232Z'],
    lozenge: ['Lozenge', 'M100 6L194 122L100 236L6 122Z']
  };
  const DIV = {
    plain: ['Plain', ''], perPale: ['Per pale', 'Per pale'], perFess: ['Per fess', 'Per fess'], perBend: ['Per bend', 'Per bend'], perBendSinister: ['Per bend sinister', 'Per bend sinister'],
    quarterly: ['Quarterly', 'Quarterly'], perSaltire: ['Per saltire', 'Per saltire'], perChevron: ['Per chevron', 'Per chevron'],
    paly: ['Stripes down (paly)', 'Paly of six'], barry: ['Stripes across (barry)', 'Barry of six'], chequy: ['Chequered (chequy)', 'Chequy']
  };
  const ORD = {
    none: ['None', ''], chief: ['Chief (band along the top)', 'a chief'], fess: ['Fess (band across)', 'a fess'], pale: ['Pale (band down)', 'a pale'],
    bend: ['Bend (diagonal)', 'a bend'], bendSinister: ['Bend sinister (other diagonal)', 'a bend sinister'], cross: ['Cross', 'a cross'], saltire: ['Saltire (X)', 'a saltire'],
    chevron: ['Chevron', 'a chevron'], bordure: ['Bordure (edge)', 'a bordure']
  };
  // the charges, drawn in a box about 80 across around 0,0
  const star = (n, R, r) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (q * Math.cos(a)).toFixed(1) + ' ' + (q * Math.sin(a)).toFixed(1); } return d + 'Z'; };
  const circ = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0Z`;
  const CH = {
    mullet: ['Star', 'mullet', 'mullets', [star(5, 42, 17)]],
    estoile: ['Eight-pointed star', 'estoile', 'estoiles', [star(8, 42, 14)]],
    sun: ['Sun', 'sun in splendour', 'suns in splendour', [star(16, 42, 26), circ(0, 0, 21)]],
    crescent: ['Crescent', 'crescent', 'crescents', ['M-28.1 -22.5A36 36 0 1 0 28.1 -22.5A30 30 0 1 1 -28.1 -22.5Z']],
    cross: ['Small cross', 'cross pattée', 'crosses pattée', ['M-8 -40H8L5 -12L40 -8V8L5 5L8 40H-8L-5 5L-40 8V-8L-5 -12Z']],
    roundel: ['Disc', 'roundel', 'roundels', [circ(0, 0, 32)]],
    annulet: ['Ring', 'annulet', 'annulets', [circ(0, 0, 32) + circ(0, 0, 21)], true],
    lozenge: ['Diamond', 'lozenge', 'lozenges', ['M0 -42L28 0L0 42L-28 0Z']],
    heart: ['Heart', 'heart', 'hearts', ['M0 34C-42 6 -36 -32 -13 -32C-4 -32 0 -24 0 -18C0 -24 4 -32 13 -32C36 -32 42 6 0 34Z']],
    tower: ['Tower', 'tower', 'towers', ['M-22 40V-12H-28V-38H-17V-29H-6V-38H6V-29H17V-38H28V-12H22V40Z'], false, 'M-8 40V20A8 8 0 0 1 8 20V40Z'],
    crown: ['Crown', 'crown', 'crowns', ['M-36 14L-42 -24L-21 -4L0 -36L21 -4L42 -24L36 14Z', 'M-36 18H36V30H-36Z']],
    key: ['Key', 'key', 'keys', [circ(0, -26, 15) + circ(0, -26, 7), 'M-4 -12H4V42H-4Z', 'M4 24H16V31H4Z', 'M4 34H12V41H4Z'], true],
    sword: ['Sword', 'sword', 'swords', ['M0 -46L6 -36V16H-6V-36Z', 'M-22 16H22V23H-22Z', 'M-4 23H4V37H-4Z', circ(0, 42, 5)]],
    axe: ['Axe', 'axe', 'axes', ['M-3 -40H3V44H-3Z', 'M3 -34C24 -38 34 -22 30 -4C22 -10 12 -12 3 -10Z']],
    tree: ['Tree', 'tree', 'trees', ['M-5 8H5V40H-5Z', circ(0, -12, 22), circ(-17, 4, 15), circ(17, 4, 15)]],
    mount: ['Hill', 'mount', 'mounts', ['M-42 36Q-42 2 -21 2Q-15 -26 0 -26Q15 -26 21 2Q42 2 42 36Z']],
    tear: ['Drop', 'gutté', 'gouttes', ['M0 -40C10 -16 26 4 26 18A26 26 0 0 1 -26 18C-26 4 -10 -16 0 -40Z']],
    eye: ['Eye', 'eye', 'eyes', ['M-42 0Q0 -38 42 0Q0 38 -42 0Z' + circ(0, 0, 13)], true]
  };
  // the shared symbol library (symbols.js) gets these hand-drawn charges too, sorted into sections
  const SECT = { mullet: 'sky', estoile: 'sky', sun: 'sky', crescent: 'sky', cross: 'shapes', roundel: 'shapes', annulet: 'shapes', lozenge: 'shapes', heart: 'shapes', tear: 'shapes', eye: 'shapes',
    tower: 'things', crown: 'things', key: 'weapons', sword: 'weapons', axe: 'weapons', tree: 'plants', mount: 'plants' };
  const SYM = window.UnwipSymbols;
  if (SYM) for (const [k, v] of Object.entries(CH)) SYM.register(k, { label: v[0], section: SECT[k] || 'shapes', b1: v[1], b2: v[2], paths: v[3], evenodd: !!v[4], cut: v[5] || '' });
  const symDef = k => CH[k] ? { b1: CH[k][1], b2: CH[k][2], label: CH[k][0] } : SYM && SYM.get(k);
  const article = w => /^[aeiou]/i.test(w) ? 'an' : 'a';
  // rot (turn of the main symbols, degrees), ribbon (its shape), ribbonHex and mottoInk (free colours for the ribbon
  // and its letters; empty means the old tincture, mottoCol, and letters that suit it) were added later: old arms keep
  // working without them. Extra symbols can carry r (their own turn).
  const blank = () => ({ shape: 'heater', div: 'plain', t1: 'azure', t2: 'or', ord: 'none', t3: 'or', charge: 'mullet', count: 3, t4: 'argent', ref: null, motto: '', mottoOn: true, mottoCol: 'argent', layout: 'auto', size: 1, pos: null, extras: [], rot: 0, ribbon: 'swallow', ribbonHex: '', mottoInk: '' });

  // ================================================================== DRAWING
  const col = t => (T[t] || T.argent)[2];
  function field(d) {
    const a = col(d.t1), b = col(d.t2);
    switch (d.div) {
      case 'perPale': return `<rect width="200" height="240" fill="${a}"/><rect x="100" width="100" height="240" fill="${b}"/>`;
      case 'perFess': return `<rect width="200" height="240" fill="${a}"/><rect y="118" width="200" height="122" fill="${b}"/>`;
      case 'perBend': return `<rect width="200" height="240" fill="${a}"/><path d="M0 0L200 240H0Z" fill="${b}"/>`;
      case 'perBendSinister': return `<rect width="200" height="240" fill="${a}"/><path d="M200 0V240H0Z" fill="${b}"/>`;
      case 'quarterly': return `<rect width="200" height="240" fill="${a}"/><rect x="100" width="100" height="118" fill="${b}"/><rect y="118" width="100" height="122" fill="${b}"/>`;
      case 'perSaltire': return `<rect width="200" height="240" fill="${a}"/><path d="M0 0L100 118L0 240ZM200 0L100 118L200 240Z" fill="${b}"/>`;
      case 'perChevron': return `<rect width="200" height="240" fill="${a}"/><path d="M0 240V196L100 104L200 196V240Z" fill="${b}"/>`;
      case 'paly': return `<rect width="200" height="240" fill="${a}"/>${[1, 3, 5].map(i => `<rect x="${i * 200 / 6}" width="${200 / 6}" height="240" fill="${b}"/>`).join('')}`;
      case 'barry': return `<rect width="200" height="240" fill="${a}"/>${[1, 3, 5].map(i => `<rect y="${10 + i * 37}" width="200" height="37" fill="${b}"/>`).join('')}`;
      case 'chequy': { let s = `<rect width="200" height="240" fill="${a}"/>`; for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) if ((x + y) % 2) s += `<rect x="${x * 200 / 6}" y="${10 + y * 30}" width="${200 / 6 + 0.3}" height="30.3" fill="${b}"/>`; return s; }
      default: return `<rect width="200" height="240" fill="${a}"/>`;
    }
  }
  function ordinary(d) {
    const c = col(d.t3);
    switch (d.ord) {
      case 'chief': return `<rect width="200" height="66" fill="${c}"/>`;
      case 'fess': return `<rect y="94" width="200" height="50" fill="${c}"/>`;
      case 'pale': return `<rect x="74" width="52" height="240" fill="${c}"/>`;
      case 'bend': return `<path d="M-10 18L18 -10L210 222L182 250Z" fill="${c}"/>`;
      case 'bendSinister': return `<path d="M210 18L182 -10L-10 222L18 250Z" fill="${c}"/>`;
      case 'cross': return `<rect x="82" width="36" height="240" fill="${c}"/><rect y="98" width="200" height="36" fill="${c}"/>`;
      case 'saltire': return `<path d="M-10 14L14 -10L210 226L186 250Z" fill="${c}"/><path d="M210 14L186 -10L-10 226L14 250Z" fill="${c}"/>`;
      case 'chevron': return `<path d="M0 178L100 82L200 178V222L100 126L0 222Z" fill="${c}"/>`;
      default: return '';
    }
  }
  // where the charges go: in the open field, around whatever band is there
  // how the symbols are arranged: the usual places (which follow the band), or a layout people pick, or where they put them
  const LAYOUTS = {
    auto: ['Usual', ''], row: ['In a row', 'in fess'], column: ['In a column', 'in pale'], bend: ['Slanting', 'in bend'],
    onetwo: ['One, then two', 'one and two'], around: ['Around the edge', 'in orle'], custom: ['Where I put them', '']
  };
  const layoutsFor = n => n <= 1 ? ['auto', 'custom'] : n === 2 ? ['auto', 'row', 'column', 'bend', 'custom'] : ['auto', 'onetwo', 'row', 'column', 'bend', 'around', 'custom'];
  function laid(d) {
    const n = d.count || 1, L = d.layout || 'auto';
    if (L === 'custom' && Array.isArray(d.pos) && d.pos.length) {
      const base = spotsAuto(d);
      return base.map((b, i) => d.pos[i] ? [d.pos[i][0], d.pos[i][1], b[2]] : b);
    }
    if (!layoutsFor(n).includes(L) || L === 'auto' || L === 'custom') return spotsAuto(d);
    const sc = { 1: 1.1, 2: .62, 3: .48, 4: .38 }[n];
    if (L === 'row') return ({ 1: [100], 2: [64, 136], 3: [46, 100, 154], 4: [38, 79, 121, 162] })[n].map(x => [x, 116, sc]);
    if (L === 'column') return ({ 1: [116], 2: [72, 160], 3: [56, 116, 176], 4: [48, 94, 140, 186] })[n].map(y => [100, y, n === 3 ? .5 : n === 4 ? .4 : sc]);
    if (L === 'bend') { const ts = { 1: [.5], 2: [.2, .8], 3: [0, .5, 1], 4: [0, .333, .667, 1] }[n]; return ts.map(t => [50 + 100 * t, 60 + 120 * t, n === 4 ? .38 : n === 3 ? .45 : .5]); }
    if (L === 'onetwo') return n === 3 ? [[100, 70, .55], [64, 148, .55], [136, 148, .55]] : [[100, 58, .42], [60, 122, .42], [140, 122, .42], [100, 186, .42]];
    if (L === 'around') return [...Array(n)].map((_, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [100 + 62 * Math.cos(a), 120 + 72 * Math.sin(a), n === 3 ? .5 : .42]; });
    return spotsAuto(d);
  }
  function spots(d) {
    const k = Math.max(0.4, Math.min(1.8, +d.size || 1));
    return (laid(d) || []).map(([x, y, s]) => [x, y, s * k]);
  }
  function spotsAuto(d) {
    const n = d.count || 1, o = d.ord;
    if (o === 'chief') return { 1: [[100, 136, 1]], 2: [[66, 130, .6], [134, 130, .6]], 3: [[66, 112, .5], [134, 112, .5], [100, 172, .5]], 4: [[66, 104, .45], [134, 104, .45], [66, 160, .45], [134, 160, .45]] }[n];
    if (o === 'fess') return { 1: [[100, 119, .5]], 2: [[100, 56, .5], [100, 180, .5]], 3: [[64, 56, .45], [136, 56, .45], [100, 180, .45]], 4: [[64, 56, .42], [136, 56, .42], [70, 180, .42], [130, 180, .42]] }[n];
    if (o === 'pale') return { 1: [[100, 116, .5]], 2: [[42, 116, .5], [158, 116, .5]], 3: [[42, 80, .42], [158, 80, .42], [100, 116, .38]], 4: [[42, 70, .42], [158, 70, .42], [42, 150, .42], [158, 150, .42]] }[n];
    if (o === 'chevron') return { 1: [[100, 170, .5]], 2: [[46, 60, .5], [154, 60, .5]], 3: [[46, 56, .45], [154, 56, .45], [100, 176, .45]], 4: [[46, 56, .42], [154, 56, .42], [100, 176, .42], [100, 40, .35]] }[n];
    if (o === 'cross' || o === 'saltire') return { 1: [[100, 116, .38]], 2: [[50, 58, .42], [150, 58, .42]], 3: [[50, 58, .42], [150, 58, .42], [100, 190, .42]], 4: o === 'cross' ? [[48, 54, .42], [152, 54, .42], [48, 176, .42], [152, 176, .42]] : [[100, 46, .42], [40, 118, .42], [160, 118, .42], [100, 184, .42]] }[n];
    if (o === 'bend') return { 1: [[100, 116, .45]], 2: [[150, 60, .5], [52, 168, .5]], 3: [[150, 54, .42], [52, 150, .42], [86, 196, .38]], 4: [[132, 44, .4], [172, 92, .4], [36, 132, .4], [76, 182, .4]] }[n];
    if (o === 'bendSinister') return { 1: [[100, 116, .45]], 2: [[50, 60, .5], [148, 168, .5]], 3: [[50, 54, .42], [148, 150, .42], [114, 196, .38]], 4: [[68, 44, .4], [28, 92, .4], [164, 132, .4], [124, 182, .4]] }[n];
    const sh = o === 'bordure' ? 0.88 : 1;
    return { 1: [[100, 112, 1.1]], 2: [[64, 108, .62], [136, 108, .62]], 3: [[64, 78, .55], [136, 78, .55], [100, 152, .55]], 4: [[64, 76, .5], [136, 76, .5], [64, 146, .5], [136, 146, .5]] }[n].map(([x, y, s]) => [x, y, s * sh]);
  }
  // Keep every charge inside the shield: the places above suit the usual shield, but a diamond, round or banner shield
  // is narrower at the edges, so a charge that would poke out moves in towards the middle and shrinks a little
  // (and charges that end up touching shrink a little more).
  const R0 = 44, EDGE = 7;
  let probe = null;
  function inside(path, x, y) { if (!probe) { try { probe = document.createElement('canvas').getContext('2d'); } catch { return true; } } return probe.isPointInPath(path, x, y); }
  function fitSpots(d, list) {
    if (typeof Path2D === 'undefined') return list;
    const sh = new Path2D((SHAPES[d.shape] || SHAPES.heater)[1]), cx = 100, cy = 122;
    const pts = list.map(([x, y, s]) => [x, y, s]);
    const fits = ([x, y, s]) => { const r = R0 * s + EDGE; for (let a = 0; a < 16; a++) { const t = a * Math.PI / 8; if (!inside(sh, x + Math.cos(t) * r, y + Math.sin(t) * r)) return false; } return true; };
    for (const p of pts) for (let i = 0; i < 40 && !fits(p); i++) { p[0] += (cx - p[0]) * 0.05; p[1] += (cy - p[1]) * 0.05; p[2] *= 0.97; }
    for (let round = 0; round < 30 && d.layout !== 'custom'; round++) {   // (symbols you placed yourself may overlap if you want)
      let clash = false;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i], b = pts[j];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < R0 * (a[2] + b[2]) * 0.92) { a[2] *= 0.96; b[2] *= 0.96; clash = true; }
      }
      if (!clash) break;
    }
    return pts.map(([x, y, s]) => [+x.toFixed(1), +y.toFixed(1), +s.toFixed(3)]);
  }
  function chargeG(d, refs) {
    if (!d.charge || d.charge === 'none') return '';
    const c = col(d.t4), line = d.t4 === 'sable' ? '#6b6b6b' : '#1d1d1f';
    let inner = '';
    if (d.charge === 'rune' || d.charge === 'sigil') {
      const R = refs && refs.item; if (!R) return '';
      if (d.charge === 'rune') {
        const A = Object.assign(B.runes.blank(), R.data || {}), g = (A.glyphs || []).find(x => x.id === d.ref.glyph) || (A.glyphs || []).find(x => (x.strokes || []).length); if (!g) return '';
        const gw = B.runes.glyphW(A), gh = B.runes.glyphH(A), k = 76 / Math.max(gw, gh, 1);
        const keep = A.width; A.width = Math.max(A.width, 4.2);
        inner = `<g transform="scale(${k}) translate(${-gw / 2} ${-gh / 2})">${B.runes.glyphG({ ...A, color: c }, g, line, (A.width * k + 5) / k / A.width)}${B.runes.glyphG({ ...A, color: c }, g, c)}</g>`;
        A.width = keep;
      } else {
        const D = Object.assign(B.sigils.blank(), R.data || {});
        inner = `<g transform="scale(.42)">${B.sigils.sigilG({ ...D, width: D.width + 4 }, null, line)}${B.sigils.sigilG(D, null, c)}</g>`;
      }
    } else {
      const def = CH[d.charge];
      if (def) inner = def[3].map(p => `<path d="${p}" fill="${c}" ${def[4] ? 'fill-rule="evenodd"' : ''} stroke="${line}" stroke-width="2.2" stroke-linejoin="round"/>`).join('') + (def[5] ? `<path d="${def[5]}" fill="${line}"/>` : '');
      else if (SYM && SYM.get(d.charge)) inner = SYM.g(d.charge, c, line, 2.2);
      else return '';
    }
    const rot = +d.rot || 0;
    return fitSpots(d, spots(d) || []).map(([x, y, s], i) => `<g data-chi="${i}" data-x="${x}" data-y="${y}" data-s="${s}" transform="translate(${x} ${y})${rot ? ` rotate(${rot})` : ''} scale(${s})">${inner}</g>`).join('');
  }
  // more symbols, as many as you like: each with its own colour and size, wherever it's dragged to
  function extrasG(d) {
    if (!SYM || !Array.isArray(d.extras)) return '';
    return d.extras.map((e, i) => { const c = col(e.t), line = e.t === 'sable' ? '#6b6b6b' : '#1d1d1f';
      return `<g data-exi="${i}" data-x="${e.x}" data-y="${e.y}" data-s="${e.s}" transform="translate(${e.x} ${e.y})${+e.r ? ` rotate(${+e.r})` : ''} scale(${e.s})">${SYM.g(e.k, c, line, 2.2)}</g>`; }).join('');
  }
  // ---- the motto's ribbon: a few shapes, drawn here. Each keeps to the space under the shield (y 240 to 290).
  const RIBBONS = { swallow: 'Swallowtail', scroll: 'Scroll', straight: 'Straight', arched: 'Arched' };
  const ribbonCol = d => /^#[0-9a-f]{6}$/i.test(d.ribbonHex || '') ? d.ribbonHex : col(d.mottoCol || 'argent');
  const lum = h => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };
  const DARK_T = ['sable', 'gules', 'azure', 'vert', 'purpure', 'sanguine'];
  const inkOn = (d, mc) => /^#[0-9a-f]{6}$/i.test(d.mottoInk || '') ? d.mottoInk
    : /^#[0-9a-f]{6}$/i.test(d.ribbonHex || '') ? (lum(mc) < 0.55 ? '#f2f1ec' : '#1d1d1f') : DARK_T.includes(d.mottoCol) ? '#f2f1ec' : '#1d1d1f';
  // a little darker, for the parts of the ribbon that turn away
  const shade = h => '#' + [16, 8, 0].map(sh => Math.round((parseInt(h.slice(1), 16) >> sh & 255) * 0.72).toString(16).padStart(2, '0')).join('');
  function ribbonSVG(kind, lines, fs, mc, tc, id) {
    const st = `stroke="#1d1d1f" stroke-linejoin="round"`, back = shade(mc);
    const fits = l => l.length * (fs * 0.72 + 1) > 150 ? ` textLength="150" lengthAdjust="spacingAndGlyphs"` : '';
    const flat = (cy) => lines.map((l, i) => `<text x="100" y="${(lines.length > 1 ? cy - 5 + i * (fs + 1.5) : cy) + fs * 0.35}" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="${fs.toFixed(1)}" letter-spacing="1"${fits(l)} fill="${tc}">${esc(l)}</text>`).join('');
    if (kind === 'straight') return `<g><path d="M8 250H192L183 263L192 276H8L17 263Z" fill="${mc}" ${st} stroke-width="1.8"/><path d="M8 250H192M8 276H192" stroke="${back}" stroke-width="1" opacity=".6" transform="translate(0 2.5)"/>${flat(263)}</g>`;
    if (kind === 'scroll') {
      const end = `<path d="M26 248.5H14C5 248.5 3 256 3 263C3 270 5 277.5 14 277.5H26Z" fill="${back}" ${st} stroke-width="1.6"/><path d="M14 277.5C7.5 277.5 6.5 270 8.5 266C10.5 262 17 262.5 17 267C17 270.5 13.5 271.5 12 268.5" fill="none" ${st} stroke-width="1.4" stroke-linecap="round"/>`;
      return `<g>${end}<g transform="translate(200 0) scale(-1 1)">${end}</g><path d="M22 250Q100 245 178 250V276Q100 271 22 276Z" fill="${mc}" ${st} stroke-width="1.8"/>${flat(263)}</g>`;
    }
    if (kind === 'arched') {
      // the band curves down in the middle; the words follow it
      const mid = (dy) => `M16 ${255 + dy}Q100 ${279 + dy} 184 ${255 + dy}`;
      const paths = lines.map((_, i) => `<path id="${id}-m${i}" d="${mid((lines.length > 1 ? -5 + i * (fs + 1.5) : 0) + fs * 0.35)}" fill="none"/>`).join('');
      const tails = `<path d="M20 247L2 251L11 259L3 270L20 266Z" fill="${back}" ${st} stroke-width="1.6"/><path d="M180 247L198 251L189 259L197 270L180 266Z" fill="${back}" ${st} stroke-width="1.6"/>`;
      return `<g><defs>${paths}</defs>${tails}<path d="M16 242Q100 266 184 242L184 268Q100 292 16 268Z" fill="${mc}" ${st} stroke-width="1.8"/>
        ${lines.map((l, i) => `<text font-family="Bookhaven, Georgia, serif" font-size="${fs.toFixed(1)}" letter-spacing="1" fill="${tc}" text-anchor="middle"><textPath href="#${id}-m${i}" startOffset="50%">${esc(l)}</textPath></text>`).join('')}</g>`;
    }
    // swallowtail (the first ribbon, and every motto made before there was a choice)
    return `<g><path d="M22 254H4L13 266L4 278H22Z" fill="${back}" ${st} stroke-width="1.6"/><path d="M178 254H196L187 266L196 278H178Z" fill="${back}" ${st} stroke-width="1.6"/>
        <path d="M18 250Q100 240 182 250V276Q100 266 18 276Z" fill="${mc}" ${st} stroke-width="1.8"/>
        ${lines.map((l, i) => `<text x="100" y="${(lines.length > 1 ? 259 + i * (fs + 1.5) : 264) + fs * 0.35}" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="${fs.toFixed(1)}" letter-spacing="1"${fits(l)} fill="${tc}">${esc(l)}</text>`).join('')}</g>`;
  }
  function armsSVG(d, refs, size) {
    const sh = (SHAPES[d.shape] || SHAPES.heater)[1];
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    const bord = d.ord === 'bordure' ? `<path d="${sh}" fill="none" stroke="${col(d.t3)}" stroke-width="28" clip-path="url(#${id})"/>` : '';
    const motto = d.mottoOn && (d.motto || '').trim();
    const mc = ribbonCol(d), up = (motto || '').toUpperCase();
    // capitals in Bookhaven are about 0.72em wide (plus 1 of letter spacing); long mottos go on two lines
    let lines = [up];
    if (up.length > 22) { const mid = up.length / 2; let cut = -1; for (let i = 0; i < up.length; i++) if (up[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i; lines = cut > 0 ? [up.slice(0, cut), up.slice(cut + 1)] : [up]; }
    const longest = Math.max(...lines.map(l => l.length), 1), fs = Math.max(6, Math.min(15, (148 / longest - 1) / 0.72, lines.length > 1 ? 11 : 15));
    const ribbon = motto ? ribbonSVG(d.ribbon, lines, fs, mc, inkOn(d, mc), id) : '';
    const H = motto ? 290 : 244;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 ${H}" width="${size ? size * 200 / H : '100%'}" height="${size || '100%'}"><defs><clipPath id="${id}"><path d="${sh}"/></clipPath></defs>
      <g clip-path="url(#${id})">${field(d)}${ordinary(d)}</g>${bord}${chargeG(d, refs)}${extrasG(d)}
      <path d="${sh}" fill="none" stroke="#1d1d1f" stroke-width="3.2" stroke-linejoin="round"/>${ribbon}</svg>`;
  }

  // ================================================================== THE HERALD'S DESCRIPTION, AND THE RULE OF COLOUR
  const tn = t => (T[t] || T.argent)[0];
  function blazon(d, refs) {
    let f = d.div === 'plain' ? tn(d.t1) : `${DIV[d.div][1]} ${tn(d.t1)} and ${tn(d.t2)}`;
    const n = d.count || 1, num = ['', 'a', 'two', 'three', 'four'][n];
    let ch = '';
    if (d.charge && d.charge !== 'none') {
      if (d.charge === 'rune' || d.charge === 'sigil') {
        const R = refs && refs.item, A = R && R.data, g = A && A.glyphs && A.glyphs.find(x => x.id === (d.ref && d.ref.glyph));
        const nm = d.charge === 'rune' ? (g && (g.name || (g.key || '').toUpperCase()) ? `rune${n > 1 ? 's' : ''} “${g.name || g.key.toUpperCase()}”` : `rune${n > 1 ? 's' : ''}`) : `sigil${n > 1 ? 's' : ''}${R ? ` of ${R.title}` : ''}`;
        ch = `${n === 1 ? (/^[aeiou]/i.test(nm) ? 'an' : 'a') : num} ${nm} ${tn(d.t4)}`;
      } else { const def = symDef(d.charge); if (def) { const word = n === 1 ? def.b1 : def.b2; ch = `${n === 1 ? article(word) : num} ${word} ${tn(d.t4)}`; } }
      const L = d.layout || 'auto', how = n > 1 && layoutsFor(n).includes(L) ? (L === 'onetwo' && n === 4 ? 'one, two and one' : LAYOUTS[L] ? LAYOUTS[L][1] : '') : '';
      if (ch && how) ch = ch.replace(new RegExp(` ${tn(d.t4)}$`), ` ${how} ${tn(d.t4)}`);   // the heralds' order: three mullets in fess Or
    }
    const o = d.ord !== 'none' && ORD[d.ord] ? `${ORD[d.ord][1]} ${tn(d.t3)}` : '';
    let s = f;
    if (o && d.ord !== 'chief' && d.ord !== 'bordure') s += `, ${o}${!ch ? '' : n === 1 ? (d.ord === 'chevron' ? `, in base ${ch}` : ` charged with ${ch}`) : ` between ${ch}`}`;
    else if (ch) s += `, ${ch}`;
    if (o && d.ord === 'chief') s += `, ${o}`;
    if (o && d.ord === 'bordure') s += `, ${o}`;
    const more = (d.extras || []).map(e => { const D = symDef(e.k); return D ? `${article(D.b1)} ${D.b1} ${tn(e.t)}` : ''; }).filter(Boolean);
    if (more.length) s += `; and ${more.length > 1 ? more.slice(0, -1).join(', ') + ' and ' + more[more.length - 1] : more[0]}`;
    return s + '.';
  }
  function tinctureNotes(d) {
    const cls = t => (T[t] || T.argent)[3] === 'stain' ? 'colour' : (T[t] || T.argent)[3];
    const fieldT = d.div === 'plain' ? [d.t1] : [d.t1, d.t2], out = [];
    const clash = (top, under) => under.every(u => cls(u) === cls(top));
    if (d.ord !== 'none' && clash(d.t3, fieldT)) out.push(`the ${ORD[d.ord][0].split(' (')[0].toLowerCase()} is ${T[d.t3][1]} on ${fieldT.map(t => T[t][1]).join(' and ')}`);
    if (d.charge && d.charge !== 'none') {
      const onBand = (d.count || 1) === 1 && ['fess', 'pale', 'bend', 'bendSinister', 'cross', 'saltire'].includes(d.ord);
      const under = onBand ? [d.t3] : fieldT;
      if (clash(d.t4, under)) out.push(`the charges are ${T[d.t4][1]} on ${under.map(t => T[t][1]).join(' and ')}`);
      if (under.length === 1 && under[0] === d.t4) out.push('the charges are the same colour as the field, so they can’t be seen');
    }
    if (d.div !== 'plain' && d.t1 === d.t2) out.push('both halves of the field are the same colour');
    return out;
  }
  function randomArms() {
    const metals = ['or', 'argent'], colours = ['gules', 'azure', 'vert', 'purpure', 'sable'];
    const d = blank();
    d.shape = pick(['heater', 'heater', 'french', 'kite', 'round']);
    const m = pick(metals), c = pick(colours), fieldIsColour = Math.random() < 0.6;
    d.t1 = fieldIsColour ? c : m; d.t2 = fieldIsColour ? m : c;
    const opposite = t => (T[t][3] === 'metal' ? pick(colours) : pick(metals));
    d.charge = pick(Object.keys(CH));
    if (Math.random() < 0.6) {
      // a plain field with a band and symbols, colour on metal and metal on colour
      d.div = 'plain';
      d.ord = Math.random() < 0.25 ? 'none' : pick(['chief', 'fess', 'pale', 'bend', 'chevron', 'cross', 'saltire', 'bordure']);
      d.t3 = opposite(d.t1); d.count = d.ord === 'none' ? pick([1, 1, 2, 3, 3]) : pick([2, 3, 3, 1]);
      const onBand = d.count === 1 && ['fess', 'pale', 'bend', 'cross', 'saltire'].includes(d.ord);
      d.t4 = onBand ? opposite(d.t3) : (d.ord === 'chevron' || d.ord === 'chief' || d.ord === 'bordure' || Math.random() < 0.5 ? d.t3 : opposite(d.t1));
    } else {
      // a divided field: a band across it would vanish into one half, so no band, and symbols in black, gold or silver
      d.div = pick(['perPale', 'perFess', 'perBend', 'quarterly', 'perChevron', 'perSaltire', 'paly', 'barry']);
      d.ord = Math.random() < 0.3 ? 'bordure' : 'none'; d.t3 = pick(colours.filter(x => x !== d.t1 && x !== d.t2));
      d.count = pick([1, 1, 2, 3]); d.t4 = pick(['sable', 'or', 'argent'].filter(x => x !== d.t1 && x !== d.t2));
    }
    return d;
  }

  // ================================================================== THE EDITOR
  // The side panel and the shield share one selection: tap a symbol on the shield (or an extra symbol's row) and it
  // gets a box with a size handle and a turn handle, like the map maker's; the sliders follow the handles.
  const K = window.UnwipKit;
  let it = null, ctx = null, box = null, d = null, refs = { item: null }, runes = [], sigils = [], sel = null, hd = null;
  async function loadRef() { refs.item = d.ref && d.ref.id ? (runes.concat(sigils).find(x => x.id === d.ref.id) || await B.get(d.ref.id)) : null; }
  async function open(item, el, c) {
    it = item; ctx = c; box = el; d = it.data = Object.assign(blank(), it.data || {}); sel = null;
    [runes, sigils] = await Promise.all([B.all('runes'), B.all('sigil')]);
    await loadRef();
    c.extra.innerHTML = '<button class="btn small" id="ar-rand" title="Roll random arms that follow the heralds’ rules (dice, not AI)">🎲 Random</button>';
    $('#ar-rand').onclick = () => { const keepMotto = { motto: d.motto, mottoOn: d.mottoOn, mottoCol: d.mottoCol, ribbon: d.ribbon, ribbonHex: d.ribbonHex, mottoInk: d.mottoInk }; Object.assign(d, randomArms(), keepMotto); d.ref = null; refs.item = null; sel = null; drawAll(); ctx.changed(); };
    drawAll();
  }
  // heraldic tinctures: the same round swatches as every other colour row, but only the real tinctures (their names
  // go into the herald's description)
  const TINCT = Object.entries(T).map(([k, v]) => ({ v: k, col: v[2], title: `${v[0]} (${v[1]})` }));
  const tinctLabel = v => T[v] ? `${T[v][0]} · ${T[v][1]}` : '';
  const mountTinct = (el, key, onPick) => K.swatches(el, { items: TINCT, value: key(), label: tinctLabel, onPick });
  // the main symbol's choices: the library's sections, then your own runes and sigils
  function chargeCats() {
    const cats = K.libCats();
    const runeItems = runes.flatMap(r => ((r.data && r.data.glyphs) || []).filter(g => (g.strokes || []).length).map(g => { const A = Object.assign(B.runes.blank(), r.data); const gw = B.runes.glyphW(A), gh = B.runes.glyphH(A);
      return { key: `rune:${r.id}|${g.id}`, title: `${r.title}: ${g.name || (g.key || '').toUpperCase()}`, words: `${r.title} ${g.name || ''} ${g.key || ''} rune`, icon: `<svg viewBox="-8 -8 ${gw + 16} ${gh + 16}" class="kit-line">${B.runes.glyphG({ ...A, width: Math.max(A.width, 4) }, g, 'currentColor')}</svg>` }; }));
    if (runeItems.length) cats.push({ id: 'my-runes', name: 'Your runes', items: runeItems.slice(0, 120) });
    if (sigils.length) cats.push({ id: 'my-sigils', name: 'Your sigils', items: sigils.map(x => ({ key: `sigil:${x.id}`, title: `Sigil: ${x.title}`, words: `${x.title} sigil`, icon: `<svg viewBox="-104 -104 208 208" class="kit-line">${B.sigils.sigilG(Object.assign(B.sigils.blank(), x.data || {}), null, 'currentColor')}</svg>` })) });
    return cats;
  }
  const chargeKey = () => d.charge === 'rune' && d.ref ? `rune:${d.ref.id}|${d.ref.glyph}` : d.charge === 'sigil' && d.ref ? `sigil:${d.ref.id}` : d.charge;
  const ribbonIcon = k => `<svg viewBox="0 238 200 56" aria-hidden="true">${ribbonSVG(k, [''], 12, '#f4ecd8', '#000', 'ri' + k)}</svg>`;
  function drawAll() {
    const side0 = box.querySelector('.ar-side'), keepSide = side0 ? side0.scrollTop : 0, keepMain = box.scrollTop;
    if (hd) { hd.destroy(); hd = null; }
    const pct = v => Math.round(v * 100), deg = v => `${Math.round(+v || 0)}°`;
    box.innerHTML = `<div class="ar-wrap">
      <section class="ar-show"><div class="ar-shield" id="ar-shield"></div><div class="ar-blazon" id="ar-blazon"></div><div class="ar-warn" id="ar-warn"></div></section>
      <aside class="ar-side">
        <h3>Shield</h3><div class="ar-shapes">${Object.entries(SHAPES).map(([k, v]) => `<button type="button" class="ar-shape ${d.shape === k ? 'on' : ''}" data-shape="${k}" title="${v[0]}"><svg viewBox="0 0 200 240"><path d="${v[1]}"/></svg></button>`).join('')}</div>
        <h3>Field</h3><div class="field"><select id="ar-div">${Object.entries(DIV).map(([k, v]) => `<option value="${k}" ${d.div === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        <div class="ar-sw" data-key="t1"></div>${d.div !== 'plain' ? '<div class="ar-sw" data-key="t2"></div>' : ''}
        <h3>Band <small>(ordinary)</small></h3><div class="field"><select id="ar-ord">${Object.entries(ORD).map(([k, v]) => `<option value="${k}" ${d.ord === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        ${d.ord !== 'none' ? '<div class="ar-sw" data-key="t3"></div>' : ''}
        <h3>Symbols <small>(charges)</small></h3>
        <div id="ar-symbols"></div>
        ${runes.length || sigils.length ? '' : '<p class="bm-help">Runes and sigils you make in Build show up here too.</p>'}
        ${d.charge !== 'none' ? `<div class="field"><label>How many</label><div class="chip-row" id="ar-count">${[1, 2, 3, 4].map(n => `<button type="button" class="chip ${d.count === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div></div><div class="ar-sw" data-key="t4"></div>
          <div class="field"><label>Arrangement</label><div class="chip-row" id="ar-layout">${layoutsFor(d.count || 1).map(k => `<button type="button" class="chip ${(d.layout || 'auto') === k || (!layoutsFor(d.count || 1).includes(d.layout || 'auto') && k === 'auto') ? 'on' : ''}" data-layout="${k}">${k === 'custom' ? '✋ ' : ''}${LAYOUTS[k][0]}</button>`).join('')}</div>
            <p class="bm-help">${d.layout === 'custom' ? 'Drag the symbols on the shield to move them. Pick another arrangement to go back.' : 'Tap a symbol on the shield for its size and turn handles. Dragging one moves it to Where I put them.'}</p></div>
          <div class="field"><label>Size <small id="ar-size-v">${pct(+d.size || 1)}%</small></label><input type="range" id="ar-size" min="40" max="180" step="1" value="${pct(+d.size || 1)}"></div>
          <div class="field"><label>Turn <small id="ar-rot-v">${deg(d.rot)}</small></label><input type="range" id="ar-rot" min="-180" max="180" step="5" value="${Math.round(+d.rot || 0)}"></div>` : ''}
        ${SYM ? `<h3>More symbols</h3><div class="kit-items" id="ar-extras"></div>
          <button type="button" class="btn small" id="ar-ex-add">+ Add a symbol</button>` : ''}
        <h3>Motto</h3><div class="field"><input id="ar-motto" value="${esc(d.motto || '')}" placeholder="e.g. We do not kneel"></div>
        ${(d.motto || '').trim() ? `<label class="bd-check"><input type="checkbox" id="ar-mon" ${d.mottoOn ? 'checked' : ''}> Show the motto on a ribbon</label>
          ${d.mottoOn ? `<div class="field"><label>Ribbon</label><div class="ar-ribbons">${Object.entries(RIBBONS).map(([k, n]) => `<button type="button" class="ar-rib ${(d.ribbon || 'swallow') === k ? 'on' : ''}" data-rib="${k}" title="${n}" aria-label="${n}">${ribbonIcon(k)}<span>${n}</span></button>`).join('')}</div></div>
          <div id="ar-rcol"></div><div id="ar-rink"></div>` : ''}` : ''}
      </aside></div>`;
    const shield = $('#ar-shield', box);
    const pic = () => shield.querySelector('svg:not(.kit-ov)');
    hd = K.handles(shield, { picture: pic, items, sel: () => sel, select: id => { sel = id; extrasList(); }, change, body: true, bounds: [0, 0, 200, 244] });
    paint();
    box.querySelector('.ar-side').scrollTop = keepSide; box.scrollTop = keepMain;
    const re = () => { drawAll(); ctx.changed(); };
    $$('.ar-shape', box).forEach(b => b.onclick = () => { d.shape = b.dataset.shape; re(); });
    $('#ar-div', box).onchange = e => { d.div = e.target.value; re(); };
    $('#ar-ord', box).onchange = e => { d.ord = e.target.value; re(); };
    $$('.ar-sw', box).forEach(s => { const k = s.dataset.key; mountTinct(s, () => d[k], v => { d[k] = v; paint(); ctx.changed(); }); });
    K.symbols($('#ar-symbols', box), { id: 'arms', cats: chargeCats(), current: chargeKey(), none: 'None', onPick: async k => {
      const had = d.charge !== 'none';
      if (k.startsWith('rune:')) { const [rid, gid] = k.slice(5).split('|'); d.charge = 'rune'; d.ref = { id: rid, glyph: gid }; }
      else if (k.startsWith('sigil:')) { d.charge = 'sigil'; d.ref = { id: k.slice(6) }; }
      else { d.charge = k; d.ref = null; }
      await loadRef();
      if (had !== (d.charge !== 'none')) re(); else { paint(); ctx.changed(); }
    } });
    $$('#ar-count .chip', box).forEach(b => b.onclick = () => { d.count = +b.dataset.n; if (d.layout === 'custom') d.pos = null, d.layout = 'auto'; sel = null; re(); });
    $$('#ar-layout .chip', box).forEach(b => b.onclick = () => {
      const L = b.dataset.layout;
      if (L === 'custom' && d.layout !== 'custom') d.pos = placed();
      d.layout = L; re();
    });
    const add = $('#ar-ex-add', box);
    if (add) add.onclick = async () => {
      const k = await K.pickSymbol({ id: 'arms-more', title: 'Add a symbol' }); if (!k) return;
      const n = (d.extras || []).length, metal = T[d.t1] && T[d.t1][3] === 'metal';
      d.extras = [...(d.extras || []), { k, t: metal ? 'sable' : 'or', x: 100 + ((n % 3) - 1) * 30, y: 118 + (Math.floor(n / 3) % 3) * 26 - 26, s: .45, r: 0 }];
      sel = 'e' + (d.extras.length - 1);
      paint(); extrasList(); ctx.changed();
    };
    const size = $('#ar-size', box); if (size) size.oninput = () => { d.size = +size.value / 100; $('#ar-size-v', box).textContent = size.value + '%'; paint(); ctx.changed(); };
    const rot = $('#ar-rot', box); if (rot) rot.oninput = () => { d.rot = +rot.value; $('#ar-rot-v', box).textContent = deg(d.rot); paint(); ctx.changed(); };
    $('#ar-motto', box).oninput = e => { const had = !!(d.motto || '').trim(); d.motto = e.target.value; paint(); ctx.changed(); if (had !== !!d.motto.trim()) { const pos = e.target.selectionStart; drawAll(); const m = $('#ar-motto', box); m.focus(); m.setSelectionRange(pos, pos); } };
    const mon = $('#ar-mon', box); if (mon) mon.onchange = e => { d.mottoOn = e.target.checked; drawAll(); ctx.changed(); };
    $$('.ar-rib', box).forEach(b => b.onclick = () => { d.ribbon = b.dataset.rib; $$('.ar-rib', box).forEach(x => x.classList.toggle('on', x === b)); paint(); ctx.changed(); });
    if ($('#ar-rcol', box)) K.colours($('#ar-rcol', box), { label: 'Ribbon colour', value: ribbonCol(d), picture: pic, onPick: h => { d.ribbonHex = h; paint(); ctx.changed(); } });
    if ($('#ar-rink', box)) K.colours($('#ar-rink', box), { label: 'Letters', value: d.mottoInk || '', reset: 'Automatic', picture: pic, onPick: h => { d.mottoInk = h; paint(); ctx.changed(); } });
    extrasList();
  }
  // where the main symbols are drawn right now (after they're kept inside the shield)
  const placed = () => [...$('#ar-shield', box).querySelectorAll('[data-chi]')].map(g => [+g.dataset.x, +g.dataset.y]);
  // what can be selected on the shield: each main symbol (size and turn are shared by all of them) and each extra
  function items() {
    const out = [], sz = +d.size || 1, sh = box && $('#ar-shield', box);
    if (sh && d.charge !== 'none') sh.querySelectorAll('[data-chi]').forEach(g => out.push({ id: 'c' + g.dataset.chi, x: +g.dataset.x, y: +g.dataset.y, s: sz, r: R0 * (+g.dataset.s) / sz, rot: +d.rot || 0, min: 0.4, max: 1.8 }));
    (d.extras || []).forEach((e, i) => { if (SYM && SYM.get(e.k)) out.push({ id: 'e' + i, x: +e.x, y: +e.y, s: +e.s, r: 44, rot: +e.r || 0, min: 0.15, max: 1.2 }); });
    return out;
  }
  // a handle was dragged: the shield and the sliders follow
  function change(id, v, done) {
    if (id[0] === 'c') {
      const i = +id.slice(1), was = placed()[i] || [v.x, v.y];
      if (Math.abs(v.x - was[0]) > 0.05 || Math.abs(v.y - was[1]) > 0.05) {
        if (d.layout !== 'custom') { d.pos = placed(); d.layout = 'custom'; $$('#ar-layout .chip', box).forEach(b => b.classList.toggle('on', b.dataset.layout === 'custom')); }
        d.pos = Array.isArray(d.pos) ? d.pos : placed(); d.pos[i] = [v.x, v.y];
      }
      d.size = v.s; d.rot = v.rot;
      const s = $('#ar-size', box), r = $('#ar-rot', box);
      if (s) { s.value = Math.round(d.size * 100); $('#ar-size-v', box).textContent = s.value + '%'; }
      if (r) { r.value = Math.round(d.rot); $('#ar-rot-v', box).textContent = `${Math.round(d.rot)}°`; }
    } else {
      const e = d.extras[+id.slice(1)]; if (!e) return;
      e.x = v.x; e.y = v.y; e.s = v.s; e.r = v.rot;
      const row = box.querySelector(`#ar-extras .kit-item[data-i="${id.slice(1)}"]`);
      if (row) { const s = row.querySelector('[data-ex-s]'), r = row.querySelector('[data-ex-r]'); if (s) { s.value = Math.round(e.s * 100); row.querySelector('[data-ex-sv]').textContent = s.value + '%'; } if (r) { r.value = Math.round(e.r); row.querySelector('[data-ex-rv]').textContent = `${Math.round(e.r)}°`; } }
    }
    paint();
    if (done) ctx.changed();
  }
  // the extra symbols: a row each; the selected one opens with its colour, size and turn
  function extrasList() {
    const el = box && $('#ar-extras', box); if (!el) { if (hd) hd.refresh(); return; }
    const list = d.extras || [];
    el.innerHTML = list.map((e, i) => { const D = SYM.get(e.k); if (!D) return ''; const on = sel === 'e' + i;
      return `<div class="kit-item ${on ? 'on' : ''}" data-i="${i}"><div class="kit-item-head" data-pick><span class="kit-item-ic">${SYM.icon(e.k)}</span><span class="kit-item-n">${esc(D.label)}</span><span class="kit-dot" style="--c:${col(e.t)}" title="${esc(tn(e.t))}"></span><button type="button" class="icon-btn small" data-ex-del title="Remove" aria-label="Remove">×</button></div>
        ${on ? `<div class="kit-item-body"><div class="ar-sw" data-ex-t></div>
          <label class="kit-sl">Size <small data-ex-sv>${Math.round(e.s * 100)}%</small><input type="range" data-ex-s min="15" max="120" step="1" value="${Math.round(e.s * 100)}"></label>
          <label class="kit-sl">Turn <small data-ex-rv>${Math.round(+e.r || 0)}°</small><input type="range" data-ex-r min="-180" max="180" step="5" value="${Math.round(+e.r || 0)}"></label></div>` : ''}</div>`; }).join('')
      + `<p class="bm-help">${list.length ? 'Tap one here or on the shield to change it. Drag it on the shield to move it; the corner handle sizes it and the round one turns it.' : 'Add as many as you like, each in its own colour and size: a crow on a tower, a numeral, a second beast.'}</p>`;
    $$('.kit-item', el).forEach(row => {
      const i = +row.dataset.i, e = () => d.extras[i];
      row.querySelector('[data-pick]').onclick = ev => { if (ev.target.closest('[data-ex-del]')) return; sel = sel === 'e' + i ? null : 'e' + i; extrasList(); };
      row.querySelector('[data-ex-del]').onclick = () => { d.extras.splice(i, 1); sel = null; paint(); extrasList(); ctx.changed(); };
      const t = row.querySelector('[data-ex-t]'); if (t) mountTinct(t, () => e().t, v => { e().t = v; paint(); ctx.changed(); row.querySelector('.kit-dot').style.setProperty('--c', col(v)); });
      const s = row.querySelector('[data-ex-s]'); if (s) s.oninput = () => { e().s = +s.value / 100; row.querySelector('[data-ex-sv]').textContent = s.value + '%'; paint(); ctx.changed(); };
      const r = row.querySelector('[data-ex-r]'); if (r) r.oninput = () => { e().r = +r.value; row.querySelector('[data-ex-rv]').textContent = r.value + '°'; paint(); ctx.changed(); };
    });
    if (hd) hd.refresh();
  }
  function paint() {
    const sh = $('#ar-shield', box);
    const ov = sh.querySelector('.kit-ov');
    sh.innerHTML = armsSVG(d, refs);
    if (ov) sh.appendChild(ov);
    if (sel && !items().some(i => i.id === sel)) sel = null;
    if (hd) hd.refresh();
    $('#ar-blazon', box).innerHTML = `<small>The herald’s description</small><p>${esc(blazon(d, refs))}</p>`;
    const notes = tinctureNotes(d);
    $('#ar-warn', box).innerHTML = notes.length ? `<b>Heralds’ rule of colour</b><p>Metal (gold, silver) goes on colour, and colour on metal, so arms can be read from far away. Here ${esc(notes.join('; '))}. It’s your world, so break the rule if you mean to: real arms sometimes do.</p>` : '';
  }
  async function refsFor(item) { const r = item.data && item.data.ref; return { item: r && r.id ? await B.get(r.id) : null }; }
  B.editors.arms = {
    blank, open,
    thumb: item => B.svgURL(armsSVG(Object.assign(blank(), item.data || {}), it === item ? refs : { item: null }, 200)),
    picture: async item => { const dd = Object.assign(blank(), item.data || {}), svg = armsSVG(dd, await refsFor(item), 1400); const H = dd.mottoOn && (dd.motto || '').trim() ? 290 : 244; return B.svgCanvas(svg, Math.round(1400 * 200 / H), 1400); },
    toBook: async item => {
      const dd = Object.assign(blank(), item.data || {}), r = await refsFor(item), H = dd.mottoOn && (dd.motto || '').trim() ? 290 : 244;
      const c = await B.svgCanvas(armsSVG(dd, r, 700), Math.round(700 * 200 / H), 700);
      return `<p><img src="${c.toDataURL('image/png')}" alt="Arms of ${esc(item.title)}" width="280"></p><p><i>${esc(blazon(dd, r))}</i></p>${(dd.motto || '').trim() ? `<p>Motto: “${esc(dd.motto)}”</p>` : ''}`;
    },
    close: () => { if (hd) { hd.destroy(); hd = null; } it = null; box = null; d = null; sel = null; }
  };
  B.arms = { armsSVG, blazon, blank, randomArms };
})();
