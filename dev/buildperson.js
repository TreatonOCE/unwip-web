// Unwip - Build › Character (Open World, at Lore). Someone who belongs to your world before they belong to a book:
// the same fields and headings as a character page in a book, kept in Build like a map or a coat of arms. Add to
// book… (top bar) puts a copy in a book's Characters folder, where the character sheet and the Story Bible take over.
(function () {
  'use strict';
  const B = window.UnwipBuild; if (!B) return;
  const U = window.__unwip;
  const { $, esc } = U;
  let it = null, box = null;
  const blank = () => ({ html: '' });
  // the first lines of the page, as plain text, for the card's picture
  const lines = item => {
    const d = document.createElement('div'); d.innerHTML = (item.data && item.data.html) || '';
    return [...d.querySelectorAll('p, h1, h2, h3, li')].map(p => ({ head: /^H/.test(p.tagName), text: p.textContent.replace(/\s+/g, ' ').trim() })).filter(x => x.text).slice(0, 9);
  };
  function cardSVG(item, W = 640, H = 400) {
    const L = lines(item), x = s => esc(String(s || '')).slice(0, 70);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="18" fill="#fbf8f1"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="12" fill="none" stroke="#d8cfbd" stroke-width="2"/>
      <circle cx="74" cy="78" r="38" fill="#e6dfd1"/><text x="74" y="91" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="34" fill="#34528a">${x((item.title || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase())}</text>
      <text x="130" y="72" font-family="Bookhaven, Georgia, serif" font-size="34" fill="#22262e">${x(item.title || 'Untitled')}</text>
      <text x="130" y="100" font-family="Georgia, serif" font-style="italic" font-size="17" fill="#7a7368">A character of the world</text>
      ${L.map((l, i) => `<text x="44" y="${158 + i * 26}" font-family="Georgia, serif" font-size="${l.head ? 17 : 16}" ${l.head ? 'font-weight="bold" ' : ''}fill="${l.head ? '#34528a' : '#3a3530'}">${x(l.text)}</text>`).join('')}</svg>`;
  }
  B.editors.person = {
    blank,
    open(item, main, ctx) {
      it = item; it.data = Object.assign(blank(), it.data || {});
      main.innerHTML = `<div class="bp-page"><p class="hint bp-lead">A character of your world, not in a book yet. When you want them in one, use <b>Add to book…</b> at the top: there they get a character sheet and a place in the Story Bible.</p>
        <div class="bp-sheet" contenteditable="true" spellcheck="true">${it.data.html || '<p><br></p>'}</div></div>`;
      box = $('.bp-sheet', main);
      box.oninput = () => { it.data.html = box.innerHTML; ctx.changed(); };
    },
    thumb: item => B.svgURL(cardSVG(item)),
    picture: item => B.svgCanvas(cardSVG(item), 640, 400),
    toBook: item => (item.data && item.data.html) || `<p>${esc(item.title || '')}</p>`,
    close: () => { if (box) box.oninput = null; it = null; box = null; }
  };
})();
