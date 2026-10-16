// Unwip - Timeline: story events on days or dates, linked to chapters and characters (Plan › Timeline).
// Moved out of app.js unchanged in the October 2026 tidy-up; it uses the shared toolbox (window.__unwip).
window.UnwipTimeline = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, $, $$, esc, on, uid, modal, toast, toastAction, confirmBox, findNode, walkTree, openDoc, scheduleMeta, today, setView } = U;
  // Events sit on "story days" (Day 1, Day 2…) or real calendar dates. Each can be linked to a chapter and to characters.
  const EV_COLOURS = ['#4a7fd0', '#c0392b', '#3f9a5a', '#d39b2a', '#7a5cc7', '#13a1a1', '#c2577a', '#6b6b6b'];
  function tl() {
    S.project.timeline = S.project.timeline || { mode: 'days', lanes: 'single', events: [], zoom: 70, filter: '' };
    return S.project.timeline;
  }
  const dayNum = d => Math.round(new Date(d + 'T12:00:00').getTime() / 86400000);
  const numDay = n => new Date(n * 86400000).toISOString().slice(0, 10);
  function evStart(e, T) { return T.mode === 'dates' ? (e.date ? dayNum(e.date) : null) : (e.day ?? null); }
  function evEnd(e, T) { return T.mode === 'dates' ? (e.endDate ? dayNum(e.endDate) : evStart(e, T)) : (e.endDay ?? evStart(e, T)); }
  function characterNames() {
    const set = new Set(window.FolioNames.entries.filter(e => e.kind === 'Character' && !e.primary).map(e => e.text));
    for (const e of tl().events) (e.chars || []).forEach(c => set.add(c));
    return [...set].sort((a, b) => a.localeCompare(b));
  }
  function chapterList() {
    const out = []; walkTree(findNode('root-manuscript').node.children || [], n => { if (n.type === 'doc') out.push(n); }); return out;
  }
  // an event can cover several chapters (a ball over chapters 9–12). Older events kept one, in chapterId.
  const evChapters = e => (e.chapterIds && e.chapterIds.length ? e.chapterIds : e.chapterId ? [e.chapterId] : []).filter(id => findNode(id));
  const setEvChapters = (e, ids) => { e.chapterIds = ids; e.chapterId = ids[0] || null; };   // chapterId too, so older versions still see the first
  // which characters the timeline follows: several at once shows the events they're in together (or any of them)
  const tlFilters = T => (Array.isArray(T.filters) ? T.filters : T.filter ? [T.filter] : []);
  // names as little chips: type and press Enter or comma (suggestions from the Characters sheets), × or Backspace removes
  function chipInput(values, suggestions, placeholder) {
    const el = document.createElement('div'); el.className = 'chipin'; el.dataset.ownEnter = '1';   // Enter adds a name here, it doesn't close the dialog
    let vals = [...values];
    const draw = () => {
      el.innerHTML = vals.map((v, i) => `<span class="chipin-c">${esc(v)}<button type="button" data-i="${i}" aria-label="Remove ${esc(v)}">×</button></span>`).join('') +
        `<span class="chipin-w"><input type="text" class="chipin-in" placeholder="${vals.length ? '' : esc(placeholder)}" autocomplete="off" spellcheck="false"><span class="chipin-s hidden"></span></span>`;
      const inp = $('.chipin-in', el), sug = $('.chipin-s', el);
      let pick = 0, list = [];
      const showSug = () => {
        const q = inp.value.trim().toLowerCase();
        list = suggestions.filter(n => !vals.some(v => v.toLowerCase() === n.toLowerCase()) && (!q || n.toLowerCase().includes(q))).slice(0, 8);
        if (!list.length || (!q && document.activeElement !== inp)) { sug.classList.add('hidden'); return; }
        pick = Math.min(pick, list.length - 1);
        sug.innerHTML = list.map((n, i) => `<button type="button" class="${i === pick ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}</button>`).join('');
        sug.classList.remove('hidden');
        $$('button', sug).forEach(b => b.onmousedown = e => { e.preventDefault(); add(b.dataset.n); });
      };
      const add = v => { v = String(v || '').replace(/,/g, ' ').trim(); if (v && !vals.some(x => x.toLowerCase() === v.toLowerCase())) vals.push(v); draw(); $('.chipin-in', el).focus(); };
      inp.addEventListener('input', () => { if (inp.value.includes(',')) { inp.value.split(',').slice(0, -1).forEach(x => { if (x.trim() && !vals.includes(x.trim())) vals.push(x.trim()); }); const rest = inp.value.split(',').pop(); draw(); const i2 = $('.chipin-in', el); i2.value = rest; i2.focus(); return; } pick = 0; showSug(); });
      inp.addEventListener('focus', showSug);
      inp.addEventListener('blur', () => setTimeout(() => { if (!inp.isConnected) return; if (inp.value.trim()) add(inp.value); else sug.classList.add('hidden'); }, 120));   // (a chip just added redraws the box: the old box's blur is ignored)
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && list.length) { e.preventDefault(); pick = (pick + 1) % list.length; showSug(); }
        else if (e.key === 'ArrowUp' && list.length) { e.preventDefault(); pick = (pick - 1 + list.length) % list.length; showSug(); }
        else if (e.key === 'Enter' || e.key === 'Tab') {
          const typed = inp.value.trim(), choice = !sug.classList.contains('hidden') && list[pick];
          if (typed || (choice && e.key === 'Enter')) { e.preventDefault(); e.stopPropagation(); add(choice && (!typed || choice.toLowerCase().startsWith(typed.toLowerCase())) ? choice : typed); }
        }
        else if (e.key === 'Backspace' && !inp.value && vals.length) { vals.pop(); draw(); $('.chipin-in', el).focus(); }
        else if (e.key === 'Escape' && !sug.classList.contains('hidden')) { e.stopPropagation(); sug.classList.add('hidden'); }
      }, true);
      $$('.chipin-c button', el).forEach(b => b.onclick = () => { vals.splice(+b.dataset.i, 1); draw(); });
    };
    el.addEventListener('mousedown', e => { if (e.target === el) { e.preventDefault(); $('.chipin-in', el).focus(); } });
    draw();
    return { el, get: () => { const t = $('.chipin-in', el); if (t && t.value.trim()) { const v = t.value.trim(); if (!vals.includes(v)) vals.push(v); } return [...vals]; } };
  }

  function renderTimeline() {
    const T = tl();
    const tv = $('#timeline-view');
    const placed = T.events.filter(e => evStart(e, T) != null);
    const unplaced = T.events.filter(e => evStart(e, T) == null);
    const F = tlFilters(T), anyMode = T.filterAny;
    const shown = placed.filter(e => !F.length || (anyMode ? F.some(n => (e.chars || []).includes(n)) : F.every(n => (e.chars || []).includes(n))));
    const starts = placed.map(e => evStart(e, T)), ends = placed.map(e => evEnd(e, T));
    let min = starts.length ? Math.min(...starts) : (T.mode === 'dates' ? dayNum(today()) : 1);
    let max = ends.length ? Math.max(...ends) : min + 10;
    if (T.mode === 'dates') min -= 1; else min = Math.min(min, 1);
    max = Math.max(max + 3, min + 12);
    const px = T.zoom || 70;
    const width = (max - min + 1) * px;
    // lanes
    let lanes;
    if (T.lanes === 'chars') {
      const names = [...new Set(shown.flatMap(e => (e.chars && e.chars.length) ? e.chars : ['—']))].sort((a, b) => a === '—' ? 1 : b === '—' ? -1 : a.localeCompare(b));
      lanes = names.map(n => ({ label: n === '—' ? 'No character' : n, events: shown.filter(e => n === '—' ? !(e.chars && e.chars.length) : e.chars.includes(n)) }));
    } else lanes = [{ label: '', events: shown }];
    // stack overlapping events into rows inside each lane
    const C = T.mode === 'days' && window.UnwipCalendar && window.UnwipCalendar.on ? window.UnwipCalendar : null;
    const ROW = C ? 78 : 64;
    for (const ln of lanes) {
      const rows = [];
      ln.items = ln.events.slice().sort((a, b) => evStart(a, T) - evStart(b, T)).map(e => {
        const s = evStart(e, T), en = evEnd(e, T);
        const minW = Math.max(150, (en - s + 1) * px - 8);
        const x = (s - min) * px + 4;
        let r = rows.findIndex(endX => endX <= x);
        if (r < 0) { r = rows.length; rows.push(0); }
        rows[r] = x + minW + 8;
        return { e, x, w: minW, row: r, span: en > s };
      });
      ln.height = Math.max(1, rows.length) * ROW + 16;
    }
    const tick = d => {
      if (T.mode === 'dates') return new Date(numDay(d) + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(px < 40 ? {} : { year: '2-digit' }) });
      if (!C) return `Day ${d}`;
      const w = C.fromDay(d);
      return `<i class="${w.d === 1 ? 'tl-m1' : ''}" title="Day ${d}: ${esc(C.describe(d))}">${w.d === 1 && w.m === 0 ? esc(String(w.y)) + ' · ' : ''}${esc(C.label(d, { short: true, tight: px < 60 }))}</i>`;
    };
    const step = C ? [1, 2, 3, 5, 7, 10, 15, 30, 60, 90].find(k => k * px >= 96) || 120 : px >= 60 ? 1 : px >= 30 ? 2 : px >= 15 ? 5 : 10;
    const ticks = []; for (let d = min; d <= max; d++) if ((d - min) % step === 0) ticks.push(d);
    // full and new moons of your own calendar, on the day they fall
    const moonMarks = () => { if (!C || max - min > 4000) return ''; let out = ''; for (let d = min; d <= max; d++) for (const m of C.fromDay(d).moons) if (m.exact) out += `<b class="tl-moon" style="left:${(d - min) * px + px / 2}px" title="Day ${d}: ${esc(m.n)}, ${m.exact} moon">${m.exact === 'full' ? '🌕' : '🌑'}</b>`; return out; };
    const names = characterNames();
    tv.innerHTML = `
      <div class="tl-head">
        <div class="seg" title="How time is measured">${[['days', 'Story days'], ['dates', 'Calendar dates']].map(([k, l]) => `<button data-mode="${k}" class="${T.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="seg" title="Layout">${[['single', 'One line'], ['chars', 'By character']].map(([k, l]) => `<button data-lanes="${k}" class="${T.lanes === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn small ghost tl-fbtn ${F.length ? 'on' : ''}" id="tl-filter" title="Follow one or more characters">${F.length ? esc(F.length <= 2 ? F.join(' + ') : F.length + ' characters') + (F.length > 1 ? (anyMode ? ' (any)' : ' (together)') : '') : 'All characters'} ▾</button>
        ${T.mode === 'days' && window.UnwipCalendar ? `<button class="btn small ghost" id="tl-cal" title="Name the months, weeks, seasons and moons of your world">🌙 ${C ? esc(C.calendar.name || 'Calendar') : 'Your own calendar…'}</button>` : ''}
        <span class="mb-zoom"><input type="range" id="tl-zoom" min="10" max="160" step="5" value="${px}"></span>
        <span style="flex:1"></span>
        ${chapterList().length ? '<button class="btn small" id="tl-fromch">Add events from chapters</button>' : ''}
        <button class="btn small primary" id="tl-add">+ Event</button>
      </div>
      <div class="tl-scroll" id="tl-scroll">
        <div class="tl-inner" style="width:${width + 160}px">
          <div class="tl-axis ${C ? 'cal' : ''}" style="margin-left:${T.lanes === 'chars' ? 140 : 0}px;width:${width}px">${ticks.map(d => `<span style="left:${(d - min) * px}px">${tick(d)}</span>`).join('')}${moonMarks()}</div>
          ${lanes.map(ln => `
            <div class="tl-lane" style="height:${ln.height}px">
              ${T.lanes === 'chars' ? `<div class="tl-lane-label">${esc(ln.label)}</div>` : ''}
              <div class="tl-track" style="margin-left:${T.lanes === 'chars' ? 140 : 0}px;width:${width}px;background-size:${px * step}px 100%">
                ${ln.items.map(it => {
                  const chIds = evChapters(it.e), ch = chIds.length ? findNode(chIds[0]) : null, chMore = chIds.length > 1 ? ` +${chIds.length - 1}` : '';
                  return `<div class="tl-ev ${it.span ? 'span' : ''}" data-id="${it.e.id}" style="left:${it.x}px;top:${it.row * ROW + 10}px;width:${it.w}px;--ev:${it.e.color || EV_COLOURS[0]}">
                    <b>${esc(it.e.title || 'Untitled event')}</b>
                    <span>${C && evStart(it.e, T) != null ? `<em class="tl-wd">${esc(C.label(evStart(it.e, T)))}</em>` : ''}${ch ? '§ ' + esc(ch.node.title) + chMore : ''}${(it.e.chars || []).length && T.lanes !== 'chars' ? (ch ? ' · ' : '') + esc(it.e.chars.join(', ')) : ''}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>`).join('')}
          ${!shown.length ? `<div class="tl-empty">${T.events.length ? (F.length > 1 && !anyMode ? 'These characters aren’t in any event together yet.' : 'No events for this character yet.') : '<b>No events yet</b>Add the key moments of your story: battles, births, journeys, betrayals. Link each to a chapter and the characters involved, then follow one character’s path with the filter above.'}</div>` : ''}
        </div>
      </div>
      ${unplaced.length ? `<div class="tl-unplaced"><b>Not on the ${T.mode === 'dates' ? 'calendar' : 'timeline'} yet:</b> ${unplaced.map(e => `<button class="tl-chip" data-id="${e.id}">${esc(e.title || 'Untitled')}</button>`).join('')}<span class="hint">Click one to give it a ${T.mode === 'dates' ? 'date' : 'day'}.</span></div>` : ''}
      <p class="ol-tip">Drag an event left or right to move it. Click to edit, link a chapter or add characters. Events that last longer stretch across days.</p>`;
    $$('[data-mode]', tv).forEach(b => b.onclick = () => {
      if (b.dataset.mode === 'dates' && !T.events.some(e => e.date) && T.events.length) toast('Give your events dates to see them on the calendar. Story days and dates are kept separately, so you can use both.', '', 7000);
      T.mode = b.dataset.mode; scheduleMeta(); renderTimeline();
    });
    $$('[data-lanes]', tv).forEach(b => b.onclick = () => { T.lanes = b.dataset.lanes; scheduleMeta(); renderTimeline(); });
    $('#tl-filter', tv).onclick = e => {
      // tick several characters: "together" shows the events they share, "any" shows each one's events
      const old = document.querySelector('.tl-fmenu'); if (old) { old.remove(); return; }
      const r = e.currentTarget.getBoundingClientRect(), m = document.createElement('div'); m.className = 'tl-fmenu';
      m.style.left = Math.min(r.left, innerWidth - 270) + 'px'; m.style.top = r.bottom + 4 + 'px';
      const sel = new Set(tlFilters(T));
      m.innerHTML = `<div class="seg tl-fmode">${[['', 'Together'], ['any', 'Any of them']].map(([k, l]) => `<button type="button" data-any="${k}" class="${!!T.filterAny === !!k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <div class="tl-flist">${names.length ? names.map(n => `<label class="check"><input type="checkbox" value="${esc(n)}" ${sel.has(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('') : '<p class="hint">No characters yet. Add them to events, or make Characters sheets.</p>'}</div>
        <div class="tl-ffoot"><button type="button" class="btn small ghost" data-clear>Show everyone</button></div>`;
      document.body.appendChild(m);
      const apply = () => { T.filters = [...m.querySelectorAll('.tl-flist input:checked')].map(i => i.value); T.filter = T.filters.length === 1 ? T.filters[0] : ''; scheduleMeta(); const keep = [m.style.left, m.style.top]; renderTimeline(); document.body.appendChild(m); [m.style.left, m.style.top] = keep; };
      m.querySelectorAll('.tl-flist input').forEach(i => i.onchange = apply);
      m.querySelectorAll('[data-any]').forEach(b => b.onclick = () => { T.filterAny = !!b.dataset.any; m.querySelectorAll('[data-any]').forEach(x => x.classList.toggle('on', x === b)); apply(); });
      m.querySelector('[data-clear]').onclick = () => { m.querySelectorAll('.tl-flist input').forEach(i => { i.checked = false; }); apply(); };
      setTimeout(() => { const off = ev => { if (!m.contains(ev.target) && !ev.target.closest('#tl-filter')) { m.remove(); document.removeEventListener('mousedown', off, true); } }; document.addEventListener('mousedown', off, true); }, 0);
    };
    $('#tl-zoom', tv).onchange = e => { T.zoom = +e.target.value; scheduleMeta(); renderTimeline(); };
    $('#tl-add', tv).onclick = () => editEvent(null);
    const calB = $('#tl-cal', tv); if (calB) calB.onclick = async () => { if (await window.UnwipCalendar.setup()) renderTimeline(); };
    const fromCh = $('#tl-fromch', tv); if (fromCh) fromCh.onclick = addEventsFromChapters;
    $$('.tl-chip', tv).forEach(c => c.onclick = () => editEvent(T.events.find(e => e.id === c.dataset.id)));
    // drag to move along the line (snaps to whole days)
    $$('.tl-ev', tv).forEach(el => {
      const ev = T.events.find(e => e.id === el.dataset.id);
      el.addEventListener('mousedown', down => {
        if (down.button !== 0) return;
        down.preventDefault();
        const sx = down.clientX, ox = parseFloat(el.style.left); let moved = 0;
        const mm = m => { const dx = m.clientX - sx; if (Math.abs(dx) > 3) moved = dx; el.style.left = ox + dx + 'px'; el.classList.add('dragging'); };
        const mu = () => {
          document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
          if (!moved) { editEvent(ev); return; }
          const shift = Math.round(moved / px);
          if (shift) {
            if (T.mode === 'dates') { ev.date = numDay(dayNum(ev.date) + shift); if (ev.endDate) ev.endDate = numDay(dayNum(ev.endDate) + shift); }
            else { ev.day = ev.day + shift; if (ev.endDay != null) ev.endDay += shift; }
            scheduleMeta();
          }
          renderTimeline();
        };
        document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
      });
    });
  }

  // seed: a new event started from words picked in a chapter (Add to… on the selection): its title, note and chapter
  async function editEvent(ev, seed) {
    const T = tl();
    const isNew = !ev;
    const lastDay = T.events.reduce((a, e) => Math.max(a, e.endDay ?? e.day ?? 0), 0);
    ev = ev || { id: uid(), title: (seed && seed.title) || '', day: lastDay + 1, chars: (seed && seed.chars) || [], note: (seed && seed.note) || '', chapterIds: seed && seed.chapterId ? [seed.chapterId] : undefined, color: EV_COLOURS[T.events.length % EV_COLOURS.length] };
    const chs = chapterList();
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-grid">
        <div class="field full"><label>What happens</label><input type="text" id="ev-title" value="${esc(ev.title || '')}" placeholder="e.g. The siege of the Moor begins"></div>
        <div class="field"><label>Story day</label><input type="number" id="ev-day" value="${ev.day ?? ''}" placeholder="e.g. 3"></div>
        <div class="field"><label>Lasts until day (optional)</label><input type="number" id="ev-endday" value="${ev.endDay ?? ''}" placeholder="same day"></div>
        ${window.UnwipCalendar && window.UnwipCalendar.on ? `<div class="field full ev-world"><label>In ${esc(window.UnwipCalendar.calendar.name || 'your calendar')}</label><div class="ev-wrow"><input type="number" id="ev-wd" min="1"><select id="ev-wm">${window.UnwipCalendar.calendar.months.map((m, i) => `<option value="${i}">${esc(m[0])}</option>`).join('')}</select><input type="number" id="ev-wy" title="Year"><span id="ev-wdesc" class="hint"></span></div></div>` : ''}
        <div class="field"><label>Calendar date (optional)</label><input type="date" class="date-input" id="ev-date" value="${ev.date || ''}"></div>
        <div class="field"><label>Until date (optional)</label><input type="date" class="date-input" id="ev-enddate" value="${ev.endDate || ''}"></div>
        <div class="field full"><label>Characters involved</label><div id="ev-chars-box"></div><span class="hint">Type a name and press Enter. Names from your Characters sheets are suggested.</span></div>
        <div class="field full"><label>Chapters</label><div id="ev-chs-box" class="ev-chs"></div>
          <select id="ev-ch-add"><option value="">+ Link a chapter…</option>${chs.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join('')}</select></div>
        <div class="field"><label>Colour</label><div class="ev-colours">${EV_COLOURS.map(c => `<button type="button" class="ev-c ${c === ev.color ? 'on' : ''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div></div>
        <div class="field full"><label>Notes</label><textarea id="ev-note" rows="3" class="ev-note">${esc(ev.note || '')}</textarea></div>
      </div>`;
    let colour = ev.color;
    const charsIn = chipInput(ev.chars || [], characterNames(), 'e.g. Mara'); $('#ev-chars-box', body).appendChild(charsIn.el);
    // chapters: one or several (an event can span chapters 9–12)
    let chIds = evChapters(ev);
    const drawChs = () => {
      const box = $('#ev-chs-box', body);
      box.innerHTML = chIds.length ? chIds.map((id, i) => { const f = findNode(id); return `<span class="chipin-c">§ ${esc(f ? f.node.title : 'Chapter')}<button type="button" data-i="${i}" aria-label="Unlink">×</button></span>`; }).join('') : '<span class="hint">Not linked to a chapter.</span>';
      $$('button', box).forEach(b => b.onclick = () => { chIds.splice(+b.dataset.i, 1); drawChs(); });
      const order = chs.map(c => c.id); chIds.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    };
    $('#ev-ch-add', body).onchange = e => { const id = e.target.value; if (id && !chIds.includes(id)) chIds.push(id); e.target.value = ''; drawChs(); };
    drawChs();
    // your own calendar: the world date and the story day follow each other
    if (window.UnwipCalendar && window.UnwipCalendar.on) {
      const C = window.UnwipCalendar, dayIn = $('#ev-day', body), wd = $('#ev-wd', body), wm = $('#ev-wm', body), wy = $('#ev-wy', body), desc = $('#ev-wdesc', body);
      const fromDayField = () => { if (dayIn.value === '') { desc.textContent = ''; return; } const w = C.fromDay(+dayIn.value); wd.value = w.d; wm.value = w.m; wy.value = w.y; desc.textContent = C.describe(+dayIn.value).split(' · ').slice(1).join(' · '); };
      const fromWorld = () => { const m = +wm.value, max = +C.calendar.months[m][1]; if (+wd.value > max) wd.value = max; if (wd.value === '' || wy.value === '') return; dayIn.value = C.toDay(+wy.value, m, +wd.value); fromDayField(); };
      dayIn.addEventListener('input', fromDayField); [wd, wm, wy].forEach(x => x.addEventListener('input', fromWorld)); fromDayField();
    }
    $$('.ev-c', body).forEach(b => b.onclick = () => { $$('.ev-c', body).forEach(x => x.classList.remove('on')); b.classList.add('on'); colour = b.dataset.c; });
    const buttons = [{ label: 'Cancel', value: null, kind: 'ghost' }];
    if (!isNew) buttons.unshift({ label: 'Delete', value: 'delete', kind: 'ghost danger-text' });
    if (evChapters(ev).length) buttons.splice(buttons.length, 0, { label: evChapters(ev).length > 1 ? 'Open first chapter' : 'Open chapter', value: 'open' });
    buttons.push({ label: isNew ? 'Add event' : 'Save', value: 'save', kind: 'primary' });
    const res = await modal({ title: isNew ? 'New event' : 'Edit event', body, wide: true, buttons });
    if (!res) return;
    if (res === 'delete') { T.events.splice(T.events.indexOf(ev), 1); scheduleMeta(); renderTimeline(); toastAction('Event deleted.', 'Undo', () => { T.events.push(ev); scheduleMeta(); renderTimeline(); }, 6000); return; }
    const v = id => $('#' + id, body).value;
    ev.title = v('ev-title').trim() || 'Untitled event';
    ev.day = v('ev-day') === '' ? null : +v('ev-day');
    ev.endDay = v('ev-endday') === '' || +v('ev-endday') <= (ev.day ?? -1e9) ? null : +v('ev-endday');
    ev.date = v('ev-date') || null;
    ev.endDate = v('ev-enddate') && ev.date && v('ev-enddate') > ev.date ? v('ev-enddate') : null;
    ev.chars = charsIn.get();
    setEvChapters(ev, chIds);
    ev.note = v('ev-note');
    ev.color = colour;
    if (isNew) T.events.push(ev);
    scheduleMeta(); if (!seed || S.view === 'timeline') renderTimeline();
    if (isNew && seed) toastAction(`Event added to the timeline: <b>${esc(ev.title)}</b>.`, 'Open the timeline', () => setView('timeline'), 7000);
    if (res === 'open' && evChapters(ev).length) { setView('write'); openDoc(evChapters(ev)[0]); }
  }
  async function addEventsFromChapters() {
    const T = tl();
    const linked = new Set(T.events.flatMap(e => evChapters(e)));
    const chs = chapterList().filter(c => !linked.has(c.id));
    if (!chs.length) { toast('Every chapter already has an event.'); return; }
    if (!(await confirmBox('Add events from chapters?', `Adds an event for each of ${chs.length} chapter${chs.length === 1 ? '' : 's'} (using its synopsis and point-of-view character), one day apart. You can drag them to the right days afterwards.`, 'Add events'))) return;
    let day = T.events.reduce((a, e) => Math.max(a, e.endDay ?? e.day ?? 0), 0);
    const added = chs.map((c, i) => ({ id: uid(), title: c.synopsis ? (c.synopsis.length > 60 ? c.synopsis.slice(0, 57) + '…' : c.synopsis) : c.title, day: ++day, chars: c.pov ? [c.pov] : [], chapterId: c.id, chapterIds: [c.id], color: EV_COLOURS[(T.events.length + i) % EV_COLOURS.length] }));
    T.events.push(...added);
    scheduleMeta(); renderTimeline();
    toastAction(`Added ${added.length} event${added.length === 1 ? '' : 's'}.`, 'Undo', () => { const gone = new Set(added.map(e => e.id)); const TT = tl(); TT.events = TT.events.filter(e => !gone.has(e.id)); scheduleMeta(); renderTimeline(); toast('Taken back out.'); }, 15000);
  }
  return { render: renderTimeline, edit: editEvent };
})();
