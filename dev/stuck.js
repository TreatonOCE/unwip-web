// Unwip - "Stuck?" tools for procrastination days. No AI: small rules, ideas and nudges.
//  1. Just 50 words   - a tiny sprint to get started
//  2. Why am I stuck? - pick a reason, get a concrete next step
//  3. Messy draft     - no backspace, what you wrote fades, spellcheck off
//  4. Make it smaller - break a chapter into tiny ticks (pinned beside the page)
//  5. Your patterns   - when you write best and where you stall (kept only in the project file)
window.UnwipStuck = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, fmt, S, I, editor } = U;

  // ================================================================== TRACKER
  let stats = null, minuteTyped = 0, lastActive = Date.now(), lastTypedAt = Date.now(), tick = null, mins = 0;
  const present = () => document.hasFocus() && Date.now() - lastActive < 3 * 60000;
  for (const ev of ['keydown', 'mousemove', 'wheel', 'mousedown']) document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
  const tracking = () => (S.settings || {}).trackStuck !== false;

  U.on('project', p => {
    stats = p.stats;
    stats.hours = stats.hours || {}; stats.weekdays = stats.weekdays || {}; stats.idle = stats.idle || {}; stats.sessions = stats.sessions || [];
    stats.sessions.push({ start: new Date().toISOString(), mins: 0, typed: 0 });
    if (stats.sessions.length > 400) stats.sessions.splice(0, stats.sessions.length - 400);
    lastTypedAt = Date.now(); mins = 0;
    clearInterval(tick); tick = setInterval(onMinute, 60000);
    renderSteps();
  });
  U.on('reload', p => { stats = p.stats; stats.hours = stats.hours || {}; stats.weekdays = stats.weekdays || {}; stats.idle = stats.idle || {}; stats.sessions = stats.sessions || []; renderSteps(); });
  U.on('leave', () => { clearInterval(tick); stats = null; stopMessy(false); nudge(false); renderSteps(); });
  U.on('typed', d => {
    if (d <= 0 || !stats) return;
    lastTypedAt = Date.now(); nudge(false);
    if (!tracking()) return;
    const now = new Date();
    stats.hours[now.getHours()] = (stats.hours[now.getHours()] || 0) + d;
    stats.weekdays[now.getDay()] = (stats.weekdays[now.getDay()] || 0) + d;
    const ses = stats.sessions[stats.sessions.length - 1]; if (ses) ses.typed += d;
    minuteTyped += d;
  });
  function onMinute() {
    if (!stats || !S.project) return;
    const here = present() && !document.querySelector('.modal-back');
    if (here && tracking()) {
      const ses = stats.sessions[stats.sessions.length - 1]; if (ses) ses.mins++;
      if (!minuteTyped && S.docId && S.view === 'write' && U.rootOf(S.docId).kind === 'manuscript') stats.idle[S.docId] = (stats.idle[S.docId] || 0) + 1;
      if (++mins % 5 === 0) U.scheduleMeta();
    }
    minuteTyped = 0;
    // a gentle nudge: here, looking at a chapter, but nothing typed for 6 minutes
    if (here && S.docId && S.view === 'write' && !S.sprint && !messy && Date.now() - lastTypedAt > 6 * 60000 && (S.settings || {}).stuckNudge !== false) nudge(true);
  }
  function nudge(on) { const b = $('#btn-stuck'); if (b) { b.classList.toggle('nudge', on); b.title = on ? 'Been quiet for a while. Want a hand getting going?' : 'Spark: tools to get you writing again'; } }

  // ================================================================== DIALOG
  const CARDS = [
    { id: 'fifty', icon: '✏️', title: 'Just 50 words', sub: 'A tiny goal to get started. Starting is the hard part.' },
    { id: 'why', icon: '🧭', title: 'Why am I stuck?', sub: 'Pick a reason and get a concrete next step.' },
    { id: 'messy', icon: '🌀', title: 'Messy draft', sub: 'No backspace, no red lines. Words fade as you go. Just forward.' },
    { id: 'steps', icon: '🪜', title: 'Make it smaller', sub: 'Break this chapter into tiny ticks you can do in a minute.' },
    { id: 'patterns', icon: '📈', title: 'Your patterns', sub: 'When you write best and where you tend to stall.' }
  ];
  let after = null;   // action to run once the dialog has closed
  function closeThen(fn) { after = fn; const b = $('.modal-back .stuck-close'); if (b) b.click(); }

  async function openStuck(start) {
    nudge(false);
    if (!S.project) return;
    const body = document.createElement('div');
    body.className = 'stuck';
    const show = view => { body.innerHTML = ''; VIEWS[view] ? VIEWS[view](body, show) : home(body, show); body.closest('.m-body') && (body.closest('.m-body').scrollTop = 0); };
    after = null;
    const p = U.modal({ title: 'Spark: let’s get you moving', body, wide: true, buttons: [{ label: 'Close', value: false, kind: 'ghost' }],
      onOpen: back => { const b = back.querySelector('.m-foot .btn'); if (b) b.classList.add('stuck-close'); } });
    show(start || 'home');
    await p;
    const fn = after; after = null;
    if (fn) await fn();
  }
  function home(body, show) {
    const q = window.UnwipQuotes && (S.settings || {}).quotes !== false ? window.UnwipQuotes.random() : null;
    body.innerHTML = `<p>Everyone gets stuck. Pick whatever feels easiest right now.</p>
      <div class="st-grid">${CARDS.map(c => `<button type="button" class="st-card" data-v="${c.id}"><span class="st-ic">${c.icon}</span><b>${c.title}</b><span>${c.sub}</span></button>`).join('')}</div>
      ${q ? `<div class="st-quote">“${esc(q[0])}” <span>— ${esc(q[1])}</span></div>` : ''}`;
    $$('.st-card', body).forEach(b => b.onclick = () => show(b.dataset.v));
  }
  const backLink = show => `<button type="button" class="st-back" data-back>‹ All options</button>`;
  const wireBack = (body, show) => { const b = $('[data-back]', body); if (b) b.onclick = () => show('home'); };

  // ---------------------------------------------------------------- 1. Just 50 words
  function fiftyView(body, show) {
    let goal = 50, minutes = 5;
    body.innerHTML = `${backLink()}<h3 class="st-h">Just ${goal} words</h3>
      <p>No pressure: write a tiny amount, then you're allowed to stop. Most of the time you won't want to.</p>
      <div class="field"><label>Words</label><div class="chip-row" data-k="goal">${[25, 50, 100, 200].map(n => `<button type="button" class="chip ${n === goal ? 'on' : ''}" data-v="${n}">${n}</button>`).join('')}</div></div>
      <div class="field" style="margin-top:10px"><label>Time</label><div class="chip-row" data-k="minutes">${[5, 10, 15].map(n => `<button type="button" class="chip ${n === minutes ? 'on' : ''}" data-v="${n}">${n} min</button>`).join('')}</div></div>
      <label class="check" style="margin-top:12px"><input type="checkbox" id="st-w" checked> Writer mode (hide everything else)</label>
      <label class="check"><input type="checkbox" id="st-m"> Messy draft too (no backspace)</label>
      <div class="st-actions"><button type="button" class="btn primary" id="st-go">Start writing</button></div>`;
    wireBack(body, show);
    $$('.chip-row', body).forEach(row => $$('.chip', row).forEach(c => c.onclick = () => {
      $$('.chip', row).forEach(x => x.classList.remove('on')); c.classList.add('on');
      if (row.dataset.k === 'goal') { goal = +c.dataset.v; $('.st-h', body).textContent = `Just ${goal} words`; } else minutes = +c.dataset.v;
    }));
    $('#st-go', body).onclick = () => {
      const w = $('#st-w', body).checked, m = $('#st-m', body).checked;
      closeThen(async () => { await toEnd(); if (m) startMessy({ fade: true, noBack: true, quiet: true }); U.beginSprint(minutes, goal, { mini: true, writer: w, message: `Just ${goal} words. Go.` }); });
    };
  }
  async function toEnd() {
    if (!S.docId) return;
    editor.focus();
    const last = editor.lastElementChild;
    const r = document.createRange();
    if (last && last.textContent.trim()) { r.selectNodeContents(last); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('insertParagraph'); }
    else { r.selectNodeContents(last || editor); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); }
    U.typewriterScroll(true);
  }

  // ---------------------------------------------------------------- 2. Why am I stuck?
  const REASONS = [
    { id: 'next', label: 'I don’t know what happens next', acts: ['tk', 'last', 'interview'], prompts: [
      'What does your main character want most in this moment, and what’s stopping them?',
      'What’s the worst thing that could happen right now? Write that. You can decide later if it stays.',
      'Skip it. Leave a TK note (“to come”) and write the next scene you do know.',
      'Write what happens next as a rough list: “then… then… then…”. Proper sentences can come later.',
      'Who isn’t in this scene but could walk in and change it?',
      'Reread only your last paragraph. What question does it raise? Answer it.'] },
    { id: 'boring', label: 'This scene feels boring', acts: ['excited', 'tk'], prompts: [
      'Cut to the moment something changes, and start the scene there.',
      'Give someone in this scene a secret, and let a little of it slip out.',
      'Add a clock: something has to happen before ____.',
      'Make two characters want opposite things here.',
      'Move the scene somewhere uncomfortable: too loud, too cold, too public.',
      'Skip ahead to the scene you’re dying to write. Come back to this one later.'] },
    { id: 'hate', label: 'I hate what I’ve written', acts: ['snapshot', 'messy', 'fifty'], prompts: [
      'First drafts are meant to be rough. You’re shovelling sand into the box so you can build castles later.',
      'Don’t reread. Write forward. Rereading is editing, and that’s a job for another day.',
      'Take a snapshot so the old version is safe, then let yourself write it badly on purpose for ten minutes.',
      'Write one line you love, even if it doesn’t fit. Then keep going from there.'] },
    { id: 'tired', label: 'I’m tired or not in the mood', acts: ['fifty', 'steps'], prompts: [
      'Set five minutes. If you still hate it after that, you’re allowed to stop, and it still counts.',
      'Write 50 words. That’s a writing day.',
      'Do a tiny job instead: name a side character, fill in a character sheet, or write one synopsis.',
      'Change something: writer mode, a new theme, typewriter sounds on. A new feel can trick your brain into starting.'] },
    { id: 'start', label: 'I don’t know how to start', acts: ['steps', 'fifty'], prompts: [
      'Start with dialogue: someone says something halfway through a conversation.',
      'Start with one sense: a sound, a smell, the temperature.',
      'Write the last line of the chapter first, then head towards it.',
      'Start with your character doing something with their hands.',
      'Start in the middle of the action. You can fill in how they got there later.'] },
    { id: 'many', label: 'Too many ideas, can’t choose', acts: ['park', 'excited'], prompts: [
      'Pick the one that scares you a little. It’s usually the right one.',
      'Write the first line of each idea and keep the one that wants to carry on.',
      'Park the others in a note so they’re safe, then write just one.',
      'Flip a coin. If you feel disappointed by the result, pick the other one.'] }
  ];
  const ACTIONS = {
    tk: { label: 'Leave a TK note and skip ahead', run: leaveTK },
    last: { label: 'Show where I left off', run: null },
    interview: { label: 'Interview my character', run: interview },
    excited: { label: 'Write the scene I’m excited about', run: excitedScene },
    snapshot: { label: 'Take a snapshot first', run: async () => { await U.takeSnapshot('Before a messy rewrite'); } },
    messy: { label: 'Messy draft mode', view: 'messy' },
    fifty: { label: 'Just 50 words', view: 'fifty' },
    steps: { label: 'Make it smaller', view: 'steps' },
    park: { label: 'Park my other ideas in a note', run: parkIdeas }
  };
  function whyView(body, show, reasonId) {
    const R = REASONS.find(r => r.id === reasonId);
    if (!R) {
      body.innerHTML = `${backLink()}<h3 class="st-h">What’s getting in the way?</h3>
        <div class="st-reasons">${REASONS.map(r => `<button type="button" class="st-reason" data-r="${r.id}">${esc(r.label)}</button>`).join('')}</div>`;
      wireBack(body, show);
      $$('.st-reason', body).forEach(b => b.onclick = () => { body.innerHTML = ''; whyView(body, show, b.dataset.r); });
      return;
    }
    let i = Math.floor(Math.random() * R.prompts.length);
    body.innerHTML = `<button type="button" class="st-back" data-r-back>‹ Other reasons</button><h3 class="st-h">${esc(R.label)}</h3>
      <div class="st-prompt"><span id="st-pt"></span><button type="button" class="btn small ghost" id="st-more">Another idea ↻</button></div>
      <div class="st-left hidden" id="st-left"></div>
      <div class="ip-label">Try one of these</div>
      <div class="st-acts">${R.acts.map(a => `<button type="button" class="btn" data-a="${a}">${esc(ACTIONS[a].label)}</button>`).join('')}</div>`;
    const put = () => { $('#st-pt', body).textContent = R.prompts[i % R.prompts.length]; };
    put();
    $('[data-r-back]', body).onclick = () => { body.innerHTML = ''; whyView(body, show); };
    $('#st-more', body).onclick = () => { i++; put(); };
    $$('[data-a]', body).forEach(b => b.onclick = () => {
      const a = ACTIONS[b.dataset.a];
      if (b.dataset.a === 'last') { const box = $('#st-left', body); box.innerHTML = leftOff(); box.classList.remove('hidden'); return; }
      if (a.view) { show(a.view); return; }
      closeThen(a.run);
    });
  }
  function leftOff() {
    const blocks = $$(':scope > p, :scope > blockquote', editor).filter(p => p.textContent.replace(/​/g, '').trim() && !p.classList.contains('scene'));
    const last = blocks.pop();
    if (!last) return '<p>This document is empty, which is a fresh start. Try “Just 50 words”.</p>';
    return `<div class="ip-label">Where you left off</div><blockquote>${esc(last.textContent.replace(/​/g, ''))}</blockquote>`;
  }
  async function leaveTK() {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    const what = await U.promptText('Leave a note for later', 'What needs to go here? (optional)', '');
    if (what === null) return;
    await toEnd();
    U.insertCleanHTML(`<p>[TK: ${esc(what || 'fill this in later')}]</p><p><br></p>`);
    U.scheduleSave();
    U.toast('Left a TK note. Search the book for “TK” (Ctrl+Shift+F) to find every gap later. Now keep going with what you do know.', '', 7000);
  }
  function sectionId(kind) { const r = S.project.binder.find(n => n.root && n.kind === kind); return r ? r.id : 'root-manuscript'; }
  async function makeDoc(parentId, title, html, afterId) {
    const node = { id: U.uid(), type: 'doc', title, words: 0 };
    const f = afterId && U.findNode(afterId);
    if (f && f.list) f.list.splice(f.index + 1, 0, node);
    else { const p = U.findNode(parentId).node; p.children.push(node); p.open = true; }
    await U.api.saveDoc(S.slug, node.id, html);
    U.scheduleMeta(); U.renderBinder();
    return node;
  }
  // Interview my character: a note of questions to answer in their voice. The questions are yours to change
  // (settings.interviewQs, shared between devices); these are the ones it starts with.
  const INTERVIEW_QS = ['What do you want right now, more than anything?', 'What are you afraid will happen next?', 'What are you not telling anyone?', 'What would you never do? What would make you do it?', 'What do you think of the other people in this scene?', 'What happens if you get what you want?'];
  const interviewQs = () => { const q = S.settings && S.settings.interviewQs; return Array.isArray(q) && q.length ? q : INTERVIEW_QS; };
  async function interview() {
    if (!S.project) { U.toast('Open a book first.'); return; }
    const f = S.docId && U.findNode(S.docId);
    const who = (f && f.node.pov) || 'my character';
    const node = await makeDoc(sectionId('notes'), `Interview: ${who}`, `<p><i>Answer in your character’s voice. No one else will read this.</i></p>` + interviewQs().map(q => `<h2>${esc(q)}</h2><p><br></p>`).join(''));
    if (S.docId) U.openSplit(node.id); else await U.openDoc(node.id);
    U.toastAction('Opened beside your chapter, in Notes. Answer as them, quickly, without thinking too hard.', 'Change the questions', editInterview, 8000);
  }
  async function editInterview() {
    const body = document.createElement('div');
    body.innerHTML = `<p>One question per line. New interviews use these; ones you’ve already made stay as they are. They follow you to your other devices.</p>
      <textarea id="iv-qs" rows="10" style="width:100%;font:inherit;line-height:1.5" spellcheck="true"></textarea>
      <p class="hint">Tip: “this scene” questions work best when you start the interview from a chapter.</p>`;
    body.querySelector('#iv-qs').value = interviewQs().join('\n');
    const v = await U.modal({ title: 'Character interview questions', body, buttons: [{ label: 'Use the usual questions', value: 'reset', kind: 'ghost' }, { label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] });
    if (!v) return;
    const list = v === 'reset' ? null : body.querySelector('#iv-qs').value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60);
    try { S.settings = await U.api.setSettings({ interviewQs: list && list.length ? list : null }); } catch {}
    U.toast(v === 'reset' || !list.length ? 'Back to the usual questions.' : `Saved ${list.length} question${list.length === 1 ? '' : 's'}.`);
  }
  async function excitedScene() {
    if (!S.docId || U.rootOf(S.docId).kind !== 'manuscript') { U.toast('Open a chapter first.'); return; }
    const node = await makeDoc(sectionId('manuscript'), 'The scene I’m excited about', '<p><br></p>', S.docId);
    await U.openDoc(node.id);
    U.toast('Write the fun scene now. You can drag it to the right place in the binder later.', '', 6000);
  }
  async function parkIdeas() {
    const existing = (() => { let id = null; U.walkTree(S.project.binder, n => { if (n.title === 'Ideas I’m saving for later' && n.type === 'doc') { id = n.id; return false; } }); return id; })();
    const node = existing ? U.findNode(existing).node : await makeDoc(sectionId('notes'), 'Ideas I’m saving for later', '<p>Every idea goes here, so none of them get lost. Pick one to write today.</p><p><br></p>');
    U.openSplit(node.id);
    U.toast('Your ideas note is open beside the chapter. Jot them all down, then pick one.', '', 6000);
  }

  // ---------------------------------------------------------------- 3. Messy draft
  let messy = null;
  function messyView(body, show) {
    body.innerHTML = `${backLink()}<h3 class="st-h">Messy draft</h3>
      <p>For when you keep fixing instead of writing. Typos stay, red lines disappear, and you can only go forward. Tidy up another day.</p>
      <label class="check"><input type="checkbox" id="mx-back" checked> No backspace or delete</label>
      <label class="check"><input type="checkbox" id="mx-fade" checked> Fade what I’ve already written</label>
      <label class="check"><input type="checkbox" id="mx-w"> Writer mode too</label>
      <div class="field" style="margin-top:10px"><label>How long</label><div class="chip-row" id="mx-time">${[[0, 'Until I stop'], [10, '10 min'], [20, '20 min'], [30, '30 min']].map(([v, l], i) => `<button type="button" class="chip ${i === 0 ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="st-actions"><button type="button" class="btn primary" id="mx-go">Start messy draft</button></div>`;
    wireBack(body, show);
    let mins = 0;
    $$('#mx-time .chip', body).forEach(c => c.onclick = () => { $$('#mx-time .chip', body).forEach(x => x.classList.remove('on')); c.classList.add('on'); mins = +c.dataset.v; });
    $('#mx-go', body).onclick = () => {
      const o = { noBack: $('#mx-back', body).checked, fade: $('#mx-fade', body).checked, minutes: mins };
      const w = $('#mx-w', body).checked;
      closeThen(async () => { await toEnd(); startMessy(o); if (w) U.setWriter(true); });
    };
  }
  function startMessy(o) {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    if (messy) stopMessy(false);
    messy = { ...o, start: Date.now(), typed0: S.sessionTyped, spell: editor.spellcheck };
    if (S.revise) U.setRevise(false);
    editor.spellcheck = false;
    document.body.classList.add('messy');
    if (o.fade && window.UnwipLook) window.UnwipLook.setMessyFade(true);
    if (o.minutes) messy.end = Date.now() + o.minutes * 60000;
    messy.timer = setInterval(renderMessy, 1000);
    renderMessy();
    if (!o.quiet) U.toast('Messy draft: forward only. Press Esc or click Stop when you’re done.', '', 5000);
    editor.focus();
  }
  function renderMessy() {
    const pill = $('#messy-pill');
    if (!messy) { pill.classList.add('hidden'); return; }
    if (messy.end && Date.now() >= messy.end) { stopMessy(true); return; }
    const words = Math.max(0, S.sessionTyped - messy.typed0);
    const left = messy.end ? Math.max(0, messy.end - Date.now()) : 0;
    pill.innerHTML = `<span class="mx-dot"></span>Messy draft · <b>${fmt(words)}</b> words${messy.end ? ` · ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}` : ''}<button type="button" class="btn small ghost" id="mx-stop">Stop</button>`;
    pill.classList.remove('hidden');
    $('#mx-stop', pill).onclick = () => stopMessy(true);
  }
  function stopMessy(report) {
    if (!messy) return;
    const m = messy; messy = null;
    clearInterval(m.timer);
    editor.spellcheck = m.spell;
    document.body.classList.remove('messy');
    if (window.UnwipLook) window.UnwipLook.setMessyFade(false);
    renderMessy();
    const words = Math.max(0, S.sessionTyped - m.typed0);
    if (report) U.quoteToast(words ? `Messy draft done: ${fmt(words)} words. That’s real progress. Tidy up another day.` : 'Messy draft stopped.');
  }
  U.on('keydown', e => {
    if (!messy) return;
    if (e.key === 'Escape') { e.preventDefault(); stopMessy(true); return; }
    if (!messy.noBack) return;
    const k = e.key.toLowerCase();
    const blocked = e.key === 'Backspace' || e.key === 'Delete' || ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'x' || k === 'y'));
    if (blocked) { e.preventDefault(); bump(); }
  });
  editor.addEventListener('beforeinput', e => { if (messy && messy.noBack && /^(delete|historyUndo|historyRedo)/.test(e.inputType)) { e.preventDefault(); bump(); } });
  let bumpT = null;
  function bump() {
    const pill = $('#messy-pill'); pill.classList.remove('bump'); void pill.offsetWidth; pill.classList.add('bump');
    clearTimeout(bumpT); const tip = pill.querySelector('.mx-tip') || (() => { const t = document.createElement('span'); t.className = 'mx-tip'; pill.appendChild(t); return t; })();
    tip.textContent = ['Forward only →', 'Fix it later →', 'Keep going →', 'Typos are fine →'][Math.floor(Math.random() * 4)];
    bumpT = setTimeout(() => tip.remove(), 1400);
  }

  // ---------------------------------------------------------------- 4. Make it smaller
  const STEP_IDEAS = ['Write the first line', 'Write one line of dialogue', 'Say where we are in one sentence', 'What does the POV character want here?', 'Something goes wrong', 'Write the last line', 'Add one smell or sound', 'Get them into the room', 'End on a question', 'Fill in the TK notes'];
  function stepsView(body, show) {
    const f = S.docId && U.findNode(S.docId);
    if (!f) { body.innerHTML = `${backLink()}<p>Open a chapter first, then come back here to break it into small steps.</p>`; wireBack(body, show); return; }
    const n = f.node; n.steps = n.steps || [];
    const draw = () => {
      body.innerHTML = `${backLink()}<h3 class="st-h">Make “${esc(n.title || 'Untitled')}” smaller</h3>
        <p>Split it into jobs small enough to do in a minute or two. Tick them off as you go. They sit beside the page while you write.</p>
        <div class="sx-list">${n.steps.map((s, i) => `<div class="sx-row ${s.done ? 'done' : ''}" data-i="${i}"><input type="checkbox" ${s.done ? 'checked' : ''}><input type="text" value="${esc(s.text)}"><button type="button" class="icon-btn small" title="Remove">${I.x}</button></div>`).join('') || '<p class="np-empty">No steps yet. Add your own or tap an idea below.</p>'}</div>
        <div class="sx-add"><input type="text" id="sx-new" placeholder="Add a small step, then press Enter"><button type="button" class="btn" id="sx-plus">Add</button></div>
        <div class="ip-label">Ideas</div><div class="chip-row">${STEP_IDEAS.filter(t => !n.steps.some(s => s.text === t)).map(t => `<button type="button" class="chip" data-t="${esc(t)}">+ ${esc(t)}</button>`).join('')}</div>
        <div class="st-actions"><button type="button" class="btn primary" id="sx-go">${n.steps.length ? 'Start on the first step' : 'Done'}</button></div>`;
      wireBack(body, show);
      const add = t => { t = t.trim(); if (!t) return; n.steps.push({ text: t, done: false }); n.stepsPinned = true; save(); draw(); const i = $('#sx-new', body); if (i) i.focus(); };
      $('#sx-new', body).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(e.target.value); } };
      $('#sx-plus', body).onclick = () => add($('#sx-new', body).value);
      $$('[data-t]', body).forEach(c => c.onclick = () => add(c.dataset.t));
      $$('.sx-row', body).forEach(row => {
        const i = +row.dataset.i;
        row.querySelector('input[type=checkbox]').onchange = e => { n.steps[i].done = e.target.checked; save(); draw(); };
        row.querySelector('input[type=text]').oninput = e => { n.steps[i].text = e.target.value; save(); };
        row.querySelector('button').onclick = () => { n.steps.splice(i, 1); save(); draw(); };
      });
      $('#sx-go', body).onclick = () => closeThen(async () => { n.stepsPinned = !!n.steps.length; save(); if (n.steps.length) await toEnd(); });
    };
    draw();
  }
  function save() { U.scheduleMeta(); renderSteps(); }
  function renderSteps() {
    const box = $('#steps-float'); if (!box) return;
    const f = S.project && S.docId && U.findNode(S.docId);
    const n = f && f.node;
    if (!n || !n.steps || !n.steps.length || !n.stepsPinned || S.view !== 'write') { box.classList.add('hidden'); return; }
    const done = n.steps.filter(s => s.done).length;
    const min = box.classList.contains('min');
    box.innerHTML = `<div class="sf-head"><span>${I.steps}</span><b>Steps</b><span class="sf-n">${done}/${n.steps.length}</span>
        <button type="button" class="icon-btn small" data-sf="min" title="${min ? 'Show' : 'Shrink'}">${min ? '▴' : '▾'}</button><button type="button" class="icon-btn small" data-sf="edit" title="Edit steps">✎</button><button type="button" class="icon-btn small" data-sf="close" title="Hide (bring back from Stuck? → Make it smaller)">${I.x}</button></div>
      <div class="sf-bar"><i style="width:${Math.round(done / n.steps.length * 100)}%"></i></div>
      <div class="sf-list">${n.steps.map((s, i) => `<label class="sf-row ${s.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''}><span>${esc(s.text)}</span></label>`).join('')}</div>`;
    box.classList.remove('hidden'); placeSteps();
    box.onmousedown = e => { if (!e.target.closest('input')) e.preventDefault(); };
    $$('input[type=checkbox]', box).forEach(c => c.onchange = () => {
      n.steps[+c.dataset.i].done = c.checked; U.scheduleMeta();
      if (c.checked && n.steps.every(s => s.done)) U.quoteToast('Every step done. That chapter just got smaller!');
      else if (c.checked) U.toast('✓ Nice. Next one.', '', 1600);
      renderSteps(); editor.focus();
    });
    $('[data-sf="min"]', box).onclick = () => { box.classList.toggle('min'); renderSteps(); };
    $('[data-sf="edit"]', box).onclick = () => openStuck('steps');
    $('[data-sf="close"]', box).onclick = () => { n.stepsPinned = false; U.scheduleMeta(); renderSteps(); };
  }
  U.on('doc', () => renderSteps());
  U.on('view', () => renderSteps());
  // keep the steps card in the bottom-right corner of the writing area, whatever panels are open
  function placeSteps() {
    const box = $('#steps-float'); if (!box || box.classList.contains('hidden')) return;
    const r = U.editorWrap.getBoundingClientRect();
    box.style.right = Math.max(8, window.innerWidth - r.right + 22) + 'px';
    box.style.bottom = Math.max(8, window.innerHeight - r.bottom + 16) + 'px';
  }
  new ResizeObserver(placeSteps).observe(U.editorWrap);
  window.addEventListener('resize', placeSteps);

  // ---------------------------------------------------------------- 5. Your patterns
  function patternsView(body, show) {
    const st = S.project.stats || {};
    const hours = st.hours || {}, wd = st.weekdays || {}, idle = st.idle || {};
    const total = Object.values(hours).reduce((a, b) => a + b, 0);
    const on = tracking();
    const parts = [['Early morning', 5, 9], ['Morning', 9, 12], ['Afternoon', 12, 17], ['Evening', 17, 21], ['Late night', 21, 29]];
    const partW = parts.map(([l, a, b]) => { let s = 0; for (let h = a; h < b; h++) s += hours[h % 24] || 0; return [l, s]; });
    const maxP = Math.max(1, ...partW.map(p => p[1]));
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const maxD = Math.max(1, ...days.map((_, i) => wd[i] || 0));
    const bestPart = [...partW].sort((a, b) => b[1] - a[1])[0];
    const bestDay = days.map((d, i) => [d, wd[i] || 0]).sort((a, b) => b[1] - a[1])[0];
    const month = Date.now() - 30 * 864e5;
    const ses = (st.sessions || []).filter(s => new Date(s.start).getTime() > month && s.mins >= 2);
    const stalled = ses.filter(s => s.mins >= 3 && s.typed < 25);
    const stallDocs = Object.entries(idle).map(([id, m]) => { const f = U.findNode(id); return f && U.rootOf(id).kind === 'manuscript' ? { id, title: f.node.title || 'Untitled', m, words: f.node.words || 0 } : null; })
      .filter(Boolean).filter(d => d.m >= 5).sort((a, b) => b.m - a.m).slice(0, 3);
    const enough = total >= 300;
    body.innerHTML = `${backLink()}<h3 class="st-h">Your patterns</h3>
      ${!on ? '<p>Tracking is off, so there’s nothing new to show.</p>' : !enough ? `<p>Not enough to go on yet (${fmt(total)} words tracked so far). Keep writing in this book and check back in a few days.</p>` : `
      <p class="st-sum">You write the most in the <b>${bestPart[0].toLowerCase()}</b>${bestDay[1] ? `, and <b>${bestDay[0]}</b> is your best day` : ''}. Try booking that slot for the hard chapters.</p>
      <div class="st-cols">
        <div><div class="ip-label">Time of day</div>${partW.map(([l, v]) => `<div class="st-bar"><span>${l}</span><i style="width:${Math.round(v / maxP * 100)}%"></i><b>${fmt(v)}</b></div>`).join('')}</div>
        <div><div class="ip-label">Day of the week</div>${days.map((d, i) => `<div class="st-bar"><span>${d}</span><i style="width:${Math.round((wd[i] || 0) / maxD * 100)}%"></i><b>${fmt(wd[i] || 0)}</b></div>`).join('')}</div>
      </div>`}
      ${on ? `<div class="ip-label">Last 30 days</div>
      <p>${ses.length ? `${ses.length} writing session${ses.length === 1 ? '' : 's'}, and ${stalled.length ? `${stalled.length} where very little got written. That’s normal. Everyone has them.` : 'none where you stalled. Nice.'}` : 'No sessions tracked yet.'}</p>
      ${stallDocs.length ? `<div class="ip-label">Where you get stuck most</div>
        <div class="st-stall">${stallDocs.map(d => `<div><span>${esc(d.title)}</span><em>${d.m} quiet minutes</em><button type="button" class="btn small" data-break="${d.id}">Make it smaller</button></div>`).join('')}</div>` : ''}` : ''}
      <label class="check" style="margin-top:14px"><input type="checkbox" id="pt-on" ${on ? 'checked' : ''}> Keep track of when I write and where I stall (kept only in this project, never shared)</label>
      <label class="check"><input type="checkbox" id="pt-nudge" ${(S.settings || {}).stuckNudge !== false ? 'checked' : ''}> Gently light up the Spark button when I’ve been quiet for a while</label>`;
    wireBack(body, show);
    $('#pt-on', body).onchange = async e => { S.settings = await U.api.setSettings({ trackStuck: e.target.checked }); };
    $('#pt-nudge', body).onchange = async e => { S.settings = await U.api.setSettings({ stuckNudge: e.target.checked }); };
    $$('[data-break]', body).forEach(b => b.onclick = () => closeThen(async () => { await U.openDoc(b.dataset.break); openStuck('steps'); }));
  }

  const VIEWS = { home, fifty: fiftyView, why: (b, s) => whyView(b, s), messy: messyView, steps: stepsView, patterns: patternsView };

  const btn = $('#btn-stuck');
  if (btn) { btn.innerHTML = `<span class="stuck-ic">${I.flame}</span><span class="tb-label">Spark</span>`; btn.onclick = () => openStuck(); }
  return { open: openStuck, interview, editInterview, startMessy, stopMessy, isMessy: () => !!messy, renderSteps };
})();
