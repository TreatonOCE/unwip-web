// Unwip - Dialogue view. Fades everything except the dialogue (or everything except the narration) so you can
// read a chapter's conversation on its own, or check the description without the talking. Can also pick out
// one character's lines, guessed from the names on your Characters sheets ("said Maz", "Anna asked").
// Nothing on the page is changed: it's a highlight drawn over the text, like Find.
window.UnwipDialogue = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, S, editor, esc } = U;
  const st = { on: false, mode: 'dialogue', who: '', compact: false };
  let bar = null, styleEl = null, timer = 0, last = null;
  const LS = k => { try { return localStorage.getItem('unwip-dv-' + k); } catch { return null; } };
  const SET = (k, v) => { try { localStorage.setItem('unwip-dv-' + k, v); } catch {} };
  st.compact = LS('compact') === '1';

  // ---------------------------------------------------------------- finding the dialogue
  // text of each paragraph, with a way back from a character offset to a DOM position
  function blocks() {
    const out = [];
    [...editor.children].forEach((el, i) => {
      if (!/^(P|BLOCKQUOTE|LI|UL|OL)$/.test(el.tagName) || el.classList.contains('scene')) return;
      const pieces = []; let text = '';
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (n.parentElement.closest('del.tc-del, sup.fn')) continue;
        pieces.push({ n, start: text.length }); text += n.data;
      }
      if (text.trim()) out.push({ el, index: i, text, pieces });
    });
    return out;
  }
  function rangeOf(b, a, z) {
    const at = off => { let p = b.pieces[0]; for (const q of b.pieces) { if (q.start <= off) p = q; else break; } return [p.n, Math.min(p.n.length, off - p.start)]; };
    const r = document.createRange();
    try { r.setStart(...at(a)); r.setEnd(...at(z)); return r; } catch { return null; }
  }
  // which quote marks does this chapter use for speech? “double” (US) or ‘single’ (UK)
  function quoteStyle(list) {
    let dbl = 0, sgl = 0;
    for (const b of list) {
      dbl += (b.text.match(/[“"]/g) || []).length;
      sgl += (b.text.match(/(^|[\s(\[—–-])‘(?=\S)/g) || []).length;
    }
    return sgl > dbl ? 'single' : 'double';
  }
  // spans [a, z) of speech in a paragraph. A speech left open runs to the end of the paragraph
  // (that's how a long speech carries over several paragraphs).
  function speechIn(text, style) {
    const spans = [];
    if (style === 'double') {
      let open = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (c === '“' && open < 0) open = i;
        else if (c === '”' && open >= 0) { spans.push([open, i + 1]); open = -1; }
        else if (c === '"') { if (open < 0) open = i; else { spans.push([open, i + 1]); open = -1; } }
      }
      if (open >= 0) spans.push([open, text.length]);
    } else {
      let open = -1;
      for (let i = 0; i < text.length; i++) {
        const c = text[i], prev = text[i - 1] || ' ', next = text[i + 1] || ' ';
        if (c === '‘' && open < 0 && /[\s(\[—–-]/.test(prev) && /\S/.test(next)) open = i;
        else if (c === '’' && open >= 0 && /\S/.test(prev) && !/[A-Za-z0-9À-ɏ]/.test(next)) {
          // "the dogs’ bowls" - a plural possessive mid-speech; only close if what follows looks like the end of a line
          if (/s/i.test(prev) && /\s/.test(next) && /^[a-z]/.test(text.slice(i + 2, i + 3)) && !/^(said|asked|says|asks|replied|whispered|shouted|called|muttered|cried|told|added|he|she|they|i|we|you|it)\b/i.test(text.slice(i + 2))) continue;
          spans.push([open, i + 1]); open = -1;
        }
      }
      if (open >= 0) spans.push([open, text.length]);
    }
    return spans;
  }

  // ---------------------------------------------------------------- who is speaking (a guess)
  function cast() {
    const list = [];
    for (const e of (window.FolioNames && window.FolioNames.entries) || []) {
      if (e.kind !== 'Character' || !e.text || e.text.length < 2) continue;
      list.push({ re: new RegExp('(^|[^\\p{L}])' + e.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}])', 'gu'), name: e.primary || e.text, sheetId: e.sheetId });
    }
    // first-person books: "I said", "I shrugged. “No.”" - the narrator is speaking
    list.push({ re: /(^|[^\p{L}])I(?![\p{L}])/gu, name: 'Me (narrator)', first: true });
    return list;
  }
  const SAID = /\b(said|says|asked|asks|replied|whispered|shouted|called|muttered|cried|answered|snapped|murmured|added|told|yelled|hissed|sighed|laughed|began|continued|insisted)\b/i;
  // a speaker for each piece of speech: a name tagged next to it ("said Maz") in the narration between this
  // speech and the next, otherwise whoever the paragraph is about
  function speakersOf(text, spans, people) {
    if (!people.length) return spans.map(() => '');
    let narr = text; for (const [a, z] of spans) narr = narr.slice(0, a) + ' '.repeat(z - a) + narr.slice(z);
    const found = [];
    for (const p of people) {
      p.re.lastIndex = 0; let m;
      while ((m = p.re.exec(narr))) {
        const at = m.index + m[1].length;
        found.push({ at, name: p.name, first: p.first, tagged: SAID.test(narr.slice(Math.max(0, at - 18), at + m[0].length + 18)) });
      }
    }
    if (!found.length) return spans.map(() => '');
    const score = (f, list) => Math.min(...list.map(([a, z]) => f.at >= z ? f.at - z : a - f.at - 1)) - (f.tagged ? 1000 : 0) + (f.first ? 25 : 0);
    const pick = (cands, list) => cands.reduce((b, f) => { const sc = score(f, list); return !b || sc < b.sc ? { sc, name: f.name } : b; }, null);
    const whole = pick(found, spans).name;
    return spans.map(([a, z], j) => {
      const from = j ? spans[j - 1][1] : 0, to = j < spans.length - 1 ? spans[j + 1][0] : text.length;
      const near = found.filter(f => f.tagged && f.at >= from && f.at < to);
      return near.length ? pick(near, [[a, z]]).name : whole;
    });
  }

  function analyse() {
    const list = blocks(), style = quoteStyle(list), people = cast();
    let words = 0, speechWords = 0, lines = 0;
    const out = [];
    const wc = s => (s.match(/[\p{L}\p{N}’']+/gu) || []).length;
    for (const b of list) {
      const spans = speechIn(b.text, style);
      let whos = [], guess = false;
      if (spans.length) {
        whos = speakersOf(b.text, spans, people);
        // back-and-forth with no tags: the speaker two lines up, if the line in between was someone else
        if (!whos.some(Boolean) && out.length >= 2) {
          const p1 = out[out.length - 1], p2 = out[out.length - 2];
          if (p1.spans.length && p2.spans.length && p2.who && p1.who && p1.who !== p2.who) { whos = spans.map(() => p2.who); guess = true; }
        }
        lines++;
      }
      words += wc(b.text);
      for (const [a, z] of spans) speechWords += wc(b.text.slice(a, z));
      out.push({ ...b, spans, whos, who: whos[whos.length - 1] || '', guess });
    }
    const speakers = {};
    for (const b of out) for (const k of new Set(b.whos.map(w => w || '?'))) speakers[k] = (speakers[k] || 0) + 1;
    return { blocks: out, words, speechWords, lines, speakers, style };
  }

  // ---------------------------------------------------------------- drawing it
  function paint() {
    if (!st.on) return;
    const a = last = analyse();
    const dim = [];
    const keepIdx = new Set();
    for (const b of a.blocks) {
      const mine = j => !(st.mode === 'dialogue' && st.who) || (st.who === '?' ? !b.whos[j] : b.whos[j] === st.who);
      // dim the complement of what we're showing
      let cur = 0; const show = [];
      if (st.mode === 'dialogue') b.spans.forEach((sp, j) => { if (mine(j)) show.push(sp); });
      else { for (const [x, y] of b.spans) { if (x > cur) show.push([cur, x]); cur = y; } if (cur < b.text.length) show.push([cur, b.text.length]); }
      if (show.some(([x, y]) => b.text.slice(x, y).trim())) keepIdx.add(b.index);
      cur = 0;
      for (const [x, y] of show) { if (x > cur) dim.push([b, cur, x]); cur = y; }
      if (cur < b.text.length) dim.push([b, cur, b.text.length]);
    }
    try {
      if (window.Highlight && CSS.highlights) {
        const h = new Highlight();
        for (const [b, x, y] of dim) { const r = rangeOf(b, x, y); if (r) h.add(r); }
        CSS.highlights.set('unwip-dv', h);
      }
    } catch {}
    // "only these paragraphs": hide the others (nothing is removed - just not shown)
    if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'dv-style'; document.head.appendChild(styleEl); }
    const hide = [];
    if (st.compact) [...editor.children].forEach((el, i) => { if (!keepIdx.has(i) && !/^H[1-3]$/.test(el.tagName)) hide.push(i + 1); });
    styleEl.textContent = hide.length ? hide.map(n => `#editor > :nth-child(${n})`).join(',') + '{display:none}' : '';
    editor.classList.toggle('dv-hiding', !!hide.length);
    render();
  }
  function soon() { clearTimeout(timer); timer = setTimeout(paint, 350); }

  function render() {
    if (!bar) {
      bar = document.createElement('div'); bar.className = 'dv-bar'; bar.id = 'dv-bar';
      bar.addEventListener('mousedown', e => { if (!e.target.closest('select')) e.preventDefault(); });
      document.body.appendChild(bar);
    }
    const a = last || { lines: 0, words: 0, speechWords: 0, speakers: {} };
    const pct = a.words ? Math.round(a.speechWords / a.words * 100) : 0;
    const sp = Object.entries(a.speakers).sort((x, y) => y[1] - x[1]);
    if (st.who && !a.speakers[st.who]) st.who = '';
    bar.innerHTML = `
      <div class="dv-seg"><button data-m="dialogue" class="${st.mode === 'dialogue' ? 'on' : ''}">Dialogue</button><button data-m="narration" class="${st.mode === 'narration' ? 'on' : ''}">Narration</button></div>
      <select class="dv-who" title="Show one character’s lines (a guess, from names near the speech)" ${st.mode !== 'dialogue' || !sp.length ? 'disabled' : ''}>
        <option value="">Everyone</option>
        ${sp.map(([k, n]) => `<option value="${esc(k)}" ${st.who === k ? 'selected' : ''}>${k === '?' ? 'Not sure who' : esc(k)} (${n})</option>`).join('')}
      </select>
      <label class="dv-compact" title="Hide the paragraphs that don’t have any"><input type="checkbox" ${st.compact ? 'checked' : ''}> Only these<span class="dv-long"> paragraphs</span></label>
      <span class="dv-stat" title="${a.lines} paragraphs with speech · ${a.speechWords.toLocaleString()} of ${a.words.toLocaleString()} words">${pct}% dialogue</span>
      <button class="dv-x" title="Back to normal (Esc)" aria-label="Close">×</button>`;
    bar.querySelectorAll('.dv-seg button').forEach(b => b.onclick = () => { st.mode = b.dataset.m; if (st.mode !== 'dialogue') st.who = ''; paint(); });
    bar.querySelector('.dv-who').onchange = e => { st.who = e.target.value; paint(); };
    bar.querySelector('.dv-compact input').onchange = e => { st.compact = e.target.checked; SET('compact', st.compact ? '1' : '0'); paint(); };
    bar.querySelector('.dv-x').onclick = () => off();
  }

  function on(mode) {
    if (!S.docId) return U.toast('Open a chapter first.');
    if (mode) st.mode = mode;
    st.on = true; document.documentElement.classList.add('dv-on');
    paint();
    const a = last;
    if (a && !a.lines) U.toast('No dialogue found in this chapter (looking for “quote marks”).');
  }
  function off() {
    st.on = false; st.who = ''; clearTimeout(timer);
    document.documentElement.classList.remove('dv-on');
    try { CSS.highlights && CSS.highlights.delete('unwip-dv'); } catch {}
    if (styleEl) styleEl.textContent = '';
    editor.classList.remove('dv-hiding');
    if (bar) { bar.remove(); bar = null; }
  }
  function toggle(mode) { if (st.on && (!mode || mode === st.mode)) off(); else on(mode); }

  editor.addEventListener('input', () => { if (st.on) soon(); });
  U.on('doc', () => { if (st.on) { st.who = ''; setTimeout(paint, 30); } });
  U.on('leave', off);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === 'KeyD') { e.preventDefault(); toggle(); return; }
    if (e.key === 'Escape' && st.on && !document.querySelector('.modal-back, .cmdk-back')) off();
  }, true);

  return { toggle, on, off, analyse, speechIn, active: () => st.on, state: st };
})();
