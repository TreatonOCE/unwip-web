// Unwip - your own calendar for the Timeline: month names and lengths, a week, an era, seasons and
// moons. Story days stay the measure underneath (Day 1, Day 2…); the calendar only says what each
// day is called in your world, so events never move when you change it.
window.UnwipCalendar = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, $, esc } = U;
  const mod = (a, n) => ((a % n) + n) % n;
  const PHASES = ['🌕', '🌖', '🌗', '🌘', '🌑', '🌒', '🌓', '🌔'];
  const PHASE_NAMES = ['full moon', 'waning', 'last quarter', 'waning', 'new moon', 'waxing', 'first quarter', 'waxing'];

  const PRESETS = {
    fantasy: { name: 'Reckoning of the Realm', era: 'AR', months: [['Thawmonth', 30], ['Seedmonth', 30], ['Bloomtide', 30], ['Highsun', 30], ['Goldmonth', 30], ['Harvest', 30], ['Leaffall', 30], ['Frostmonth', 30], ['Deepwinter', 30], ['Longnight', 30], ['Snowmelt', 30], ['Yearsend', 35]],
      week: ['Moonday', 'Tideday', 'Windsday', 'Thunderday', 'Fireday', 'Starday', 'Sunday'], start: { y: 1204, m: 0, d: 1, wd: 0 },
      seasons: [['Spring', 0, 1], ['Summer', 3, 1], ['Autumn', 6, 1], ['Winter', 8, 1]], moons: [['The Moon', 30, 1]] },
    earth: { name: 'Earth calendar', era: '', months: [['January', 31], ['February', 28], ['March', 31], ['April', 30], ['May', 31], ['June', 30], ['July', 31], ['August', 31], ['September', 30], ['October', 31], ['November', 30], ['December', 31]],
      week: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], start: { y: 2025, m: 0, d: 1, wd: 2 },
      seasons: [['Spring', 2, 1], ['Summer', 5, 1], ['Autumn', 8, 1], ['Winter', 11, 1]], moons: [['The Moon', 29.53, 14]] },
    two: { name: 'Twin-moon calendar', era: '', months: [['First Dark', 36], ['Second Dark', 36], ['First Light', 36], ['Second Light', 36], ['Turning', 36], ['High Light', 36], ['Waning Light', 36], ['Dusk', 36], ['Old Dark', 36], ['Year’s Breath', 41]],
      week: ['Oneday', 'Twoday', 'Threeday', 'Fourday', 'Restday'], start: { y: 1, m: 0, d: 1, wd: 0 },
      seasons: [['Dark', 0, 1], ['Light', 2, 1], ['Dusk', 7, 1]], moons: [['Ilun', 24, 1], ['Varra', 37, 10]] }
  };

  const cal = () => { const T = S.project && S.project.timeline; return T && T.calendar && T.calendar.on && T.calendar.months && T.calendar.months.length ? T.calendar : null; };
  const yearLen = c => c.months.reduce((a, m) => a + Math.max(1, +m[1] || 1), 0);
  const startOffset = c => c.months.slice(0, c.start.m).reduce((a, m) => a + Math.max(1, +m[1] || 1), 0) + (c.start.d - 1);

  // story day -> { y, m, d, wd, season, moons }
  function fromDay(day, c = cal()) {
    if (!c) return null;
    const Y = yearLen(c), i = (day - 1) + startOffset(c);
    const y = c.start.y + Math.floor(i / Y); let r = mod(i, Y), m = 0;
    while (m < c.months.length - 1 && r >= +c.months[m][1]) { r -= +c.months[m][1]; m++; }
    const d = r + 1;
    const wd = c.week && c.week.length ? mod(day - 1 + (c.start.wd || 0), c.week.length) : -1;
    let season = '';
    const ss = (c.seasons || []).filter(s => s[0]).map(s => ({ n: s[0], at: c.months.slice(0, s[1]).reduce((a, x) => a + +x[1], 0) + (s[2] || 1) - 1 })).sort((a, b) => a.at - b.at);
    if (ss.length) { const pos = mod(i, Y); season = (ss.filter(s => s.at <= pos).pop() || ss[ss.length - 1]).n; }
    const moons = (c.moons || []).filter(x => x[0] && +x[1] > 1).map(([n, cyc, full]) => { const r = mod(day - (full || 1), +cyc), k = Math.round(r / +cyc * 8) % 8; return { n, k, icon: PHASES[k], phase: PHASE_NAMES[k], exact: r < 1 ? 'full' : Math.abs(r - cyc / 2) < 0.5 ? 'new' : '' }; });
    return { y, m, d, wd, season, moons };
  }
  // world date -> story day
  function toDay(y, m, d, c = cal()) {
    if (!c) return null;
    const before = c.months.slice(0, m).reduce((a, x) => a + +x[1], 0);
    return (y - c.start.y) * yearLen(c) + before + (d - 1) - startOffset(c) + 1;
  }
  const yearText = (y, c) => `${y}${c.era ? ' ' + c.era : ''}`;
  function label(day, opts = {}) {
    const c = cal(), w = fromDay(day, c); if (!w) return null;
    const mn = c.months[w.m][0];
    if (opts.short) return `${w.d} ${mn.length > 7 && opts.tight ? mn.slice(0, 4) + '.' : mn}`;
    return `${opts.weekday && w.wd >= 0 ? c.week[w.wd] + ', ' : ''}${w.d} ${mn} ${yearText(w.y, c)}`;
  }
  function describe(day) {
    const c = cal(), w = fromDay(day, c); if (!w) return '';
    return [label(day, { weekday: true }), w.season, ...w.moons.map(x => `${x.n}: ${x.phase} ${x.icon}`)].filter(Boolean).join(' · ');
  }

  // ------------------------------------------------------------------ setting it up
  async function setup() {
    const T = S.project.timeline = S.project.timeline || { mode: 'days', lanes: 'single', events: [], zoom: 70, filter: '' };
    const had = T.calendar && T.calendar.months ? JSON.parse(JSON.stringify(T.calendar)) : null;
    let c = had || JSON.parse(JSON.stringify(PRESETS.fantasy));
    c.on = true;
    const body = document.createElement('div'); body.className = 'cal';
    const rows = (list, cells, cls) => list.map((r, i) => `<div class="cal-row ${cls}" data-i="${i}">${cells(r, i)}<button type="button" class="cal-x" data-del="${cls}" data-i="${i}" title="Remove" aria-label="Remove">×</button></div>`).join('');
    const monthOpts = sel => c.months.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(m[0] || 'Month ' + (i + 1))}</option>`).join('');
    const draw = () => {
      body.innerHTML = `
        <p class="hint">Name the months, the week, seasons and moons of your world. Your events stay on their story days; this only changes what each day is called. <span class="cal-pre">Start from: <button type="button" class="link-btn" data-pre="fantasy">Fantasy</button> · <button type="button" class="link-btn" data-pre="earth">Earth</button> · <button type="button" class="link-btn" data-pre="two">Two moons</button></span></p>
        <div class="form-grid">
          <div class="field"><label>Calendar name</label><input type="text" id="cal-name" value="${esc(c.name || '')}" placeholder="e.g. The Harbour Count"></div>
          <div class="field"><label>After the year (optional)</label><input type="text" id="cal-era" value="${esc(c.era || '')}" placeholder="e.g. AR, Third Age"></div>
        </div>
        <div class="cal-cols">
          <div><h4>Months <small>${c.months.length} months, ${yearLen(c)} days a year</small></h4>
            <div class="cal-list">${rows(c.months, m => `<input type="text" class="cal-mn" value="${esc(m[0])}" placeholder="Month name"><input class="cal-md" type="number" min="1" max="400" value="${m[1]}" title="Days in this month">`, 'mo')}</div>
            <button type="button" class="btn small ghost" data-add="mo">+ Month</button></div>
          <div><h4>Seasons</h4>
            <div class="cal-list">${rows(c.seasons || [], s => `<input type="text" class="cal-sn" value="${esc(s[0])}" placeholder="Season"><span class="cal-w">from</span><input class="cal-sd" type="number" min="1" value="${s[2] || 1}" title="Day of the month"><select class="cal-sm">${monthOpts(s[1])}</select>`, 'se')}</div>
            <button type="button" class="btn small ghost" data-add="se">+ Season</button>
            <h4>Moons</h4>
            <div class="cal-list">${rows(c.moons || [], m => `<input type="text" class="cal-on" value="${esc(m[0])}" placeholder="Moon name"><input class="cal-oc" type="number" min="2" step="0.01" value="${m[1]}" title="Days from one full moon to the next"><span class="cal-w">days, full on day</span><input class="cal-of" type="number" value="${m[2] || 1}" title="A story day when this moon is full">`, 'mn')}</div>
            <button type="button" class="btn small ghost" data-add="mn">+ Moon</button></div>
        </div>
        <div class="field"><label>Days of the week (comma separated, optional)</label><input type="text" id="cal-week" value="${esc((c.week || []).join(', '))}" placeholder="e.g. Moonday, Tideday, Windsday"></div>
        <div class="cal-start"><b>Day 1 of your story is</b>
          <input id="cal-sd" type="number" min="1" value="${c.start.d}"> <select id="cal-sm">${monthOpts(c.start.m)}</select> <input id="cal-sy" type="number" value="${c.start.y}" title="Year">
          ${c.week && c.week.length ? `<span class="cal-w">, a</span> <select id="cal-swd">${c.week.map((w, i) => `<option value="${i}" ${i === (c.start.wd || 0) ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>` : ''}</div>
        <p class="cal-prev" id="cal-prev"></p>`;
      body.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => { c = JSON.parse(JSON.stringify(PRESETS[b.dataset.pre])); c.on = true; draw(); });
      body.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { read(); const k = b.dataset.add;
        if (k === 'mo') c.months.push(['', 30]); if (k === 'se') (c.seasons = c.seasons || []).push(['', 0, 1]); if (k === 'mn') (c.moons = c.moons || []).push(['', 28, 1]); draw();
        const l = b.previousElementSibling.querySelector('.cal-row:last-child input'); if (l) l.focus(); });
      body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { read(); const list = { mo: c.months, se: c.seasons, mn: c.moons }[b.dataset.del]; if (b.dataset.del === 'mo' && c.months.length < 2) return; list.splice(+b.dataset.i, 1); if (c.start.m >= c.months.length) c.start.m = 0; draw(); });
      body.querySelectorAll('input, select').forEach(x => x.addEventListener('input', () => { read(); preview(); }));
      body.querySelector('#cal-week').addEventListener('change', () => { read(); draw(); });
      body.querySelectorAll('.cal-mn').forEach(x => x.addEventListener('change', () => { read(); draw(); }));
      preview();
    };
    const read = () => {
      const q = s => body.querySelector(s), all = s => [...body.querySelectorAll(s)];
      c.name = q('#cal-name').value.trim(); c.era = q('#cal-era').value.trim();
      c.months = all('.cal-row.mo').map(r => [r.querySelector('.cal-mn').value.trim(), Math.max(1, Math.min(400, Math.round(+r.querySelector('.cal-md').value) || 1))]);
      c.seasons = all('.cal-row.se').map(r => [r.querySelector('.cal-sn').value.trim(), +r.querySelector('.cal-sm').value, Math.max(1, Math.round(+r.querySelector('.cal-sd').value) || 1)]);
      c.moons = all('.cal-row.mn').map(r => [r.querySelector('.cal-on').value.trim(), Math.max(2, +r.querySelector('.cal-oc').value || 28), Math.round(+r.querySelector('.cal-of').value) || 1]);
      c.week = q('#cal-week').value.split(',').map(x => x.trim()).filter(Boolean);
      const m = Math.min(+q('#cal-sm').value || 0, c.months.length - 1);
      c.start = { y: Math.round(+q('#cal-sy').value) || 0, m, d: Math.max(1, Math.min(+c.months[m][1], Math.round(+q('#cal-sd').value) || 1)), wd: q('#cal-swd') ? +q('#cal-swd').value : 0 };
    };
    const preview = () => {
      const p = body.querySelector('#cal-prev'); if (!p) return;
      const keep = T.calendar; T.calendar = c;
      p.innerHTML = [1, 2, 100].map(d => `<span><b>Day ${d}</b> ${esc(describe(d))}</span>`).join('');
      T.calendar = keep;
    };
    draw();
    const v = await U.modal({ title: had ? 'Your world’s calendar' : 'Make a calendar for your world', body, wide: true,
      buttons: [...(had ? [{ label: 'Stop using it', value: 'off', kind: 'ghost' }] : []), { label: 'Cancel', value: false, kind: 'ghost' }, { label: had ? 'Save' : 'Use this calendar', value: true, kind: 'primary' }] });
    if (v === 'off') { if (T.calendar) T.calendar.on = false; U.scheduleMeta(); return true; }
    if (!v) return false;
    read();
    if (c.months.some(m => !m[0])) c.months.forEach((m, i) => { if (!m[0]) m[0] = 'Month ' + (i + 1); });
    T.calendar = c; T.calendar.on = true; U.scheduleMeta();
    return true;
  }

  return { fromDay, toDay, label, describe, setup, get on() { return !!cal(); }, get calendar() { return cal(); }, PRESETS };
})();
