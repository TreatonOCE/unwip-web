// Unwip - book typesetting for print (paperback PDF).
// Lays the book out page by page the way a printed novel is set: mirrored margins with a gutter
// sized for the page count, chapters opening on a right-hand page, running heads (author left,
// title right), page numbers, drop caps, small-caps opening lines, scene-break ornaments, and
// front and back matter (half title, title page, copyright, dedication, epigraph, contents with
// page numbers, acknowledgements, about the author, also by).
// The same pages are shown in the preview and printed to PDF, so what you see is what prints.
window.UnwipTypeset = (function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const PX = 96;

  // ------------------------------------------------------------------ fonts that ship with Unwip (SIL Open Font Licence)
  const FONTS = [
    ['EB Garamond', 'EBGaramond'], ['Bookhaven', 'Bookhaven'], ['Crimson Pro', 'CrimsonPro'], ['Larkspur', 'Larkspur'],
    ['Cinzel', 'Cinzel', true], ['Oswald', 'Oswald', true]
  ];
  // static Regular and Bold cuts (not variable fonts), so PDFs embed them as normal TrueType fonts printers accept
  function fontFaceCSS(base) {
    const face = (fam, file, style, w) => `@font-face{font-family:"${fam}";src:url("${base}${file}.woff") format("woff");font-weight:${w};font-style:${style};font-display:block}`;
    return FONTS.map(([fam, file, noItalic]) => [
      face(fam, file + '-Regular', 'normal', '100 599'), face(fam, file + '-Bold', 'normal', '600 900'),
      ...(noItalic ? [] : [face(fam, file + '-Italic-Regular', 'italic', '100 599'), face(fam, file + '-Italic-Bold', 'italic', '600 900')])
    ].join('\n')).join('\n');
  }
  const fontBase = () => new URL('fonts/', location.href).href;

  // ------------------------------------------------------------------ book designs
  // number: words | digits | roman | none ; label: text before the number ; numCase: how the number line is set
  const THEMES = {
    classic: { name: 'Classic', blurb: 'Garamond, “Chapter One” in small capitals, a fleuron and a drop cap. Fits almost anything.',
      body: 'EB Garamond', head: 'EB Garamond', size: 11.5, leading: 1.38, number: 'words', label: 'Chapter', numCase: 'smallcaps', numSize: 1.05,
      titleSize: 1.75, titleStyle: 'italic', titleCase: 'normal', orn: '❦', drop: true, lead: true, scene: '❦', head1: 'smallcaps', folio: 'bottom', sink: 0.3, align: 'center', oldstyle: true },
    fantasy: { name: 'Fantasy', blurb: 'Inscriptional capitals for titles, a big number and an ornament. Epic and historical fiction.',
      body: 'EB Garamond', head: 'Cinzel', size: 11.5, leading: 1.38, number: 'words', label: 'Chapter', numCase: 'upper', numSize: 0.95,
      titleSize: 1.85, titleStyle: 'normal', titleCase: 'normal', orn: '⁂', drop: true, lead: true, scene: '⁂', head1: 'cinzel', folio: 'bottom', sink: 0.3, align: 'center', oldstyle: true },
    literary: { name: 'Literary', blurb: 'Baskerville, quiet small-capital titles, no numbers. Understated and elegant.',
      body: 'Bookhaven', head: 'Bookhaven', size: 10.5, leading: 1.45, number: 'none', label: '', numCase: 'smallcaps', numSize: 1,
      titleSize: 1.25, titleStyle: 'smallcaps', titleCase: 'normal', orn: '', drop: false, lead: true, scene: '·  ·  ·', head1: 'smallcaps', folio: 'bottom', sink: 0.33, align: 'center', oldstyle: false },
    romance: { name: 'Romance', blurb: 'Larkspur with a flowing italic title, a lowercase chapter line and a drop cap.',
      body: 'Larkspur', head: 'Larkspur', size: 11, leading: 1.4, number: 'words', label: 'chapter', numCase: 'lower', numSize: 1.05,
      titleSize: 1.8, titleStyle: 'italic', titleCase: 'normal', orn: '❧', drop: true, lead: false, scene: '❧', head1: 'italic', folio: 'bottom', sink: 0.3, align: 'center', oldstyle: false },
    thriller: { name: 'Thriller', blurb: 'Tall condensed capitals, a big chapter number, no drop cap. Crime, thriller, sci-fi.',
      body: 'Crimson Pro', head: 'Oswald', size: 11.5, leading: 1.35, number: 'digits', label: '', numCase: 'normal', numSize: 3.6,
      titleSize: 1.2, titleStyle: 'normal', titleCase: 'upper', orn: '', drop: false, lead: false, scene: '■  ■  ■', head1: 'upper', folio: 'top', sink: 0.2, align: 'left', oldstyle: false },
    modern: { name: 'Modern', blurb: 'Crimson Pro body, left-aligned titles with a numeral above, clean and contemporary.',
      body: 'Crimson Pro', head: 'Crimson Pro', size: 12, leading: 1.36, number: 'digits', label: '', numCase: 'normal', numSize: 2.2,
      titleSize: 1.6, titleStyle: 'normal', titleCase: 'normal', orn: '', drop: false, lead: true, scene: '—', head1: 'smallcaps', folio: 'top', sink: 0.22, align: 'left', oldstyle: true }
  };
  const TRIMS = { '5 × 8 in': [5, 8], '5.25 × 8 in': [5.25, 8], '5.5 × 8.5 in': [5.5, 8.5], '6 × 9 in': [6, 9], '6.14 × 9.21 in (Royal)': [6.14, 9.21], 'A5': [5.83, 8.27], 'B-format (5.06 × 7.81 in)': [5.06, 7.81] };
  const SCENES = ['theme', '* * *', '#', '❦', '⁂', '·  ·  ·', '~', '—', 'blank line'];
  const DEFAULT = {
    theme: 'classic', trim: '5.5 × 8.5 in', largePrint: false, recto: true, drop: 'theme', lead: 'theme', scene: 'theme',
    headers: true, headerRight: 'title', pageNumbers: true, justify: true, hyphenate: true, size: 0, leading: 0, bodyFont: '', headFont: '',
    front: { halfTitle: true, titlePage: true, copyright: true, dedication: true, epigraph: true, toc: true },
    back: { acknowledgements: true, about: true, alsoBy: true }
  };
  function design(project) {
    const d = project.design || {};
    return { ...DEFAULT, ...d, front: { ...DEFAULT.front, ...(d.front || {}) }, back: { ...DEFAULT.back, ...(d.back || {}) } };
  }
  function resolved(d) {
    const t = { ...THEMES[d.theme] || THEMES.classic };
    if (d.bodyFont) t.body = window.FolioFonts ? window.FolioFonts.alias(d.bodyFont) : d.bodyFont;
    if (d.headFont) t.head = window.FolioFonts ? window.FolioFonts.alias(d.headFont) : d.headFont;
    if (d.drop !== 'theme') t.drop = !!d.drop;
    if (d.lead !== 'theme') t.lead = !!d.lead;
    if (d.scene !== 'theme') t.scene = d.scene;
    t.size = d.largePrint ? 16 : (d.size || t.size);
    t.leading = d.largePrint ? 1.4 : (d.leading || t.leading);
    return t;
  }
  // gutter (inside margin) grows with the page count, as print-on-demand printers ask (KDP's table)
  const gutterFor = pages => pages <= 150 ? 0.375 : pages <= 300 ? 0.5 : pages <= 500 ? 0.625 : pages <= 700 ? 0.75 : 0.875;
  function geometry(d, pages) {
    const [w, h] = TRIMS[d.trim] || TRIMS['5.5 × 8.5 in'];
    const big = w >= 6;
    const g = { w, h, top: big ? 0.8 : 0.72, bottom: big ? 0.8 : 0.72, outside: big ? 0.6 : 0.5, gutter: gutterFor(pages) };
    g.P = Math.round(w * PX); g.PH = Math.round(h * PX);
    g.W = Math.round((w - g.gutter - g.outside) * PX); g.H = Math.round((h - g.top - g.bottom) * PX);
    g.G = 40;
    return g;
  }

  // ------------------------------------------------------------------ numbers
  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words(n) {
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    return ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + words(n % 100) : '');
  }
  function roman(n) { const r = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]; let s = ''; for (const [v, l] of r) while (n >= v) { s += l; n -= v; } return s; }
  function numberText(n, t) { return t.number === 'words' ? words(n) : t.number === 'roman' ? roman(n) : t.number === 'digits' ? String(n) : ''; }

  // ------------------------------------------------------------------ manuscript blocks -> chapters
  const UNNUMBERED = /^\s*(prologue|epilogue|interlude|introduction|foreword|preface|afterword|coda|acknowledge?ments?|author[’']?s note|a note|about the author|glossary|appendix|dramatis personae)\b/i;
  const CH_TITLE = /^\s*(chapter|ch\.)\s+([\w-]+)\s*(?:[:.\-–—]\s*|\s+)?(.*)$/i;
  const SCENE = /^\s*((\*|#|~|•|·|⁂|❦)\s*){1,5}\s*$/;
  const textOf = b => b.runs.map(r => r.br ? ' ' : (r.text || '')).join('').trim();
  function chaptersFrom(blocks) {
    const out = []; let cur = null;
    for (const b of blocks) {
      if (b.titleDoc) { cur = { kind: 'skip', blocks: [] }; out.push(cur); continue; }
      if (b.tag === 'h1' || b.newPage) {
        const title = b.tag === 'h1' ? textOf(b) : '';
        if (b.part) { out.push({ kind: 'part', title }); cur = null; continue; }
        cur = { kind: 'chapter', title, hidden: b.tag !== 'h1', tocTitle: title || b.chapterTitle || '', blocks: b.tag === 'h1' ? [] : [b] };
        out.push(cur); continue;
      }
      if (!cur) { cur = { kind: 'chapter', title: '', tocTitle: '', blocks: [], untitled: true }; out.push(cur); }
      cur.blocks.push(b);
    }
    // numbering
    let n = 0;
    for (const c of out) {
      if (c.kind !== 'chapter') continue;
      if (UNNUMBERED.test(c.title)) { c.numbered = false; continue; }
      c.raw = c.title;
      // a title that starts with its own number ("116 - The market", "12. Home") has the number taken off, since the
      // book numbers its chapters itself; "104 - Interlude: …" then counts as an interlude
      const bare = /^\s*\d{1,3}\s*[-–—.:)]\s+(\S.*)$/.exec(c.title);
      if (bare) { c.title = bare[1].trim(); if (UNNUMBERED.test(c.title)) { c.numbered = false; continue; } }
      const m = CH_TITLE.exec(c.title);
      if (m) { c.title = m[3].trim(); }
      else if (/^\s*(\d+|[ivxlc]+)\s*\.?\s*$/i.test(c.title)) c.title = '';
      c.numbered = true; c.n = ++n;
    }
    return out.filter(c => c.kind !== 'skip' && (c.kind === 'part' || c.blocks.some(b => textOf(b) || b.runs.some(r => r.img)) || c.title));
  }

  // ------------------------------------------------------------------ HTML for the text
  function runsHTML(runs, notes) {
    let h = '';
    for (const r of runs) {
      if (r.br) { h += '<br>'; continue; }
      if (r.img) { h += `<img src="${r.img}" style="width:${r.pct || 60}%" alt="">`; continue; }
      if (r.fn !== undefined) { notes.push(r.fn); h += `<sup class="fnm">${notes.length}</sup>`; continue; }
      let t = esc(r.text || '');
      if (!t) continue;
      if (r.sup) t = `<sup>${t}</sup>`; if (r.sub) t = `<sub>${t}</sub>`;
      if (r.strike) t = `<s>${t}</s>`; if (r.underline) t = `<u>${t}</u>`;
      if (r.italic) t = `<i>${t}</i>`; if (r.bold) t = `<b>${t}</b>`;
      h += t;
    }
    return h;
  }
  function bodyHTML(blocks, t) {
    const notes = [];
    let h = '', fresh = true;
    for (const b of blocks) {
      const tx = textOf(b), img = b.runs.some(r => r.img);
      if (!tx && !img) continue;                                   // blank lines aren't used in typeset books
      if (SCENE.test(tx) && tx.length < 20) {
        h += t.scene === 'blank line' ? '<p class="scene blank">&nbsp;</p>' : `<p class="scene">${esc(t.scene)}</p>`;
        fresh = true; continue;
      }
      const inner = runsHTML(b.runs, notes);
      if (img && !tx) { h += `<p class="pic">${inner}</p>`; fresh = true; continue; }
      if (/^h[2-3]$/.test(b.tag)) { h += `<h3 class="sub">${inner}</h3>`; fresh = true; continue; }
      if (b.tag === 'blockquote') { h += `<blockquote>${inner}</blockquote>`; fresh = true; continue; }
      const cls = [fresh ? 'first' : '', b.align === 'center' ? 'c' : b.align === 'right' ? 'rt' : ''].filter(Boolean).join(' ');
      h += `<p${cls ? ` class="${cls}"` : ''}>${inner}</p>`;
      fresh = false;
    }
    if (notes.length) h += `<div class="notes"><p class="nh">Notes</p>${notes.map((n, i) => `<p class="nt"><sup>${i + 1}</sup> ${esc(n)}</p>`).join('')}</div>`;
    return h;
  }
  function openerHTML(c, t, g) {
    const sink = Math.round(g.H * t.sink);
    const num = c.numbered && t.number !== 'none' ? `${t.label ? t.label + ' ' : ''}${numberText(c.n, t)}` : '';
    // a design without chapter numbers still needs something at the top: fall back to the heading as written
    const title = c.hidden ? '' : (c.title || (!num ? c.raw || '' : ''));
    return `<div class="opener" style="padding-top:${sink}px">${num ? `<div class="num">${esc(num)}</div>` : ''}${t.orn && (num || title) ? `<div class="orn">${esc(t.orn)}</div>` : ''}${title ? `<div class="ttl">${esc(title)}</div>` : ''}</div>`;
  }

  // ------------------------------------------------------------------ the stylesheet
  function css(t, g, d) {
    const fam = f => `"${f}", "EB Garamond", Georgia, serif`;
    const numCase = { smallcaps: 'font-variant-caps:all-small-caps;letter-spacing:.14em;', upper: 'text-transform:uppercase;letter-spacing:.12em;', lower: 'text-transform:lowercase;letter-spacing:.06em;font-style:italic;', normal: '' }[t.numCase] || '';
    const titleStyle = { italic: 'font-style:italic;', smallcaps: 'font-variant-caps:all-small-caps;letter-spacing:.12em;', normal: '' }[t.titleStyle] || '';
    const head1 = { smallcaps: 'font-variant-caps:all-small-caps;letter-spacing:.14em;', upper: 'text-transform:uppercase;letter-spacing:.14em;font-size:.82em;', italic: 'font-style:italic;', cinzel: `font-family:${fam('Cinzel')};font-size:.8em;letter-spacing:.1em;` }[t.head1] || '';
    return `
.tsx-page{position:relative;width:${g.P}px;height:${g.PH}px;background:#fffefb;color:#141414;overflow:hidden;box-sizing:border-box}
.tsx-area{position:absolute;overflow:hidden}
.tsx-flow{width:${g.W}px;height:${g.H}px;column-width:${g.W}px;column-gap:${g.G}px;column-fill:auto;font-family:${fam(t.body)};font-size:${t.size}pt;line-height:${t.leading};
  text-align:${d.justify ? 'justify' : 'left'};hyphens:${d.hyphenate ? 'auto' : 'manual'};-webkit-hyphens:${d.hyphenate ? 'auto' : 'manual'};widows:2;orphans:2;
  font-variant-numeric:${t.oldstyle ? 'oldstyle-nums' : 'normal'};font-kerning:normal;text-rendering:optimizeLegibility;color:#141414}
.tsx-flow p{margin:0;text-indent:1.4em}
.tsx-flow p.first{text-indent:0}
.tsx-flow p.c{text-align:center;text-indent:0}.tsx-flow p.rt{text-align:right;text-indent:0}
.tsx-flow p.scene{text-align:center;text-indent:0;margin:.55em 0;letter-spacing:.2em;font-family:${fam(t.body)}, "Segoe UI Symbol", "DejaVu Sans", sans-serif;break-after:avoid}
.tsx-flow p.scene.blank{margin:0}
.tsx-flow p.pic{text-align:center;text-indent:0;margin:.6em 0;break-inside:avoid}.tsx-flow img{max-width:100%;height:auto}
.tsx-flow blockquote{margin:.5em 1.4em;text-align:${d.justify ? 'justify' : 'left'}}
.tsx-flow h3.sub{font:600 1em/1.3 ${fam(t.head)};text-align:center;margin:1em 0 .5em;break-after:avoid}
.tsx-flow sup{font-size:.62em;line-height:0}
.tsx-flow .notes{margin-top:1.4em;font-size:.82em;line-height:1.35;break-inside:auto}.tsx-flow .notes p{text-indent:0}.tsx-flow .notes .nh{font-style:italic;margin-bottom:.3em}
.tsx-flow .opener{text-align:${t.align};break-inside:avoid;margin-bottom:${(t.size * 2.4).toFixed(1)}pt;font-family:${fam(t.head)}}
.tsx-flow .opener .num{font-size:${t.numSize}em;line-height:1.1;${numCase}${t.number === 'digits' && t.numSize > 2 ? 'font-weight:500;' : ''}}
.tsx-flow .opener .orn{font-family:"Segoe UI Symbol","DejaVu Sans",${fam(t.body)};font-size:1.2em;margin:.35em 0;line-height:1}
.tsx-flow .opener .ttl{font-size:${t.titleSize}em;line-height:1.15;margin-top:.25em;text-wrap:balance;${titleStyle}${t.titleCase === 'upper' ? 'text-transform:uppercase;letter-spacing:.06em;' : ''}${t.head === 'Oswald' ? 'font-weight:500;' : ''}}
.tsx-flow .opener + p::first-line{${t.lead ? 'font-variant-caps:small-caps;letter-spacing:.03em;' : ''}}
${t.drop ? `.tsx-flow .opener + p::first-letter{initial-letter:3;-webkit-initial-letter:3;font-family:${fam(t.head === 'Oswald' ? t.body : t.head)};margin-right:.07em;color:#141414}` : ''}
.tsx-flow h2.sec{font:${t.titleStyle === 'italic' ? 'italic ' : ''}400 ${t.titleSize * 0.85}em/1.2 ${fam(t.head)};text-align:center;margin:0 0 1.6em}
.tsx-hd,.tsx-ft{position:absolute;font-family:${fam(t.body)};font-size:${Math.max(8, t.size - 2.5)}pt;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:${t.oldstyle ? 'oldstyle-nums' : 'lining-nums'}}
.tsx-hd .h{${head1}}
.tsx-fixed{position:absolute;display:flex;flex-direction:column;font-family:${fam(t.body)};color:#141414;text-align:center}
.tsx-fixed .bt{font-family:${fam(t.head)};font-size:${t.head === 'Oswald' ? 2.4 : 2.2}em;line-height:1.1;${t.titleCase === 'upper' || t.head === 'Cinzel' ? 'text-transform:uppercase;letter-spacing:.08em;' : ''}text-wrap:balance}
.tsx-fixed .st{font-style:italic;font-size:1.15em;margin-top:.6em}
.tsx-fixed .au{font-family:${fam(t.head)};font-size:1.25em;letter-spacing:.1em;font-variant-caps:all-small-caps}
.tsx-fixed .pub{font-size:.85em;letter-spacing:.12em;font-variant-caps:all-small-caps}
.tsx-fixed .cp{text-align:left;font-size:${Math.max(7.5, t.size - 3)}pt;line-height:1.45}
.tsx-fixed .cp p{margin:0 0 .7em}
.tsx-fixed .ded{font-style:italic;font-size:${t.size}pt;line-height:1.5;text-wrap:balance}
.tsx-fixed .epi{font-style:italic;font-size:${t.size}pt;line-height:1.5;text-align:left}.tsx-fixed .epi .by{font-style:normal;text-align:right;margin-top:.6em;font-variant-caps:all-small-caps;letter-spacing:.06em}
.tsx-fixed .part-l{font-family:${fam(t.head)};font-variant-caps:all-small-caps;letter-spacing:.2em;font-size:1.05em}
.tsx-fixed .part-t{font-family:${fam(t.head)};font-size:2em;line-height:1.15;margin-top:.5em;text-wrap:balance;${t.titleStyle === 'italic' ? 'font-style:italic;' : ''}}
.tsx-toc{font-family:${fam(t.body)};font-size:${t.size}pt;line-height:1.5}
.tsx-toc .th{font-family:${fam(t.head)};text-align:center;font-size:1.5em;margin:${Math.round(g.H * 0.12)}px 0 1.2em;${t.titleStyle === 'italic' ? 'font-style:italic;' : ''}}
.tsx-toc .row{display:flex;align-items:baseline;gap:.4em;margin:0 0 .25em}.tsx-toc .row .t{flex:0 1 auto}.tsx-toc .row .d{flex:1;border-bottom:1px dotted #777;transform:translateY(-.25em)}.tsx-toc .row .p{font-variant-numeric:lining-nums}
.tsx-toc .row.part{margin-top:.7em;font-variant-caps:all-small-caps;letter-spacing:.1em}
.tsx-toc .row .n{font-variant-caps:all-small-caps;letter-spacing:.06em;margin-right:.3em}
`;
  }

  // ------------------------------------------------------------------ measuring
  let box = null;
  function measureBox(styleText) {
    if (!box) {
      box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-30000px;top:0;visibility:hidden;contain:layout style';
      document.body.appendChild(box);
    }
    let st = document.getElementById('tsx-style');
    if (!st) { st = document.createElement('style'); st.id = 'tsx-style'; document.head.appendChild(st); }
    st.textContent = fontFaceCSS(fontBase()) + styleText;
    return box;
  }
  function countColumns(html, g) {
    const flow = document.createElement('div'); flow.className = 'tsx-flow';
    flow.innerHTML = html + '<span class="tsx-end"></span>';
    box.appendChild(flow);
    const fr = flow.getBoundingClientRect(), er = flow.lastChild.getBoundingClientRect();
    let n = Math.max(1, Math.floor((er.left - fr.left + 1) / (g.W + g.G)) + 1);
    // an end marker alone at the top of a fresh column means the text ended exactly on the page before
    if (n > 1 && er.top - fr.top < 2) n--;
    flow.remove();
    return n;
  }

  // ------------------------------------------------------------------ building the book
  // returns { pages: [page], geo, theme, design, css, toc, bodyStart }
  async function build(blocks, project, opts = {}) {
    const d = design(project), t = resolved(d);
    const book = project.book || {};
    const author = (book.author || opts.author || '').trim();
    const title = (book.title || project.title || '').trim();
    const chapters = chaptersFrom(blocks);
    const wordsTotal = blocks.reduce((a, b) => a + (textOf(b).split(/\s+/).filter(Boolean).length), 0);
    let estPages = Math.round(wordsTotal / (t.size >= 14 ? 190 : 290)) + chapters.length + 8;
    let result = null;
    for (let pass = 0; pass < 2; pass++) {
      const g = geometry(d, estPages);
      result = await layout(chapters, d, t, g, book, title, author, opts);
      if (gutterFor(result.pages.length) === g.gutter) break;
      estPages = result.pages.length;
    }
    return result;
  }

  async function layout(chapters, d, t, g, book, title, author, opts) {
    const style = css(t, g, d);
    measureBox(style);
    if (document.fonts && document.fonts.load) {
      try { await Promise.all([t.body, t.head].map(f => document.fonts.load(`${t.size}pt "${f}"`))); await document.fonts.load(`italic ${t.size}pt "${t.body}"`); } catch {}
    }
    const pages = [];
    // labels are shown under the pages in the preview only, so the opening pages of a printed book make sense
    const blank = (label = 'Left blank, so the next part starts on a right-hand page, as in printed books') => pages.push({ type: 'blank', label });
    const toRecto = () => { if (pages.length % 2 === 1) blank(); };      // next page index even = page number odd = right-hand page
    const fixed = (html, align = 'center', v = 'top', label = '') => pages.push({ type: 'fixed', html, align, v, label });

    // ---- front matter
    const F = d.front, hasText = s => !!String(s || '').trim();
    if (F.halfTitle && title) { fixed(`<div class="bt" style="font-size:1.6em">${esc(title)}</div>`, 'center', 'third', 'Half-title page: the book’s name on its own, as printed books open'); blank('Back of the half-title, left blank as in printed books'); }
    if (F.titlePage && title) {
      fixed(`<div style="flex:1"></div><div class="bt">${esc(title)}</div>${hasText(book.subtitle) ? `<div class="st">${esc(book.subtitle)}</div>` : ''}<div style="flex:1.2"></div>${author ? `<div class="au">${esc(author)}</div>` : ''}<div style="flex:2"></div>${hasText(book.publisher) ? `<div class="pub">${esc(book.publisher)}</div>` : ''}`, 'center', 'fill', 'Title page');
      if (F.copyright) pages.push({ type: 'fixed', html: `<div style="flex:1"></div><div class="cp">${copyrightHTML(book, author, title)}</div>`, v: 'fill', label: 'Copyright page (the back of the title page)' });
      else blank('Back of the title page, left blank');
    } else if (F.copyright) { toRecto(); pages.push({ type: 'fixed', html: `<div style="flex:1"></div><div class="cp">${copyrightHTML(book, author, title)}</div>`, v: 'fill' }); blank(); }
    if (F.dedication && hasText(book.dedication)) { toRecto(); fixed(`<div class="ded">${esc(book.dedication).replace(/\n/g, '<br>')}</div>`, 'center', 'third'); blank(); }
    if (F.epigraph && hasText(book.epigraph)) { toRecto(); fixed(`<div class="epi">${esc(book.epigraph).replace(/\n/g, '<br>')}${hasText(book.epigraphBy) ? `<div class="by">— ${esc(book.epigraphBy)}</div>` : ''}</div>`, 'center', 'third'); blank(); }
    const tocAt = F.toc ? (toRecto(), pages.length) : -1;   // filled in once the page numbers are known

    // ---- body
    const bodyChapters = [];
    const bodyStartPlaceholder = pages.length;
    const tocEntries = [];
    for (let i = 0; i < chapters.length; i++) {
      const c = chapters[i];
      if (opts.yield && i % 6 === 5) await new Promise(r => setTimeout(r, 0));
      if (c.kind === 'part') {
        toRecto();
        tocEntries.push({ part: true, title: c.title, at: pages.length });
        const m = /^\s*(part|book|act|volume)\s+([\w-]+)\s*[:.\-–—]?\s*(.*)$/i.exec(c.title);
        fixed(m ? `<div class="part-l">${esc(m[1] + ' ' + m[2])}</div>${m[3] ? `<div class="part-t">${esc(m[3])}</div>` : ''}` : `<div class="part-t">${esc(c.title)}</div>`, 'center', 'third');
        if (d.recto) blank();
        continue;
      }
      if (d.recto) toRecto();
      const html = openerHTML(c, t, g) + bodyHTML(c.blocks, t);
      const n = countColumns(html, g);
      tocEntries.push({ title: c.hidden ? '' : c.title, num: c.numbered && t.number !== 'none' ? numberText(c.n, t) : '', label: t.label, at: pages.length, tocTitle: c.tocTitle });
      for (let k = 0; k < n; k++) pages.push({ type: 'flow', ch: bodyChapters.length, k, opener: k === 0, title: c.title || c.tocTitle });
      bodyChapters.push(html);
    }
    // ---- back matter (unnumbered sections, plus the "also by" page)
    const B = d.back;
    const section = (name, text) => {
      if (!hasText(text)) return;
      if (d.recto) toRecto();
      const html = `<div class="opener" style="padding-top:${Math.round(g.H * t.sink)}px"><div class="ttl">${esc(name)}</div></div>` + text.split(/\n\s*\n/).map((p, i) => `<p${i === 0 ? ' class="first"' : ''}>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
      const n = countColumns(html, g);
      tocEntries.push({ title: name, at: pages.length });
      for (let k = 0; k < n; k++) pages.push({ type: 'flow', ch: bodyChapters.length, k, opener: k === 0, title: name });
      bodyChapters.push(html);
    };
    if (B.acknowledgements) section('Acknowledgements', book.acknowledgements);
    if (B.about) section('About the Author', book.about);
    if (B.alsoBy && hasText(book.alsoBy)) {
      if (d.recto) toRecto();
      tocEntries.push({ title: `Also by ${author || 'the author'}`, at: pages.length });
      fixed(`<div class="part-l">Also by</div><div class="au" style="margin-bottom:1.4em">${esc(author)}</div>${book.alsoBy.split('\n').filter(s => s.trim()).map(s => `<div style="font-style:italic;margin:.25em 0">${esc(s.trim())}</div>`).join('')}`, 'center', 'third');
    }

    // ---- contents page(s), now that every chapter's page is known
    let bodyStart = bodyStartPlaceholder;
    if (tocAt >= 0) {
      const rowH = t.size * 1.5 * 1.333 + 4;                     // px per line, roughly
      const firstCap = Math.max(4, Math.floor((g.H - g.H * 0.12 - t.size * 1.333 * 3.3) / rowH));
      const perPage = Math.max(4, Math.floor(g.H / rowH) - 1);
      const tocPages = tocEntries.length <= firstCap ? 1 : 1 + Math.ceil((tocEntries.length - firstCap) / perPage);
      const insert = tocPages + (tocPages % 2);                  // keep the book starting on a right-hand page
      tocEntries.forEach(e => { e.at += insert; });
      bodyStart += insert;
      const folio = at => at - bodyStart + 1;
      const row = e => e.part
        ? `<div class="row part"><span class="t">${esc(e.title)}</span><span class="d"></span><span class="p">${folio(e.at)}</span></div>`
        : `<div class="row"><span class="t">${e.num && !e.title ? `<span class="n">${esc((e.label || 'Chapter') + ' ' + e.num)}</span>` : e.num ? `<span class="n">${esc(e.num)}</span>` : ''}${esc(e.title || (e.num ? '' : e.tocTitle || ''))}</span><span class="d"></span><span class="p">${folio(e.at)}</span></div>`;
      const tocPagesArr = [];
      let rest = tocEntries.slice();
      for (let p = 0; p < tocPages; p++) {
        const take = rest.splice(0, p === 0 ? firstCap : perPage);
        tocPagesArr.push({ type: 'toc', html: `${p === 0 ? '<div class="th">Contents</div>' : ''}${take.map(row).join('')}` });
      }
      if (insert > tocPages) tocPagesArr.push({ type: 'blank' });
      pages.splice(tocAt, 0, ...tocPagesArr);
    }
    // where the body starts (page 1): the first chapter
    const firstBody = pages.findIndex(p => p.type === 'flow' || (p.type === 'fixed' && p.part));
    const bs = tocEntries.length ? tocEntries[0].at : (firstBody >= 0 ? firstBody : bodyStart);
    return { pages, bodyChapters, geo: g, theme: t, design: d, css: css(t, g, d), title, author, bodyStart: bs, toc: tocEntries };
  }

  function copyrightHTML(book, author, title) {
    const year = book.year || new Date().getFullYear();
    if (String(book.copyright || '').trim()) return book.copyright.split(/\n\s*\n/).map(p => `<p>${esc(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
    return [`Copyright © ${year} ${esc(author || 'the author')}`, 'All rights reserved.',
      'No part of this book may be reproduced in any form or by any electronic or mechanical means without written permission from the author, except for brief quotations in a review.',
      'This is a work of fiction. Names, characters, places and incidents are the products of the author’s imagination or are used fictitiously.',
      book.isbn ? `ISBN ${esc(book.isbn)}` : '', book.publisher ? `Published by ${esc(book.publisher)}` : '', book.edition ? esc(book.edition) : `First edition ${year}`]
      .filter(Boolean).map(p => `<p>${p}</p>`).join('');
  }

  // ------------------------------------------------------------------ one page as HTML
  function pageHTML(book, i) {
    const p = book.pages[i], g = book.geo, d = book.design, t = book.theme;
    const recto = i % 2 === 0;                                  // index 0 = page 1 = right-hand
    const left = recto ? g.gutter * PX : g.outside * PX;
    const top = g.top * PX;
    const folioNum = i - book.bodyStart + 1;
    const showNum = d.pageNumbers && folioNum >= 1 && p.type === 'flow';
    let inner = '';
    if (p.type === 'flow') {
      inner = `<div class="tsx-area" style="left:${left}px;top:${top}px;width:${g.W}px;height:${g.H}px"><div class="tsx-flow" style="transform:translateX(${-p.k * (g.W + g.G)}px)">${book.bodyChapters[p.ch]}</div></div>`;
      if (!p.opener && d.headers) {
        const txt = recto ? (d.headerRight === 'chapter' ? p.title : book.title) : book.author || book.title;
        const numTop = t.folio === 'top' && showNum;
        inner += `<div class="tsx-hd" style="top:${Math.round(top - 0.38 * PX)}px;left:${left}px;width:${g.W}px;text-align:${numTop ? (recto ? 'left' : 'right') : 'center'}">${numTop && !recto ? `<span style="float:left">${folioNum}</span>` : ''}<span class="h">${esc(txt)}</span>${numTop && recto ? `<span style="float:right">${folioNum}</span>` : ''}</div>`;
      }
      if (showNum && (t.folio !== 'top' || p.opener || !d.headers)) inner += `<div class="tsx-ft" style="top:${Math.round(g.PH - g.bottom * PX + 0.3 * PX)}px;left:${left}px;width:${g.W}px;text-align:center">${folioNum}</div>`;
    } else if (p.type === 'fixed') {
      const v = p.v === 'third' ? `justify-content:flex-start;padding-top:${Math.round(g.H * 0.28)}px;` : p.v === 'fill' ? '' : 'justify-content:flex-start;';
      inner = `<div class="tsx-fixed" style="left:${left}px;top:${top}px;width:${g.W}px;height:${g.H}px;box-sizing:border-box;${v}font-size:${t.size}pt">${p.html}</div>`;
    } else if (p.type === 'toc') {
      inner = `<div class="tsx-area tsx-toc" style="left:${left}px;top:${top}px;width:${g.W}px;height:${g.H}px">${p.html}</div>`;
    }
    return `<section class="tsx-page">${inner}</section>`;
  }

  // the whole book as one HTML document, ready to print to PDF at the trim size
  function documentHTML(book, extraFontCSS = '') {
    const g = book.geo;
    return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(book.title)}</title><style>
@page{size:${g.w}in ${g.h}in;margin:0}html,body{margin:0;padding:0;background:#fff}
${fontFaceCSS(fontBase())}${extraFontCSS}${book.css}
.tsx-page{break-after:page;background:#fff}
</style></head><body>${book.pages.map((_, i) => pageHTML(book, i)).join('\n')}</body></html>`;
  }

  // preview: put pages from..to into a row of page slots
  function fill(container, book, from, to, space) {
    const g = book.geo;
    container.style.width = (book.pages.length * (g.P + space)) + 'px';
    container.style.height = g.PH + 'px';
    container.style.position = 'relative';
    for (const el of [...container.children]) { const i = +el.dataset.i; if (i < from - 4 || i > to + 4) el.remove(); }
    for (let i = Math.max(0, from); i <= Math.min(book.pages.length - 1, to); i++) {
      if (container.querySelector(`[data-i="${i}"]`)) continue;
      const slot = document.createElement('div');
      slot.dataset.i = i;
      slot.style.cssText = `position:absolute;top:0;left:${i * (g.P + space)}px;width:${g.P}px;height:${g.PH}px;box-shadow:0 1px 4px rgba(0,0,0,.18)`;
      slot.innerHTML = pageHTML(book, i) + (book.pages[i].label ? `<div class="tsx-cap">${esc(book.pages[i].label)}</div>` : '');
      container.appendChild(slot);
    }
  }
  function ensureStyle(book) { measureBox(book.css); }

  return { THEMES, TRIMS, SCENES, DEFAULT, design, resolved, build, documentHTML, pageHTML, fill, ensureStyle, fontFaceCSS, chaptersFrom, numberText, FONTS: FONTS.map(f => f[0]) };
})();
