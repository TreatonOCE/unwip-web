// Unwip - Sprint history. Every writing sprint from every book in one list: when, which book and chapter,
// how long, how many words and the speed, with your average and best. Runs you don't want counted
// (a test, a sprint you abandoned) can be deleted.
window.UnwipSprints = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, fmt } = U;

  // every sprint, newest first, each remembering which book it belongs to
  async function gather() {
    let list = [];
    try { list = await api.listProjects(); } catch {}
    const out = [];
    for (const p of list) {
      const runs = p.slug === S.slug && S.project ? (S.project.stats.sprints || []) : (p.sprints || []);
      runs.forEach(r => out.push({ ...r, slug: p.slug, book: p.title || p.slug }));
    }
    if (S.project && !list.some(p => p.slug === S.slug)) (S.project.stats.sprints || []).forEach(r => out.push({ ...r, slug: S.slug, book: S.project.title }));
    return out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }
  const stats = runs => {
    const minutes = runs.reduce((a, r) => a + (r.minutes || 0), 0), words = runs.reduce((a, r) => a + (r.words || 0), 0);
    return {
      n: runs.length, words, minutes,
      avg: runs.length ? Math.round(runs.reduce((a, r) => a + (r.wpm || 0), 0) / runs.length * 10) / 10 : 0,
      overall: minutes ? Math.round(words / minutes * 10) / 10 : 0,
      best: runs.reduce((a, r) => Math.max(a, r.wpm || 0), 0)
    };
  };

  // delete one run from its book (the open book in memory, any other straight from its file)
  async function remove(run) {
    const same = r => r.date === run.date && r.wpm === run.wpm && r.words === run.words;
    if (run.slug === S.slug && S.project) {
      const i = S.project.stats.sprints.findIndex(same); if (i >= 0) S.project.stats.sprints.splice(i, 1);
      await U.saveMetaNow();
      return true;
    }
    const p = await api.openProject(run.slug).catch(() => null); if (!p || !p.stats || !p.stats.sprints) return false;
    const i = p.stats.sprints.findIndex(same); if (i < 0) return false;
    p.stats.sprints.splice(i, 1); await api.saveProjectMeta(run.slug, p);
    return true;
  }
  async function restore(run) {
    const { slug, book, ...rec } = run;
    if (slug === S.slug && S.project) { S.project.stats.sprints.push(rec); S.project.stats.sprints.sort((a, b) => String(a.date).localeCompare(String(b.date))); await U.saveMetaNow(); return; }
    const p = await api.openProject(slug).catch(() => null); if (!p) return;
    p.stats = p.stats || {}; p.stats.sprints = p.stats.sprints || []; p.stats.sprints.push(rec); p.stats.sprints.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    await api.saveProjectMeta(slug, p);
  }

  function chart(runs) {
    const last = runs.slice(0, 40).reverse();
    if (last.length < 2) return '';
    const max = Math.max(...last.map(r => r.wpm || 0), 1), avg = last.reduce((a, r) => a + (r.wpm || 0), 0) / last.length;
    return `<div class="spr-chart" title="Speed of your last ${last.length} sprints, oldest on the left">
      <div class="spr-avg" style="bottom:${avg / max * 100}%"><span>avg ${Math.round(avg * 10) / 10}</span></div>
      ${last.map(r => `<i style="height:${Math.max(3, (r.wpm || 0) / max * 100)}%" title="${esc(new Date(r.date).toLocaleDateString())}: ${r.wpm} wpm"></i>`).join('')}
    </div>`;
  }

  async function open(opts = {}) {
    const all = await gather();
    let book = opts.book || '';
    const books = [...new Map(all.map(r => [r.slug, r.book])).entries()];
    const body = document.createElement('div'); body.className = 'spr';
    const draw = () => {
      const runs = book ? all.filter(r => r.slug === book) : all;
      const s = stats(runs);
      body.innerHTML = `
        ${books.length > 1 ? `<div class="spr-filter"><label>Book</label><select id="spr-book"><option value="">All books</option>${books.map(([k, t]) => `<option value="${esc(k)}" ${k === book ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>` : ''}
        ${runs.length ? `
        <div class="hi-cards spr-cards">
          <div class="hi-card"><b>${s.avg}</b><span>average wpm<small>the average of your sprints</small></span></div>
          <div class="hi-card"><b>${s.best}</b><span>best wpm</span></div>
          <div class="hi-card"><b>${s.n}</b><span>sprint${s.n === 1 ? '' : 's'}</span></div>
          <div class="hi-card"><b>${fmt(s.words)}</b><span>words in sprints<small>${Math.round(s.minutes)} minutes · ${s.overall} wpm overall</small></span></div>
        </div>
        ${chart(runs)}
        <div class="spr-table-wrap"><table class="spr-table">
          <thead><tr><th>When</th>${books.length > 1 && !book ? '<th>Book</th>' : ''}<th>Chapter</th><th class="n">Minutes</th><th class="n">Words</th><th class="n">WPM</th><th></th></tr></thead>
          <tbody>${runs.map((r, i) => { const d = new Date(r.date); return `<tr class="${r.wpm === s.best && s.best ? 'best' : ''}">
            <td>${esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }))} <small>${esc(d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }))}</small></td>
            ${books.length > 1 && !book ? `<td>${esc(r.book)}</td>` : ''}
            <td class="spr-doc">${esc(r.doc || '–')}</td>
            <td class="n">${r.minutes}</td><td class="n">${fmt(r.words || 0)}</td><td class="n"><b>${r.wpm}</b>${r.wpm === s.best && s.best ? ' <span class="spr-star" title="Your best">★</span>' : ''}</td>
            <td><button class="spr-del" data-i="${i}" title="Delete this sprint" aria-label="Delete this sprint">×</button></td></tr>`; }).join('')}</tbody>
        </table></div>
        <p class="sb-hint">Delete a sprint you don’t want counted, like a test run or one you abandoned. Your average and best update straight away.</p>`
        : `<p class="sb-hint">No sprints yet. Start one with the ⚡ Sprint button while writing: pick a length, write, and your speed is saved here.</p>`}`;
      const sel = body.querySelector('#spr-book'); if (sel) sel.onchange = () => { book = sel.value; draw(); };
      body.querySelectorAll('.spr-del').forEach(b => b.onclick = async () => {
        const run = runs[+b.dataset.i];
        if (!(await remove(run))) return U.toast('Couldn’t delete that sprint.', 'warn');
        all.splice(all.indexOf(run), 1); draw();
        U.toastAction ? U.toastAction(`Sprint deleted (${run.wpm} wpm).`, 'Undo', async () => { await restore(run); all.push(run); all.sort((a, b) => String(b.date).localeCompare(String(a.date))); if (body.isConnected) draw(); })
          : U.toast('Sprint deleted.');
        if (U.updateStatus) U.updateStatus();
      });
    };
    draw();
    await U.modal({ title: 'Sprints', body, wide: true, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }

  return { open, gather, stats };
})();
