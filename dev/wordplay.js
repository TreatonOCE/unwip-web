// Unwip - word games in Play: Word guess (five letters, six tries, no timer), Which word? (match words and
// meanings), a thesaurus, and My words (words you saved to learn, shared between devices as settings.wordList).
// The words and meanings come from WordNet 3.0 (app/words-data.js, built by tools/words/make.py). That file is
// big (about 3 MB), so it only loads the first time a word game is opened.
window.UnwipWords = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, api } = U;
  const POS = { n: 'noun', v: 'verb', a: 'adjective', r: 'adverb' };
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const show = w => w.replace(/_/g, ' ');

  // ---------------------------------------------------------------- the word data, loaded once when needed
  let D = null, loading = null, FIVE = null;
  function load() {
    if (D) return Promise.resolve(D);
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      if (window.UnwipWordData) return res();
      const s = document.createElement('script'); s.src = 'words-data.js';
      s.onload = () => res(); s.onerror = () => { loading = null; rej(new Error('The word list didn’t load.')); };
      document.head.appendChild(s);
    }).then(() => { D = window.UnwipWordData; FIVE = new Set(D.five); return D; });
    return loading;
  }
  const senses = w => (D.w[w] || []).map(i => D.s[i]);
  // finds the dictionary form: "running" -> run, "wolves" -> wolf, "happier" -> happy
  function base(w) {
    w = String(w || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[’']/g, "'");
    if (D.w[w]) return w;
    const tries = [];
    const add = (re, to) => { if (re.test(w)) tries.push(w.replace(re, to)); };
    add(/ies$/, 'y'); add(/ves$/, 'f'); add(/ves$/, 'fe'); add(/es$/, ''); add(/s$/, '');
    add(/ied$/, 'y'); add(/ed$/, ''); add(/ed$/, 'e'); add(/([^aeiou])\1ed$/, '$1');
    add(/ing$/, ''); add(/ing$/, 'e'); add(/([^aeiou])\1ing$/, '$1');
    add(/ier$/, 'y'); add(/iest$/, 'y'); add(/er$/, ''); add(/est$/, ''); add(/er$/, 'e'); add(/est$/, 'e'); add(/ly$/, '');
    return tries.find(t => D.w[t]) || null;
  }
  const isGuess = g => FIVE.has(g) || (/^[a-z]{5}$/.test(g) && (!!D.w[g] || !!base(g)));

  // ---------------------------------------------------------------- my words (settings.wordList, shared)
  const mine = () => (U.S.settings && U.S.settings.wordList) || [];
  const isMine = w => mine().some(x => x.w === w);
  async function save(w, on = true) {
    const list = mine().filter(x => x.w !== w);
    if (on) list.unshift({ w, at: Date.now() });
    try { U.S.settings = await api.setSettings({ wordList: list.slice(0, 500) }); } catch {}
    U.toast(on ? `“${show(w)}” saved to My words` : `“${show(w)}” removed from My words`);
  }

  // small per-device scores (not important enough to sync)
  const stats = () => { try { return JSON.parse(localStorage.getItem('unwip-word-stats')) || {}; } catch { return {}; } };
  const setStats = s => { try { localStorage.setItem('unwip-word-stats', JSON.stringify(s)); } catch {} };

  // ---------------------------------------------------------------- the screen
  let box = null, ctx = null, mode = 'guess', keyH = null;
  try { mode = localStorage.getItem('unwip-word-mode') || 'guess'; } catch {}
  const MODES = [['guess', '🟩', 'Word guess'], ['which', '🧩', 'Which word?'], ['thes', '📚', 'Thesaurus'], ['mine', '⭐', 'My words']];

  async function view(b, c) {
    box = b; ctx = c;
    box.innerHTML = `${ctx.back}<div class="pl-head"><div><h1>Word games</h1><p>Learn new words and find better ones. No timer, no pressure. Meanings come from WordNet, a free English dictionary.</p></div></div>
      <div class="wd-tabs" role="tablist">${MODES.map(([k, ic, name]) => `<button class="chip" role="tab" data-wm="${k}">${ic} ${name}</button>`).join('')}</div>
      <div class="wd-body"><p class="wd-loading">Loading the word list…</p></div>`;
    ctx.wireHome(box);
    $$('[data-wm]', box).forEach(t => t.onclick = () => go(t.dataset.wm));
    try { await load(); } catch (e) { $('.wd-body', box).innerHTML = `<p class="wd-loading">${esc(e.message)} Check your connection and try again.</p>`; return; }
    if (!box.isConnected) return;
    go(c.mode || mode, c.arg);
  }
  function go(m, arg) {
    mode = m; try { localStorage.setItem('unwip-word-mode', m); } catch {}
    $$('[data-wm]', box).forEach(t => { t.classList.toggle('on', t.dataset.wm === m); t.setAttribute('aria-selected', t.dataset.wm === m); });
    const body = $('.wd-body', box);
    if (keyH) { document.removeEventListener('keydown', keyH); keyH = null; }
    ({ guess: guessView, which: whichView, thes: thesView, mine: mineView })[m](body, arg);
  }
  const alive = el => el.isConnected && !el.closest('.hidden');

  // a word's meanings, with its other words clickable (opens the thesaurus)
  function meaningsHTML(w, max = 4) {
    const ss = senses(w).slice(0, max);
    return `<ol class="wd-means">${ss.map(([p, def, words]) => { const syn = words.filter(x => x !== w); return `<li><i>${POS[p]}</i> ${esc(def)}${syn.length ? `<div class="wd-syn">${syn.slice(0, 8).map(x => `<button class="wd-chip" data-look="${esc(x)}">${esc(show(x))}</button>`).join('')}</div>` : ''}</li>`; }).join('')}</ol>`;
  }
  function wordActs(w) {
    return `<div class="wd-acts"><button class="btn ghost" data-save="${esc(w)}">${isMine(w) ? '★ In My words' : '☆ Save to My words'}</button><button class="btn ghost" data-write="${esc(w)}">✍️ Write a sentence with it</button></div>`;
  }
  function wireWords(el) {
    $$('[data-look]', el).forEach(b => b.onclick = () => go('thes', b.dataset.look));
    $$('[data-save]', el).forEach(b => b.onclick = async () => { const w = b.dataset.save, on = !isMine(w); await save(w, on); b.textContent = on ? '★ In My words' : '☆ Save to My words'; });
    $$('[data-write]', el).forEach(b => b.onclick = () => write([b.dataset.write]));
  }
  function write(words) {
    const ws = words.map(show);
    const def = words.length === 1 && senses(words[0])[0] ? ` (${senses(words[0])[0][1]})` : '';
    ctx.write({ kind: 'word', vocab: words, title: words.length === 1 ? `Using “${ws[0]}”` : `Using ${ws.length} new words`,
      prompt: words.length === 1 ? `Write a few sentences that use “${ws[0]}”${def}.` : `Write a scene that uses all of these: ${ws.join(', ')}.` });
  }

  // ---------------------------------------------------------------- Word guess
  function guessView(body) {
    const st = stats();
    const recent = st.recent || [];
    const pool = D.answers.filter(w => !recent.includes(w));
    const answer = pick(pool.length ? pool : D.answers);
    const rows = [], marks = [];
    let cur = '', done = false, hint = false;
    const keys = {};   // letter -> best colour so far
    body.innerHTML = `<div class="wd-game">
      <div class="wd-score"><span>Played <b>${st.played || 0}</b></span><span>Won <b>${st.won || 0}</b></span><span>Streak <b>${st.streak || 0}</b></span></div>
      <p class="wd-help">Guess the five-letter word in six tries. <span class="wd-k g">green</span> right letter, right place. <span class="wd-k y">gold</span> in the word, wrong place. <span class="wd-k x">grey</span> not in the word.</p>
      <div class="wd-board" aria-live="polite"></div>
      <div class="wd-under"><button class="btn ghost small" id="wd-hint">💡 Show the meaning</button><button class="btn ghost small" id="wd-give">Give up</button></div>
      <div class="wd-hinttext hidden"></div>
      <div class="wd-kb"></div>
      <div class="wd-end hidden"></div></div>`;
    const board = $('.wd-board', body), kb = $('.wd-kb', body);
    function score(g) {
      const res = Array(5).fill('x'), left = {};
      for (let i = 0; i < 5; i++) if (g[i] === answer[i]) res[i] = 'g'; else left[answer[i]] = (left[answer[i]] || 0) + 1;
      for (let i = 0; i < 5; i++) if (res[i] !== 'g' && left[g[i]]) { res[i] = 'y'; left[g[i]]--; }
      return res;
    }
    function draw(shake) {
      board.innerHTML = [...Array(6)].map((_, r) => {
        const g = r < rows.length ? rows[r] : r === rows.length ? cur : '', m = marks[r];
        return `<div class="wd-row ${shake && r === rows.length ? 'shake' : ''}">${[...Array(5)].map((_, i) => `<span class="wd-tile ${m ? m[i] : g[i] ? 'typed' : ''}">${g[i] ? g[i].toUpperCase() : ''}</span>`).join('')}</div>`;
      }).join('');
      kb.innerHTML = ['qwertyuiop', 'asdfghjkl', '⏎zxcvbnm⌫'].map(row => `<div>${[...row].map(k => k === '⏎' ? '<button class="wd-key wide" data-k="enter">Enter</button>' : k === '⌫' ? '<button class="wd-key wide" data-k="back" aria-label="Delete">⌫</button>' : `<button class="wd-key ${keys[k] || ''}" data-k="${k}">${k.toUpperCase()}</button>`).join('')}</div>`).join('');
    }
    function press(k) {
      if (done) return;
      if (k === 'back') cur = cur.slice(0, -1);
      else if (k === 'enter') {
        if (cur.length < 5) { draw(true); U.toast('Five letters, please.'); return; }
        if (!isGuess(cur)) { draw(true); U.toast(`“${cur.toUpperCase()}” isn’t in the word list.`); return; }
        const m = score(cur); rows.push(cur); marks.push(m);
        m.forEach((c, i) => { const L = cur[i], was = keys[L]; if (c === 'g' || (c === 'y' && was !== 'g') || !was) keys[L] = c; });
        const won = cur === answer; cur = '';
        if (won || rows.length === 6) return finish(won);
      } else if (/^[a-z]$/.test(k) && cur.length < 5) cur += k;
      draw();
    }
    function finish(won, gaveUp) {
      done = true; draw();
      const s = stats(); s.played = (s.played || 0) + 1;
      if (won) { s.won = (s.won || 0) + 1; s.streak = (s.streak || 0) + 1; s.best = Math.max(s.best || 0, s.streak); } else s.streak = 0;
      s.recent = [answer, ...(s.recent || [])].slice(0, 200); setStats(s);
      const end = $('.wd-end', body); end.classList.remove('hidden');
      $('.wd-under', body).classList.add('hidden'); $('.wd-hinttext', body).classList.add('hidden'); kb.classList.add('hidden');
      end.innerHTML = `<div class="wd-card"><div class="wd-result">${won ? `🎉 Got it in ${rows.length}${rows.length === 1 ? '. Wow.' : '!'}` : gaveUp ? 'The word was' : 'So close. The word was'}</div>
        <h2 class="wd-word">${esc(show(answer))}</h2>${meaningsHTML(answer)}${wordActs(answer)}
        <div class="wd-acts"><button class="btn primary" id="wd-next">Next word ↻</button></div></div>`;
      wireWords(end);
      $('#wd-next', end).onclick = () => guessView(body);
      $('#wd-next', end).focus({ preventScroll: true }); end.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    kb.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) press(b.dataset.k); });
    $('#wd-hint', body).onclick = () => {
      hint = !hint; const t = $('.wd-hinttext', body);
      const s = senses(answer)[0];
      t.innerHTML = s ? `<i>${POS[s[0]]}</i> ${esc(s[1])}` : 'No meaning for this one.';
      t.classList.toggle('hidden', !hint); $('#wd-hint', body).textContent = hint ? '💡 Hide the meaning' : '💡 Show the meaning';
    };
    $('#wd-give', body).onclick = () => { if (!done) finish(false, true); };
    keyH = e => {
      if (!alive(body)) { document.removeEventListener('keydown', keyH); keyH = null; return; }
      if (e.ctrlKey || e.metaKey || e.altKey || done) return;
      if (e.target.closest && e.target.closest('input, textarea, [contenteditable="true"], .modal-back')) return;
      const k = e.key === 'Enter' ? 'enter' : e.key === 'Backspace' ? 'back' : e.key.length === 1 ? e.key.toLowerCase() : '';
      if (k === 'enter' || k === 'back' || /^[a-z]$/.test(k)) { e.preventDefault(); press(k); }
    };
    document.addEventListener('keydown', keyH);
    draw();
  }

  // ---------------------------------------------------------------- Which word?
  let byPos = null;
  function posPools() {
    if (byPos) return byPos;
    byPos = { n: [], v: [], a: [], r: [] };
    for (const w of D.learn) { const s = senses(w)[0]; if (s) byPos[s[0]].push(w); }
    return byPos;
  }
  function whichView(body, arg) {
    const st = stats();
    let reverse = !!st.whichReverse, practise = arg === 'mine' && mine().length > 0, streak = 0;
    function round() {
      const P = posPools();
      const own = mine().map(x => x.w).filter(w => senses(w).length);
      const target = practise && own.length ? pick(own) : pick(D.learn);
      const ss = senses(target), sense = ss.find(s => P[s[0]].length > 20) || ss[0];
      const pool = P[sense[0]].length > 20 ? P[sense[0]] : D.learn;
      const others = [];
      while (others.length < 3) { const o = pick(pool); if (o !== target && !others.includes(o) && !sense[2].includes(o)) others.push(o); }
      const opts = shuffle([target, ...others]);
      const meaning = w => w === target ? sense[1] : (senses(w).find(s => s[0] === sense[0]) || senses(w)[0])[1];
      body.innerHTML = `<div class="wd-game">
        <div class="wd-score"><span>Streak <b>${streak}</b></span><span>Best <b>${stats().whichBest || 0}</b></span>
          <label class="check small"><input type="checkbox" id="wd-rev" ${reverse ? 'checked' : ''}> Show the word, pick the meaning</label>
          ${own.length ? `<label class="check small"><input type="checkbox" id="wd-own" ${practise ? 'checked' : ''}> Only My words</label>` : ''}</div>
        <div class="wd-card">
          <div class="wd-q-label">${reverse ? 'What does this word mean?' : 'Which word means…'}</div>
          ${reverse ? `<h2 class="wd-word">${esc(show(target))} <i class="wd-pos">${POS[sense[0]]}</i></h2>` : `<p class="wd-q"><i>${POS[sense[0]]}</i> ${esc(sense[1])}</p>`}
          <div class="wd-opts ${reverse ? 'long' : ''}">${opts.map(o => `<button class="wd-opt" data-o="${esc(o)}">${esc(reverse ? meaning(o) : show(o))}</button>`).join('')}</div>
          <div class="wd-after hidden"></div></div></div>`;
      $('#wd-rev', body).onchange = e => { reverse = e.target.checked; const s = stats(); s.whichReverse = reverse; setStats(s); round(); };
      const ow = $('#wd-own', body); if (ow) ow.onchange = e => { practise = e.target.checked; round(); };
      $$('.wd-opt', body).forEach(b => b.onclick = () => {
        if (body.querySelector('.wd-opt[disabled]')) return;
        const right = b.dataset.o === target;
        $$('.wd-opt', body).forEach(x => { x.disabled = true; if (x.dataset.o === target) x.classList.add('right'); });
        if (!right) b.classList.add('wrong');
        streak = right ? streak + 1 : 0;
        const s = stats(); s.whichBest = Math.max(s.whichBest || 0, streak); setStats(s);
        $('.wd-score b', body).textContent = streak;
        const after = $('.wd-after', body); after.classList.remove('hidden');
        after.innerHTML = `<div class="wd-result">${right ? (streak > 2 ? `✓ Right! ${streak} in a row.` : '✓ Right!') : '✗ Not quite. It’s this one:'}</div>
          <h3 class="wd-word small">${esc(show(target))}</h3>${meaningsHTML(target, 3)}${wordActs(target)}
          <div class="wd-acts"><button class="btn primary" id="wd-next">Next ↻</button></div>`;
        wireWords(after);
        $('#wd-next', after).onclick = round; $('#wd-next', after).focus({ preventScroll: true }); after.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
    round();
  }

  // ---------------------------------------------------------------- Thesaurus
  function thesView(body, q) {
    body.innerHTML = `<div class="wd-game wide"><form class="wd-find"><input type="search" id="wd-q" placeholder="Look up a word: bright, walk, angry…" aria-label="Look up a word" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary">Look up</button></form>
      <div class="wd-results"><p class="wd-help">Type a word to see its meanings and other words for it. Click any of those to look that one up too.</p></div></div>`;
    const inp = $('#wd-q', body), out = $('.wd-results', body);
    function look(word) {
      const raw = String(word || '').trim(); if (!raw) return;
      inp.value = show(raw.toLowerCase());
      const w = base(raw);
      if (!w) {
        const near = Object.keys(D.w).filter(k => k.startsWith(raw.toLowerCase().slice(0, 4))).slice(0, 12);
        out.innerHTML = `<p class="wd-help">No “${esc(raw)}” in the dictionary.${near.length ? ' Did you mean:' : ''}</p>${near.length ? `<div class="wd-syn">${near.map(x => `<button class="wd-chip" data-look="${esc(x)}">${esc(show(x))}</button>`).join('')}</div>` : ''}`;
        wireWords(out); return;
      }
      const groups = {};
      for (const s of senses(w)) (groups[s[0]] = groups[s[0]] || []).push(s);
      out.innerHTML = `<div class="wd-card"><h2 class="wd-word">${esc(show(w))}</h2>${w !== raw.toLowerCase().replace(/\s+/g, '_') ? `<p class="wd-help">Showing “${esc(show(w))}”, the dictionary form.</p>` : ''}
        ${Object.entries(groups).map(([p, ss]) => `<h4 class="wd-posh">${POS[p]}</h4><ol class="wd-means">${ss.map(([, def, words]) => { const syn = words.filter(x => x !== w); return `<li>${esc(def)}${syn.length ? `<div class="wd-syn">${syn.map(x => `<button class="wd-chip" data-look="${esc(x)}">${esc(show(x))}</button>`).join('')}</div>` : ''}</li>`; }).join('')}</ol>`).join('')}
        ${wordActs(w)}</div>`;
      wireWords(out);
      $$('[data-look]', out).forEach(b => b.onclick = () => { look(b.dataset.look); box.scrollTop = 0; });
    }
    $('.wd-find', body).onsubmit = e => { e.preventDefault(); look(inp.value); };
    if (q) look(q); else if (!matchMedia('(pointer: coarse)').matches) inp.focus();
  }

  // ---------------------------------------------------------------- My words
  function mineView(body) {
    const list = mine();
    body.innerHTML = `<div class="wd-game wide">${list.length ? `
      <div class="wd-acts"><button class="btn primary" id="wd-prac">🧩 Practise these</button><button class="btn ghost" id="wd-wall">✍️ Write a scene using some</button></div>
      <div class="wd-list">${list.map(x => { const s = senses(x.w)[0]; return `<div class="wd-item"><button class="wd-iw" data-look="${esc(x.w)}">${esc(show(x.w))}</button><span>${s ? `<i>${POS[s[0]]}</i> ${esc(s[1])}` : ''}</span><button class="icon-btn small" data-del="${esc(x.w)}" title="Remove">${U.I.x}</button></div>`; }).join('')}</div>`
      : '<p class="wd-help">No saved words yet. Press ☆ Save to My words on any word in the games or the thesaurus, and it shows up here, on all your devices.</p>'}</div>`;
    wireWords(body);
    $$('[data-del]', body).forEach(b => b.onclick = async () => { await save(b.dataset.del, false); mineView(body); });
    const p = $('#wd-prac', body); if (p) p.onclick = () => go('which', 'mine');
    const a = $('#wd-wall', body); if (a) a.onclick = () => write(shuffle(list.map(x => x.w)).slice(0, 5));
  }

  // used by the Play editor's side panel: which of the words appear in the writing (any ending: run, runs, running)
  function used(text, words) {
    const t = ' ' + String(text || '').toLowerCase().replace(/[^a-z'\- ]+/g, ' ') + ' ';
    return words.map(w => {
      const p = show(w).toLowerCase(), stem = p.length > 4 ? p.replace(/(e|y)$/, '') : p;
      return new RegExp(`[^a-z]${stem.replace(/[-]/g, '\\-')}[a-z]{0,4}[^a-z]`).test(t);
    });
  }
  const meaning = w => { const s = D && senses(w)[0]; return s ? `${POS[s[0]]}: ${s[1]}` : ''; };
  return { view, load, used, meaning, _base: w => base(w) };
})();
