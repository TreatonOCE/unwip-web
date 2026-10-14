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
  const blank = () => ({ shape: 'heater', div: 'plain', t1: 'azure', t2: 'or', ord: 'none', t3: 'or', charge: 'mullet', count: 3, t4: 'argent', ref: null, motto: '', mottoOn: true, mottoCol: 'argent' });

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
  function spots(d) {
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
      const def = CH[d.charge]; if (!def) return '';
      inner = def[3].map(p => `<path d="${p}" fill="${c}" ${def[4] ? 'fill-rule="evenodd"' : ''} stroke="${line}" stroke-width="2.2" stroke-linejoin="round"/>`).join('') + (def[5] ? `<path d="${def[5]}" fill="${line}"/>` : '');
    }
    return (spots(d) || []).map(([x, y, s]) => `<g transform="translate(${x} ${y}) scale(${s})">${inner}</g>`).join('');
  }
  function armsSVG(d, refs, size) {
    const sh = (SHAPES[d.shape] || SHAPES.heater)[1];
    const id = 'c' + Math.random().toString(36).slice(2, 8);
    const bord = d.ord === 'bordure' ? `<path d="${sh}" fill="none" stroke="${col(d.t3)}" stroke-width="28" clip-path="url(#${id})"/>` : '';
    const motto = d.mottoOn && (d.motto || '').trim();
    const mc = col(d.mottoCol || 'argent'), up = (motto || '').toUpperCase();
    // capitals in Georgia are about 0.72em wide (plus 1 of letter spacing); long mottos go on two lines
    let lines = [up];
    if (up.length > 22) { const mid = up.length / 2; let cut = -1; for (let i = 0; i < up.length; i++) if (up[i] === ' ' && (cut < 0 || Math.abs(i - mid) < Math.abs(cut - mid))) cut = i; lines = cut > 0 ? [up.slice(0, cut), up.slice(cut + 1)] : [up]; }
    const longest = Math.max(...lines.map(l => l.length), 1), fs = Math.max(6, Math.min(15, (148 / longest - 1) / 0.72, lines.length > 1 ? 11 : 15));
    const fits = l => l.length * (fs * 0.72 + 1) > 150 ? ` textLength="150" lengthAdjust="spacingAndGlyphs"` : '';
    const ribbon = motto ? `<g><path d="M22 254H4L13 266L4 278H22Z" fill="${mc}" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/><path d="M178 254H196L187 266L196 278H178Z" fill="${mc}" stroke="#1d1d1f" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M18 250Q100 240 182 250V276Q100 266 18 276Z" fill="${mc}" stroke="#1d1d1f" stroke-width="1.8" stroke-linejoin="round"/>
        ${lines.map((l, i) => `<text x="100" y="${(lines.length > 1 ? 259 + i * (fs + 1.5) : 264) + fs * 0.35}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${fs.toFixed(1)}" letter-spacing="1"${fits(l)} fill="${d.mottoCol === 'sable' || d.mottoCol === 'gules' || d.mottoCol === 'azure' || d.mottoCol === 'vert' || d.mottoCol === 'purpure' || d.mottoCol === 'sanguine' ? '#f2f1ec' : '#1d1d1f'}">${esc(l)}</text>`).join('')}</g>` : '';
    const H = motto ? 290 : 244;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 ${H}" width="${size ? size * 200 / H : '100%'}" height="${size || '100%'}"><defs><clipPath id="${id}"><path d="${sh}"/></clipPath></defs>
      <g clip-path="url(#${id})">${field(d)}${ordinary(d)}</g>${bord}${chargeG(d, refs)}
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
      } else { const def = CH[d.charge]; if (def) { const word = n === 1 ? def[1] : def[2]; ch = `${n === 1 ? (/^[aeiou]/i.test(word) ? 'an' : 'a') : num} ${word} ${tn(d.t4)}`; } }
    }
    const o = d.ord !== 'none' && ORD[d.ord] ? `${ORD[d.ord][1]} ${tn(d.t3)}` : '';
    let s = f;
    if (o && d.ord !== 'chief' && d.ord !== 'bordure') s += `, ${o}${!ch ? '' : n === 1 ? (d.ord === 'chevron' ? `, in base ${ch}` : ` charged with ${ch}`) : ` between ${ch}`}`;
    else if (ch) s += `, ${ch}`;
    if (o && d.ord === 'chief') s += `, ${o}`;
    if (o && d.ord === 'bordure') s += `, ${o}`;
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
  let it = null, ctx = null, box = null, d = null, refs = { item: null }, runes = [], sigils = [];
  async function loadRef() { refs.item = d.ref && d.ref.id ? (runes.concat(sigils).find(x => x.id === d.ref.id) || await B.get(d.ref.id)) : null; }
  async function open(item, el, c) {
    it = item; ctx = c; box = el; d = it.data = Object.assign(blank(), it.data || {});
    [runes, sigils] = await Promise.all([B.all('runes'), B.all('sigil')]);
    await loadRef();
    c.extra.innerHTML = '<button class="btn small" id="ar-rand" title="Roll random arms that follow the heralds’ rules (dice, not AI)">🎲 Random</button>';
    $('#ar-rand').onclick = () => { const keepMotto = { motto: d.motto, mottoOn: d.mottoOn, mottoCol: d.mottoCol }; Object.assign(d, randomArms(), keepMotto); d.ref = null; refs.item = null; drawAll(); ctx.changed(); };
    drawAll();
  }
  const sw = (key, label) => `<div class="ar-sw" data-key="${key}" aria-label="${label}">${Object.entries(T).map(([k, v]) => `<button type="button" class="ar-t ${d[key] === k ? 'on' : ''}" data-t="${k}" style="--c:${v[2]}" title="${v[0]} (${v[1]})"></button>`).join('')}<span class="ar-tn">${T[d[key]] ? `${T[d[key]][0]} · ${T[d[key]][1]}` : ''}</span></div>`;
  function drawAll() {
    const side0 = box.querySelector('.ar-side'), keepSide = side0 ? side0.scrollTop : 0, keepMain = box.scrollTop;
    const charges = [['none', 'None'], ...Object.entries(CH).map(([k, v]) => [k, v[0]])];
    const runeOpts = runes.flatMap(r => ((r.data && r.data.glyphs) || []).filter(g => (g.strokes || []).length).map(g => ({ r, g })));
    box.innerHTML = `<div class="ar-wrap">
      <section class="ar-show"><div class="ar-shield" id="ar-shield"></div><div class="ar-blazon" id="ar-blazon"></div><div class="ar-warn" id="ar-warn"></div></section>
      <aside class="ar-side">
        <h3>Shield</h3><div class="ar-shapes">${Object.entries(SHAPES).map(([k, v]) => `<button type="button" class="ar-shape ${d.shape === k ? 'on' : ''}" data-shape="${k}" title="${v[0]}"><svg viewBox="0 0 200 240"><path d="${v[1]}"/></svg></button>`).join('')}</div>
        <h3>Field</h3><div class="field"><select id="ar-div">${Object.entries(DIV).map(([k, v]) => `<option value="${k}" ${d.div === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        ${sw('t1', 'First colour')}${d.div !== 'plain' ? sw('t2', 'Second colour') : ''}
        <h3>Band <small>(ordinary)</small></h3><div class="field"><select id="ar-ord">${Object.entries(ORD).map(([k, v]) => `<option value="${k}" ${d.ord === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select></div>
        ${d.ord !== 'none' ? sw('t3', 'Band colour') : ''}
        <h3>Symbols <small>(charges)</small></h3>
        <div class="ar-charges">${charges.map(([k, l]) => `<button type="button" class="ar-ch ${d.charge === k ? 'on' : ''}" data-ch="${k}" title="${l}">${k === 'none' ? '<span>—</span>' : `<svg viewBox="-50 -50 100 100">${CH[k][3].map(p => `<path d="${p}" ${CH[k][4] ? 'fill-rule="evenodd"' : ''}/>`).join('')}</svg>`}</button>`).join('')}
          ${runeOpts.length ? '<span class="ar-chl">Your runes</span>' : ''}${runeOpts.slice(0, 60).map(({ r, g }) => { const A = Object.assign(B.runes.blank(), r.data); const gw = B.runes.glyphW(A), gh = B.runes.glyphH(A); return `<button type="button" class="ar-ch rune ${d.charge === 'rune' && d.ref && d.ref.glyph === g.id ? 'on' : ''}" data-rune="${r.id}|${g.id}" title="${esc(r.title)}: ${esc(g.name || (g.key || '').toUpperCase())}"><svg viewBox="${-8} ${-8} ${gw + 16} ${gh + 16}">${B.runes.glyphG({ ...A, width: Math.max(A.width, 4) }, g, 'currentColor')}</svg></button>`; }).join('')}
          ${sigils.length ? '<span class="ar-chl">Your sigils</span>' : ''}${sigils.map(s => `<button type="button" class="ar-ch sigil ${d.charge === 'sigil' && d.ref && d.ref.id === s.id ? 'on' : ''}" data-sigil="${s.id}" title="Sigil: ${esc(s.title)}"><svg viewBox="-104 -104 208 208">${B.sigils.sigilG(Object.assign(B.sigils.blank(), s.data || {}), null, 'currentColor')}</svg></button>`).join('')}</div>
        ${runes.length || sigils.length ? '' : '<p class="bm-help">Runes and sigils you make in Build show up here too.</p>'}
        ${d.charge !== 'none' ? `<div class="field"><label>How many</label><div class="chip-row" id="ar-count">${[1, 2, 3, 4].map(n => `<button type="button" class="chip ${d.count === n ? 'on' : ''}" data-n="${n}">${n}</button>`).join('')}</div></div>${sw('t4', 'Symbol colour')}` : ''}
        <h3>Motto</h3><div class="field"><input id="ar-motto" value="${esc(d.motto || '')}" placeholder="e.g. We do not kneel"></div>
        ${(d.motto || '').trim() ? `<label class="bd-check"><input type="checkbox" id="ar-mon" ${d.mottoOn ? 'checked' : ''}> Show the motto on a ribbon</label>${sw('mottoCol', 'Ribbon colour')}` : ''}
      </aside></div>`;
    paint();
    box.querySelector('.ar-side').scrollTop = keepSide; box.scrollTop = keepMain;
    const re = () => { drawAll(); ctx.changed(); };
    $$('.ar-shape', box).forEach(b => b.onclick = () => { d.shape = b.dataset.shape; re(); });
    $('#ar-div', box).onchange = e => { d.div = e.target.value; re(); };
    $('#ar-ord', box).onchange = e => { d.ord = e.target.value; re(); };
    $$('.ar-sw', box).forEach(s => $$('.ar-t', s).forEach(b => b.onclick = () => { d[s.dataset.key] = b.dataset.t; re(); }));
    $$('.ar-ch', box).forEach(b => b.onclick = async () => {
      if (b.dataset.rune) { const [rid, gid] = b.dataset.rune.split('|'); d.charge = 'rune'; d.ref = { id: rid, glyph: gid }; }
      else if (b.dataset.sigil) { d.charge = 'sigil'; d.ref = { id: b.dataset.sigil }; }
      else { d.charge = b.dataset.ch; d.ref = null; }
      await loadRef(); re();
    });
    $$('#ar-count .chip', box).forEach(b => b.onclick = () => { d.count = +b.dataset.n; re(); });
    $('#ar-motto', box).oninput = e => { const had = !!(d.motto || '').trim(); d.motto = e.target.value; paint(); ctx.changed(); if (had !== !!d.motto.trim()) { const pos = e.target.selectionStart; drawAll(); const m = $('#ar-motto', box); m.focus(); m.setSelectionRange(pos, pos); } };
    const mon = $('#ar-mon', box); if (mon) mon.onchange = e => { d.mottoOn = e.target.checked; paint(); ctx.changed(); };
  }
  function paint() {
    $('#ar-shield', box).innerHTML = armsSVG(d, refs);
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
    close: () => { it = null; box = null; d = null; }
  };
  B.arms = { armsSVG, blazon, blank, randomArms };
})();
