// Unwip - tracked changes (suggestions), like Word's Track Changes or Google Docs' Suggesting mode.
// While it's on, nothing you type replaces the original: new words are marked as added (<ins class="tc-ins">)
// and deleted words stay visible, crossed out (<del class="tc-del">), until someone accepts or rejects them.
// Changes travel to Word as real tracked changes, and an editor's tracked changes in a Word file come in the same way.
// Exports, copies and word counts always use the text as if every change were accepted.
window.UnwipTrack = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, esc, api } = U;
  const on = () => !!(S.project && S.project.track);
  const me = () => ((S.settings || {}).author || '').trim() || (api.web ? 'Me (phone)' : 'Me');
  const up = (n, cls) => { const el = n && (n.nodeType === 3 ? n.parentNode : n); return el && el.closest ? el.closest('.' + cls) : null; };
  function mark(kind) { const e = document.createElement(kind); e.className = 'tc-' + kind; e.dataset.a = me(); e.dataset.t = String(Date.now()); return e; }

  // ---------------------------------------------------------------- typing while tracking
  editor.addEventListener('beforeinput', e => {
    if (!on() || S.programmatic) return;
    const t = e.inputType;
    if (t === 'insertText' || t === 'insertReplacementText') {
      const text = e.data != null ? e.data : e.dataTransfer ? e.dataTransfer.getData('text/plain') : null;
      if (text == null) return;
      if (t === 'insertReplacementText' && e.getTargetRanges && e.getTargetRanges()[0]) {     // spelling suggestion: replace that word
        const tr = e.getTargetRanges()[0], r = document.createRange(); r.setStart(tr.startContainer, tr.startOffset); r.setEnd(tr.endContainer, tr.endOffset);
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
      }
      e.preventDefault(); typeText(text); done();
    } else if (/^delete(Content|Word|SoftLine|HardLine)/.test(t)) {
      if (deleteTracked(t)) { e.preventDefault(); done(); }
    }
  }, true);

  // ---------------------------------------------------------------- typing while NOT tracking
  // The browser treats an added or deleted mark like bold: type beside one, or press Enter at its end, and the new words
  // carry the mark on (green, underlined, listed as a suggestion). With tracking off, new words are never marked.
  // the outermost mark around n (marks can end up inside each other)
  const tcAt = n => { let el = up(n, 'tc-ins') || up(n, 'tc-del'), o; while (el && (o = up(el.parentNode, 'tc-ins') || up(el.parentNode, 'tc-del')) && editor.contains(o)) el = o; return el; };
  function stepOut(r) {
    const el = tcAt(r.startContainer); if (!el) return null;
    // where in the mark the caret is: at its start, at its end, or in the middle (then the mark is split in two)
    const before = document.createRange(); before.selectNodeContents(el); before.setEnd(r.startContainer, r.startOffset);
    const atStart = !before.toString().length, atEnd = before.toString().length >= el.textContent.length;
    const out = document.createRange();
    if (atEnd) out.setStartAfter(el);
    else if (atStart) out.setStartBefore(el);
    else { const rest = document.createRange(); rest.setStart(r.startContainer, r.startOffset); rest.setEnd(el, el.childNodes.length); const tail = el.cloneNode(false); tail.appendChild(rest.extractContents()); el.after(tail); out.setStartAfter(el); }
    out.collapse(true); return out;
  }
  editor.addEventListener('beforeinput', e => {
    if (on() || S.programmatic || (e.inputType !== 'insertText' && e.inputType !== 'insertReplacementText') || e.data == null) return;
    const sel = getSelection(); if (!sel.rangeCount || !sel.getRangeAt(0).collapsed) return;
    const out = stepOut(sel.getRangeAt(0)); if (!out) return;
    e.preventDefault();
    const tn = document.createTextNode(e.data.replace(/ /g, '\u00a0')); out.insertNode(tn);   // (a plain space on its own at a line's end would vanish)
    const nr = document.createRange(); nr.setStart(tn, tn.length); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: e.data }));
  }, true);
  // Enter (tracking on or off): the browser copies the mark onto the new line, nests marks inside each other and leaves
  // the line's end-of-line placeholder inside a mark, so later typing on that line lands on a line of its own.
  // Tidy both lines: one level of mark, the placeholder outside any mark, and no empty marks.
  const blockAt = n => { let b = n && (n.nodeType === 3 ? n.parentNode : n); while (b && b !== editor && !/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(b.tagName)) b = b.parentNode; return b && b !== editor ? b : null; };
  const unwrapMark = el => { while (el.firstChild) el.before(el.firstChild); el.remove(); };
  function tidyMarks(block) {
    if (!block) return;
    for (const inner of [...block.querySelectorAll('.tc-ins .tc-ins, .tc-del .tc-del')]) unwrapMark(inner);
    for (const br of [...block.querySelectorAll('.tc-ins br, .tc-del br')]) {
      let m = tcAt(br); if (!m) continue;
      const after = document.createRange(); after.setStartAfter(br); after.setEnd(m, m.childNodes.length);
      if (after.toString().length) continue;              // a line break in the middle of the words: leave it
      m.after(br);
    }
    for (const el of [...block.querySelectorAll('ins.tc-ins, del.tc-del')]) if (!el.textContent.replace(/\u200b/g, '')) unwrapMark(el);
  }
  editor.addEventListener('input', e => {
    if (S.programmatic || e.inputType !== 'insertParagraph') return;
    const sel = getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0), block = blockAt(r.startContainer); if (!block) return;
    const keep = { n: r.startContainer, o: r.startOffset };
    tidyMarks(block.previousElementSibling); tidyMarks(block);
    if (!block.firstChild) block.appendChild(document.createElement('br'));
    try { if (!editor.contains(keep.n)) { const nr = document.createRange(); nr.setStart(block, 0); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr); } } catch {}
  });

  function typeText(text) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    let r = sel.getRangeAt(0);
    if (!r.collapsed) { markDeleted(r, 'end'); r = sel.getRangeAt(0); }
    // never type inside a crossed-out deletion: step past it
    const d = up(r.startContainer, 'tc-del'); if (d) { r = document.createRange(); r.setStartAfter(d); r.collapse(true); }
    const mine = el => el && el.classList && el.classList.contains('tc-ins') && el.dataset.a === me();
    const insHere = up(r.startContainer, 'tc-ins');
    let tn, off;
    if (mine(insHere) && r.startContainer.nodeType === 3) { tn = r.startContainer; off = r.startOffset; tn.insertData(off, text); off += text.length; }
    else {
      // right after one of my own additions: keep growing it
      let prev = null; const n = r.startContainer, o = r.startOffset;
      if (n.nodeType === 3) { if (o === 0) prev = n.previousSibling; }
      else prev = n.childNodes[o - 1];
      if (mine(prev)) { tn = prev.lastChild && prev.lastChild.nodeType === 3 ? prev.lastChild : prev.appendChild(document.createTextNode('')); tn.appendData(text); off = tn.length; }
      else {
        if (insHere && !mine(insHere)) { r = document.createRange(); r.setStartAfter(insHere); r.collapse(true); }   // someone else's addition: start my own beside it
        const el = mark('ins'); tn = document.createTextNode(text); el.appendChild(tn); r.insertNode(el); off = text.length;
      }
    }
    const nr = document.createRange(); nr.setStart(tn, off); nr.collapse(true); sel.removeAllRanges(); sel.addRange(nr);
  }

  // text in a range that isn't already crossed out
  function liveText(r) {
    let s = '';
    const w = document.createTreeWalker(r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!r.intersectsNode(n) || up(n, 'tc-del')) continue;
      const a = n === r.startContainer ? r.startOffset : 0, b = n === r.endContainer ? r.endOffset : n.length;
      s += n.data.slice(a, b);
    }
    return s;
  }
  const blockOf = n => U.currentBlock(n);

  // Backspace / Delete: cross out instead of removing (your own additions just disappear)
  function deleteTracked(type) {
    const sel = getSelection(); if (!sel.rangeCount) return false;
    let r = sel.getRangeAt(0).cloneRange();
    const back = /Backward/.test(type);
    if (r.collapsed) {
      const unit = /Word/.test(type) ? 'word' : /Line/.test(type) ? 'lineboundary' : 'character';
      const start = r.cloneRange();
      for (let i = 0; i < 2000; i++) {
        const before = sel.getRangeAt(0).cloneRange();
        sel.modify('extend', back ? 'backward' : 'forward', unit);
        const now = sel.getRangeAt(0);
        if (now.compareBoundaryPoints(Range.START_TO_START, before) === 0 && now.compareBoundaryPoints(Range.END_TO_END, before) === 0) break;   // start or end of the chapter
        if (liveText(now).replace(/​/g, '')) break;
        if (blockOf(now.startContainer) !== blockOf(now.endContainer)) break;
      }
      r = sel.getRangeAt(0).cloneRange();
      // only a paragraph break in the way: let the paragraphs join as usual (that isn't tracked)
      if (!liveText(r).replace(/​/g, '') && blockOf(r.startContainer) !== blockOf(r.endContainer)) {
        sel.removeAllRanges(); sel.addRange(start);
        return false;
      }
      if (!liveText(r).replace(/​/g, '')) { sel.removeAllRanges(); sel.addRange(start); return true; }
    }
    markDeleted(r, back ? 'start' : 'end');
    return true;
  }

  function markDeleted(r, caret) {
    // split the ends so every text node is either fully in or fully out
    const sc = r.startContainer, so = r.startOffset, ec = r.endContainer, eo = r.endOffset;
    if (ec.nodeType === 3 && eo > 0 && eo < ec.length) ec.splitText(eo);
    let first = sc;
    if (sc.nodeType === 3 && so > 0 && so < sc.length) { first = sc.splitText(so); r.setStart(first, 0); }
    else if (sc.nodeType === 3 && so === sc.length && sc.length) r.setStartAfter(sc);
    if (ec === sc && first !== sc) r.setEnd(first, eo - so);
    const anchor = document.createTextNode('');
    const texts = [];
    const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode : r.commonAncestorContainer;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!r.intersectsNode(n) || !n.length) continue;
      const a = n === r.startContainer ? r.startOffset : 0, b = n === r.endContainer ? r.endOffset : n.length;
      if (b <= a) continue;
      if (n.parentNode && n.parentNode.closest && n.parentNode.closest('[contenteditable="false"]')) continue;
      texts.push(n);
    }
    if (!texts.length) return;
    // where the cursor ends up: before the first piece (Backspace) or after the last (Delete / typing over)
    if (caret === 'start') texts[0].parentNode.insertBefore(anchor, texts[0]);
    else texts[texts.length - 1].parentNode.insertBefore(anchor, texts[texts.length - 1].nextSibling);
    for (const n of texts) {
      if (up(n, 'tc-del')) continue;
      const ins = up(n, 'tc-ins');
      if (ins) { n.remove(); if (!ins.textContent) { if (anchor.parentNode === ins) ins.parentNode.insertBefore(anchor, ins); ins.remove(); } continue; }   // taking back an addition
      // join onto my own deletion right next to it, otherwise start a new one
      const prev = n.previousSibling, next = n.nextSibling;
      const mineDel = el => el && el.nodeType === 1 && el.classList.contains('tc-del') && el.dataset.a === me();
      if (mineDel(prev)) prev.appendChild(n);
      else if (mineDel(next)) next.insertBefore(n, next.firstChild);
      else { const d = mark('del'); n.parentNode.insertBefore(d, n); d.appendChild(n); }
    }
    // if the anchor ended up inside a crossed-out piece, step outside it
    let a = anchor; const d = up(a.parentNode, 'tc-del');
    const sel = getSelection(), nr = document.createRange();
    if (d) { if (caret === 'start') nr.setStartBefore(d); else nr.setStartAfter(d); } else nr.setStartBefore(a);
    nr.collapse(true); a.remove();
    sel.removeAllRanges(); sel.addRange(nr);
  }

  function done() { editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' })); refreshSoon(); }

  // ---------------------------------------------------------------- the list of changes
  function changes() {
    const els = $$('ins.tc-ins, del.tc-del', editor), out = [];
    for (let i = 0; i < els.length; i++) {
      const el = els[i], next = els[i + 1];
      // a deletion followed straight away by an addition from the same person reads as one replacement
      const adjacent = next && el.tagName === 'DEL' && next.tagName === 'INS' && next.dataset.a === el.dataset.a && el.nextSibling === next;
      if (adjacent) { out.push({ els: [el, next], kind: 'rep', a: el.dataset.a, t: +next.dataset.t || +el.dataset.t }); i++; }
      else out.push({ els: [el], kind: el.tagName === 'INS' ? 'ins' : 'del', a: el.dataset.a, t: +el.dataset.t });
    }
    return out;
  }
  const unwrap = el => { const p = el.parentNode; while (el.firstChild) p.insertBefore(el.firstChild, el); el.remove(); p.normalize(); };
  function accept(c) { for (const el of c.els) { if (!el.isConnected) continue; if (el.tagName === 'INS') unwrap(el); else el.remove(); } after(); }
  function reject(c) { for (const el of c.els) { if (!el.isConnected) continue; if (el.tagName === 'INS') el.remove(); else unwrap(el); } after(); }
  function after() { U.scheduleSave(); U.updateCountsSoon && U.updateCountsSoon(); U.resyncWords(); render(); status(); }
  const all = fn => { const cs = changes(); for (const c of cs) fn(c, true); after(); };

  // ---------------------------------------------------------------- on and off
  async function setOn(v) {
    if (!S.project) return;
    S.project.track = !!v; U.scheduleMeta();
    if (v && !((S.settings || {}).author || '').trim()) {
      const name = await U.promptText('Your name on suggestions', 'Shown next to every change, so an editor (or future you) can tell who suggested what.', '', 'Your name');
      if (name && name.trim()) S.settings = await api.setSettings({ author: name.trim() });
    }
    U.toast(v ? 'Tracking changes. What you type is marked as a suggestion until it’s accepted.' : 'No longer tracking changes. Existing suggestions stay until you accept or reject them.');
    render(); status();
  }
  const toggle = () => setOn(!on());

  // ---------------------------------------------------------------- status bar: a reminder while it's on
  function status() {
    let b = $('#st-track');
    if (!b) {
      const anchor = $('#st-session'); if (!anchor) return;
      b = document.createElement('button'); b.className = 'st-btn st-track'; b.id = 'st-track';
      const dot = document.createElement('span'); dot.className = 'st-dot';
      anchor.parentNode.insertBefore(b, anchor); anchor.parentNode.insertBefore(dot, anchor);
      b.onclick = () => window.UnwipSide && window.UnwipSide.open('changes');
    }
    const n = S.docId ? changes().length : 0;
    b.hidden = !on() && !n; if (b.nextSibling && b.nextSibling.classList) b.nextSibling.hidden = b.hidden;
    b.innerHTML = `<span class="st-tc-dot ${on() ? 'live' : ''}"></span>${on() ? 'Tracking changes' : 'Suggestions'}${n ? ` · ${n}` : ''}`;
    b.title = on() ? 'Everything you type is marked as a suggestion. Click to review.' : 'This chapter has suggestions to accept or reject. Click to review.';
    document.body.classList.toggle('tc-on', on());
  }

  // ---------------------------------------------------------------- the Changes tab in the side panel
  let panelBody = null;
  function attach(body) { panelBody = body; render(); }
  const when = t => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  const clip = (s, n = 70) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  function render() {
    if (!panelBody || !panelBody.isConnected) return;
    const cs = S.docId ? changes() : [];
    panelBody.innerHTML = `
      <label class="tc-switch"><input type="checkbox" id="tc-on" ${on() ? 'checked' : ''}><span><b>Track changes</b><small>${on() ? `New edits are suggestions, marked as <b>${esc(me())}</b>.` : 'Turn on to suggest edits instead of making them.'} Ctrl+Shift+E</small></span></label>
      <div class="tc-bar"><span>${cs.length ? `${cs.length} suggestion${cs.length === 1 ? '' : 's'} in this chapter` : 'No suggestions in this chapter'}</span>
        ${cs.length ? '<button class="btn small" id="tc-acc-all">Accept all</button><button class="btn small ghost" id="tc-rej-all">Reject all</button>' : ''}</div>
      <div class="tc-list">${cs.map((c, i) => {
        const txt = el => clip(el.textContent);
        const what = c.kind === 'rep' ? `<span class="tc-old">${esc(txt(c.els[0]))}</span> → <span class="tc-new">${esc(txt(c.els[1]))}</span>`
          : c.kind === 'ins' ? `<span class="tc-lbl">Added</span> <span class="tc-new">${esc(txt(c.els[0]))}</span>` : `<span class="tc-lbl">Deleted</span> <span class="tc-old">${esc(txt(c.els[0]))}</span>`;
        return `<div class="tc-card" data-i="${i}"><div class="tc-who"><b>${esc(c.a || 'Someone')}</b><span>${esc(when(c.t))}</span></div><div class="tc-what">${what}</div>
          <div class="tc-acts"><button class="btn small" data-x="acc">✓ Accept</button><button class="btn small ghost" data-x="rej">✕ Reject</button></div></div>`;
      }).join('')}</div>
      <div class="tc-readers"><button class="btn small" id="tc-send">Send to a beta reader…</button><button class="btn small" id="tc-recv">Bring in feedback…</button></div>
      <p class="side-note">Suggestions show in your exports as if accepted. A Word export keeps them as real tracked changes, and an editor’s tracked changes in a Word file come in here to accept or reject.</p>`;
    $('#tc-on', panelBody).onchange = e => setOn(e.target.checked);
    $('#tc-send', panelBody).onclick = () => window.UnwipReader && window.UnwipReader.send();
    $('#tc-recv', panelBody).onclick = () => window.UnwipReader && window.UnwipReader.receive();
    const aa = $('#tc-acc-all', panelBody), ra = $('#tc-rej-all', panelBody);
    if (aa) aa.onclick = () => all(accept);
    if (ra) ra.onclick = async () => { if (await U.confirmBox('Reject every suggestion?', 'Additions are removed and deleted words come back.', 'Reject all')) all(reject); };
    $$('.tc-card', panelBody).forEach(card => {
      const c = cs[+card.dataset.i];
      card.addEventListener('mousedown', e => { if (e.target.closest('button')) return; show(c); });
      card.querySelector('[data-x="acc"]').onclick = () => accept(c);
      card.querySelector('[data-x="rej"]').onclick = () => reject(c);
    });
  }
  function show(c) {
    const el = c.els[0]; const wrap = U.editorWrap, r = el.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    if (r.top < w.top + 40 || r.bottom > w.bottom - 40) wrap.scrollTop += r.top - w.top - w.height * 0.35;
    c.els.forEach(x => { x.classList.add('tc-flash'); setTimeout(() => x.classList.remove('tc-flash'), 1200); });
  }
  // clicking a change in the text opens it in the panel
  editor.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('ins.tc-ins, del.tc-del'); if (!el) return;
    if (window.UnwipSide && window.UnwipSide.current() !== 'changes') window.UnwipSide.open('changes');
    requestAnimationFrame(() => {
      const i = changes().findIndex(c => c.els.includes(el)); if (i < 0 || !panelBody) return;
      const card = panelBody.querySelector(`.tc-card[data-i="${i}"]`); if (card) { card.scrollIntoView({ block: 'nearest' }); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 1200); }
    });
  });

  let rt = null; const refreshSoon = () => { clearTimeout(rt); rt = setTimeout(() => { render(); status(); }, 250); };
  U.on('doc', () => { render(); status(); });
  U.on('project', () => { render(); status(); });
  U.on('input', refreshSoon);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e' && S.slug) { e.preventDefault(); toggle(); }
  });
  return { on, setOn, toggle, changes, accept, reject, attach, render, status, acceptAll: () => all(accept), rejectAll: () => all(reject) };
})();
