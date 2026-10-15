// Unwip - comments and footnotes.
// Comments: <span class="cmt" data-cid data-note data-at> around the text. Never exported.
// Footnotes: <sup class="fn" contenteditable="false" data-fn="note text">. Exported as real footnotes in Word,
// pop-up notes in e-books, and notes at the end of each chapter in PDF / Google Docs.
window.UnwipNotes = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, editor, S, I } = U;
  const panel = $('#notes-panel');
  const list = $('#np-list');
  const hasHL = typeof Highlight !== 'undefined' && CSS.highlights;
  let isOpen = false;

  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const inEditor = () => { const s = getSelection(); return s.rangeCount && editor.contains(s.anchorNode) && S.docId; };
  const changed = () => { U.scheduleSave(); };
  const fmtDate = iso => { try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); } catch { return ''; } };

  // ---- comments
  function wordAround(sel) {
    const n = sel.anchorNode, o = sel.anchorOffset;
    if (n.nodeType !== 3) return null;
    const t = n.nodeValue; let a = o, b = o;
    while (a > 0 && /[\p{L}\p{N}'’-]/u.test(t[a - 1])) a--;
    while (b < t.length && /[\p{L}\p{N}'’-]/u.test(t[b])) b++;
    if (a === b) return null;
    const r = document.createRange(); r.setStart(n, a); r.setEnd(n, b); return r;
  }
  function addComment() {
    if (!inEditor()) { U.toast('Click in your writing first, or select the words you want to comment on.'); return; }
    const sel = getSelection();
    let r = sel.getRangeAt(0);
    if (r.collapsed) r = wordAround(sel);
    if (!r || !r.toString().trim()) { U.toast('Select the words you want to comment on, then press Ctrl+Alt+M.'); return; }
    const id = newId('c'), at = new Date().toISOString();
    const blocks = [...editor.children].filter(b => r.intersectsNode(b));
    let last = null;
    for (const b of blocks) {
      const br = document.createRange(); br.selectNodeContents(b);
      if (b.contains(r.startContainer)) br.setStart(r.startContainer, r.startOffset);
      if (b.contains(r.endContainer)) br.setEnd(r.endContainer, r.endOffset);
      if (br.collapsed || !br.toString().trim()) continue;
      const span = document.createElement('span');
      span.className = 'cmt'; span.dataset.cid = id; span.dataset.note = ''; span.dataset.at = at;
      span.appendChild(br.extractContents());
      br.insertNode(span);
      last = span;
    }
    if (!last) return;
    const after = document.createRange(); after.setStartAfter(last); after.collapse(true);
    sel.removeAllRanges(); sel.addRange(after);
    changed();
    open(true);
    render();
    focusCard(`[data-cid="${id}"] textarea`);
  }
  function comments() {
    const map = new Map();
    for (const s of $$('span.cmt[data-cid]', editor)) {
      const id = s.dataset.cid;
      if (!map.has(id)) map.set(id, { id, note: s.dataset.note || '', at: s.dataset.at || '', by: s.dataset.by || '', spans: [] });
      map.get(id).spans.push(s);
    }
    return [...map.values()];
  }
  function setNote(id, text) { for (const s of $$(`span.cmt[data-cid="${id}"]`, editor)) s.dataset.note = text; changed(); }
  function resolve(id) {
    for (const s of $$(`span.cmt[data-cid="${id}"]`, editor)) s.replaceWith(...s.childNodes);
    editor.normalize(); changed(); render();
  }

  // ---- footnotes
  function addFootnote() {
    if (!inEditor()) { U.toast('Click in your writing where the footnote should go first.'); return; }
    const sel = getSelection(); sel.collapseToEnd();
    const id = newId('f');
    // placed by hand: the browser's own insert splits the paragraph around a non-editable mark
    const r = sel.getRangeAt(0);
    if (r.startContainer === editor) { U.toast('Click inside a paragraph first.'); return; }
    const sup = document.createElement('sup');
    sup.className = 'fn'; sup.contentEditable = 'false'; sup.dataset.fid = id; sup.dataset.fn = ''; sup.textContent = '\u200b';
    r.insertNode(sup);
    // a text node after the mark so the cursor has somewhere to go
    let next = sup.nextSibling;
    if (!next || next.nodeType !== 3) { next = document.createTextNode(''); sup.after(next); }
    const c = document.createRange(); c.setStart(next, 0); c.collapse(true); sel.removeAllRanges(); sel.addRange(c);
    changed();
    open(true); render();
    focusCard(`[data-fid="${id}"] textarea`);
  }
  function footnotes() {
    return $$('sup.fn', editor).map((s, i) => { if (!s.dataset.fid) s.dataset.fid = newId('f'); return { id: s.dataset.fid, n: i + 1, text: s.dataset.fn || '', el: s }; });
  }

  // ---- panel
  function open(on) {
    isOpen = on === undefined ? !isOpen : !!on;
    if (isOpen && S.revise) U.setRevise(false);
    panel.classList.toggle('hidden', !isOpen);
    $('#btn-notes').classList.toggle('on', isOpen);
    if (isOpen) render(); else activate(null);
  }
  function quoteOf(c) { const t = c.spans.map(s => s.textContent).join(' ').replace(/\s+/g, ' ').trim(); return t.length > 90 ? t.slice(0, 88) + '…' : t; }
  function snippetAround(sup) {
    const b = U.currentBlock(sup); if (!b) return '';
    const pre = document.createRange(); pre.selectNodeContents(b); pre.setEndBefore(sup);
    const t = pre.toString().replace(/​/g, '').trim();
    return (t.length > 60 ? '…' + t.slice(-58) : t);
  }
  function render() {
    updateBadge();
    if (!isOpen) return;
    const cs = comments(), fs = footnotes();
    const focusSel = document.activeElement && document.activeElement.closest('.np-card') ? `[data-${document.activeElement.closest('.np-card').dataset.cid ? 'cid' : 'fid'}="${document.activeElement.closest('.np-card').dataset.cid || document.activeElement.closest('.np-card').dataset.fid}"] textarea` : null;
    list.innerHTML = `
      <div class="np-sec"><span>Comments</span><b>${cs.length}</b><button class="btn small ghost" id="np-add-c" title="Comment on the selected words (Ctrl+Alt+M)">+ Comment</button></div>
      ${cs.length ? cs.map(c => `<div class="np-card" data-cid="${c.id}">
          <div class="np-quote">“${esc(quoteOf(c))}”</div>
          <textarea rows="2" placeholder="Write your comment…">${esc(c.note)}</textarea>
          <div class="np-foot"><span>${c.by ? `<b>${esc(c.by)}</b> · ` : ''}${esc(fmtDate(c.at))}</span><button class="btn small ghost np-resolve" title="Remove the comment and keep the words">Resolve</button></div>
        </div>`).join('') : '<p class="np-empty">Select some words and press <b>Ctrl+Alt+M</b> (or right-click → Add comment). Comments are notes to yourself and never appear in exports.</p>'}
      <div class="np-sec"><span>Footnotes</span><b>${fs.length}</b><button class="btn small ghost" id="np-add-f" title="Insert a footnote where the cursor is (Ctrl+Alt+F)">+ Footnote</button></div>
      ${fs.length ? fs.map(f => `<div class="np-card fn" data-fid="${f.id}">
          <div class="np-quote"><span class="np-num">${f.n}</span>${esc(snippetAround(f.el))}</div>
          <textarea rows="2" placeholder="Footnote text…">${esc(f.text)}</textarea>
          <div class="np-foot"><span></span><button class="btn small ghost np-del" title="Remove this footnote">Remove</button></div>
        </div>`).join('') : '<p class="np-empty">Put the cursor where the note belongs and press <b>Ctrl+Alt+F</b>. Footnotes become real footnotes in Word, pop-up notes in e-books, and notes at the end of each chapter in PDFs and Google Docs.</p>'}`;
    $$('textarea', list).forEach(t => { const fit = () => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }; requestAnimationFrame(fit); t.addEventListener('input', fit); });
    $$('.np-card[data-cid]', list).forEach(card => {
      const id = card.dataset.cid;
      $('textarea', card).addEventListener('input', e => setNote(id, e.target.value));
      $('.np-resolve', card).onclick = () => resolve(id);
      card.addEventListener('mousedown', e => { if (!e.target.closest('button')) { activate(id); reveal(`span.cmt[data-cid="${id}"]`); } });
    });
    $$('.np-card[data-fid]', list).forEach(card => {
      const id = card.dataset.fid;
      $('textarea', card).addEventListener('input', e => { const s = editor.querySelector(`sup[data-fid="${id}"]`); if (s) { s.dataset.fn = e.target.value; changed(); } });
      $('.np-del', card).onclick = () => { const s = editor.querySelector(`sup[data-fid="${id}"]`); if (s) s.remove(); changed(); render(); };
      card.addEventListener('mousedown', e => { if (!e.target.closest('button')) { activate(null); reveal(`sup[data-fid="${id}"]`); } });
    });
    $('#np-add-c', list).onmousedown = e => e.preventDefault();
    $('#np-add-f', list).onmousedown = e => e.preventDefault();
    $('#np-add-c', list).onclick = addComment;
    $('#np-add-f', list).onclick = addFootnote;
    if (focusSel) { const t = list.querySelector(focusSel); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
  }
  function focusCard(selector) {
    requestAnimationFrame(() => { const t = list.querySelector(selector); if (t) { t.focus(); t.closest('.np-card').scrollIntoView({ block: 'nearest' }); t.closest('.np-card').classList.add('flash'); } });
  }
  function reveal(selector) {
    const el = editor.querySelector(selector); if (!el) return;
    const wrap = U.editorWrap, r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    if (r.top < w.top + 40 || r.bottom > w.bottom - 40) wrap.scrollTop += r.top - w.top - w.height * 0.35;
    if (el.tagName === 'SUP') { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200); }
  }
  function activate(id) {
    $$('.np-card.on', list).forEach(c => c.classList.remove('on'));
    if (!hasHL) return;
    CSS.highlights.delete('unwip-cmt-on');
    if (!id) return;
    const ranges = $$(`span.cmt[data-cid="${id}"]`, editor).map(s => { const r = document.createRange(); r.selectNodeContents(s); return r; });
    if (ranges.length) CSS.highlights.set('unwip-cmt-on', new Highlight(...ranges));
    const card = list.querySelector(`[data-cid="${id}"]`); if (card) { card.classList.add('on'); card.scrollIntoView({ block: 'nearest' }); }
  }
  function updateBadge() {
    const n = S.docId ? comments().length + footnotes().length : 0;
    const b = $('#np-count'); if (b) { b.textContent = n || ''; b.classList.toggle('hidden', !n); }
  }

  // ---- hover tip + clicks in the text
  const tip = document.createElement('div'); tip.className = 'np-tip hidden'; document.body.appendChild(tip);
  editor.addEventListener('mouseover', e => {
    const c = e.target.closest('span.cmt'), f = e.target.closest('sup.fn');
    if (!c && !f) { tip.classList.add('hidden'); return; }
    const note = c ? c.dataset.note : f.dataset.fn;
    tip.innerHTML = `<b>${c ? 'Comment' : 'Footnote ' + (footnotes().findIndex(x => x.el === f) + 1)}</b>${note ? esc(note) : '<i>Empty. Click to write it.</i>'}`;
    const r = (c || f).getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 280, Math.max(8, r.left)) + 'px';
    tip.style.top = (r.bottom + 6) + 'px';
    tip.classList.remove('hidden');
  });
  editor.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  editor.addEventListener('click', e => {
    const c = e.target.closest('span.cmt'), f = e.target.closest('sup.fn');
    if (f) { open(true); focusCard(`[data-fid="${f.dataset.fid}"] textarea`); return; }
    if (c && isOpen) activate(c.dataset.cid);
    else if (isOpen) activate(null);
  });

  // ---- keyboard, menu, toolbar
  document.addEventListener('keydown', e => {
    if (!((e.ctrlKey || e.metaKey) && e.altKey) || e.shiftKey || !S.project) return;
    const k = e.code === 'KeyM' ? 'm' : e.code === 'KeyF' ? 'f' : e.key.toLowerCase();   // on a Mac, Option changes the letter (Option+M is µ)
    if (k === 'm') { e.preventDefault(); addComment(); }
    else if (k === 'f') { e.preventDefault(); addFootnote(); }
  }, true);
  if (U.api.onNoteCmd) U.api.onNoteCmd(what => { if (what === 'image') { const b = document.getElementById('btn-image'); if (b) b.click(); return; } (what === 'comment' ? addComment : addFootnote)(); });
  $('#btn-notes').innerHTML = I.comment + '<span class="np-badge hidden" id="np-count"></span>';
  $('#btn-notes').onclick = () => open();
  $('#np-close').onclick = () => open(false);
  for (const [id, fn] of [['#btn-comment', addComment], ['#btn-footnote', addFootnote]]) { const b = $(id); if (b) { b.onmousedown = e => e.preventDefault(); b.onclick = fn; } }

  let t = null;
  U.on('input', () => { clearTimeout(t); t = setTimeout(() => { if (isOpen && !(document.activeElement && panel.contains(document.activeElement))) render(); else updateBadge(); }, 500); });
  U.on('doc', () => { activate(null); render(); });
  U.on('revise', on => { if (on && isOpen) open(false); });
  U.on('leave', () => { if (isOpen) open(false); });

  return { addComment, addFootnote, open, render };
})();
