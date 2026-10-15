// Unwip - name ideas (no AI): first, middle and last names, each rolled on its own, with the whole name previewed at
// the bottom. The lists come from real naming traditions (medieval Europe, today's world, everyday English), plus
// invented names built from real sound patterns and place names built the way real ones are. No stock "fantasy"
// names: no Kael, no Lyra, nothing "Ashen" or "Vale".
window.UnwipNames = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, esc, S } = U;
  const R = a => a[Math.floor(Math.random() * a.length)];
  const split = s => s.trim().split(/\s+/);

  const L = {
    // medieval and early-modern Europe (English, Norman, Welsh, Cornish, Norse, German, French)
    oldF: split(`Agnes Alys Avice Beatrix Cecily Clemence Edith Elspeth Emmeline Ermengarde Gisela Gunhild Hawise Hedda Ingrith Isobel Joan Juliana
      Mabel Margery Matilda Petronel Rohese Sibyl Thomasina Ysolde Brigid Eithne Morwenna Tamsin Wenna Branwen Rhonwen Odile Perrine Sabine Ottilie
      Astrid Sigrid Ragna Solveig Hild Aldith Wulfrun Gwenllian Nest Orable Amice Dulcie Felise Gytha Lettice Maud Osanna Parnel Rosamund Tiffany`),
    oldM: split(`Aldric Anselm Baldwin Bertram Conrad Cuthbert Drogo Eadric Fulk Gervase Godfrey Hamon Hereward Hugh Ivo Lambert Leofric Osbert
      Piers Ralf Reynard Roderic Swithin Thurstan Walter Wystan Brannoc Cadoc Emrys Gethin Idris Madoc Rhodri Tudur Ulf Torvald Halvard Einar Leif Odo
      Tancred Amaury Aymer Guiscard Alard Benedict Crispin Edmund Faramond Gilbert Jocelin Matthias Nicol Oswin Ranulf Simund Theobald Warin`),
    oldL: split(`Barrow Brewer Carver Cobb Coldwell Crane Dyer Fairweather Fletcher Furnival Gannet Hardacre Harrow Holloway Kemp Lark Longshanks
      Marlow Merrick Mudge Nettleship Oakes Pennock Quill Reeve Ridley Sayer Shepherd Skelton Tanner Thatcher Trask Varley Wainwright Warrender
      Weaver Whitlock Wolsey Yarrow Drummond Ashby Bracegirdle Catesby Despenser Gaunt Hawtrey Lovell Mortimer Pole Scrope Tyrrell Vachell Wake`),
    // today's world, many places
    nowF: split(`Amara Bao Dagny Farida Ines Leilani Nadia Priya Saoirse Uma Ximena Zofia Ngozi Mei Lucía Anouk Esi Ilse Kalinda Mirela Nilufar
      Rania Valentina Ayesha Bethan Chiara Dalia Elif Fenna Greta Hana Ingrid Jolene Keiko Leticia Marisol Nkechi Oona Paloma Rukmini Sunniva Tamar
      Wanjiru Yara Zuzana Adaeze Birte Carmen Divya Eszter`),
    nowM: split(`Bao Chidi Emeka Goran Haruto Jun Kofi Mateus Oskar Quang Rafael Tomasz Vikram Yusuf Arjun Teodor Kenji Bjørn Dmitri Hamid Joaquín
      Lior Pavel Sione Tariq Wiremu Ade Bastian Cosmin Davi Emil Farid Gideon Hiroshi Ismail Jarek Kwame Lukas Matteo Nikhil Obi Paulo Rasmus
      Santiago Tobias Vusi Wojciech Yannick Zoran Anders Bilal`),
    nowL: split(`Okafor Nakamura Lindqvist Petrov Haddad Castellanos Novak Sørensen Achterberg Kowalski Zhou Ferreira Adeyemi Takahashi Moreau Brandt
      Iyer Quispe Halloran Varga Ndiaye Osei Lund Reyes Vasquez Bergström Okoye Szabo Tran Kaur Gallagher Ishikawa Mendoza Yilmaz Abara Delacroix
      Eriksen Fonseca Grünewald Hossain Ivanova Jovanović Kariuki Lopes Mwangi Nguyen Oyelaran Pereira Rasmussen Silva Tanaka Urquhart Volkov`),
    // everyday English (contemporary and LitRPG)
    dayF: split(`Abby Becky Chloe Dani Ellie Fran Gemma Hannah Izzy Jess Kate Lauren Megan Nat Olivia Paige Rachel Sophie Tash Vicky Zoe Amy Beth
      Claire Donna Emma Fiona Grace Holly Jade Kerry Lucy Molly Nicola Rosie Sam Tara`),
    dayM: split(`Adam Ben Callum Dave Ethan Finn Gary Harry Jake Kyle Liam Matt Nathan Ollie Pete Rob Sam Tom Will Zach Alfie Brad Chris Dean Ed
      Frank Greg Jamie Kev Luke Mike Neil Owen Rich Steve Tony`),
    dayL: split(`Smith Jones Taylor Brown Wilson Evans Thomas Johnson Roberts Walker Wright Robinson Thompson White Hughes Edwards Green Hall Wood
      Harris Lewis Martin Jackson Clarke Clark Turner Hill Scott Cooper Morris Ward Moore King Watson Baker Harrison Morgan Patel Young Allen
      Mitchell James Anderson Phillips Lee Bell Parker Davies Kelly Bennett`),
    // player handles
    hAdj: split(`Lazy Grim Tiny Salty Feral Sleepy Crispy Rusty Lucky Moody Soggy Bold Sneaky Angry Polite Spicy Wobbly Quiet Loud Sticky Frosty Cheap
      Feisty Clumsy Humble Smug Noble Sad Dizzy Jolly Nervous Brave Mild Tired Hungry`),
    hNoun: split(`Goose Toast Badger Spoon Gnome Pickle Wrench Turnip Mango Kettle Waffle Otter Llama Crumpet Ferret Biscuit Noodle Pigeon Moth
      Walrus Muffin Sprout Tadpole Brick Cabbage Hamster Possum Beetle Parsnip Crab Gherkin Teapot Lobster Sock Donut`)
  };
  // invented names from real sound patterns (Germanic / Romance / Slavic-ish), not stock fantasy syllables
  const INV = {
    start: split('Bar Bor Cal Dag Dor Ed Fal Ger Gor Hal Hed Ing Jor Kas Lod Lud Mag Mer Nor Od Os Per Rad Ros Sig Tam Tor Ul Var Ved Wen Yor Zed Bran Drav Grim Stef Tav'),
    midF: ['', '', 'i', 'e', 'el', 'en', 'ar', 'is'], endF: ['a', 'ia', 'ine', 'ette', 'ild', 'una', 'ika', 'ola', 'gard', 'is'],
    midM: ['', '', 'o', 'e', 'an', 'er', 'ul'], endM: ['ric', 'mund', 'o', 'an', 'ek', 'ard', 'win', 'ulf', 'or', 'ian', 'as', 'it'],
    lastStart: split('Brack Hol Kes Dun Tav Lin Mor Cal Pen Gol Wex Sund Hart Rud Stav Farn Abb Lod Skel Hask Wend Blen Cran Hun Kil Ross Sel Bran'),
    lastEnd: ['er', 'ing', 'ley', 'wick', 'stead', 'ford', 'dale', 'mouth', 'ton', 'ham', 'well', 'more', 'combe', 'den', 'by', 'holm', 'garth', 'ett', 'ock', 'iss', 'ovic', 'enko', 'berg']
  };
  const tidy = s => { s = s.replace(/([aeiou])\1+/g, '$1').replace(/(.)\1\1/g, '$1$1').replace(/oa|ao|eo|ua|ae(?!l)/g, m => m[0]).replace(/([aeiou])([aeiou])([aeiou])/g, '$1$2'); return s[0].toUpperCase() + s.slice(1).toLowerCase(); };
  const invFirst = lean => { const f = lean === 'f' || (lean === 'any' && Math.random() < 0.5); return tidy(R(INV.start) + (f ? R(INV.midF) + R(INV.endF) : R(INV.midM) + R(INV.endM))); };
  const invLast = () => tidy(R(INV.lastStart) + R(INV.lastEnd));
  const place = () => { const m = window.UnwipMaps && window.UnwipMaps.placeName; return m ? m() : invLast(); };

  const STYLES = {
    old: { name: 'Old-world fantasy', first: lean => R(lean === 'f' ? L.oldF : lean === 'm' ? L.oldM : [...L.oldF, ...L.oldM]), last: () => Math.random() < 0.2 ? 'of ' + place() : R(L.oldL) },
    made: { name: 'Invented fantasy', first: lean => invFirst(lean), last: () => Math.random() < 0.15 ? 'of ' + place() : invLast() },
    scifi: { name: 'Sci-fi', first: lean => R(lean === 'f' ? L.nowF : lean === 'm' ? L.nowM : [...L.nowF, ...L.nowM]), last: () => Math.random() < 0.12 ? R(L.nowL) + '-' + R(L.nowL) : R(L.nowL) },
    today: { name: 'Contemporary / LitRPG', first: lean => R(lean === 'f' ? L.dayF : lean === 'm' ? L.dayM : [...L.dayF, ...L.dayM]), last: () => R(L.dayL) }
  };
  function handle() {
    const a = R(L.hAdj), n = R(L.hNoun), k = Math.random();
    return k < 0.3 ? a + n : k < 0.55 ? `${a}_${n}${Math.floor(Math.random() * 99) + 1}` : k < 0.75 ? `${n}${R(['Lord', 'King', 'Slayer', 'Enjoyer', 'Wrangler', 'Botherer'])}` : k < 0.9 ? `x${a}${n}x` : `${a.toLowerCase()}.${n.toLowerCase()}`;
  }
  const uniq = (fn, n) => { const out = new Set(); let tries = 0; while (out.size < n && tries++ < n * 12) out.add(fn()); return [...out]; };

  // ---- the dialog. opts.onUse(name) puts the name where it's needed (a character sheet, a Build sheet)
  async function open(opts = {}) {
    const st = Object.assign({ style: 'old', lean: 'any', middle: false, handle: false }, (() => { try { return JSON.parse(localStorage.getItem('unwip-namegen') || '{}'); } catch { return {}; } })());
    const pick = { first: '', middle: '', last: '', handle: '' };
    let lists = {};
    const body = document.createElement('div'); body.className = 'ng';
    const roll = part => {
      const S2 = STYLES[st.style] || STYLES.old;
      if (part === 'first' || part === 'middle') lists[part] = uniq(() => S2.first(st.lean), 8);
      if (part === 'last') lists.last = uniq(S2.last, 8);
      if (part === 'handle') lists.handle = uniq(handle, 8);
    };
    const rollAll = () => { ['first', 'middle', 'last', 'handle'].forEach(roll); for (const k of Object.keys(pick)) if (!pick[k] || !lists[k].includes(pick[k])) pick[k] = ''; pick.first = pick.first || lists.first[0]; pick.last = pick.last || lists.last[0]; if (st.middle) pick.middle = pick.middle || lists.middle[0]; if (st.handle) pick.handle = pick.handle || lists.handle[0]; };
    const full = () => [pick.first, st.middle ? pick.middle : '', pick.last].filter(Boolean).join(' ');
    const col = (part, label) => `<div class="ng-col" data-part="${part}"><div class="ng-head"><b>${label}</b><button type="button" class="icon-btn small" data-roll="${part}" title="New ${label.toLowerCase()} ideas (the others stay)">↻</button></div>
      ${lists[part].map(n => `<button type="button" class="ng-name ${pick[part] === n ? 'on' : ''}" data-pick="${esc(n)}">${esc(n)}</button>`).join('')}
      <input type="text" class="ng-own" data-own="${part}" placeholder="or type your own" value="${pick[part] && !lists[part].includes(pick[part]) ? esc(pick[part]) : ''}"></div>`;
    const draw = () => {
      body.innerHTML = `
        <div class="ng-opts"><div class="chip-row">${Object.entries(STYLES).map(([k, v]) => `<button type="button" class="chip ${st.style === k ? 'on' : ''}" data-style="${k}">${v.name}</button>`).join('')}</div>
          <div class="ng-row2"><div class="chip-row">${[['any', 'Any'], ['f', 'Feminine'], ['m', 'Masculine']].map(([k, l]) => `<button type="button" class="chip small ${st.lean === k ? 'on' : ''}" data-lean="${k}">${l}</button>`).join('')}</div>
          <label class="check"><input type="checkbox" data-opt="middle" ${st.middle ? 'checked' : ''}> Middle name</label>
          <label class="check"><input type="checkbox" data-opt="handle" ${st.handle ? 'checked' : ''}> Player handle (LitRPG)</label></div></div>
        <div class="ng-cols n${2 + (st.middle ? 1 : 0) + (st.handle ? 1 : 0)}">${col('first', 'First')}${st.middle ? col('middle', 'Middle') : ''}${col('last', 'Last')}${st.handle ? col('handle', 'Handle') : ''}</div>
        <div class="ng-preview"><div><span class="ng-full">${esc(full() || '…')}</span>${st.handle && pick.handle ? `<span class="ng-h">“${esc(pick.handle)}”</span>` : ''}</div>
          <div class="ng-acts"><button type="button" class="btn small ghost" id="ng-all">↻ New ideas for all</button><button type="button" class="btn small" id="ng-copy">Copy</button></div></div>
        <p class="hint">Click a name to use it; ↻ above a column gives new ideas for just that part. Names come from real naming traditions and sound patterns, picked at random on this device (no AI).</p>`;
      $$('[data-style]', body).forEach(b => b.onclick = () => { st.style = b.dataset.style; save(); for (const k of Object.keys(pick)) pick[k] = ''; rollAll(); draw(); });
      $$('[data-lean]', body).forEach(b => b.onclick = () => { st.lean = b.dataset.lean; save(); pick.first = ''; pick.middle = ''; roll('first'); roll('middle'); rollAll(); draw(); });
      $$('[data-opt]', body).forEach(c => c.onchange = () => { st[c.dataset.opt] = c.checked; save(); rollAll(); draw(); });
      $$('[data-roll]', body).forEach(b => b.onclick = () => { roll(b.dataset.roll); draw(); });
      $$('[data-pick]', body).forEach(b => b.onclick = () => { pick[b.closest('[data-part]').dataset.part] = b.dataset.pick; draw(); });
      $$('[data-own]', body).forEach(i => i.oninput = () => { pick[i.dataset.own] = i.value.trim(); const f = $('.ng-full', body); if (f) f.textContent = full() || '…'; $$(`[data-part="${i.dataset.own}"] .ng-name`, body).forEach(x => x.classList.remove('on')); });
      $('#ng-all', body).onclick = () => { for (const k of Object.keys(pick)) pick[k] = ''; rollAll(); draw(); };
      $('#ng-copy', body).onclick = async () => { try { await navigator.clipboard.writeText(full() + (st.handle && pick.handle ? ` (${pick.handle})` : '')); U.toast('Copied.'); } catch { U.toast('Couldn’t copy here.', 'warn'); } };
    };
    const save = () => { try { localStorage.setItem('unwip-namegen', JSON.stringify(st)); } catch {} };
    rollAll(); draw();
    const v = await U.modal({ title: 'Name ideas', body, wide: true, buttons: [{ label: 'Close', value: null, kind: 'ghost' }, ...(opts.onUse ? [{ label: opts.useLabel || 'Use this name', value: 'use', kind: 'primary' }] : [])] });
    if (v === 'use' && full()) opts.onUse({ name: full(), first: pick.first, middle: st.middle ? pick.middle : '', last: pick.last, handle: st.handle ? pick.handle : '' });
  }

  // ---- on a character sheet: puts the name in the title and the Full name / Name line (and Player handle if there is one)
  function useOnSheet(n) {
    const title = document.getElementById('doc-title');
    if (title) { title.value = n.name; title.dispatchEvent(new Event('input', { bubbles: true })); title.dispatchEvent(new Event('change', { bubbles: true })); }
    const set = (re, val) => {
      if (!val) return;
      const p = [...U.editor.querySelectorAll('p')].find(x => re.test(x.textContent || '')); if (!p) return;
      const t = p.textContent, i = t.indexOf(':') + 1; const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let node, at = 0, r = document.createRange(), started = false;
      while ((node = w.nextNode())) { const len = node.nodeValue.length; if (!started && at + len >= i) { r.setStart(node, i - at); started = true; } at += len; r.setEnd(node, node.nodeValue.length); }
      if (!started) return; const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      document.execCommand('insertText', false, ' ' + val);
    };
    set(/^\s*(full name|name)\s*:/i, n.name); set(/^\s*player handle\s*:/i, n.handle);
    U.scheduleSave(); U.toast(`Named ${esc(n.name)}.`);
  }
  { const b = document.getElementById('btn-names'); if (b) b.onclick = () => open({ onUse: useOnSheet }); }
  return { open, useOnSheet, STYLES, _test: { handle, invFirst, invLast } };
})();
