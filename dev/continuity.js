// Unwip - Continuity pass. After a big change (a power level, a distance, a name, a date), list what changed: what it
// was, what it is now. Unwip finds every place the old version appears in the manuscript, chapter by chapter, and walks
// you through them one at a time with "Change it" or "Leave it", so nothing is missed and nothing is changed blindly.
// The list and how far you've got are kept with the book, so a pass can take as many sittings as it needs.
window.UnwipContinuity = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, esc, fmt, S, editor } = U;

  const data = () => { const c = S.project.continuity = S.project.continuity || { facts: [], from: '' }; c.facts = c.facts || []; return c; };
  const chapters = () => { const out = [], r = U.findNode('root-manuscript'); if (r) U.walkTree(r.node.children || [], n => { if (n.type === 'doc') out.push(n); }); return out; };
  const fromChapters = () => { const all = chapters(), i = all.findIndex(c => c.id === data().from); return i > 0 ? all.slice(i) : all; };
  const looksFor = f => String(f.old || '').split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);
  // whole words, any case: "Level 12" finds "level 12" but not "Level 125"
  function regexFor(f) {
    const alts = looksFor(f).sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
    if (!alts.length) return null;
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join('|')})(?![\\p{L}\\p{N}])`, f.matchCase ? 'gu' : 'giu');
  }
  // the text of a chapter (or the editor), block by block, with where each piece of text sits
  function textMap(root) {
    const segs = []; let full = '';
    const BLOCK = /^(P|H[1-6]|LI|BLOCKQUOTE|DIV|TD|TH|PRE)$/;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: n => n.nodeType === 1 && n.matches('del.tc-del, sup.fn, [contenteditable="false"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let n, lastBlock = null;
    while ((n = tw.nextNode())) {
      if (n.nodeType === 1) { if (n.tagName === 'BR') full += '\n'; continue; }
      let b = n.parentElement; while (b && b !== root && !BLOCK.test(b.tagName)) b = b.parentElement;
      if (b !== lastBlock) { if (full) full += '\n'; lastBlock = b; }
      segs.push({ node: n, at: full.length }); full += n.nodeValue;
    }
    return { full, segs };
  }
  function hitsIn(root, f) {
    const re = regexFor(f); if (!re) return [];
    const { full, segs } = textMap(root), out = []; let m;
    while ((m = re.exec(full))) { if (!m[0]) { re.lastIndex++; continue; } out.push({ a: m.index, b: m.index + m[0].length, word: m[0], segs, full }); }
    return out;
  }
  function rangeOf(h) {
    const find = pos => { let s = h.segs[0]; for (const x of h.segs) { if (x.at <= pos) s = x; else break; } return [s.node, Math.min(pos - s.at, s.node.nodeValue.length)]; };
    const r = document.createRange(); const [sn, so] = find(h.a), [en, eo] = find(h.b - 1); r.setStart(sn, so); r.setEnd(en, eo + 1); return r;
  }
  // the new version takes the case of the old one where it can: "Level 12" → "Level 30", "LEVEL 12" → "LEVEL 30"
  const keepCase = (word, rep) => !rep ? rep : word === word.toUpperCase() && word !== word.toLowerCase() && word.length > 1 ? rep.toUpperCase() : /^\p{Lu}/u.test(word) && /^\p{Ll}/u.test(rep) ? rep[0].toUpperCase() + rep.slice(1) : rep;
  const docText = async id => { const html = id === S.docId ? editor.innerHTML : await U.api.loadDoc(S.slug, id).catch(() => ''); const div = document.createElement('div'); div.innerHTML = html || ''; return div; };

  // ================================================================== THE LIST
  async function open() {
    if (!S.project) return;
    await U.flushSave();
    const c = data();
    if (!c.facts.length) c.facts.push({ id: U.uid(), old: '', now: '', note: '' });
    const body = document.createElement('div'); body.className = 'cn-dialog';
    let counts = null;
    const draw = () => {
      const chs = chapters();
      body.innerHTML = `
        <p class="cn-lead">List what changed: what it <b>was</b> and what it <b>is now</b>. Unwip finds every place the old version appears and walks you through them one at a time, so you decide each one. Your list and progress are kept with the book.</p>
        <div class="cn-facts">
          <div class="cn-row cn-th"><span>It was</span><span>It’s now</span><span>Note (for you)</span><span>Found</span><span></span></div>
          ${c.facts.map((f, i) => `<div class="cn-row" data-i="${i}">
            <input data-k="old" value="${esc(f.old || '')}" placeholder="e.g. Level 12  (several: Level 12 | level twelve)">
            <input data-k="now" value="${esc(f.now || '')}" placeholder="e.g. Level 30  (empty: just show me each one)">
            <input data-k="note" value="${esc(f.note || '')}" placeholder="optional">
            <span class="cn-found">${counts ? (counts[i] ? `<b>${fmt(counts[i].n)}</b> in ${counts[i].ch} ch.` : f.old ? '<span class="cn-ok">✓ none left</span>' : '') : ''}</span>
            <button class="icon-btn small" data-del="${i}" title="Remove">×</button></div>`).join('')}
        </div>
        <div class="cn-acts"><button class="btn small ghost" id="cn-add">+ Add a change</button>
          <label class="cn-from">Start at <select id="cn-from"><option value="">the first chapter</option>${chs.map(ch => `<option value="${ch.id}" ${c.from === ch.id ? 'selected' : ''}>${esc(ch.title || 'Untitled')}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" id="cn-case" ${c.matchCase ? 'checked' : ''}> Match capitals exactly</label></div>
        <p class="hint">Whole words only, so “12” won’t match “125”. Separate other ways of writing the same thing with | (“Level 12 | level twelve”). Leave “It’s now” empty for changes that need rewriting rather than swapping a word: Unwip still takes you to each place.</p>`;
      $$('.cn-row[data-i] input', body).forEach(inp => inp.oninput = () => { c.facts[+inp.closest('.cn-row').dataset.i][inp.dataset.k] = inp.value; counts = null; U.scheduleMeta(); });
      $$('[data-del]', body).forEach(b => b.onclick = () => { c.facts.splice(+b.dataset.del, 1); if (!c.facts.length) c.facts.push({ id: U.uid(), old: '', now: '', note: '' }); counts = null; U.scheduleMeta(); draw(); });
      $('#cn-add', body).onclick = () => { c.facts.push({ id: U.uid(), old: '', now: '', note: '' }); U.scheduleMeta(); draw(); $$('.cn-row[data-i] input[data-k="old"]', body).pop().focus(); };
      $('#cn-from', body).onchange = e => { c.from = e.target.value; counts = null; U.scheduleMeta(); };
      $('#cn-case', body).onchange = e => { c.matchCase = e.target.checked; c.facts.forEach(f => f.matchCase = c.matchCase); counts = null; U.scheduleMeta(); };
    };
    const count = async () => {
      counts = [];
      const chs = fromChapters();
      const texts = []; for (const ch of chs) texts.push(await docText(ch.id));
      c.facts.forEach((f, i) => { f.matchCase = !!c.matchCase; let n = 0, k = 0; for (const t of texts) { const h = hitsIn(t, f).length; if (h) { n += h; k++; } } counts[i] = n ? { n, ch: k } : null; });
      draw();
    };
    draw();
    const v = await U.modal({ title: 'Continuity pass', body, wide: true,
      buttons: [{ label: 'Close', value: null, kind: 'ghost' }, { label: 'Count them', value: 'count', kind: 'ghost' }, { label: 'Go through them', value: 'go', kind: 'primary' }],
      onOpen: back => { const b = [...back.querySelectorAll('.m-foot .btn')][1]; b.onclick = async e => { e.stopPropagation(); b.disabled = true; b.textContent = 'Counting…'; await count(); b.disabled = false; b.textContent = 'Count them'; }; } });
    c.facts = c.facts.filter(f => (f.old || '').trim() || (f.now || '').trim() || (f.note || '').trim());
    U.scheduleMeta();
    if (v === 'go') walk();
  }

  // ================================================================== GOING THROUGH THEM
  // One place at a time: the chapter opens, the words are selected, and the bar at the bottom says what to do.
  let W = null;
  async function walk() {
    const c = data(), facts = c.facts.filter(f => looksFor(f).length);
    if (!facts.length) { U.toast('Add what it was first (the “It was” column).'); return open(); }
    facts.forEach(f => f.matchCase = !!c.matchCase);
    W = { facts, fi: 0, chs: fromChapters(), ci: 0, skip: 0, changed: 0, left: 0 };
    bar(); await step();
  }
  function stop(msg) {
    W = null; const b = document.getElementById('cn-bar'); if (b) b.remove();
    try { CSS.highlights && CSS.highlights.delete('cn-hit'); } catch {}
    if (msg) U.toast(msg, '', 8000);
  }
  // find the next place, starting from where we are
  async function step() {
    if (!W) return;
    while (W.fi < W.facts.length) {
      const f = W.facts[W.fi];
      while (W.ci < W.chs.length) {
        const ch = W.chs[W.ci];
        if (ch.id !== S.docId) {
          const t = await docText(ch.id);
          if (hitsIn(t, f).length <= W.skip) { W.ci++; W.skip = 0; continue; }   // nothing (left) here: skip without opening it
          await U.openDoc(ch.id); await new Promise(r => setTimeout(r, 60));
        }
        const hits = hitsIn(editor, f);
        if (W.skip < hits.length) return show(f, ch, hits, hits[W.skip]);
        W.ci++; W.skip = 0;
      }
      W.fi++; W.ci = 0; W.skip = 0;
    }
    const msg = `Continuity pass done: ${fmt(W.changed)} changed, ${fmt(W.left)} left as they were.`;
    stop(msg);
  }
  function show(f, ch, hits, h) {
    const r = rangeOf(h);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    try { if (CSS.highlights && window.Highlight) CSS.highlights.set('cn-hit', new Highlight(r)); } catch {}
    const rect = r.getBoundingClientRect(), wrap = U.editorWrap, wr = wrap.getBoundingClientRect();
    if (rect.top < wr.top + 60 || rect.bottom > wr.bottom - 140) wrap.scrollTop += rect.top - wr.top - wr.height * 0.35;
    W.cur = { f, ch, h, n: hits.length };
    const b = document.getElementById('cn-bar'); if (!b) return;
    const now = (f.now || '').trim();
    b.querySelector('.cn-what').innerHTML = `<b>${esc(h.word)}</b>${now ? ` → <b>${esc(keepCase(h.word, now))}</b>` : ' <span class="cn-rw">(rewrite by hand if it needs it)</span>'}${f.note ? `<small>${esc(f.note)}</small>` : ''}`;
    b.querySelector('.cn-where').textContent = `${ch.title || 'Untitled'} · ${W.skip + 1} of ${hits.length} here · change ${W.fi + 1} of ${W.facts.length}`;
    b.querySelector('[data-cn="change"]').hidden = !now;
    b.querySelector('[data-cn="all"]').hidden = !now || hits.length - W.skip < 2;
  }
  function replaceHit(h, f) {
    const r = rangeOf(h), sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
    S.programmatic = true; try { document.execCommand('insertText', false, keepCase(h.word, f.now.trim())); } finally { S.programmatic = false; }
  }
  async function act(what) {
    if (!W || !W.cur) return;
    const { f } = W.cur;
    if (what === 'change') { replaceHit(W.cur.h, f); W.changed++; const re = regexFor(f); if (re && re.test(keepCase(W.cur.h.word, f.now.trim()))) W.skip++; }   // the new words contain the old: step past them
    else if (what === 'leave') { W.skip++; W.left++; }
    else if (what === 'all') {   // the rest in this chapter, from the end so places don't shift
      const hits = hitsIn(editor, f).slice(W.skip);
      for (const h of hits.slice().reverse()) replaceHit(h, f);
      W.changed += hits.length; W.ci++; W.skip = 0;
    } else if (what === 'next-ch') { W.ci++; W.skip = 0; }
    else if (what === 'stop') return stop(`Stopped. ${fmt(W.changed)} changed so far. Start again any time: the list is kept with the book.`);
    if (what === 'change' || what === 'all') { U.resyncWords && U.resyncWords(); U.scheduleSave(); U.updateCountsSoon && U.updateCountsSoon(); }
    await step();
  }
  function bar() {
    let b = document.getElementById('cn-bar'); if (b) b.remove();
    b = document.createElement('div'); b.id = 'cn-bar'; b.className = 'cn-bar';
    b.innerHTML = `<div class="cn-info"><div class="cn-what"></div><div class="cn-where"></div></div>
      <div class="cn-btns"><button class="btn small primary" data-cn="change" title="Change these words (Enter)">Change it</button><button class="btn small" data-cn="leave" title="Leave it as it is (Tab)">Leave it</button>
      <button class="btn small ghost" data-cn="all" title="Change every place left in this chapter">Change all here</button><button class="btn small ghost" data-cn="next-ch" title="Skip the rest of this chapter">Next chapter</button>
      <button class="icon-btn small" data-cn="stop" title="Stop the pass (Esc)">×</button></div>`;
    b.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    b.onclick = e => { const t = e.target.closest('[data-cn]'); if (t) act(t.dataset.cn); };
    document.body.appendChild(b);
  }
  // Enter / Tab / Esc while the bar is up and the words are still selected (typing anything else edits as normal)
  document.addEventListener('keydown', e => {
    if (!W || !W.cur || document.querySelector('.modal-back')) return;
    const sel = getSelection(), r = sel.rangeCount && sel.getRangeAt(0);
    const onHit = r && !r.collapsed && r.toString() === W.cur.h.word;
    if (e.key === 'Escape') { e.preventDefault(); act('stop'); }
    else if (onHit && e.key === 'Enter' && !e.shiftKey && (W.cur.f.now || '').trim()) { e.preventDefault(); e.stopImmediatePropagation(); act('change'); }
    else if (onHit && e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); act('leave'); }
  }, true);
  U.on('leave', () => { if (W) stop(); });
  { const b = document.getElementById('rp-cont'); if (b) b.onclick = () => open(); }
  return { open, walk, _test: { hitsIn, keepCase, regexFor } };
})();
