// Unwip - Read aloud. The computer's own voice (Windows, iPhone and iPad all have good ones, offline) reads the chapter,
// one sentence at a time, highlighting the sentence being read. Hearing your words is the best way to catch clunky lines.
// Suggested deletions (tracked changes) and footnote marks are skipped. Typing stops it.
window.UnwipRead = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, esc } = U;
  const synth = () => window.speechSynthesis;
  const LS = k => { try { return localStorage.getItem('unwip-read-' + k); } catch { return null; } };
  const SET = (k, v) => { try { localStorage.setItem('unwip-read-' + k, v); } catch {} };
  let sents = [], idx = 0, playing = false, bar = null, token = 0;
  let rate = +(LS('rate') || 1), voiceName = LS('voice') || '';

  // ---------------------------------------------------------------- the sentences on the page, as ranges
  function collect() {
    const out = [];
    for (const block of [...editor.children]) {
      if (!/^(P|H1|H2|H3|BLOCKQUOTE)$/.test(block.tagName)) continue;
      const pieces = []; let text = '';
      const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.parentElement.closest('del.tc-del, sup.fn')) continue;
        pieces.push({ n, start: text.length }); text += n.data;
      }
      if (!text.trim()) continue;
      const re = /[^.!?…]+(?:[.!?…]+["”’)\]]*|$)\s*/g; let m;
      while ((m = re.exec(text))) {
        if (!m[0].trim()) { if (m[0] === '') re.lastIndex++; continue; }
        const a = m.index + (m[0].length - m[0].trimStart().length), b = m.index + m[0].trimEnd().length;
        const r = document.createRange(), at = off => { let p = pieces[0]; for (const q of pieces) { if (q.start <= off) p = q; else break; } return [p.n, Math.min(p.n.length, off - p.start)]; };
        try { r.setStart(...at(a)); r.setEnd(...at(b)); } catch { continue; }
        out.push({ range: r, text: text.slice(a, b).replace(/\s+([.,!?;:”’])/g, '$1').replace(/\s{2,}/g, ' '), block });
      }
    }
    return out;
  }
  // where to begin: the sentence the cursor is in (or the selection starts in)
  function startIndex() {
    const sel = getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) {
      const c = sel.getRangeAt(0), n = c.startContainer, o = c.startOffset;
      const i = sents.findIndex(s => { try { return s.range.isPointInRange(n, o) || s.range.comparePoint(n, o) < 0; } catch { return false; } });
      if (i >= 0) return i;
    }
    return 0;
  }

  // ---------------------------------------------------------------- speaking
  function voice() {
    const vs = synth().getVoices();
    return vs.find(v => v.name === voiceName) || vs.find(v => /^en[-_](AU|GB)/i.test(v.lang) && /natural|online|neural/i.test(v.name)) || vs.find(v => /^en/i.test(v.lang) && v.default) || vs.find(v => /^en/i.test(v.lang)) || vs[0] || null;
  }
  function speak() {
    const my = ++token;
    if (idx >= sents.length) { stop(); U.toast('That’s the end of the chapter.'); return; }
    const s = sents[idx];
    highlight(s);
    const u = new SpeechSynthesisUtterance(s.text.replace(/[“”]/g, '"'));
    const v = voice(); if (v) { try { u.voice = v; } catch {} u.lang = v.lang; }
    u.rate = rate;
    u.onend = () => { if (my !== token || !playing) return; idx++; speak(); };
    u.onerror = e => { if (my !== token || !playing) return; if (e.error === 'interrupted' || e.error === 'canceled') return; idx++; speak(); };
    synth().speak(u);
    render();
  }
  function highlight(s) {
    try { if (window.Highlight && CSS.highlights) CSS.highlights.set('unwip-read', new Highlight(s.range)); } catch {}
    const r = s.range.getBoundingClientRect(), w = U.editorWrap.getBoundingClientRect();
    if (r.top < w.top + 60 || r.bottom > w.bottom - 120) U.editorWrap.scrollTo({ top: U.editorWrap.scrollTop + r.top - w.top - w.height * 0.35, behavior: 'smooth' });
  }
  function start(from) {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    if (!synth() || !window.SpeechSynthesisUtterance) { U.toast('This device doesn’t have a reading voice.', 'warn'); return; }
    sents = collect();
    if (!sents.length) { U.toast('Nothing to read in this chapter yet.'); return; }
    idx = from != null ? from : startIndex();
    playing = true; synth().cancel(); showBar(); speak();
  }
  function pause() { playing = false; token++; synth().cancel(); render(); }
  function resume() { if (!sents.length) return start(); playing = true; synth().cancel(); speak(); }
  function stop() {
    playing = false; token++; try { synth().cancel(); } catch {}
    try { CSS.highlights.delete('unwip-read'); } catch {}
    if (bar) { bar.remove(); bar = null; }
    sents = [];
    const lb = document.getElementById('btn-listen'); if (lb) lb.classList.remove('on');
  }
  const jump = d => { idx = Math.max(0, Math.min(sents.length - 1, idx + d)); if (playing) { synth().cancel(); speak(); } else { highlight(sents[idx]); render(); } };
  const toggle = () => bar ? (playing ? pause() : resume()) : start();

  // ---------------------------------------------------------------- the little player
  const ICON = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-6 6 6 6M11 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l6 6-6 6M13 6l6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  function showBar() {
    if (bar) return render();
    bar = document.createElement('div'); bar.className = 'ra-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Read aloud');
    bar.innerHTML = `<button class="ra-b" data-a="prev" title="Previous sentence">${ICON.prev}</button><button class="ra-b ra-play" data-a="play"></button><button class="ra-b" data-a="next" title="Next sentence">${ICON.next}</button>
      <span class="ra-pos"></span>
      <select class="ra-rate" title="Speed">${[0.8, 0.9, 1, 1.1, 1.25, 1.5].map(r => `<option value="${r}" ${r === rate ? 'selected' : ''}>${r}×</option>`).join('')}</select>
      <select class="ra-voice" title="Voice"></select>
      <button class="ra-b" data-a="stop" title="Stop reading (Esc)">${ICON.x}</button>`;
    document.body.appendChild(bar);
    bar.addEventListener('mousedown', e => { if (!e.target.closest('select')) e.preventDefault(); });
    bar.addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; ({ prev: () => jump(-1), next: () => jump(1), play: () => (playing ? pause() : resume()), stop })[b.dataset.a](); });
    $('.ra-rate', bar).onchange = e => { rate = +e.target.value; SET('rate', rate); if (playing) { synth().cancel(); speak(); } };
    $('.ra-voice', bar).onchange = e => { voiceName = e.target.value; SET('voice', voiceName); if (playing) { synth().cancel(); speak(); } };
    fillVoices(); render();
  }
  function fillVoices() {
    if (!bar) return;
    const vs = synth().getVoices(), cur = voice(), sel = $('.ra-voice', bar);
    const en = vs.filter(v => /^en/i.test(v.lang)), list = en.length ? en : vs;
    sel.innerHTML = list.map(v => `<option value="${esc(v.name)}" ${cur && v.name === cur.name ? 'selected' : ''}>${esc(v.name.replace(/^Microsoft\s+|\s+-\s+.*$|\s*\(.*\)$/g, ''))}</option>`).join('') || '<option>Default voice</option>';
    sel.hidden = list.length < 2;
  }
  if (window.speechSynthesis) speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', fillVoices);
  function render() {
    if (!bar) return;
    { const lb = document.getElementById('btn-listen'); if (lb) lb.classList.add('on'); }
    const p = $('.ra-play', bar); p.innerHTML = playing ? ICON.pause : ICON.play; p.title = playing ? 'Pause (F8)' : 'Read (F8)';
    $('.ra-pos', bar).textContent = sents.length ? `${idx + 1} / ${sents.length}` : '';
  }

  // stop when you start typing, change chapter or leave
  editor.addEventListener('beforeinput', () => { if (bar) stop(); });
  U.on('doc', () => { if (bar) stop(); });
  U.on('leave', () => { if (bar) stop(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'F8' && S.docId) { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape' && bar && !document.querySelector('.modal-back, .cmdk-back')) stop();
  });
  return { start, stop, pause, resume, toggle, get playing() { return playing; }, get index() { return idx; }, get count() { return sents.length; }, sentences: () => sents.map(s => s.text) };
})();
