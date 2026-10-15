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
    c.on = true; c.seasons = c.seasons || []; c.moons = c.moons || []; c.week = c.week || [];
    const SEASON_COL = ['#7fb069', '#e8b04a', '#c9733f', '#6f8fbf', '#9b7fc4', '#4fa3a5'];
    const PRE = [['fantasy', 'Fantasy', '12 months of 30 days, a seven-day week, one moon'], ['earth', 'Earth', 'Our months, leap years aside, and the real moon'], ['two', 'Two moons', '10 long months, a five-day week, two moons']];
    const body = document.createElement('div'); body.className = 'cal2'; body.dataset.ownEnter = '';   // Enter adds a week day or leaves a box, never closes the window
    const num = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v) || lo));
    const monthOpts = sel => c.months.map((m, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(m[0] || 'Month ' + (i + 1))}</option>`).join('');
    const stepper = (cls, i, v, unit) => `<span class="c2-step"><button type="button" data-step="${cls}" data-i="${i}" data-d="-1" aria-label="One less">−</button><input class="${cls}" data-i="${i}" type="number" value="${v}" aria-label="${unit}"><button type="button" data-step="${cls}" data-i="${i}" data-d="1" aria-label="One more">+</button>${unit ? `<em>${unit}</em>` : ''}</span>`;
    // the year as one strip: months at their real length, seasons as colour bands under them, a moon's full days as dots
    function strip() {
      const Y = yearLen(c); let acc = 0;
      const mos = c.months.map((m, i) => { const w = +m[1] / Y * 100, x = acc / Y * 100; acc += +m[1]; return `<div class="c2-sm" style="left:${x}%;width:${w}%" title="${esc(m[0] || 'Month ' + (i + 1))}: ${m[1]} days"><span>${esc(m[0] || '·')}</span></div>`; }).join('');
      const ss = c.seasons.filter(x => x[0]).map((x, i) => ({ n: x[0], i, at: c.months.slice(0, x[1]).reduce((a, m) => a + +m[1], 0) + (x[2] || 1) - 1 })).sort((a, b) => a.at - b.at);
      const bands = ss.map((x, k) => { const to = k < ss.length - 1 ? ss[k + 1].at : Y; return `<div class="c2-band" style="left:${x.at / Y * 100}%;width:${(to - x.at) / Y * 100}%;background:${SEASON_COL[x.i % SEASON_COL.length]}">${esc(x.n)}</div>`; }).join('')
        + (ss.length && ss[0].at > 0 ? `<div class="c2-band" style="left:0;width:${ss[0].at / Y * 100}%;background:${SEASON_COL[ss[ss.length - 1].i % SEASON_COL.length]}"></div>` : '');
      const off = startOffset(c);
      const moons = c.moons.filter(m => m[0] && +m[1] > 1).map((m, mi) => { let dots = ''; for (let d = 0; d < Y; d++) { const day = d - off + 1; if (mod(day - (m[2] || 1), +m[1]) < 1) dots += `<i style="left:${d / Y * 100}%" title="${esc(m[0])} full"></i>`; } return `<div class="c2-moon" data-k="${mi}" style="--mc:${['#e8c55a', '#9fb7da', '#d48a9a'][mi % 3]}">${dots}</div>`; }).join('');
      const legend = c.moons.filter(m => m[0] && +m[1] > 1).map((m, mi) => `<span><i style="background:${['#e8c55a', '#9fb7da', '#d48a9a'][mi % 3]}"></i>${esc(m[0])} full</span>`).join('');
      return `<div class="c2-year"><div class="c2-months">${mos}</div>${ss.length ? `<div class="c2-bands">${bands}</div>` : ''}${moons}${legend ? `<div class="c2-leg">${legend}</div>` : ''}</div>`;
    }
    // the month story day 1 falls in, as a real month: week days across, moon phases on the days, day 1 marked
    function month() {
      const keep = T.calendar; T.calendar = c;
      try {
        const w0 = fromDay(1, c); if (!w0) return '';
        const first = 1 - (w0.d - 1), len = +c.months[w0.m][1], wk = c.week.length;
        const lead = wk ? fromDay(first, c).wd : 0, cells = [];
        for (let k = 0; k < lead; k++) cells.push('<span class="c2-d blank"></span>');
        for (let d = 0; d < len; d++) { const day = first + d, w = fromDay(day, c), full = w.moons.filter(x => x.k === 0 || x.k === 4);
          cells.push(`<span class="c2-d ${day === 1 ? 'one' : ''}" title="${esc(describe(day))}"><b>${w.d}</b>${full.map(x => `<small title="${esc(x.n + ': ' + x.phase)}">${x.icon}</small>`).join('')}${day === 1 ? '<em>Day 1</em>' : ''}</span>`); }
        const cols = Math.max(5, Math.min(wk || 7, 10));
        return `<div class="c2-cal"><div class="c2-cal-h">${esc(c.months[w0.m][0] || 'Month')} ${yearText(w0.y, c)}${w0.season ? ` <span>· ${esc(w0.season)}</span>` : ''}</div>
          <div class="c2-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${wk ? c.week.slice(0, cols).map(n => `<span class="c2-wd">${esc(n.slice(0, 3))}</span>`).join('') : ''}${cells.join('')}</div></div>
          <div class="c2-lines">${[1, 2, 100].map(d => `<span><b>Day ${d}</b> ${esc(describe(d))}</span>`).join('')}</div>`;
      } finally { T.calendar = keep; }
    }
    const draw = (focus) => {
      body.innerHTML = `
        <div class="c2-pre">${PRE.map(([k, n, d]) => `<button type="button" class="c2-card" data-pre="${k}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>
        <div class="c2-title"><input id="cal-name" value="${esc(c.name || '')}" placeholder="Name your calendar" aria-label="Calendar name"><label class="c2-era">after the year<input id="cal-era" value="${esc(c.era || '')}" placeholder="AR" aria-label="After the year"></label></div>
        <div id="c2-strip">${strip()}</div>
        <div class="c2-cols">
          <section class="c2-sec"><h4>Months <small>${c.months.length} months · ${yearLen(c)} days a year</small></h4>
            <div class="c2-list">${c.months.map((m, i) => `<div class="c2-row mo"><span class="c2-n">${i + 1}</span><input class="c2-name cal-mn" data-i="${i}" value="${esc(m[0])}" placeholder="Month ${i + 1}">${stepper('cal-md', i, m[1], 'days')}<span class="c2-tools"><button type="button" data-mv="-1" data-i="${i}" ${i ? '' : 'disabled'} aria-label="Move up">↑</button><button type="button" data-mv="1" data-i="${i}" ${i < c.months.length - 1 ? '' : 'disabled'} aria-label="Move down">↓</button><button type="button" data-del="mo" data-i="${i}" ${c.months.length > 1 ? '' : 'disabled'} aria-label="Remove">×</button></span></div>`).join('')}</div>
            <div class="c2-foot"><button type="button" class="link-btn" data-add="mo">+ Add a month</button><span class="c2-all">Set all to ${stepper('cal-all', 0, c.months[0] ? c.months[0][1] : 30, '')}<button type="button" class="link-btn" data-allgo>Apply</button></span></div></section>
          <div class="c2-side">
            <section class="c2-sec"><h4>The week <small>${c.week.length ? c.week.length + ' days' : 'none'}</small></h4>
              <div class="c2-chips">${c.week.map((w, i) => `<span class="c2-chip">${esc(w)}<button type="button" data-delw="${i}" aria-label="Remove ${esc(w)}">×</button></span>`).join('')}<input id="cal-wadd" placeholder="${c.week.length ? 'Add a day…' : 'Type a day, then Enter'}" aria-label="Add a day of the week"></div></section>
            <section class="c2-sec"><h4>Seasons</h4>
              <div class="c2-list">${c.seasons.map((x, i) => `<div class="c2-row se"><span class="c2-dot" style="background:${SEASON_COL[i % SEASON_COL.length]}"></span><input class="c2-name cal-sn" data-i="${i}" value="${esc(x[0])}" placeholder="Season"><span class="c2-say">starts</span><input class="c2-small cal-sd" data-i="${i}" type="number" min="1" value="${x[2] || 1}" aria-label="Day"><select class="c2-sel cal-sm" data-i="${i}">${monthOpts(x[1])}</select><span class="c2-tools"><button type="button" data-del="se" data-i="${i}" aria-label="Remove">×</button></span></div>`).join('')}</div>
              <div class="c2-foot"><button type="button" class="link-btn" data-add="se">+ Add a season</button></div></section>
            <section class="c2-sec"><h4>Moons</h4>
              <div class="c2-list">${c.moons.map((m, i) => `<div class="c2-row mn"><span class="c2-dot moon">🌕</span><input class="c2-name cal-on" data-i="${i}" value="${esc(m[0])}" placeholder="Moon name"><span class="c2-say">full every</span>${stepper('cal-oc', i, m[1], 'days')}<span class="c2-say">first on day</span><input class="c2-small cal-of" data-i="${i}" type="number" value="${m[2] || 1}" aria-label="A story day it is full"><span class="c2-tools"><button type="button" data-del="mn" data-i="${i}" aria-label="Remove">×</button></span></div>`).join('')}</div>
              <div class="c2-foot"><button type="button" class="link-btn" data-add="mn">+ Add a moon</button></div></section>
          </div>
        </div>
        <section class="c2-sec c2-begin"><h4>Your story begins on</h4>
          <div class="c2-sentence">${c.week.length ? `<select class="c2-sel" id="cal-swd">${c.week.map((w, i) => `<option value="${i}" ${i === (c.start.wd || 0) ? 'selected' : ''}>${esc(w)}</option>`).join('')}</select>,` : ''}
            <input class="c2-small" id="cal-sd" type="number" min="1" value="${c.start.d}" aria-label="Day"> <select class="c2-sel" id="cal-sm">${monthOpts(c.start.m)}</select> <input class="c2-year-in" id="cal-sy" type="number" value="${c.start.y}" aria-label="Year"> <span class="c2-say">${esc(c.era || '')}</span></div>
          <div id="c2-month">${month()}</div></section>`;
      if (focus) { const f = body.querySelector(focus); if (f) { f.focus(); if (f.select && f.tagName === 'INPUT' && f.type !== 'number') { const v = f.value; f.value = ''; f.value = v; } } }
    };
    // keep the picture and the month in step while typing, without redrawing the boxes being typed in
    const live = () => { const st = body.querySelector('#c2-strip'), mo = body.querySelector('#c2-month'); if (st) st.innerHTML = strip(); if (mo) mo.innerHTML = month();
      const h = body.querySelector('.c2-sec h4 small'); if (h) h.textContent = `${c.months.length} months · ${yearLen(c)} days a year`; };
    body.addEventListener('input', e => {
      const t = e.target, i = +t.dataset.i;
      if (t.id === 'cal-name') c.name = t.value.trim();
      else if (t.id === 'cal-era') c.era = t.value.trim();
      else if (t.classList.contains('cal-mn')) c.months[i][0] = t.value.trim();
      else if (t.classList.contains('cal-md')) c.months[i][1] = num(t.value, 1, 400);
      else if (t.classList.contains('cal-sn')) c.seasons[i][0] = t.value.trim();
      else if (t.classList.contains('cal-sd')) c.seasons[i][2] = num(t.value, 1, 400);
      else if (t.classList.contains('cal-sm')) c.seasons[i][1] = +t.value;
      else if (t.classList.contains('cal-on')) c.moons[i][0] = t.value.trim();
      else if (t.classList.contains('cal-oc')) c.moons[i][1] = Math.max(2, +t.value || 28);
      else if (t.classList.contains('cal-of')) c.moons[i][2] = Math.round(+t.value) || 1;
      else if (t.id === 'cal-sd') c.start.d = num(t.value, 1, +c.months[c.start.m][1]);
      else if (t.id === 'cal-sm') { c.start.m = +t.value; c.start.d = Math.min(c.start.d, +c.months[c.start.m][1]); }
      else if (t.id === 'cal-sy') c.start.y = Math.round(+t.value) || 0;
      else if (t.id === 'cal-swd') c.start.wd = +t.value;
      else return;
      live();
    });
    body.addEventListener('change', e => { if (e.target.classList.contains('cal-mn')) draw(); });   // month names appear in the season and start pickers
    body.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const i = +b.dataset.i;
      if (b.dataset.pre) { c = JSON.parse(JSON.stringify(PRESETS[b.dataset.pre])); c.on = true; c.seasons = c.seasons || []; c.moons = c.moons || []; c.week = c.week || []; return draw(); }
      if (b.dataset.step) { const inp = b.parentNode.querySelector('input'); inp.value = (+inp.value || 0) + (+b.dataset.d); inp.dispatchEvent(new Event('input', { bubbles: true })); if (b.dataset.step === 'cal-md') draw(); return; }
      if (b.dataset.mv) { const j = i + +b.dataset.mv; [c.months[i], c.months[j]] = [c.months[j], c.months[i]];
        c.seasons.forEach(x => { if (x[1] === i) x[1] = j; else if (x[1] === j) x[1] = i; }); if (c.start.m === i) c.start.m = j; else if (c.start.m === j) c.start.m = i; return draw(); }
      if (b.dataset.del) { const list = { mo: c.months, se: c.seasons, mn: c.moons }[b.dataset.del]; if (b.dataset.del === 'mo') { if (c.months.length < 2) return; c.seasons.forEach(x => { if (x[1] > i) x[1]--; else if (x[1] === i) x[1] = 0; }); }
        list.splice(i, 1); if (c.start.m >= c.months.length) c.start.m = 0; return draw(); }
      if (b.dataset.add) { const k = b.dataset.add; if (k === 'mo') c.months.push(['', c.months.length ? c.months[c.months.length - 1][1] : 30]); if (k === 'se') c.seasons.push(['', 0, 1]); if (k === 'mn') c.moons.push(['', 28, 1]);
        draw(); const l = body.querySelectorAll(`.c2-row.${k} .c2-name`); if (l.length) l[l.length - 1].focus(); return; }
      if (b.hasAttribute('data-allgo')) { const v = num(body.querySelector('.cal-all').value, 1, 400); c.months.forEach(m => { m[1] = v; }); return draw(); }
      if (b.dataset.delw != null) { const k = +b.dataset.delw; c.week.splice(k, 1); if ((c.start.wd || 0) >= c.week.length) c.start.wd = 0; return draw('#cal-wadd'); }
    });
    body.addEventListener('keydown', e => {
      const t = e.target;
      if (t.id === 'cal-wadd') {
        if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); e.stopPropagation(); const v = t.value.replace(/,/g, '').trim(); if (v) { c.week.push(v.slice(0, 30)); draw('#cal-wadd'); } }
        else if (e.key === 'Backspace' && !t.value && c.week.length) { c.week.pop(); draw('#cal-wadd'); }
      } else if (e.key === 'Enter' && t.tagName === 'INPUT') { e.preventDefault(); e.stopPropagation(); t.blur(); }
    });
    draw();
    const v = await U.modal({ title: had ? 'Your world’s calendar' : 'Make a calendar for your world', body, wide: true, onOpen: back => { const m = back.querySelector('.modal'); if (m) m.classList.add('cal-wide'); },
      buttons: [...(had ? [{ label: 'Stop using it', value: 'off', kind: 'ghost' }] : []), { label: 'Cancel', value: false, kind: 'ghost' }, { label: had ? 'Save' : 'Use this calendar', value: true, kind: 'primary' }] });
    if (v === 'off') { if (T.calendar) T.calendar.on = false; U.scheduleMeta(); return true; }
    if (!v) return false;
    const wa = body.querySelector('#cal-wadd'); if (wa && wa.value.trim()) c.week.push(wa.value.trim().slice(0, 30));
    c.months.forEach((m, i) => { if (!m[0]) m[0] = 'Month ' + (i + 1); });
    c.seasons = c.seasons.filter(x => x[0]); c.moons = c.moons.filter(x => x[0]);
    T.calendar = c; T.calendar.on = true; U.scheduleMeta();
    return true;
  }

  return { fromDay, toDay, label, describe, setup, get on() { return !!cal(); }, get calendar() { return cal(); }, PRESETS };
})();
