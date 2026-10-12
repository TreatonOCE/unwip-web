// Unwip - Writing history. A calendar of every day you wrote (across all your books), words per day, month and
// book, your streaks, how long you spend writing, and the times of day (and days of the week) your words come.
// Only words you type count, the same as goals: pasting and big deletions are left out.
window.UnwipHistory = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, S, api, esc, fmt } = U;
  const key = d => d.toLocaleDateString('en-CA');
  const DAY = 86400000;

  async function gather() {
    let list = [];
    try { list = await api.listProjects(); } catch {}
    // the open book's numbers are newer in memory than on disk
    if (S.project && S.slug) {
      const st = S.project.stats || {};
      const mine = { slug: S.slug, title: S.project.title, days: st.days || {}, hours: st.hours || {}, mins: st.mins || {} };
      const i = list.findIndex(p => p.slug === S.slug);
      if (i >= 0) list[i] = { ...list[i], ...mine }; else list.push(mine);
    }
    return list.map(p => ({ slug: p.slug, title: p.title || p.slug, days: p.days || {}, hours: p.hours || {}, mins: p.mins || {} }));
  }

  function build(projects, range) {
    const end = new Date(); end.setHours(12, 0, 0, 0);
    let from, to;
    if (range === 'last') { to = new Date(end); from = new Date(end.getTime() - 364 * DAY); }
    else { from = new Date(+range, 0, 1, 12); to = new Date(+range, 11, 31, 12); if (to > end) to = new Date(end); }
    const days = [];
    for (let t = from.getTime(); t <= to.getTime() + 1000; t += DAY) {
      const d = new Date(t), k = key(d);
      const per = projects.map(p => Math.max(0, p.days[k] || 0));
      days.push({ k, d, words: per.reduce((a, b) => a + b, 0), per, mins: projects.reduce((a, p) => a + (p.mins[k] || 0), 0) });
    }
    return { from, to, days };
  }

  function heatmap(days) {
    const vals = days.map(x => x.words).filter(Boolean).sort((a, b) => a - b);
    const q = f => vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * f))] : 0;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    const lvl = w => !w ? 0 : w <= cuts[0] ? 1 : w <= cuts[1] ? 2 : w <= cuts[2] ? 3 : 4;
    // columns are weeks starting Monday
    const first = days[0].d, pad = (first.getDay() + 6) % 7;
    const cells = Array(pad).fill(null).concat(days);
    const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    let lastMonth = -1;
    const months = weeks.map(w => { const d = w.find(Boolean); if (!d) return ''; const m = d.d.getMonth(); if (m === lastMonth) return ''; lastMonth = m; return d.d.toLocaleDateString(undefined, { month: 'short' }); });
    const todayK = key(new Date());
    return `<div class="hm" style="--weeks:${weeks.length}">
      <div class="hm-months">${months.map(m => `<span>${m}</span>`).join('')}</div>
      <div class="hm-body">
        <div class="hm-wd"><span>Mon</span><span></span><span>Wed</span><span></span><span>Fri</span><span></span><span>Sun</span></div>
        <div class="hm-grid">${weeks.map(w => `<div class="hm-col">${Array.from({ length: 7 }, (_, i) => { const x = w[i];
          if (!x) return '<i class="hm-c none"></i>';
          return `<i class="hm-c l${lvl(x.words)} ${x.k === todayK ? 'today' : ''}" data-k="${x.k}" title="${x.d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}: ${x.words ? fmt(x.words) + ' words' : 'no writing'}${x.mins ? ` · ${dur(x.mins)}` : ''}"></i>`; }).join('')}</div>`).join('')}</div>
      </div>
      <div class="hm-key">Less <i class="hm-c l0"></i><i class="hm-c l1"></i><i class="hm-c l2"></i><i class="hm-c l3"></i><i class="hm-c l4"></i> More</div>
    </div>`;
  }
  const dur = m => m < 60 ? `${m} min` : m >= 600 ? `${fmt(Math.round(m / 60))} h` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  const hourName = h => { const x = ((h % 24) + 24) % 24; return x === 0 ? 'midnight' : x === 12 ? 'noon' : x < 12 ? `${x} am` : `${x - 12} pm`; };

  function bars(items, { cls = '', fmtV = fmt, best = true } = {}) {
    const max = Math.max(1, ...items.map(x => x.v));
    const top = best ? Math.max(...items.map(x => x.v)) : -1;
    return `<div class="hb ${cls}">${items.map(x => `<div class="hb-col ${x.v && x.v === top ? 'top' : ''}" title="${esc(x.title || x.label)}: ${fmtV(x.v)}"><i style="height:${Math.max(x.v ? 3 : 0, x.v / max * 100)}%"></i><span>${esc(x.label)}</span></div>`).join('')}</div>`;
  }

  function content(projects, range) {
    const { days } = build(projects, range);
    const written = days.filter(x => x.words > 0);
    const total = written.reduce((a, x) => a + x.words, 0);
    const mins = days.reduce((a, x) => a + x.mins, 0);
    const bestDay = written.reduce((a, x) => (!a || x.words > a.words ? x : a), null);
    const allSets = projects.map(p => p.days);
    const st = U.streaks(allSets);
    // longest run inside this range
    let run = 0, longest = 0; for (const x of days) { if (x.words > 0) { run++; longest = Math.max(longest, run); } else run = 0; }

    // time of day: from every book, all time (the hours are only kept as totals)
    const hours = Array.from({ length: 24 }, (_, h) => projects.reduce((a, p) => a + Math.max(0, p.hours[h] || 0), 0));
    const hoursTotal = hours.reduce((a, b) => a + b, 0);
    let bw = 0, bwAt = 0; for (let h = 0; h < 24; h++) { const v = hours[h] + hours[(h + 1) % 24]; if (v > bw) { bw = v; bwAt = h; } }
    const morning = hours.slice(5, 12).reduce((a, b) => a + b, 0), afternoon = hours.slice(12, 17).reduce((a, b) => a + b, 0),
      evening = hours.slice(17, 22).reduce((a, b) => a + b, 0), night = hours.slice(22).concat(hours.slice(0, 5)).reduce((a, b) => a + b, 0);
    const parts = [['a morning writer', morning], ['an afternoon writer', afternoon], ['an evening writer', evening], ['a night owl', night]].sort((a, b) => b[1] - a[1]);

    const wd = [0, 0, 0, 0, 0, 0, 0]; for (const x of days) wd[(x.d.getDay() + 6) % 7] += x.words;
    const wdNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const wdBest = wd.indexOf(Math.max(...wd));

    const months = []; for (const x of days) { const k = x.k.slice(0, 7); let m = months[months.length - 1]; if (!m || m.k !== k) months.push(m = { k, d: x.d, v: 0 }); m.v += x.words; }
    const books = projects.map((p, i) => ({ title: p.title, v: days.reduce((a, x) => a + x.per[i], 0) })).filter(b => b.v > 0).sort((a, b) => b.v - a.v);
    const bmax = Math.max(1, ...books.map(b => b.v));
    const kfmt = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : String(v);

    return `
      <div class="hi-cards">
        <div class="hi-card"><b>${fmt(total)}</b><span>words written</span></div>
        <div class="hi-card"><b>${written.length}</b><span>days you wrote<small>${days.length ? Math.round(written.length / days.length * 100) : 0}% of days</small></span></div>
        <div class="hi-card"><b>${written.length ? fmt(Math.round(total / written.length)) : '–'}</b><span>words on a writing day</span></div>
        <div class="hi-card"><b>${bestDay ? fmt(bestDay.words) : '–'}</b><span>best day${bestDay ? `<small>${bestDay.d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</small>` : ''}</span></div>
        <div class="hi-card flame"><b>${st.current}</b><span>day streak<small>best ever ${st.best} · this period ${longest}</small></span></div>
        <div class="hi-card"><b>${mins ? dur(mins) : '–'}</b><span>time writing${mins ? `<small>about ${fmt(Math.round(total / (mins / 60)))} words an hour</small>` : '<small>counted from now on</small>'}</span></div>
      </div>
      <div class="hi-sec"><h3>Every day</h3>${heatmap(days)}<div class="hi-day" id="hi-day">Click a day to see what you wrote.</div></div>
      <div class="hi-two">
        <div class="hi-sec"><h3>Time of day</h3>
          ${hoursTotal ? `<p class="hi-say">You’re ${parts[0][0]}. Most words come between <b>${hourName(bwAt)}</b> and <b>${hourName(bwAt + 2)}</b>.</p>
          ${bars(hours.map((v, h) => ({ v, label: h % 3 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? h + 'a' : (h - 12) + 'p') : '', title: `${hourName(h)} to ${hourName(h + 1)}` })), { cls: 'hb-hours' })}`
          : `<p class="hi-say muted">This fills in as you write: from now on Unwip notes the hour your words come in.</p>`}
        </div>
        <div class="hi-sec"><h3>Day of the week</h3>
          ${total ? `<p class="hi-say">Your best day is <b>${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][wdBest]}</b>.</p>` : '<p class="hi-say muted">Nothing written in this period yet.</p>'}
          ${bars(wd.map((v, i) => ({ v, label: wdNames[i] })), { cls: 'hb-wd' })}
        </div>
      </div>
      <div class="hi-sec"><h3>By month</h3>${bars(months.map(m => ({ v: m.v, label: m.d.toLocaleDateString(undefined, { month: 'short' }), title: m.d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) })), { cls: 'hb-months', fmtV: v => fmt(v) + ' words' })}
        <div class="hb-vals">${months.map(m => `<span>${m.v ? kfmt(m.v) : ''}</span>`).join('')}</div></div>
      ${books.length ? `<div class="hi-sec"><h3>By book</h3><div class="hi-books">${books.map(b => `<div class="hi-book"><span>${esc(b.title)}</span><i><em style="width:${b.v / bmax * 100}%"></em></i><b>${fmt(b.v)}</b></div>`).join('')}</div></div>` : ''}`;
  }

  async function open() {
    const projects = await gather();
    const years = new Set();
    for (const p of projects) for (const k of Object.keys(p.days)) if ((p.days[k] || 0) > 0) years.add(k.slice(0, 4));
    years.add(String(new Date().getFullYear()));
    const ys = [...years].sort().reverse();
    const body = document.createElement('div'); body.className = 'hi';
    body.innerHTML = `<div class="hi-range"><button data-r="last" class="on">Last 12 months</button>${ys.map(y => `<button data-r="${y}">${y}</button>`).join('')}</div><div class="hi-main"></div>`;
    let range = 'last';
    const draw = () => {
      body.querySelector('.hi-main').innerHTML = content(projects, range);
      body.querySelectorAll('.hi-range button').forEach(b => b.classList.toggle('on', b.dataset.r === range));
      requestAnimationFrame(() => { const hm = body.querySelector('.hm'); if (hm) hm.scrollLeft = hm.scrollWidth; });
      body.querySelectorAll('.hm-c[data-k]').forEach(c => c.onclick = () => {
        body.querySelectorAll('.hm-c.sel').forEach(x => x.classList.remove('sel')); c.classList.add('sel');
        const k = c.dataset.k, d = new Date(k + 'T12:00:00');
        const per = projects.map(p => ({ t: p.title, v: Math.max(0, p.days[k] || 0) })).filter(x => x.v).sort((a, b) => b.v - a.v);
        const m = projects.reduce((a, p) => a + (p.mins[k] || 0), 0);
        body.querySelector('#hi-day').innerHTML = `<b>${d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</b> · ` +
          (per.length ? per.map(x => `${esc(x.t)}: ${fmt(x.v)} words`).join(' · ') + (m ? ` · ${dur(m)} writing` : '') : 'no writing this day');
      });
    };
    body.querySelectorAll('.hi-range button').forEach(b => b.onclick = () => { range = b.dataset.r; draw(); });
    draw();
    await U.modal({ title: 'Writing history', body, wide: true, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }

  return { open, build, gather };
})();
