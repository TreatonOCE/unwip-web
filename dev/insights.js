// Unwip - Insights (Detailed mode): the shape of the whole book at a glance.
//  Pacing     - one bar per chapter: length, how much is dialogue, how many scenes; unusual chapters are pointed out
//  Characters - who appears in which chapter, whose point of view each chapter is, and who disappears for a long stretch
// Everything is counted on this device from your own text (no AI). Suggested deletions and footnotes aren't counted.
window.UnwipInsights = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, esc, api, editor } = U;
  const view = () => $('#insights-view');
  const LS = 'unwip-insights-tab';
  let tab = (() => { try { return localStorage.getItem(LS) || 'pacing'; } catch { return 'pacing'; } })();
  const cache = new Map();          // id -> { key, stats }
  let busy = false;

  // title pages and front matter aren't chapters
  const FRONT = /^\s*(title|title page|half[- ]title|front matter|copyright|dedication|epigraph|contents|table of contents)\s*$/i;
  const chapters = () => { const out = [], ms = U.findNode('root-manuscript'); if (ms) U.walkTree(ms.node.children || [], n => { if (n.type === 'doc' && !n.map && !FRONT.test(n.title || '')) out.push(n); }); return out; };
  const SCENE = /^\s*(\*\s*){3,}\s*$|^\s*#\s*$|^\s*[~•·]{1,3}\s*$/;
  const wc = s => (s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

  // ---------------------------------------------------------------- counting one chapter
  function analyse(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    d.querySelectorAll('del.tc-del, sup.fn').forEach(x => x.remove());
    let words = 0, dialogue = 0, breaks = 0, firstPerson = 0; const parts = [];
    for (const b of d.querySelectorAll('p, h1, h2, h3, blockquote')) {
      if (b.querySelector('p, h1, h2, h3')) continue;
      const t = b.textContent;
      if (b.classList.contains('scene') || SCENE.test(t)) { breaks++; continue; }
      const w = wc(t); if (!w) continue;
      words += w; parts.push(t);
      for (const m of t.matchAll(/“[^”]*”?|"[^"]*"/g)) dialogue += wc(m[0]);
      // narration only (outside quotes) for first person
      firstPerson += (t.replace(/“[^”]*”?|"[^"]*"/g, ' ').match(/\b(I|me|my|myself)\b/g) || []).length;
    }
    return { words, dialogue: Math.min(dialogue, words), scenes: words ? breaks + 1 : 0, text: parts.join('\n'), fp: words ? firstPerson / words : 0 };
  }
  async function statsFor(n) {
    const html = n.id === S.docId ? editor.innerHTML : null;
    const key = html != null ? 'open:' + html.length + ':' + html.slice(-60) : String(n.mod || '') + ':' + (n.words || 0);
    const c = cache.get(n.id); if (c && c.key === key) return c.stats;
    const stats = analyse(html != null ? html : await api.loadDoc(S.slug, n.id).catch(() => ''));
    cache.set(n.id, { key, stats }); return stats;
  }

  // ---------------------------------------------------------------- characters from the Characters sheets
  function cast() {
    const by = new Map();
    for (const e of (window.FolioNames && window.FolioNames.entries) || []) {
      if (e.kind !== 'Character' || !e.sheetId || /^New [a-z]/i.test(e.text)) continue;
      const c = by.get(e.sheetId) || { id: e.sheetId, name: '', names: new Set() };
      if (!e.primary) c.name = e.text; c.names.add(e.text);
      by.set(e.sheetId, c);
    }
    return [...by.values()].filter(c => c.name).map(c => ({ ...c, re: window.FolioNames.matcher(window.FolioNames.namesFor(c.id)) || /(?!)/gu }));
  }
  const COLORS = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#0d9488', '#ea580c', '#4f46e5'];
  const colorOf = i => COLORS[i % COLORS.length];
  const initials = n => n.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  // ---------------------------------------------------------------- drawing
  async function render() {
    const el = view(); if (!el || busy) return;
    busy = true;
    try {
      const chs = chapters();
      if (!chs.length) { el.innerHTML = `<div class="in-empty">Add some chapters to the Manuscript to see the shape of your book here.</div>`; return; }
      el.innerHTML = `<div class="in-wrap"><div class="in-loading">Reading ${chs.length} chapters…</div></div>`;
      const stats = []; for (const n of chs) stats.push(await statsFor(n));
      const head = `<div class="in-head"><div class="in-tabs" role="tablist"><button data-t="pacing" class="${tab === 'pacing' ? 'on' : ''}">Pacing</button><button data-t="chars" class="${tab === 'chars' ? 'on' : ''}">Characters</button></div><div class="in-sum" id="in-sum"></div></div>`;
      el.innerHTML = `<div class="in-wrap">${head}<div class="in-body" id="in-body"></div></div>`;
      $$('.in-tabs button', el).forEach(b => b.onclick = () => { tab = b.dataset.t; try { localStorage.setItem(LS, tab); } catch {} render(); });
      if (tab === 'pacing') pacing(chs, stats); else characters(chs, stats);
    } finally { busy = false; }
  }
  const go = (id, find) => { U.setView('write'); U.openDoc(id).then(() => { if (find) { U.openFind(); const fi = document.getElementById('find-input'); if (fi) { fi.value = find; fi.dispatchEvent(new Event('input', { bubbles: true })); } } }); };
  const short = n => (n.title || 'Untitled').replace(/^(chapter\s+)?(\d+)[.:)\s-]+\s*/i, '');
  // bars are numbered by their place in the manuscript (titles can repeat numbers or have none); hover shows the title
  const num = (n, i) => String(i + 1);

  // what the charts and the side panel both say about the book
  function findings(chs, stats) {
    const words = stats.map(s => s.words), total = words.reduce((a, b) => a + b, 0);
    // empty chapters (placeholders) would drag the average down, so they're left out of it
    const filled = words.filter(w => w > 0), sorted = [...filled].sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)] || 0;
    const avg = filled.length ? total / filled.length : 0, max = Math.max(...words, 1), dlg = stats.reduce((a, s) => a + s.dialogue, 0);
    const sum = `${chs.length} chapters · ${total.toLocaleString()} words · average ${Math.round(avg).toLocaleString()} · ${total ? Math.round(dlg / total * 100) : 0}% dialogue`;
    // things worth a look
    const notes = [];
    chs.forEach((n, i) => {
      const s = stats[i], name = `<b>${esc(n.title || 'Untitled')}</b>${/^\s*(chapter\s+)?\d+\b/i.test(n.title || '') && num(n, i) === (/\d+/.exec(n.title) || [])[0] ? '' : ` <small>(bar ${num(n, i)})</small>`}`;
      if (!s.words) { notes.push(['empty', i, `${name} is empty.`]); return; }
      if (median && s.words > median * 1.8 && s.words > 1500) notes.push(['long', i, `${name} is ${(s.words / median).toFixed(1)}× your usual chapter length. Worth splitting, or is it the big one?`]);
      else if (median && s.words < median * 0.4 && chs.length > 3) notes.push(['short', i, `${name} is much shorter than the rest (${s.words.toLocaleString()} words).`]);
      if (s.words > 400 && s.dialogue / s.words > 0.7) notes.push(['talk', i, `${name} is ${Math.round(s.dialogue / s.words * 100)}% dialogue. Room for a little more setting or action?`]);
      if (s.words > 1200 && s.dialogue / s.words < 0.04) notes.push(['quiet', i, `${name} has almost no dialogue. Fine for a reflective chapter, but check it moves.`]);
      if (s.words > 4000 && s.scenes === 1) notes.push(['scene', i, `${name} is one long scene of ${s.words.toLocaleString()} words.`]);
    });
    // the book at a glance: always there, however even the chapters are
    const glance = [];
    const idx = filled.length ? stats.map((x, i) => i).filter(i => stats[i].words) : [];
    if (idx.length) {
      const by = f => idx.reduce((a, i) => (f(i) > f(a) ? i : a), idx[0]), byMin = f => idx.reduce((a, i) => (f(i) < f(a) ? i : a), idx[0]);
      const dl = i => stats[i].dialogue / stats[i].words, t = i => `<b>${esc(chs[i].title || 'Untitled')}</b>`;
      const longI = by(i => stats[i].words), shortI = byMin(i => stats[i].words);
      if (idx.length > 1) glance.push(['g', longI, `Longest: ${t(longI)} at ${stats[longI].words.toLocaleString()} words. Shortest: ${t(shortI)} at ${stats[shortI].words.toLocaleString()}.`]);
      const hiD = by(dl), loD = byMin(dl);
      if (idx.length > 1) glance.push(['g', hiD, `Most dialogue: ${t(hiD)} (${Math.round(dl(hiD) * 100)}%). Least: ${t(loD)} (${Math.round(dl(loD) * 100)}%).`]);
      const scenes = idx.reduce((a, i) => a + Math.max(1, stats[i].scenes), 0);
      glance.push(['g', -1, `Scenes run about ${Math.round(total / scenes).toLocaleString()} words on average (${scenes} scene${scenes === 1 ? '' : 's'} in ${idx.length} chapter${idx.length === 1 ? '' : 's'}).`]);
      const pct = total ? Math.round(dlg / total * 100) : 0;
      glance.push(['g', -1, `The book is ${pct}% dialogue. ${pct < 15 ? 'That’s on the narration-heavy side: fine for a reflective or descriptive book, but if a scene feels slow, more people talking can speed it up.' : pct > 55 ? 'That’s dialogue-heavy: quick to read, but check readers can still picture where everyone is.' : 'That’s a middle-of-the-road mix of talk and narration.'}`]);
      if (idx.length < 4) glance.push(['g', -1, `Comparing chapters gets more useful from about four chapters on: with ${idx.length} there isn’t much to compare yet.`]);
    }
    return { words, total, avg, max, filled, median, dlg, notes, glance, sum };
  }
  function pacing(chs, stats) {
    const body = $('#in-body');
    const { words, total, avg, max, filled, dlg, notes, glance, sum } = findings(chs, stats);
    $('#in-sum').textContent = sum;
    const avgPct = avg / max * 100;
    body.innerHTML = `
      <div class="pc-legend"><span><i class="pc-k nar"></i>Narration</span><span><i class="pc-k dlg"></i>Dialogue</span><span><i class="pc-k scn"></i>Scenes</span><span><i class="pc-k avg"></i>Average length</span></div>
      <div class="pc-scroll"><div class="pc-chart" style="--n:${chs.length}">
        <div class="pc-avg" style="bottom:calc(var(--plot) * ${(avgPct / 100).toFixed(4)} + var(--base))"><span>avg ${Math.round(avg).toLocaleString()}</span></div>
        ${chs.map((n, i) => { const s = stats[i], h = s.words / max * 100, d = s.words ? s.dialogue / s.words * 100 : 0, flag = notes.some(x => x[1] === i && (x[0] === 'long' || x[0] === 'short'));
          return `<button class="pc-col ${n.id === S.docId ? 'cur' : ''} ${flag ? 'flag' : ''} ${s.words ? '' : 'empty'}" data-i="${i}" aria-label="${esc(n.title || '')}: ${s.words} words">
            <div class="pc-bar" style="--h:${h.toFixed(2)};height:calc(${h.toFixed(2)}% * 0 + var(--plot) * ${(h / 100).toFixed(4)})"><div class="pc-dlg" style="height:${d}%"></div></div>
            <div class="pc-scn">${s.scenes > 6 ? `<b>${s.scenes}</b>` : '<i></i>'.repeat(s.scenes)}</div>
            <div class="pc-lbl">${esc(num(n, i))}</div></button>`; }).join('')}
      </div></div>
      <div class="pc-tip hidden" id="pc-tip"></div>
      <div class="in-notes"><h4>Worth a look</h4>${notes.length ? notes.slice(0, 12).map(x => `<button class="in-note k-${x[0]}" data-i="${x[1]}">${x[2]}</button>`).join('') : `<p class="in-ok">${filled.length > 1 ? 'Nothing unusual: no chapter is far longer or shorter than the rest, or all talk, or all narration.' : 'Nothing to compare yet.'}</p>`}</div>
      ${glance.length ? `<div class="in-notes in-glance"><h4>At a glance</h4>${glance.map(x => x[1] >= 0 ? `<button class="in-note k-g" data-i="${x[1]}">${x[2]}</button>` : `<p class="in-note k-g">${x[2]}</p>`).join('')}</div>` : ''}
      <p class="in-foot">Counted on this device from your own writing. Dialogue is anything inside quotation marks; scenes are split by scene breaks (* * *). Suggested deletions aren’t counted.</p>`;
    const tip = $('#pc-tip');
    $$('.pc-col', body).forEach(b => {
      const i = +b.dataset.i, n = chs[i], s = stats[i];
      b.onclick = () => go(n.id);
      b.onmouseenter = () => { tip.innerHTML = `<b>${esc(n.title || 'Untitled')}</b><span>${s.words.toLocaleString()} words · ${s.words ? Math.round(s.dialogue / s.words * 100) : 0}% dialogue · ${s.scenes} scene${s.scenes === 1 ? '' : 's'}${n.synopsis ? `<br><em>${esc(n.synopsis.slice(0, 110))}</em>` : ''}</span>`; tip.classList.remove('hidden');
        const r = b.getBoundingClientRect(), br = body.getBoundingClientRect(); tip.style.left = Math.max(0, Math.min(br.width - 260, r.left - br.left + r.width / 2 - 130)) + 'px'; tip.style.top = (r.top - br.top - 8) + 'px'; };
      b.onmouseleave = () => tip.classList.add('hidden');
    });
    $$('button.in-note', body).forEach(b => b.onclick = () => go(chs[+b.dataset.i].id));
  }

  function characters(chs, stats) {
    const body = $('#in-body'), people = cast();
    if (!people.length) {
      $('#in-sum').textContent = '';
      body.innerHTML = `<div class="in-empty">Add your characters as sheets in the <b>Characters</b> folder (with any nicknames in “Aliases:”), and this shows which chapters each one is in.</div>`;
      return;
    }
    const grid = people.map(p => stats.map(s => { p.re.lastIndex = 0; return (s.text.match(p.re) || []).length; }));
    const totals = grid.map(r => r.reduce((a, b) => a + b, 0));
    const order = people.map((p, i) => i).filter(i => totals[i] > 0).sort((a, b) => totals[b] - totals[a]).slice(0, 30);
    const unseen = people.filter((p, i) => !totals[i]).map(p => p.name);
    const colorFor = new Map(order.map((pi, k) => [people[pi].id, colorOf(k)]));
    // point of view: what you chose, or a best guess (first person, or whoever is named most)
    const povOf = (n, i) => {
      if (n.pov) { const p = people.find(x => x.id === n.pov); return { id: n.pov, label: n.pov === 'first' ? 'I' : p ? p.name : '?', set: true }; }
      if (!stats[i].words) return null;
      if (stats[i].fp > 0.02) return { id: 'first', label: 'I', set: false };
      let best = -1, bi = -1; order.forEach(pi => { if (grid[pi][i] > best) { best = grid[pi][i]; bi = pi; } });
      return bi >= 0 && best > 2 ? { id: people[bi].id, label: people[bi].name, set: false } : null;
    };
    const povs = chs.map(povOf);
    const max = Math.max(1, ...order.flatMap(pi => grid[pi]));
    // the longest stretch each character is missing, between their first and last appearance
    const gapOf = pi => { const r = grid[pi]; const first = r.findIndex(x => x > 0), last = r.length - 1 - [...r].reverse().findIndex(x => x > 0); let best = [0, 0, 0], run = 0;
      for (let i = first; i <= last; i++) { if (!r[i]) { run++; if (run > best[0]) best = [run, i - run + 1, i]; } else run = 0; } return best; };
    $('#in-sum').textContent = `${order.length} character${order.length === 1 ? '' : 's'} across ${chs.length} chapters`;
    body.innerHTML = `
      <div class="ch-scroll"><table class="ch-grid">
        <thead><tr><th class="ch-name">Chapter</th>${chs.map((n, i) => `<th title="${esc(n.title || '')}"><button class="ch-h" data-i="${i}">${esc(num(n, i))}</button></th>`).join('')}<th class="ch-gap">Longest absence</th></tr>
        <tr class="ch-pov"><th class="ch-name">Point of view</th>${chs.map((n, i) => { const v = povs[i]; return `<td><button class="ch-povb ${v && !v.set ? 'guess' : ''}" data-i="${i}" title="${v ? esc(v.label) + (v.set ? '' : ' (best guess, click to set)') : 'Click to set'}" style="${v ? `--c:${v.id === 'first' ? '#64748b' : colorFor.get(v.id) || '#64748b'}` : ''}">${v ? esc(v.id === 'first' ? 'I' : initials(v.label)) : '+'}</button></td>`; }).join('')}<td></td></tr></thead>
        <tbody>${order.map(pi => { const p = people[pi], g = gapOf(pi), c = colorFor.get(p.id);
          return `<tr><th class="ch-name"><i style="background:${c}"></i>${esc(p.name)}<small>${totals[pi].toLocaleString()}</small></th>${grid[pi].map((v, i) => `<td class="${g[0] >= 3 && i >= g[1] && i <= g[2] ? 'gapcell' + (i === g[1] ? ' gs' : '') + (i === g[2] ? ' ge' : '') : ''}">${v ? `<button class="ch-dot ${povs[i] && povs[i].id === p.id ? 'pov' : ''}" data-p="${pi}" data-i="${i}" title="${esc(p.name)} · ${esc(chs[i].title || '')}: ${v} mention${v === 1 ? '' : 's'}" style="--c:${c};--s:${(0.35 + 0.65 * Math.sqrt(v / max)).toFixed(2)}"></button>` : ''}</td>`).join('')}
            <td class="ch-gap">${g[0] >= 3 ? `<button class="ch-gapb" data-i="${g[1]}">${g[0]} chapters <small>(${esc(num(chs[g[1]], g[1]))}–${esc(num(chs[g[2]], g[2]))})</small></button>` : ''}</td></tr>`; }).join('')}</tbody>
      </table></div>
      ${unseen.length ? `<p class="in-foot">Not in the manuscript yet: ${unseen.slice(0, 12).map(esc).join(', ')}${unseen.length > 12 ? '…' : ''}</p>` : ''}
      <p class="in-foot">Bigger dots mean more mentions (names and aliases from the Characters sheets). A ring marks that character’s point-of-view chapters. Click a dot to open the chapter with their name highlighted. Faded point-of-view letters are guesses: click to set them.</p>`;
    $$('.ch-dot', body).forEach(b => b.onclick = () => go(chs[+b.dataset.i].id, people[+b.dataset.p].name));
    $$('.ch-h, .ch-gapb', body).forEach(b => b.onclick = () => go(chs[+b.dataset.i].id));
    $$('.ch-povb', body).forEach(b => b.onclick = e => {
      const i = +b.dataset.i, n = chs[i], r = b.getBoundingClientRect();
      const set = v => { if (v) n.pov = v; else delete n.pov; U.scheduleMeta(); render(); };
      U.showMenu(r.left, r.bottom + 4, [
        ...order.slice(0, 14).map(pi => ({ label: people[pi].name + (n.pov === people[pi].id ? '  ✓' : ''), action: () => set(people[pi].id) })),
        { sep: true }, { label: 'First person (I)' + (n.pov === 'first' ? '  ✓' : ''), action: () => set('first') }, { label: 'Not set (guess for me)', action: () => set(null) }]);
    });
  }

  U.on('doc', () => { if (S.view === 'insights') render(); });
  // the side panel's Insights tab: the same findings, small enough for the panel
  async function compact(box) {
    const chs = chapters();
    if (!chs.length) { box.innerHTML = '<p class="side-lead">Add some chapters to the Manuscript to see the shape of your book.</p>'; return; }
    box.innerHTML = `<p class="side-lead">Reading ${chs.length} chapters…</p>`;
    const stats = []; for (const n of chs) stats.push(await statsFor(n));
    const f = findings(chs, stats);
    const max = Math.max(...f.words, 1);
    box.innerHTML = `<p class="side-lead">${esc(f.sum)}</p>
      <div class="ins-mini" title="Chapter lengths, in order. Click one to open it">${chs.map((n, i) => `<button style="height:${Math.max(3, f.words[i] / max * 100)}%" data-i="${i}" title="${esc(n.title || 'Untitled')}: ${f.words[i].toLocaleString()} words"></button>`).join('')}</div>
      <div class="in-notes"><h4>Worth a look</h4>${f.notes.length ? f.notes.slice(0, 8).map(x => `<button class="in-note k-${x[0]}" data-i="${x[1]}">${x[2]}</button>`).join('') : '<p class="in-ok">Nothing unusual.</p>'}</div>
      ${f.glance.length ? `<div class="in-notes in-glance"><h4>At a glance</h4>${f.glance.map(x => `<p class="in-note k-g">${x[2]}</p>`).join('')}</div>` : ''}
      <div class="side-foot"><button class="btn small" data-full="pacing">Open the full charts</button><button class="btn small ghost" data-full="chars">Characters by chapter</button></div>`;
    $$('[data-i]', box).forEach(b => b.onclick = () => go(chs[+b.dataset.i].id));
    $$('[data-full]', box).forEach(b => b.onclick = () => { tab = b.dataset.full; try { localStorage.setItem(LS, tab); } catch {} U.setView('insights'); });
  }
  return { render, analyse, compact, clear: () => cache.clear() };
})();
