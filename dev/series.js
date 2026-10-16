// Unwip - Series bible. Books in the same series can share their Characters, Places and Items sheets:
// a shared sheet lives in every book of the series, and a change made in any book reaches the others
// (next time that sheet is opened there). If the same sheet was changed in two books before they caught up,
// the newer one wins and the other is kept as a snapshot, so nothing is lost.
window.UnwipSeries = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, api, esc, I } = U;
  const KINDS = { characters: 'Characters', places: 'Places', items: 'Items' };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + s.length; };
  const norm = h => (h || '').trim();
  const kindTitle = (p, k) => ((p.binder || []).find(r => r.kind === k) || {}).title || KINDS[k] || k;
  function walk(nodes, fn, root) { for (const n of nodes || []) { fn(n, root); if (n.children) walk(n.children, fn, root); } }
  function sheetsOf(p) {
    const out = [];
    for (const r of p.binder || []) if (KINDS[r.kind] || r.custom) walk(r.children, n => { if (n.type === 'doc' && !n.map) out.push({ node: n, kind: r.kind }); }, r);
    return out;
  }
  const seriesName = () => (S.project && S.project.series) || '';
  async function books(name) {
    name = name || seriesName(); if (!name) return [];
    let list = [];
    try { list = await api.listProjects(); } catch {}
    S.allProjects = list;
    return list.filter(p => p.slug !== S.slug && p.series && p.series.toLowerCase() === name.toLowerCase());
  }
  async function loadBook(slug) { try { return await api.openProject(slug); } catch { return null; } }
  const findKey = (p, key) => sheetsOf(p).find(s => s.node.series && s.node.series.key === key);

  // ---------------------------------------------------------------- keeping copies in step
  let chain = Promise.resolve();
  const queue = fn => (chain = chain.then(fn, fn));

  // when a shared sheet is opened: has another book changed it since we last caught up?
  async function reconcile(node, html) {
    if (!node.series || !seriesName()) return null;
    return queue(async () => {
      const others = [];
      for (const b of await books()) {
        const p = await loadBook(b.slug); if (!p) continue;
        const s = findKey(p, node.series.key); if (!s) continue;
        others.push({ slug: b.slug, title: p.title, p, node: s.node, html: norm(await api.loadDoc(b.slug, s.node.id)) });
      }
      if (!others.length) return null;
      const mine = norm(html), H = node.series.hash;
      const changed = others.filter(o => hash(o.html) !== H && o.html !== mine);
      if (!changed.length) {
        if (hash(mine) !== H) await pushNow(node, html);     // our change hadn't reached them yet
        return null;
      }
      const newest = changed.reduce((a, o) => ((o.node.series.at || o.node.mod || 0) > (a.node.series.at || a.node.mod || 0) ? o : a));
      const localChanged = hash(mine) !== H;
      if (localChanged && (node.series.at || node.mod || 0) > (newest.node.series.at || newest.node.mod || 0)) {
        // ours is newer: keep ours, theirs is saved as a snapshot in their book by push
        await pushNow(node, html);
        return null;
      }
      if (localChanged && mine) await api.snapSave(S.slug, node.id, html, `My version, before ${newest.title}’s change (series)`, false).catch(() => {});
      node.title = newest.node.title || node.title;
      node.series.at = newest.node.series.at || Date.now();
      await api.saveDoc(S.slug, node.id, newest.html);
      await pushNow(node, newest.html, { quiet: true });
      U.renderBinder();
      U.toast(`Updated from <b>${esc(newest.title)}</b> (shared with the series).`);
      return newest.html;
    });
  }
  // after a shared sheet is saved: copy it into the other books
  function push(node, html) { if (!node.series || !seriesName()) return Promise.resolve(); return queue(() => pushNow(node, html)); }
  async function pushNow(node, html, opts = {}) {
    const h = hash(norm(html)), H = node.series.hash, at = opts.quiet ? (node.series.at || Date.now()) : Date.now();
    const myTitle = (S.project && S.project.title) || 'another book';
    for (const b of await books()) {
      const p = await loadBook(b.slug); if (!p) continue;
      const s = findKey(p, node.series.key); if (!s) continue;
      const theirs = norm(await api.loadDoc(b.slug, s.node.id));
      if (theirs === norm(html) && s.node.series.hash === h && s.node.title === node.title) continue;
      if (theirs && hash(theirs) !== H && theirs !== norm(html)) await api.snapSave(b.slug, s.node.id, theirs, `Before ${myTitle}’s change (series)`, false).catch(() => {});
      await api.saveDoc(b.slug, s.node.id, html);
      s.node.series.hash = h; s.node.series.at = at; s.node.title = node.title; s.node.mod = Date.now();
      await api.saveProjectMeta(b.slug, p);
    }
    node.series.hash = h; node.series.at = at;
    U.scheduleMeta();
  }

  // ---------------------------------------------------------------- sharing and bringing in
  async function share(nodes) {
    const name = seriesName(); if (!name) return 0;
    const others = await books();
    let added = 0;
    for (const n of nodes) {
      const html = await api.loadDoc(S.slug, n.id);
      n.series = n.series || { key: U.uid() + U.uid() };
      n.series.hash = hash(norm(html)); n.series.at = Date.now();
      const kind = U.rootOf(n.id).kind;
      for (const b of others) {
        const p = await loadBook(b.slug); if (!p || findKey(p, n.series.key)) continue;
        // the other book already has its own sheet with this name: join them up (its old text is kept as a snapshot)
        const same = sheetsOf(p).find(x => x.kind === kind && !x.node.series && x.node.title.trim().toLowerCase() === n.title.trim().toLowerCase());
        if (same) {
          const old = norm(await api.loadDoc(b.slug, same.node.id));
          if (old && old !== norm(html)) await api.snapSave(b.slug, same.node.id, old, `This book’s own version, before sharing with ${(S.project && S.project.title) || 'the series'}`, false).catch(() => {});
          same.node.series = { ...n.series }; same.node.mod = Date.now();
          await api.saveDoc(b.slug, same.node.id, html); await api.saveProjectMeta(b.slug, p); added++; continue;
        }
        let root = (p.binder || []).find(r => r.kind === kind);
        if (!root) { root = { id: 'root-' + kind, type: 'folder', kind, title: U.rootOf(n.id).title, root: true, children: [] }; p.binder.splice(Math.max(0, p.binder.length - 1), 0, root); }
        const id = U.uid();
        root.children = root.children || [];
        root.children.push({ id, type: 'doc', title: n.title, words: n.words || 0, mod: Date.now(), series: { ...n.series } });
        await api.saveDoc(b.slug, id, html);
        await api.saveProjectMeta(b.slug, p);
        added++;
      }
    }
    U.scheduleMeta(); U.renderBinder();
    return added;
  }
  // sheets shared in other books of the series that this book doesn't have yet
  async function missing() {
    const have = new Set(sheetsOf(S.project).filter(s => s.node.series).map(s => s.node.series.key));
    const out = new Map();
    for (const b of await books()) {
      const p = await loadBook(b.slug); if (!p) continue;
      for (const s of sheetsOf(p)) {
        if (!s.node.series || have.has(s.node.series.key) || out.has(s.node.series.key)) continue;
        out.set(s.node.series.key, { slug: b.slug, book: p.title, node: s.node, kind: s.kind, kindTitle: kindTitle(p, s.kind) });
      }
    }
    return [...out.values()];
  }
  async function bringIn(items) {
    for (const it of items) {
      const html = await api.loadDoc(it.slug, it.node.id);
      const same = sheetsOf(S.project).find(x => x.kind === it.kind && !x.node.series && x.node.title.trim().toLowerCase() === it.node.title.trim().toLowerCase());
      if (same) {
        const old = norm(await api.loadDoc(S.slug, same.node.id));
        if (old && old !== norm(html)) await api.snapSave(S.slug, same.node.id, old, `This book’s own version, before ${it.book}’s was brought in`, false).catch(() => {});
        same.node.series = { ...it.node.series }; same.node.mod = Date.now();
        await api.saveDoc(S.slug, same.node.id, html);
        if (S.docId === same.node.id) await U.openDoc(same.node.id);
        continue;
      }
      let root = S.project.binder.find(r => r.kind === it.kind);
      if (!root) { root = { id: 'root-' + it.kind, type: 'folder', kind: it.kind, title: it.kindTitle, root: true, children: [] }; S.project.binder.splice(Math.max(0, S.project.binder.length - 1), 0, root); }
      const id = U.uid();
      root.children = root.children || [];
      root.children.push({ id, type: 'doc', title: it.node.title, words: it.node.words || 0, mod: Date.now(), series: { ...it.node.series } });
      await api.saveDoc(S.slug, id, html);
    }
    U.scheduleMeta(); await U.saveMetaNow(); U.renderBinder();
    if (window.FolioNames) try { await window.FolioNames.rebuild(S.project, id => api.loadDoc(S.slug, id)); } catch {}
  }
  // stop sharing: every book keeps its own copy, they just stop updating each other
  async function unshare(node) {
    const key = node.series && node.series.key; if (!key) return;
    for (const b of await books()) {
      const p = await loadBook(b.slug); if (!p) continue;
      const s = findKey(p, key); if (!s) continue;
      delete s.node.series; await api.saveProjectMeta(b.slug, p);
    }
    delete node.series; U.scheduleMeta(); U.renderBinder();
  }

  // ---------------------------------------------------------------- the dialog
  async function open() {
    if (!S.project) return;
    await U.flushSave();
    let all = []; try { all = await api.listProjects(); } catch {}
    const names = [...new Set(all.map(p => p.series).filter(Boolean))];
    const body = document.createElement('div'); body.className = 'sb';
    const draw = async () => {
      const name = seriesName();
      const others = name ? await books() : [];
      const mine = sheetsOf(S.project);
      const shared = mine.filter(s => s.node.series), notShared = mine.filter(s => !s.node.series);
      const miss = name ? await missing() : [];
      const group = list => { const g = {}; for (const s of list) (g[s.kind] = g[s.kind] || []).push(s); return g; };
      body.innerHTML = `
        <p class="sb-intro">Books in the same series can share their characters, places and items. A shared sheet is in every book of the series, and when you change it in one book the others catch up.</p>
        <div class="field"><label>This book is part of the series</label>
          <div class="sb-name"><input id="sb-name" list="sb-names" placeholder="e.g. The Lantern Road" value="${esc(name)}"><datalist id="sb-names">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
          <button class="btn" id="sb-save">${name ? 'Rename / change' : 'Join'}</button></div></div>
        ${name ? `<div class="sb-books">${I.series}<span><b>${esc(name)}</b>: ${[S.project.title, ...others.map(o => o.title)].map(t => `<span class="sb-chip">${esc(t)}</span>`).join('')}</span></div>
        ${!others.length ? `<p class="sb-hint">No other books in this series yet. Open another book, choose <b>Series bible</b> there and type the same series name.</p>` : ''}
        ${miss.length ? `<div class="sb-sec sb-miss"><h3>In the series, not in this book yet <span>${miss.length}</span></h3>
          <div class="sb-list">${miss.map((m, i) => `<label class="sb-row"><input type="checkbox" data-m="${i}" checked><span class="sb-t">${esc(m.node.title)}</span><span class="sb-k">${esc(m.kindTitle)} · from ${esc(m.book)}${mine.some(x => !x.node.series && x.node.title.trim().toLowerCase() === m.node.title.trim().toLowerCase()) ? ' · joins up with this book’s own (yours is kept as a snapshot)' : ''}</span></label>`).join('')}</div>
          <button class="btn primary" id="sb-bring">Bring these in</button></div>` : ''}
        <div class="sb-sec"><h3>Shared with the series <span>${shared.length}</span></h3>
          ${shared.length ? Object.entries(group(shared)).map(([k, l]) => `<div class="sb-kind">${esc(kindTitle(S.project, k))}</div><div class="sb-list">${l.map(s => `<div class="sb-row"><span class="sb-ic">${I.series}</span><span class="sb-t">${esc(s.node.title)}</span><button class="link-btn" data-open="${s.node.id}">Open</button><button class="link-btn" data-un="${s.node.id}">Stop sharing</button></div>`).join('')}</div>`).join('') : '<p class="sb-hint">Nothing shared yet.</p>'}
        </div>
        ${notShared.length ? `<div class="sb-sec"><h3>Share more from this book</h3>
          ${Object.entries(group(notShared)).map(([k, l]) => `<div class="sb-kind"><label><input type="checkbox" class="sb-all" data-k="${esc(k)}"> ${esc(kindTitle(S.project, k))}</label></div><div class="sb-list">${l.map(s => `<label class="sb-row"><input type="checkbox" data-s="${s.node.id}" data-k="${esc(k)}"><span class="sb-t">${esc(s.node.title)}</span></label>`).join('')}</div>`).join('')}
          <button class="btn primary" id="sb-share">Share with the series</button></div>` : ''}` : ''}`;
      $('#sb-save', body).onclick = async () => {
        const v = $('#sb-name', body).value.trim();
        if (S.project.series && v !== S.project.series && sheetsOf(S.project).some(s => s.node.series)) {
          if (!(await U.confirmBox('Change series?', `Move this book to “${esc(v || 'no series')}”? Its shared sheets stop updating with “${esc(S.project.series)}”.`, 'Move'))) return;
          sheetsOf(S.project).forEach(s => { delete s.node.series; });
        }
        S.project.series = v; U.scheduleMeta(); await U.saveMetaNow(); U.renderBinder(); draw();
      };
      $('#sb-name', body).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('#sb-save', body).click(); } };
      const bring = $('#sb-bring', body);
      if (bring) bring.onclick = async () => {
        const pick = $$('[data-m]', body).filter(c => c.checked).map(c => miss[+c.dataset.m]);
        if (!pick.length) return;
        bring.disabled = true; await bringIn(pick);
        U.toast(`Brought in ${pick.length} sheet${pick.length === 1 ? '' : 's'} from the series.`); draw();
      };
      $$('.sb-all', body).forEach(a => a.onchange = () => $$(`[data-s][data-k="${a.dataset.k}"]`, body).forEach(c => { c.checked = a.checked; }));
      const sh = $('#sb-share', body);
      if (sh) sh.onclick = async () => {
        const ids = $$('[data-s]', body).filter(c => c.checked).map(c => c.dataset.s);
        if (!ids.length) return U.toast('Tick the sheets to share first.');
        sh.disabled = true;
        const n = await share(ids.map(id => U.findNode(id).node));
        U.toast(`Shared ${ids.length} sheet${ids.length === 1 ? '' : 's'}${n ? ` · added to ${others.length} other book${others.length === 1 ? '' : 's'}` : ''}.`); draw();
      };
      $$('[data-un]', body).forEach(b => b.onclick = async () => {
        const n = U.findNode(b.dataset.un).node;
        if (!(await U.confirmBox('Stop sharing?', `“${esc(n.title)}” stays in every book, but the copies stop updating each other.`, 'Stop sharing'))) return;
        await unshare(n); draw();
      });
      $$('[data-open]', body).forEach(b => b.onclick = () => { const id = b.dataset.open; const back = body.closest('.modal-back'); const close = back && back.querySelector('.m-foot button'); if (close) close.click(); U.openDoc(id); });
    };
    await draw();
    await U.modal({ title: 'Series bible', body, wide: true, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }

  return { open, reconcile, push, share, unshare, missing, bringIn, hash, books, active: () => !!seriesName() };
})();
