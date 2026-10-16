// Unwip - autocorrect as you type, with no AI: fixed lists and simple rules, like Word's AutoCorrect.
//   1. Common typos (autocorrect-list.js: teh -> the, dont -> don't), "i" -> "I", a capital at the start of a sentence,
//      and TWo capitals at the start fixed.
//   2. Your own corrections ("Always correct to…" from a spelling suggestion, or added in Settings › Autocorrect). Also
//      works as a shortcut (dz -> Dungeon's Safezone).
//   3. Optional, off until ticked: a word that isn't in the dictionary and is one slip from exactly one word that is
//      (two letters swapped, one missed, one extra or one wrong) is fixed. The dictionary is SCOWL's en-AU, en-GB and
//      en-US word lists together (app/vendor/spell/words.txt, made by tools/spell/make.py), loaded only when needed.
// It learns, without guessing: undoing a correction (Ctrl+Z or Backspace straight after) puts your word back, and a
// word you've undone twice is never corrected again. A word already written the same way twice elsewhere in the
// chapter, a name from the book's Characters, Places and Items, a glossary word or a word in your own dictionary is
// left alone by rule 3, and so is anything with a capital in the middle of a sentence (names you made up).
// Never inside [system messages], links or words with numbers in them. Settings live in the shared settings file, so
// they follow you to your other devices.
window.UnwipAutocorrect = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, editor, esc } = U;
  const DEF = { on: true, caps: true, smart: false, pairs: {}, never: [], undone: {} };
  const cfg = () => Object.assign({}, DEF, (S.settings && S.settings.autocorrect) || {});
  async function save(next) { S.settings = await U.api.setSettings({ autocorrect: next }); }
  const WORDCH = /[\p{L}\p{M}'’]/u;
  const ABBR = /^(e\.g|i\.e|etc|vs|mr|mrs|ms|dr|st|mt|no|fig|approx|p|pp|vol|ch)$/i;

  // ---- the dictionary (rule 3 only)
  let dict = null, loading = null;
  function loadDict() {
    if (dict || loading) return loading;
    loading = fetch('vendor/spell/words.txt').then(r => r.ok ? r.text() : '').then(t => { const s = new Set(); for (const w of t.split('\n')) if (w) s.add(w); dict = s.size ? s : null; }).catch(() => { dict = null; });
    return loading;
  }
  // a word is real if the list has it as typed, in lower case (Then at the start of a sentence) or with a capital (names
  // and places in the list, like Paris); the one-slip fix only ever suggests words the list has in lower case
  const known = w => { if (!dict) return false; w = w.replace(/’/g, "'"); const lw = w.toLowerCase(); return dict.has(w) || dict.has(lw) || dict.has(lw[0].toUpperCase() + lw.slice(1)); };
  const ABC = 'abcdefghijklmnopqrstuvwxyz';
  // every word one slip away that's in the dictionary
  function oneSlip(w) {
    const lw = w.toLowerCase(), out = new Set();
    for (let i = 0; i <= lw.length; i++) {
      if (i < lw.length) out.add(lw.slice(0, i) + lw.slice(i + 1));                                    // one extra
      if (i < lw.length - 1) out.add(lw.slice(0, i) + lw[i + 1] + lw[i] + lw.slice(i + 2));           // two swapped
      for (const c of ABC) { out.add(lw.slice(0, i) + c + lw.slice(i)); if (i < lw.length) out.add(lw.slice(0, i) + c + lw.slice(i + 1)); }   // missed / wrong
    }
    out.delete(lw);
    return [...out].filter(x => dict.has(x));
  }
  // suggestions up to two slips away, for "Always correct this word…" (where the PC's own suggestions aren't there)
  function suggest(w, max = 6) {
    if (!dict) return [];
    const one = oneSlip(w), seen = new Set(one), two = [];
    if (one.length < max && w.length <= 14) {
      outer: for (const a of oneSlipRaw(w)) for (const b of oneSlipRaw(a)) if (b !== w.toLowerCase() && dict.has(b) && !seen.has(b)) { seen.add(b); two.push(b); if (one.length + two.length >= max) break outer; }
    }
    const cased = x => /^\p{Lu}/u.test(w) ? x[0].toUpperCase() + x.slice(1) : x;
    return [...one, ...two].slice(0, max).map(cased);
  }
  function oneSlipRaw(w) {
    const lw = w.toLowerCase(), out = new Set();
    for (let i = 0; i <= lw.length; i++) {
      if (i < lw.length) out.add(lw.slice(0, i) + lw.slice(i + 1));
      if (i < lw.length - 1) out.add(lw.slice(0, i) + lw[i + 1] + lw[i] + lw.slice(i + 2));
      for (const c of ABC) { out.add(lw.slice(0, i) + c + lw.slice(i)); if (i < lw.length) out.add(lw.slice(0, i) + c + lw.slice(i + 1)); }
    }
    return out;
  }

  // ---- words of the book that rule 3 must leave alone
  function bookWords() {
    const s = new Set();
    try { for (const e of (window.FolioNames && window.FolioNames.entries) || []) for (const p of String(e.text || '').split(/\s+/)) s.add(p.toLowerCase()); } catch {}
    try { for (const g of (S.project && S.project.bible && S.project.bible.glossary) || []) for (const p of String(g.term || '').split(/\s+/)) s.add(p.toLowerCase()); } catch {}
    for (const w of ownWords) s.add(w);
    return s;
  }
  let ownWords = new Set();
  const loadOwn = async () => { try { ownWords = new Set(((await U.api.spellWords()) || []).map(w => String(w).toLowerCase())); } catch {} };

  // ---- deciding what a word becomes (or null)
  function fixFor(word, ctx) {
    const c = cfg(), lw = word.toLowerCase();
    if ((c.never || []).includes(lw)) return null;
    if (/\d/.test(word)) return null;
    const pairs = c.pairs || {};
    const own = Object.prototype.hasOwnProperty.call(pairs, lw) ? pairs[lw] : null;
    const caseLike = to => word === word.toUpperCase() && word.length > 1 ? to.toUpperCase() : (/^\p{Lu}/u.test(word) ? to[0].toUpperCase() + to.slice(1) : to);
    if (own) return own.startsWith(lw) || /[A-Z]/.test(own) ? own : caseLike(own);
    if (!c.on) return null;
    const ty = (window.UnwipTypos || {})[lw];
    if (ty && (word === lw || /^\p{Lu}\p{Ll}*$/u.test(word))) return ty.startsWith('I') ? ty : caseLike(ty);
    if (word === 'i') return 'I';
    // TWo capitals at the start of a word (THe -> The), not acronyms or names written that way on purpose
    if (/^\p{Lu}{2}\p{Ll}{2,}$/u.test(word)) return word[0] + word.slice(1).toLowerCase();
    if (c.caps && ctx.sentenceStart && /^\p{Ll}[\p{Ll}'’]*$/u.test(word) && !ABBR.test(ctx.prevWord || '')) {
      const up = word[0].toUpperCase() + word.slice(1);
      if (!dict || known(word) || known(up)) return up;
    }
    if (c.smart && dict && !known(word) && word.length >= 4 && !(!ctx.sentenceStart && /^\p{Lu}/u.test(word)) && !/\p{Ll}\p{Lu}/u.test(word)) {
      if (bookWords().has(lw)) return null;
      if (ctx.timesElsewhere >= 2) return null;   // written this way twice already: it's meant
      const opts = oneSlip(word);
      if (opts.length === 1) return caseLike(opts[0]);
    }
    return null;
  }

  // ---- watching the typing: a word ends when a space or punctuation is typed after it
  let last = null;   // { node, start, from, to } of the last correction, so Ctrl+Z / Backspace can undo it
  editor.addEventListener('input', e => {
    if (e.inputType === 'historyUndo' && last) { forget(last.from); last = null; return; }
    if (e.inputType !== 'insertText' || !e.data || !/^[\s.,;:!?)\]"”’…—-]$/.test(e.data)) { if (e.inputType !== 'insertText') last = null; return; }
    if (S.view !== 'write') return;
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return;
    const n = sel.anchorNode, o = sel.anchorOffset; if (!n || n.nodeType !== 3) return;
    const text = n.data, endW = o - e.data.length; if (endW <= 0) return;
    let s0 = endW; while (s0 > 0 && WORDCH.test(text[s0 - 1])) s0--;
    let word = text.slice(s0, endW).replace(/^['’]+|['’]+$/g, '');
    if (!word || word.length > 40) return;
    s0 = text.indexOf(word, s0);
    // the paragraph up to the word: inside [a system message], or a link or address?
    const block = U.currentBlock ? U.currentBlock(n) : n.parentElement;
    let before = '';
    try { const r = document.createRange(); r.setStart(block, 0); r.setEnd(n, s0); before = r.toString(); } catch { before = text.slice(0, s0); }
    if ((before.match(/\[/g) || []).length > (before.match(/\]/g) || []).length) return;
    const tokenStart = before.split(/\s/).pop() + word;
    if (/[\/@]|\.\w/.test(tokenStart) || /^(https?|www)/i.test(tokenStart)) return;
    const trimmed = before.replace(/[\s"“‘'(\[—–-]+$/, '');
    const sentenceStart = !trimmed || /[.!?…]$/.test(trimmed);
    const prevWord = (trimmed.match(/([\p{L}.]+)[.!?…]?$/u) || [])[1] ? (trimmed.match(/([\p{L}.]+?)\.?$/u) || [])[1] : '';
    let timesElsewhere = 0;
    if (cfg().smart) { try { const all = editor.textContent.toLowerCase(), lw = word.toLowerCase(); const re = new RegExp(`(?<![\\p{L}])${lw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'gu'); timesElsewhere = (all.match(re) || []).length - 1; } catch {} }
    if (cfg().smart && !dict) loadDict();
    const to = fixFor(word, { sentenceStart, prevWord, timesElsewhere });
    if (!to || to === word) { last = null; return; }
    // swap the word (keeping what was typed after it), as one step Ctrl+Z can take back
    const r = document.createRange(); r.setStart(n, s0); r.setEnd(n, s0 + word.length);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertText', false, to);
    const after = getSelection(); const an = after.anchorNode, ao = after.anchorOffset;
    // put the caret back after the space or mark that was typed
    try { const rr = document.createRange(); rr.setStart(an, Math.min(an.length || 0, ao + e.data.length)); rr.collapse(true); after.removeAllRanges(); after.addRange(rr); } catch {}
    last = { node: an, at: ao - to.length, from: word, to, mark: e.data };
    flash(an, ao - to.length, to.length);
  });
  // Backspace straight after a correction: your word comes back (with what you typed after it)
  editor.addEventListener('keydown', e => {
    if (!last) return;
    if (e.key !== 'Backspace' || e.ctrlKey || e.metaKey || e.altKey) { if (!['Shift', 'Control', 'Meta', 'Alt'].includes(e.key)) last = null; return; }
    const L = last; last = null;
    const sel = getSelection(); if (!sel.rangeCount) return;
    const n = sel.anchorNode, o = sel.anchorOffset;
    if (n !== L.node || n.data.slice(L.at, L.at + L.to.length) !== L.to || o !== L.at + L.to.length + L.mark.length) return;
    e.preventDefault();
    const r = document.createRange(); r.setStart(n, L.at); r.setEnd(n, o);
    sel.removeAllRanges(); sel.addRange(r);
    document.execCommand('insertText', false, L.from + L.mark);
    forget(L.from);
  });
  // undone: twice and that word is never corrected again
  async function forget(word) {
    const c = cfg(), lw = word.toLowerCase(), undone = { ...(c.undone || {}) };
    undone[lw] = (undone[lw] || 0) + 1;
    const never = undone[lw] >= 2 ? [...new Set([...(c.never || []), lw])] : (c.never || []);
    if (undone[lw] >= 2) { delete undone[lw]; U.toast(`Unwip won’t correct “${esc(word)}” any more. Settings › Autocorrect lists these.`); }
    await save({ ...c, undone, never });
  }
  function flash(node, at, len) {
    try { const r = document.createRange(); r.setStart(node, at); r.setEnd(node, at + len); const b = r.getBoundingClientRect(); if (!b.width) return;
      const f = document.createElement('div'); f.className = 'ac-flash'; f.style.cssText = `left:${b.left}px;top:${b.bottom - 2}px;width:${b.width}px`; document.body.appendChild(f); setTimeout(() => f.remove(), 900); } catch {}
  }

  // ---- your own corrections
  async function addPair(from, to, quiet) {
    from = String(from || '').trim().toLowerCase(); to = String(to || '').trim();
    if (!from || !to || from === to.toLowerCase()) return;
    const c = cfg(); await save({ ...c, pairs: { ...(c.pairs || {}), [from]: to }, never: (c.never || []).filter(w => w !== from) });
    if (!quiet) U.toast(`“${esc(from)}” will be corrected to “${esc(to)}” from now on.`);
  }
  // Ctrl+K and the web: the word at the caret (or picked), with suggestions to choose from
  async function always(word) {
    const sel = getSelection();
    word = word || sel.toString().trim();
    if (!word && sel.rangeCount) { const n = sel.anchorNode, o = sel.anchorOffset; if (n && n.nodeType === 3) { let a = o, b = o; while (a > 0 && WORDCH.test(n.data[a - 1])) a--; while (b < n.data.length && WORDCH.test(n.data[b])) b++; word = n.data.slice(a, b); } }
    word = (word || '').replace(/^['’]+|['’]+$/g, '');
    if (!word) { U.toast('Put the cursor on a word first.'); return; }
    await loadDict();
    const opts = suggest(word);
    const body = document.createElement('div'); body.className = 'ac-always';
    body.innerHTML = `<p>Every time you type <b>${esc(word)}</b>, Unwip writes:</p>
      ${opts.length ? `<div class="chip-row ac-opts">${opts.map((o, i) => `<button type="button" class="chip ${i ? '' : 'on'}" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : ''}
      <div class="field"><label>Or type it</label><input type="text" id="ac-to" value="${esc(opts[0] || '')}" maxlength="80"></div>`;
    body.querySelectorAll('[data-o]').forEach(b => b.onclick = () => { body.querySelectorAll('[data-o]').forEach(x => x.classList.toggle('on', x === b)); body.querySelector('#ac-to').value = b.dataset.o; });
    const ok = await U.modal({ title: 'Always correct this word', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!ok) return;
    await addPair(word, body.querySelector('#ac-to').value);
  }
  // Settings › Autocorrect › Your corrections…
  async function manage() {
    const draw = () => { const c = cfg(), P = Object.entries(c.pairs || {}).sort((a, b) => a[0].localeCompare(b[0]));
      body.innerHTML = `<div class="ac-add"><input type="text" id="ac-f" placeholder="When I type" maxlength="40"><span>→</span><input type="text" id="ac-t" placeholder="Write this" maxlength="80"><button type="button" class="btn small primary" id="ac-addb">Add</button></div>
        <div class="ac-list">${P.length ? P.map(([f, t]) => `<div class="ac-row"><b>${esc(f)}</b><span>→</span><span>${esc(t)}</span><button type="button" class="ac-rm" data-rm="${esc(f)}" aria-label="Remove">×</button></div>`).join('') : '<p class="hint">None yet. Right-click a word with a red line on a PC or Mac and choose Always correct to, or add one here. A short one works as a shortcut too.</p>'}</div>
        ${(c.never || []).length ? `<h4 class="ac-h">Never corrected</h4><div class="chip-row">${c.never.map(w => `<button type="button" class="chip" data-nv="${esc(w)}" title="Correct it again">${esc(w)} ×</button>`).join('')}</div>` : ''}`;
      body.querySelector('#ac-addb').onclick = async () => { await addPair(body.querySelector('#ac-f').value, body.querySelector('#ac-t').value, true); draw(); };
      body.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { const c2 = cfg(), p = { ...(c2.pairs || {}) }; delete p[b.dataset.rm]; await save({ ...c2, pairs: p }); draw(); });
      body.querySelectorAll('[data-nv]').forEach(b => b.onclick = async () => { const c2 = cfg(); await save({ ...c2, never: (c2.never || []).filter(w => w !== b.dataset.nv) }); draw(); }); };
    const body = document.createElement('div'); body.className = 'ac-manage'; body.dataset.ownEnter = '1';
    draw();
    await U.modal({ title: 'Your corrections', body, wide: true, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }
  // the Settings section's tick boxes
  function settingsHTML() {
    const c = cfg();
    return `<label class="check full"><input type="checkbox" id="ac-on" ${c.on ? 'checked' : ''}> Correct common typos as I type (teh → the, dont → don’t, i → I)</label>
      <label class="check full"><input type="checkbox" id="ac-caps" ${c.caps ? 'checked' : ''}> Capital letter at the start of a sentence</label>
      <label class="check full"><input type="checkbox" id="ac-smart" ${c.smart ? 'checked' : ''}> Also fix a word that’s one letter off a real word (never names, invented words or words you keep writing that way)</label>
      <div class="field full"><button class="btn" type="button" id="ac-manage">Your corrections…</button><div class="hint">Ctrl+Z or Backspace straight after a correction puts your word back. Do that twice for the same word and it’s never corrected again.</div></div>`;
  }
  function wireSettings(box) {
    const set = async () => { const c = cfg(); await save({ ...c, on: box.querySelector('#ac-on').checked, caps: box.querySelector('#ac-caps').checked, smart: box.querySelector('#ac-smart').checked }); if (cfg().smart) loadDict(); };
    ['#ac-on', '#ac-caps', '#ac-smart'].forEach(s => { const el = box.querySelector(s); if (el) el.onchange = set; });
    const m = box.querySelector('#ac-manage'); if (m) m.onclick = manage;
  }
  // the PC/Mac right-click menu: Always correct to…
  if (U.api.onAutocorrectAdd) U.api.onAutocorrectAdd(o => { if (o && o.from && o.to) addPair(o.from, o.to); });
  U.on('project', () => { loadOwn(); if (cfg().smart) loadDict(); });
  setTimeout(() => { loadOwn(); if (cfg().smart) loadDict(); }, 3000);
  return { fixFor, addPair, always, manage, settingsHTML, wireSettings, loadDict, suggest, get dict() { return dict; } };
})();
