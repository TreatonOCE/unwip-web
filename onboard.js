// Unwip - the welcome setup (first launch, or Settings › Help) and the guided tour.
// The setup asks what you've written with before and sets Unwip up to feel familiar:
// layout (clean page / writer's desk / distraction-free), how the book is organised,
// look, font and goal. It can build an example project laid out the way you chose.
window.UnwipIntro = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, S, api } = U;

  // ================================================================== WHERE YOU'RE COMING FROM
  const FROM = {
    scrivener: {
      name: 'Scrivener', icon: '📚', blurb: 'Binder, corkboard, compile',
      layout: 'desk', structure: 'scenes', font: 'Times New Roman', para: 'book',
      map: [['Binder', 'Binder (left side)'], ['Corkboard & Outliner', 'Detailed mode › Corkboard and Outline'], ['Labels & Status', 'Status (right-click a document)'],
        ['Compile', 'Export (PDF, e-book, Word)'], ['Snapshots', 'Snapshots (camera button)'], ['Composition mode', 'Writer mode'], ['Project targets', 'Goals & sprints']],
      tip: 'Your Scrivener projects can come straight across, with folders, synopses, labels, icons and pictures.'
    },
    docs: {
      name: 'Google Docs', icon: '📄', blurb: 'One long document in the browser',
      layout: 'page', structure: 'chapters', font: 'Arial', para: 'blocks',
      map: [['One long document', 'One page per chapter in the Binder, so nothing gets lost scrolling'], ['Headings / outline', 'The Binder'], ['Comments', 'Comments (speech bubble)'],
        ['Version history', 'Snapshots, plus automatic backups'], ['Sharing with readers', 'Copy for Google Docs puts your book back into Docs in one go']],
      tip: 'Paste a chapter in and the formatting is cleaned up for you. "Copy for Docs" goes the other way.'
    },
    word: {
      name: 'Microsoft Word', icon: '📝', blurb: 'A .docx file on your computer',
      layout: 'page', structure: 'chapters', font: 'Calibri', para: 'blocks',
      map: [['Navigation pane', 'The Binder'], ['Comments & footnotes', 'Comments and footnotes, kept in Word exports'], ['Styles', 'Text style (Aa) for the whole book'],
        ['Save As…', 'Saves itself every few seconds'], ['Export to PDF', 'Export › PDF, Word or e-book']],
      tip: 'Bring a Word document in and Unwip splits it into chapters at the headings.'
    },
    hemingway: {
      name: 'Hemingway / ProWritingAid', icon: '✂️', blurb: 'Editing and tightening',
      layout: 'calm', structure: 'chapters', font: 'Georgia', para: 'book',
      map: [['Highlighted problems', 'Revise (repeated words, adverbs, long sentences, filler)'], ['Readability', 'Revise › readability score'],
        ['Write mode', 'Writer mode with typewriter scrolling'], ['Word counts', 'Live counts, goals and progress']],
      tip: 'Revise highlights things to look at, but never changes your words for you. No AI anywhere.'
    },
    new: {
      name: 'Nothing yet / pen & paper', icon: '✨', blurb: 'Starting fresh',
      layout: 'page', structure: 'chapters', font: 'Georgia', para: 'book',
      map: [['A notebook', 'One page per chapter, with Notes and Characters alongside'], ['Losing work', 'Saves itself, plus backups'], ['Not knowing what next', 'Spark and Play give you a push']],
      tip: 'Take the tour at the end: it points at each button and says what it does.'
    }
  };
  const LAYOUTS = {
    page: { name: 'Clean page', like: 'Feels like Google Docs or Word', desc: 'A list of chapters and a page. Everything else stays out of the way until you want it.', mode: 'focused' },
    desk: { name: 'Writer’s desk', like: 'Feels like Scrivener', desc: 'Binder, corkboard, outline, statuses and timeline: the whole project laid out.', mode: 'detailed' },
    calm: { name: 'Distraction-free', like: 'Feels like iA Writer or Hemingway', desc: 'Just your words, full screen, with the current line kept in the middle.', mode: 'focused', writer: true }
  };
  const STRUCT = {
    chapters: { name: 'Chapters', desc: 'Each chapter is one page.', tree: ['Chapter 1', 'Chapter 2', 'Chapter 3'] },
    scenes: { name: 'Chapters with scenes', desc: 'Each chapter is a folder; scenes inside it are easy to move around.', tree: ['▾ Chapter 1', '  Scene: The light goes out', '  Scene: Fog', '▾ Chapter 2', '  Scene: The logbook'] },
    parts: { name: 'Parts, chapters, scenes', desc: 'For longer books split into parts or acts.', tree: ['▾ Part One', '  ▾ Chapter 1', '    Scene', '    Scene', '  ▸ Chapter 2', '▸ Part Two'] }
  };
  const THEME_PICKS = ['paper', 'sepia', 'mint', 'night', 'midnight', 'forest'];
  const FONT_PICKS = ['Times New Roman', 'Georgia', 'Garamond', 'Palatino Linotype', 'Calibri', 'Arial', 'Courier New'];
  const GOALS = [[0, 'No goal'], [250, '250'], [500, '500'], [1000, '1,000'], [1667, '1,667 (NaNo)'], [2000, '2,000']];
  const SAMPLE = 'The lamp had burned every night for ninety years. On the night it went out, Mara was halfway up the stairs with the oil, and she heard the sea go quiet.';

  // ================================================================== THE SETUP
  let ans = null, step = 0, root = null;
  const STEPS = ['welcome', 'from', 'layout', 'structure', 'look', 'goal', 'ready'];

  function start() {
    const look = window.UnwipLook ? window.UnwipLook.look : {};
    ans = { from: S.settings.from || '', layout: '', structure: '', theme: (look.theme && look.theme !== 'system') ? look.theme : 'paper',
      font: '', para: '', goal: S.settings.dailyGoal || 0, author: S.settings.author || '', example: true, action: '' };
    step = 0;
    if (root) root.remove();
    root = document.createElement('div'); root.id = 'intro';
    document.body.appendChild(root);
    render();
  }
  function close() { if (root) { root.classList.add('out'); const r = root; setTimeout(() => r.remove(), 250); root = null; } }

  function choose(list, cur, key, extra = () => '') {
    return list.map(([id, title, sub]) => `<button class="in-choice${cur === id ? ' on' : ''}" data-${key}="${id}">${extra(id)}<b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</button>`).join('');
  }
  function layoutPreview(id) {
    if (id === 'page') return `<div class="in-mini"><i class="b"></i><i class="p"></i></div>`;
    if (id === 'desk') return `<div class="in-mini"><i class="b"></i><i class="c"><s></s><s></s><s></s><s></s></i><i class="n"></i></div>`;
    return `<div class="in-mini dark"><i class="p wide"></i></div>`;
  }

  function render() {
    const f = FROM[ans.from] || null;
    const name = STEPS[step];
    let h = '';
    if (name === 'welcome') h = `
      <div class="in-hero">${($('.brand-wordmark') || {}).outerHTML || '<h1>unwip</h1>'}<p class="in-slogan">Write to finish</p></div>
      <h2>Welcome. Let’s set Unwip up for you.</h2>
      <p class="in-lead">Six quick questions, about a minute. You can change every answer later in Settings, and run this again from Settings › Help.</p>
      <p class="in-small">Everything stays on your computer. No account, no AI, works offline.</p>`;
    else if (name === 'from') h = `
      <h2>What have you written with before?</h2>
      <p class="in-lead">Unwip will borrow the parts that feel familiar.</p>
      <div class="in-grid">${choose(Object.entries(FROM).map(([id, x]) => [id, x.name, x.blurb]), ans.from, 'from', id => `<em>${FROM[id].icon}</em>`)}</div>
      ${f ? `<div class="in-map"><h3>Coming from ${esc(f.name)}: where things are</h3><table>${f.map.map(([a, b]) => `<tr><td>${esc(a)}</td><td>→</td><td>${esc(b)}</td></tr>`).join('')}</table><p>${esc(f.tip)}</p></div>` : ''}`;
    else if (name === 'layout') h = `
      <h2>Which layout feels like home?</h2>
      <p class="in-lead">${f ? `We’ve picked the one closest to ${esc(f.name)}. ` : ''}Switch any time with the Focused / Detailed buttons at the top.</p>
      <div class="in-grid three">${Object.entries(LAYOUTS).map(([id, l]) => `<button class="in-choice tall${ans.layout === id ? ' on' : ''}" data-layout="${id}">${layoutPreview(id)}<b>${l.name}</b><span class="in-like">${l.like}</span><span>${l.desc}</span></button>`).join('')}</div>`;
    else if (name === 'structure') h = `
      <h2>How do you like to organise a book?</h2>
      <p class="in-lead">This shapes the example project and how chapter titles come out in exports. You can mix and match later.</p>
      <div class="in-grid three">${Object.entries(STRUCT).map(([id, x]) => `<button class="in-choice tall${ans.structure === id ? ' on' : ''}" data-structure="${id}"><pre class="in-tree">${x.tree.map(esc).join('\n')}</pre><b>${x.name}</b><span>${x.desc}</span></button>`).join('')}</div>`;
    else if (name === 'look') h = `
      <h2>Pick a look</h2>
      <div class="in-row"><label>Colours</label><div class="in-chips">${THEME_PICKS.map(t => { const th = window.UnwipLook.THEMES[t]; return `<button class="in-sw${ans.theme === t ? ' on' : ''}" data-theme="${t}" title="${th.name}"><i style="background:${th.sw[0]}"><s style="background:${th.sw[1]}"></s><u style="background:${th.sw[2]}"></u></i>${th.name}</button>`; }).join('')}</div></div>
      <div class="in-row"><label>Writing font</label><div class="in-chips">${FONT_PICKS.map(x => `<button class="in-chip${ans.font === x ? ' on' : ''}" data-font="${esc(x)}" style="font-family:'${esc(x)}'">${esc(x)}</button>`).join('')}</div></div>
      <div class="in-row"><label>Paragraphs</label><div class="in-chips">
        <button class="in-chip${ans.para === 'book' ? ' on' : ''}" data-para="book">Indented, like a printed book</button>
        <button class="in-chip${ans.para === 'blocks' ? ' on' : ''}" data-para="blocks">Spaced blocks, like Docs and Word</button></div></div>
      <div class="in-sample ${ans.para}" style="font-family:'${esc(ans.font)}'"><p>${SAMPLE}</p><p>She set the can down. Below her, very faintly, someone was knocking at the door.</p></div>`;
    else if (name === 'goal') h = `
      <h2>A daily goal?</h2>
      <p class="in-lead">Shown as a quiet progress ring while you write. Plenty of people pick none.</p>
      <div class="in-chips big">${GOALS.map(([v, l]) => `<button class="in-chip${+ans.goal === v ? ' on' : ''}" data-goal="${v}">${l}${v ? ' words' : ''}</button>`).join('')}</div>
      <div class="in-row"><label>Your name, as it goes on title pages and exports</label><input id="in-author" class="in-input" placeholder="e.g. Ima Novelist" value="${esc(ans.author)}"></div>`;
    else if (name === 'ready') {
      const actions = [];
      if (ans.from === 'scrivener') actions.push(['scriv', '📚 Bring in my Scrivener project', 'Pick the .scriv folder. Everything comes across as a new project.']);
      if (ans.from === 'docs') actions.push(['paste', '📋 Paste my book from Google Docs', 'Select all in Docs, copy, paste. Unwip finds the chapters for you.']);
      if (ans.from !== 'scrivener') actions.push(['files', ans.from === 'word' ? '📝 Bring in my Word files' : '📁 Bring in my book from files', 'One file or one per chapter: Word, LibreOffice, RTF, text or Markdown. Chapters are found automatically.']);
      h = `
      <h2>All set</h2>
      <ul class="in-summary">
        <li><b>Layout</b> ${esc(LAYOUTS[ans.layout].name)}</li>
        <li><b>Books organised as</b> ${esc(STRUCT[ans.structure].name.toLowerCase())}</li>
        <li><b>Look</b> ${esc(window.UnwipLook.THEMES[ans.theme].name)}, ${esc(ans.font)}, ${ans.para === 'book' ? 'indented paragraphs' : 'spaced paragraphs'}</li>
        <li><b>Daily goal</b> ${ans.goal ? fmtN(ans.goal) + ' words' : 'none'}</li>
      </ul>
      <h3 class="in-h3">What would you like to start with?</h3>
      <div class="in-grid">${choose([
        ['example', '🏮 An example project', 'A short sample story, “The Lighthouse Keeper”, laid out the way you chose, with a character, a place and tips. Poke at it freely.'],
        ...actions,
        ['blank', '📖 A blank book', 'Name it and start writing.']
      ], ans.action, 'action')}</div>`;
    }
    const canNext = name === 'welcome' || name === 'goal' || name === 'look' ||
      (name === 'from' && ans.from) || (name === 'layout' && ans.layout) || (name === 'structure' && ans.structure) || (name === 'ready' && ans.action);
    root.innerHTML = `<div class="in-card">
      <div class="in-top"><div class="in-dots">${STEPS.map((_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div><button class="in-skip" id="in-skip">${step === 0 ? 'Skip setup' : 'Skip'}</button></div>
      <div class="in-body">${h}</div>
      <div class="in-foot">${step ? '<button class="btn ghost" id="in-back">Back</button>' : '<span></span>'}
        ${name === 'ready'
          ? `<div class="in-end"><button class="btn" id="in-go" ${canNext ? '' : 'disabled'}>Start writing</button><button class="btn primary" id="in-tour" ${canNext ? '' : 'disabled'}>Start with a quick tour</button></div>`
          : `<button class="btn primary" id="in-next" ${canNext ? '' : 'disabled'}>${step === 0 ? 'Let’s go' : 'Next'}</button>`}</div>
    </div>`;
    wire();
  }
  const fmtN = n => (+n).toLocaleString();

  function pickFrom(id) {
    const f = FROM[id]; ans.from = id;
    ans.layout = f.layout; ans.structure = f.structure; ans.font = f.font; ans.para = f.para;
  }
  function wire() {
    const r = root;
    $$('[data-from]', r).forEach(b => b.onclick = () => { pickFrom(b.dataset.from); render(); });
    $$('[data-layout]', r).forEach(b => b.onclick = () => { ans.layout = b.dataset.layout; render(); });
    $$('[data-structure]', r).forEach(b => b.onclick = () => { ans.structure = b.dataset.structure; render(); });
    $$('[data-theme]', r).forEach(b => b.onclick = () => { ans.theme = b.dataset.theme; window.UnwipLook.setTheme(ans.theme); render(); });
    $$('[data-font]', r).forEach(b => b.onclick = () => { ans.font = b.dataset.font; render(); });
    $$('[data-para]', r).forEach(b => b.onclick = () => { ans.para = b.dataset.para; render(); });
    $$('[data-goal]', r).forEach(b => b.onclick = () => { ans.goal = +b.dataset.goal; render(); });
    $$('[data-action]', r).forEach(b => b.onclick = () => { ans.action = b.dataset.action; render(); });
    const au = $('#in-author', r); if (au) au.oninput = () => { ans.author = au.value; };
    $('#in-skip', r).onclick = skip;
    const back = $('#in-back', r); if (back) back.onclick = () => { step--; render(); };
    const next = $('#in-next', r); if (next) next.onclick = () => {
      if (!ans.layout) { const keep = ans.from; pickFrom(keep || 'new'); ans.from = keep; }
      step++; render();
    };
    const go = $('#in-go', r); if (go) go.onclick = () => finish(false);
    const tr = $('#in-tour', r); if (tr) tr.onclick = () => finish(true);
  }
  async function skip() {
    S.settings = await api.setSettings({ onboarded: true });
    close();
    const list = await api.listProjects();
    if (!list.length) U.toast('Click “New project” to start your first book. Settings › Help has the setup and a tour.', '', 7000);
  }

  async function finish(withTour) {
    const f = FROM[ans.from] || FROM.new, L = LAYOUTS[ans.layout];
    const style = { font: ans.font, ...(ans.para === 'blocks'
      ? { indent: 0, paraSpacing: 8, lineHeight: ans.font === 'Arial' ? 1.15 : 1.3, noIndentFirst: true }
      : { indent: 0.5, paraSpacing: 0, lineHeight: 1.5, noIndentFirst: true }),
      size: ans.font === 'Arial' ? 11 : ans.font === 'Calibri' ? 11 : 12 };
    S.settings = await api.setSettings({ onboarded: true, from: ans.from || 'new', defaultStyle: style, dailyGoal: +ans.goal || 0,
      author: (ans.author || '').trim(), layout: ans.layout, structure: ans.structure });
    window.UnwipLook.setTheme(ans.theme);
    U.setMode(L.mode);
    close();
    let opened = false;
    if (ans.action === 'scriv') { await U.importScrivener(); opened = !!S.slug; }
    else if (ans.action === 'paste' || ans.action === 'files') {
      const BI = window.UnwipBookImport, after = withTour ? () => setTimeout(tour, 500) : null;
      if (ans.action === 'paste') BI.fromPaste({ onDone: after }); else BI.fromFiles({ onDone: after });
      return;
    }
    else if (ans.action === 'example') { await makeExample(); opened = true; }
    else {
      const title = await U.promptText('Your book', 'Title (you can change it later)', '');
      if (title) { const slug = await api.createProject(title, blankTemplate()); await U.openProject(slug, { skipCheck: true }); opened = true; }
    }
    if (!opened) { U.showLibrary(); return; }
    if (withTour) setTimeout(tour, 500);
    else if (L.writer) setTimeout(() => U.toast('Press the Writer mode button (or F11) any time for the distraction-free page.', '', 6000), 800);
  }

  // ================================================================== EXAMPLE PROJECT
  const P = s => s.split('\n\n').map(x => `<p>${x}</p>`).join('');
  const TEXT = {
    out: P(`The lamp at Gull Rock had burned every night for ninety years. On the night it went out, Mara Quill was halfway up the spiral stairs with a can of oil in each hand, counting steps the way her father had taught her.

Seventy-one. Seventy-two. The light above her flickered once, the way a candle does when a door opens somewhere in the house, and then it was simply gone.

She stood very still. Without the hum of the clockwork and the turning of the great lens, she could hear the sea properly for the first time in her life. It was quieter than she expected. It sounded like it was listening.

“Right,” she said, to nobody, and kept climbing.`),
    fog: P(`By midnight the fog had come in so thick that Mara could not see the rail of the gallery from the door. She lit the old storm lantern, the one with the cracked red glass, and hung it on the hook outside. It was not much. It was something.

At ten past one she heard an engine. Not a ship's engine, which she would have felt in the floor, but something small and coughing, like a fishing boat with a cold.

Then the engine stopped, and a voice called her name.`),
    log: P(`The logbook lived in the drawer under the chart table, and nobody but the keeper was supposed to write in it. Mara's father had kept it in small, square capitals for thirty-one years.

She opened it to the last page, meaning to write down the time the light failed. Instead she read the entry above it, in her father's hand, dated the morning he left:

IF THE LIGHT GOES OUT, DO NOT OPEN THE DOOR.

She read it three times. Downstairs, someone knocked.`),
    door: P(`[This chapter isn't written yet. That's what the “To do” status is for.]

Ideas:
– Who is at the door? Someone she knows, or someone who knows her?
– What did her father know?`)
  };
  const START_HERE = name => {
    const f = FROM[ans.from] || FROM.new;
    return `<p>This is an example project, so click around and change anything. Delete it from the main screen (right-click its card) when you're done.</p>
<h2>Coming from ${esc(f.name)}</h2>
<ul>${f.map.map(([a, b]) => `<li><b>${esc(a)}</b> → ${esc(b)}</li>`).join('')}</ul>
<p>${esc(f.tip)}</p>
<h2>Things to try</h2>
<ul>
<li>Open <b>${name}</b> in the Binder on the left and just type. It saves itself.</li>
<li>Drag a chapter in the Binder to reorder it.</li>
<li>Click <b>Detailed</b> at the top for the corkboard, outline and statuses${ans.layout === 'desk' ? ' (you’re already in it)' : ''}.</li>
<li>Select a word and add a comment, or put a footnote in.</li>
<li>Try <b>Revise</b> on the first chapter to see repeated words.</li>
<li>Press <b>Spark</b> if you don't know what comes next.</li>
<li>Export the book as a PDF to see the chapter titles come out properly.</li>
</ul>
<p>Settings › Help runs the setup and the tour again.</p>`;
  };
  const CHAR = `<p><b>Full name:</b> Mara Quill</p><p><b>Aliases:</b> The keeper’s girl</p><p><b>Role:</b> Main character</p><p><b>Age:</b> 19</p>
<h2>Appearance</h2><p>Salt-cracked hands, her father's oilskin coat with the sleeves rolled three times.</p>
<h2>Personality</h2><p>Practical, stubborn, talks to herself when she's frightened. Counts things.</p>
<h2>Backstory</h2><p>Grew up on Gull Rock. Her father left on the supply boat a week ago and hasn't come back.</p>
<h2>Notes</h2><p>What does she want more: to keep the light, or to leave it?</p>`;
  const PLACE = `<p><b>Name:</b> Gull Rock Lighthouse</p><p><b>Aliases:</b> The Rock</p><p><b>Region:</b> Off the north coast</p><p><b>Type:</b> Lighthouse</p>
<h2>Description</h2><p>A white tower on a lump of black rock, 112 steps to the lamp room. A keeper's cottage, a boat shed, a lot of gulls.</p>
<h2>History</h2><p>Built ninety years ago after the wreck of the <i>Constance</i>.</p><h2>Notes</h2><p>The door at the bottom of the tower has never had a lock. Why not?</p>`;

  function blankTemplate() {
    const t = U.newProjectTemplate();
    const ms = t.binder[0];
    if (ans.structure === 'scenes' || ans.structure === 'parts') {
      const scene = { id: U.uid(), type: 'doc', title: 'Scene 1', words: 0 };
      let ch = { id: U.uid(), type: 'folder', title: 'Chapter 1', holds: 'scenes', open: true, children: [scene] };
      if (ans.structure === 'parts') ch = { id: U.uid(), type: 'folder', title: 'Part One', holds: 'chapters', open: true, children: [ch] };
      ms.children = [ch]; t.lastDoc = scene.id;
    }
    return t;
  }

  async function makeExample() {
    const t = U.newProjectTemplate();
    const docs = {};
    const doc = (title, html, extra = {}) => { const id = U.uid(); docs[id] = html; return { id, type: 'doc', title, words: U.countWords(html.replace(/<[^>]+>/g, ' ')), ...extra }; };
    const desk = ans.layout === 'desk' || ans.from === 'scrivener';
    const st = s => desk ? { status: s } : {};
    let ms;
    if (ans.structure === 'chapters') {
      ms = [doc('The Light Goes Out', TEXT.out + TEXT.fog, { synopsis: 'The lamp fails. Fog comes in, and someone arrives by boat.', ...st('draft') }),
        doc('What the Logbook Said', TEXT.log, { synopsis: 'Mara finds her father’s last warning.', ...st('draft') }),
        doc('The Door', TEXT.door, { synopsis: 'Does she open it?', ...st('todo') })];
    } else {
      const ch1 = { id: U.uid(), type: 'folder', title: 'Chapter 1', holds: 'scenes', open: true, synopsis: 'The light fails on a foggy night.', children: [
        doc('The light goes out', TEXT.out, { synopsis: 'Halfway up the stairs, the lamp dies.', ...st('revised') }),
        doc('Fog', TEXT.fog, { synopsis: 'A small boat, and a voice calling her name.', ...st('draft') })] };
      const ch2 = { id: U.uid(), type: 'folder', title: 'Chapter 2', holds: 'scenes', open: true, synopsis: 'A warning, and a knock.', children: [
        doc('The logbook', TEXT.log, { synopsis: 'Her father’s last entry.', ...st('draft') }),
        doc('The door', TEXT.door, { synopsis: 'Does she open it?', ...st('todo') })] };
      ms = ans.structure === 'parts'
        ? [{ id: U.uid(), type: 'folder', title: 'Part One: The Rock', holds: 'chapters', open: true, children: [ch1, ch2] },
           { id: U.uid(), type: 'folder', title: 'Part Two: The Mainland', holds: 'chapters', open: false, children: [] }]
        : [ch1, ch2];
    }
    const firstName = ans.structure === 'chapters' ? '“The Light Goes Out”' : '“The light goes out”';
    const byKind = k => t.binder.find(n => n.kind === k);
    byKind('manuscript').children = ms;
    byKind('characters').children = [doc('Mara Quill', CHAR)];
    byKind('places').children = [doc('Gull Rock Lighthouse', PLACE)];
    const start = doc('Start here', START_HERE(firstName), { icon: '👋' });
    byKind('notes').children = [start];
    byKind('notes').open = true;
    t.lastDoc = start.id;
    t.goals = { daily: +ans.goal || 0, total: 80000, deadline: '' };
    const slug = await api.createProject('The Lighthouse Keeper (example)', t);
    for (const [id, html] of Object.entries(docs)) await api.saveDoc(slug, id, html);
    await U.openProject(slug, { skipCheck: true });
  }

  // ================================================================== THE TOUR
  // A spotlight that walks round the main buttons. Steps whose button isn't on screen are skipped.
  const TOUR = [
    ['#binder-tree', 'The Binder', 'Your whole project: the Manuscript (what gets exported), plus Characters, Places, Notes and Research. Drag to reorder; right-click anything for more.',
      { scrivener: 'Same idea as Scrivener’s Binder. Only the Manuscript is exported, like “Include in compile”.', docs: 'Instead of one long document, each chapter gets its own page here.', word: 'Like Word’s Navigation pane, but each chapter is its own page.' }],
    ['#editor', 'The page', 'Just write. Unwip saves every few seconds, keeps backups, and cleans up anything you paste in.',
      { docs: 'Pasting from Google Docs keeps italics and bold but drops the clutter.', word: 'Pasting from Word keeps italics and bold but drops the clutter.' }],
    ['#mode-switch', 'Focused or Detailed', 'Focused is a clean page. Detailed adds the corkboard, outline, status labels and timeline.',
      { scrivener: 'Detailed is where the Corkboard, Outliner and labels live.' }],
    ['#btn-writer', 'Writer mode', 'Full screen, nothing but the page. Typewriter scrolling keeps your line in the middle.',
      { hemingway: 'This is the distraction-free mode. Settings › Typewriter adds focus dimming and sounds.', scrivener: 'Like Composition mode.' }],
    ['#btn-new', 'New', 'Add a document, folder or map, or a template section like Factions, Magic or Monsters where every entry starts from the same sheet.'],
    ['#btn-help', 'Help', 'What every button does, and all the keyboard shortcuts. Press F1 any time.'],
    ['#btn-sprint', 'Sprints', 'A timed burst of writing with a word target. Good for getting going.'],
    ['#btn-stuck', 'Spark', 'Five little tools for when you don’t know what comes next or keep putting it off.'],
    ['#btn-cmdk', 'Find anything', 'Press Ctrl+K (or this magnifying glass) and type what you want: “snapshot”, “epub”, “map”, a chapter name. Every feature is in there, so nothing is ever more than a few letters away.'],
    ['#btn-panel', 'Side panel', 'Revise, Comments, Snapshots and Manuscript style share this panel. Click a tab to switch. Select some words and a small bar appears for comments, footnotes and alignment.'],
    ['#btn-revise', 'Revise', 'Highlights repeated words, adverbs, long sentences and filler for you to look at. It never changes anything by itself.',
      { hemingway: 'This is the Hemingway-style part, without any AI.' }],
    ['#btn-snap', 'Snapshots', 'Save a copy of a chapter before a big rewrite, and compare or go back later.',
      { scrivener: 'Same as Scrivener’s Snapshots.', docs: 'Like Version history, but you choose the moments.' }],
    ['#btn-copy-docs', 'Copy for Google Docs', 'Copies the chapter (or the whole book) ready to paste into Google Docs with the formatting right.'],
    ['#btn-export-more', 'Export', 'The arrow next to Copy for Docs: print-ready PDF, EPUB e-book, Word, and page counts.'],
    ['#btn-library', 'All your projects', 'Back to the main screen. The Play tab there has writing prompts and exercises that don’t touch your book.'],
    ['#btn-settings', 'Settings', 'Themes, typing sounds, Dropbox or OneDrive sync, backups and updates. Help in here runs this tour again.']
  ];
  let tEls = null;
  // really on screen: has a size, isn't hidden, and isn't tucked under something else (e.g. a squeezed toolbar)
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || getComputedStyle(el).visibility === 'hidden') return false;
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + Math.min(r.width / 2, 12))), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    if (x < 0 || y < 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    const hit = document.elementsFromPoint(x, y).find(h => !h.closest('.tour-card, .tour-spot'));
    return !!hit && (el === hit || el.contains(hit) || hit.contains(el));
  }
  // a step can name several places; the first one actually showing is used
  const target = sel => sel.split('|').map(x => $(x)).find(visible) || null;
  function tour() {
    if (!S.slug) { U.toast('Open a project first, then take the tour.'); return; }
    if (document.body.classList.contains('writer')) U.setWriter(false);
    endTour();
    tEls = { shade: document.createElement('div'), card: document.createElement('div') };
    tEls.shade.className = 'tour-spot'; tEls.card.className = 'tour-card';
    document.body.append(tEls.shade, tEls.card);
    curIdx = -1; showStep(1);
    document.addEventListener('keydown', tourKey, true);
    window.addEventListener('resize', placeStep);
  }
  function tourKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); showStep(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); showStep(-1); }
  }
  function endTour() {
    if (!tEls) return;
    tEls.shade.remove(); tEls.card.remove(); tEls = null;
    document.removeEventListener('keydown', tourKey, true);
    window.removeEventListener('resize', placeStep);
  }
  let curIdx = -1;
  function showStep(dir) {
    let i = curIdx < 0 ? 0 : curIdx + dir;
    while (i >= 0 && i < TOUR.length && !target(TOUR[i][0])) i += dir || 1;
    if (i < 0) return;
    if (i >= TOUR.length) { endTour(); curIdx = -1; U.toast('That’s the tour. Happy writing!'); return; }
    curIdx = i;
    const [sel, title, text, alt] = TOUR[i];
    const extra = alt && alt[S.settings.from];
    const shown = TOUR.filter(x => target(x[0]));
    const n = shown.indexOf(TOUR[i]) + 1;
    tEls.card.innerHTML = `<div class="tour-n">${n} of ${shown.length}</div><h3>${esc(title)}</h3><p>${esc(text)}</p>${extra ? `<p class="tour-alt">${esc(extra)}</p>` : ''}
      <div class="tour-foot"><button class="btn ghost small" data-t="end">End tour</button><span></span>${n > 1 ? '<button class="btn small" data-t="back">Back</button>' : ''}<button class="btn primary small" data-t="next">${n === shown.length ? 'Finish' : 'Next'}</button></div>`;
    tEls.card.onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'end') { endTour(); curIdx = -1; } else showStep(b.dataset.t === 'next' ? 1 : -1); };
    placeStep();
  }
  function placeStep() {
    if (!tEls || curIdx < 0) return;
    const el = target(TOUR[curIdx][0]); if (!el) return; const r = el.getBoundingClientRect();
    const pad = 6, W = innerWidth, H = innerHeight;
    // big targets (the page, the binder) get a spotlight trimmed to the screen
    const box = { l: Math.max(4, r.left - pad), t: Math.max(4, r.top - pad), r: Math.min(W - 4, r.right + pad), b: Math.min(H - 4, r.bottom + pad) };
    Object.assign(tEls.shade.style, { left: box.l + 'px', top: box.t + 'px', width: (box.r - box.l) + 'px', height: (box.b - box.t) + 'px' });
    const c = tEls.card, cw = c.offsetWidth, ch = c.offsetHeight;
    let x, y;
    if (box.b + ch + 14 < H) { y = box.b + 12; x = box.l + (box.r - box.l) / 2 - cw / 2; }          // below
    else if (box.t - ch - 14 > 0) { y = box.t - ch - 12; x = box.l + (box.r - box.l) / 2 - cw / 2; } // above
    else if (box.r + cw + 14 < W) { x = box.r + 12; y = box.t + 20; }                                   // right
    else { x = box.l + (box.r - box.l) / 2 - cw / 2; y = box.t + (box.b - box.t) / 2 - ch / 2; }       // inside (big area)
    c.style.left = Math.max(10, Math.min(W - cw - 10, x)) + 'px';
    c.style.top = Math.max(10, Math.min(H - ch - 10, y)) + 'px';
  }

  return { start, tour, endTour };
})();
