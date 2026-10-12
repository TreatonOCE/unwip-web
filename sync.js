// Unwip - working across devices (Dropbox / OneDrive folders) and backups.
// Sync itself is done by the Dropbox (or OneDrive) app: Unwip keeps its library inside that folder, then
//  - warns when the same project is open on another device right now
//  - notices when another device changed a chapter or the binder, and loads it
//  - finds Dropbox "conflicted copies" and helps keep both versions
// Backups: automatic backups (now with images), restore any of them as a copy, full backup files (.unwip),
// and an optional extra copy to another folder or drive once a day.
window.UnwipSync = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, fmt, S, api, editor } = U;
  let beat = null, current = null;

  // ================================================================== ONE DEVICE AT A TIME
  // Before a project opens: if another device has it open right now, ask it to save and close
  // (through a note in the project's Dropbox folder) and wait until it has.
  api.libraryInfo().then(i => { S.device = i.device; }).catch(() => {});
  const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); };
  async function beforeOpen(slug) {
    let others = [];
    try { others = await api.othersOpen(slug); } catch { return true; }
    if (!others.length) return true;
    const o = others[0];
    const choice = await U.modal({ title: 'Open on another device', body: `<p>This project is open on <b>${esc(o.device)}</b> right now (active ${ago(o.at)}).</p>
      <p>To keep your writing safe, Unwip can <b>save and close it there</b>, then open it here. It takes a few seconds, sometimes up to a minute while Dropbox passes the message along.</p>`,
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Open on both anyway', value: 'both', kind: 'ghost' }, { label: `Close it on ${o.device} and open here`, value: 'take', kind: 'primary' }] });
    if (!choice) return false;
    if (choice === 'both') return true;
    await api.requestTakeover(slug, true);
    const body = document.createElement('div');
    body.innerHTML = `<div class="sy-wait"><span class="sy-spin"></span><div><b>Waiting for ${esc(o.device)} to save and close…</b><span id="sy-wait-t">Asked just now</span></div></div>`;
    let done = false, t0 = Date.now();
    const p = U.modal({ title: 'One moment', body, buttons: [{ label: 'Open now anyway', value: 'now', kind: 'ghost' }, { label: 'Cancel', value: false, kind: 'ghost' }] });
    const back = document.querySelector('.modal-back:last-of-type');
    const result = await new Promise(resolve => {
      p.then(v => { if (!done) { done = true; resolve(v); } });
      const tick = setInterval(async () => {
        if (done) return clearInterval(tick);
        const left = await api.othersOpen(slug).catch(() => []);
        const el = $('#sy-wait-t', body); if (el) el.textContent = `Asked ${Math.round((Date.now() - t0) / 1000)} seconds ago`;
        if (!left.length) { done = true; clearInterval(tick); if (back) back.remove(); resolve('closed'); }
        else if (Date.now() - t0 > 120000) { done = true; clearInterval(tick); if (back) back.remove(); resolve('timeout'); }
      }, 2000);
    });
    await api.requestTakeover(slug, false);
    if (result === 'closed') { U.toast(`Closed safely on ${esc(o.device)}. Opening here.`); return true; }
    if (result === 'now') return true;
    if (result === 'timeout') return !!(await U.confirmBox('No answer', `${esc(o.device)} didn’t reply. It may be asleep or offline, in which case it can’t change anything. Open the project here anyway?`, 'Open here'));
    return false;
  }
  // the other side: this computer is asked to let go
  async function letGo(t) {
    clearInterval(beat);
    const slug = S.slug;
    $$('.modal-back').forEach(m => m.remove());
    if (document.body.classList.contains('writer')) await U.setWriter(false);
    await U.flushSave(); await U.saveMetaNow();
    await U.showLibrary();
    await api.presence(slug, false);
    U.modal({ title: 'Closed to keep your work safe', body: `<p>You opened this project on <b>${esc(t.by)}</b>, so Unwip saved everything here and closed it, so the two computers can’t overwrite each other.</p><p>Everything you wrote here is saved and on its way to ${esc(t.by)} through Dropbox.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
  }
  U.on('project', async () => {
    current = S.slug;
    S.lastSeenAt = (() => { try { return +localStorage.getItem('unwip-seen-' + S.slug) || 0; } catch { return 0; } })();
    U.renderBinder();
    api.presence(S.slug, true); clearInterval(beat);
    beat = setInterval(async () => {
      if (!S.slug) return;
      api.presence(S.slug, true);
      const t = await api.checkTakeover(S.slug).catch(() => null);
      if (t) letGo(t);
    }, 15000);
    api.watchProject(S.slug);
    checkConflicts();
    changedElsewhere();
  });
  const markSeen = () => { if (S.slug) try { localStorage.setItem('unwip-seen-' + S.slug, String(Date.now())); } catch {} };
  U.on('leave', () => { markSeen(); if (current) { api.presence(current, false); api.watchProject(null); } clearInterval(beat); current = null; });
  window.addEventListener('beforeunload', () => { markSeen(); if (current) api.presence(current, false); });

  // ================================================================== WHAT CHANGED ELSEWHERE
  // documents saved on another device since this one last had the project open
  function changedList(since) {
    const out = []; U.walkTree(S.project.binder, n => { if (n.type === 'doc' && n.mod && n.dev && n.dev !== S.device && n.mod > since) out.push(n); });
    return out.sort((a, b) => b.mod - a.mod);
  }
  function changedElsewhere() {
    const list = changedList(S.lastSeenAt || 0);
    if (!list.length || !S.lastSeenAt) return;
    const dev = list[0].dev;
    U.toastAction(`${list.length} document${list.length > 1 ? 's were' : ' was'} changed on <b>${esc(dev)}</b> since you were last here.`, 'Show me', () => recentDialog(true), 15000);
  }
  // binder: a small dot on documents changed on another device since last time
  U.on('binder', () => {
    if (!S.project || !S.lastSeenAt) return;
    for (const n of changedList(S.lastSeenAt)) {
      const t = document.querySelector(`.tree-row[data-id="${n.id}"] .tr-title`);
      if (t && !t.parentElement.querySelector('.tr-new')) t.insertAdjacentHTML('afterend', `<span class="tr-new" data-tip="Changed on ${esc(n.dev)} ${ago(n.mod)}"></span>`);
    }
  });
  async function recentDialog(onlyElsewhere) {
    const all = []; U.walkTree(S.project.binder, n => { if (n.type === 'doc' && n.mod && !n.map) all.push(n); });
    all.sort((a, b) => b.mod - a.mod);
    const list = onlyElsewhere ? changedList(S.lastSeenAt || 0) : all.slice(0, 20);
    const body = document.createElement('div');
    body.innerHTML = list.length ? `<div class="sy-list">${list.map(n => `<div class="sy-row" data-id="${n.id}"><div><b>${esc(n.title || 'Untitled')}</b><span>${ago(n.mod)}${n.dev ? ` · on ${esc(n.dev)}${n.dev === S.device ? ' (this computer)' : ''}` : ''}</span></div><button class="btn small">Open</button></div>`).join('')}</div>
      <p class="rp-note">Opening a document that was changed on another device highlights exactly what changed.</p>` : '<p class="np-empty">Nothing yet. Documents show up here as they’re saved.</p>';
    U.modal({ title: onlyElsewhere ? 'Changed on your other device' : 'Recently updated', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }],
      onOpen: back => $$('.sy-row', back).forEach(r => r.querySelector('button').onclick = () => { back.querySelector('.m-foot .btn').click(); U.openDoc(r.dataset.id); }) });
  }

  // ---- highlight exactly what changed since this computer last saw a document
  const hasHL = typeof Highlight !== 'undefined' && CSS.highlights;
  const words = t => t.match(/\S+/g) || [];
  function textPoint(block, offset) {
    const w = document.createTreeWalker(block, NodeFilter.SHOW_TEXT); let n, left = offset;
    while ((n = w.nextNode())) { if (left <= n.length) return [n, left]; left -= n.length; }
    return [block, block.childNodes.length];
  }
  function lcsKeep(a, b) {   // which words of b also appear (in order) in a
    if (a.length * b.length > 2.5e6) return new Array(b.length).fill(false);
    const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
    for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const keep = new Array(b.length).fill(false); let i = 0, j = 0;
    while (i < a.length && j < b.length) { if (a[i] === b[j]) { keep[j] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
    return keep;
  }
  function highlightChanges(oldHTML) {
    if (!hasHL) return null;
    const box = document.createElement('div'); box.innerHTML = oldHTML;
    const oldParas = [...box.children].map(b => b.textContent.trim()).filter(Boolean);
    const oldSet = new Set(oldParas);
    const ranges = []; let changedParas = 0, newWords = 0;
    for (const block of editor.children) {
      const text = block.textContent; if (!text.trim() || oldSet.has(text.trim())) continue;
      changedParas++;
      const nw = words(text);
      // the most similar old paragraph, if any
      let best = null, bestScore = 0; const set = new Set(nw);
      for (const op of oldParas) { const ow = words(op); let hit = 0; for (const w of ow) if (set.has(w)) hit++; const sc = hit / Math.max(ow.length, nw.length); if (sc > bestScore) { bestScore = sc; best = ow; } }
      const keep = best && bestScore > 0.4 ? lcsKeep(best, nw) : new Array(nw.length).fill(false);
      let pos = 0, k = 0; const re = /\S+/g; let m;
      while ((m = re.exec(text))) {
        if (!keep[k]) {
          newWords++;
          let end = m.index + m[0].length;
          while (k + 1 < nw.length && !keep[k + 1]) { const n2 = re.exec(text); if (!n2) break; k++; newWords++; end = n2.index + n2[0].length; }
          const r = document.createRange(); r.setStart(...textPoint(block, m.index)); r.setEnd(...textPoint(block, end)); ranges.push(r);
        }
        k++;
      }
    }
    CSS.highlights.delete('unwip-changed');
    if (ranges.length) CSS.highlights.set('unwip-changed', new Highlight(...ranges));
    const removed = Math.max(0, words(oldParas.join(' ')).length - (words(editor.innerText).length - newWords));
    return { changedParas, newWords, removed };
  }
  function clearHighlights() { if (hasHL) CSS.highlights.delete('unwip-changed'); const b = $('#chg-bar'); if (b) b.remove(); }
  async function showChanges(id) {
    const f = U.findNode(id); if (!f) return;
    const seen = await api.seenLoad(S.slug, id).catch(() => null);
    const n = f.node;
    if (seen && n.dev && n.dev !== S.device && n.mod && n.mod > seen.at + 1000 && seen.html !== editor.innerHTML) {
      api.snapSave(S.slug, id, seen.html, `Before changes on ${n.dev}`, true).catch(() => {});   // the old version stays in Snapshots
      const r = highlightChanges(seen.html);
      if (r && (r.newWords || r.removed)) {
        const bar = document.createElement('div'); bar.id = 'chg-bar'; bar.className = 'chg-bar';
        bar.innerHTML = `<span class="chg-sw"></span><div><b>Changed on ${esc(n.dev)} ${ago(n.mod)}</b><span>${r.newWords ? `${U.fmt(r.newWords)} word${r.newWords > 1 ? 's' : ''} new or changed` : ''}${r.newWords && r.removed ? ' · ' : ''}${r.removed ? `${U.fmt(r.removed)} removed` : ''} · the earlier version is in Snapshots</span></div><button class="btn small" id="chg-hide">Hide highlights</button>`;
        $('#page').prepend(bar);
        $('#chg-hide', bar).onclick = clearHighlights;
      }
    }
    api.seenSave(S.slug, id, editor.innerHTML);
  }
  U.on('doc', id => { clearHighlights(); showChanges(id); });
  U.on('saved', (id, html) => api.seenSave(S.slug, id, html));
  U.on('leave', clearHighlights);

  // ================================================================== CHANGES ARRIVING WHILE OPEN
  api.onExternalChange(async info => {
    if (!S.project || info.slug !== S.slug) return;
    if (info.file === 'project.json') {
      const load = async () => { clearTimeout(S.metaTimer); S.metaTimer = null; try { U.reloadProjectMeta(await api.openProject(S.slug)); U.toast('Updated with changes from your other device.'); } catch {} };
      if (S.metaTimer) U.toastAction('The binder was changed on another device.', 'Load those changes', load, 20000);
      else load();
      return;
    }
    if (info.id && info.id === S.docId) {
      const before = editor.innerHTML;
      const load = async () => {
        if (S.dirty) await U.takeSnapshot('My version before an update from another device').catch(() => {});
        const html = await api.loadDoc(S.slug, info.id);
        const top = U.editorWrap.scrollTop;
        S.programmatic = true; editor.innerHTML = html || '<p><br></p>'; S.programmatic = false;
        S.dirty = false; U.resyncWords(); U.updateStatus(); U.editorWrap.scrollTop = top;
        highlightChanges(before); api.seenSave(S.slug, info.id, editor.innerHTML);
      };
      if (!S.dirty) { await load(); U.toast('This chapter was just updated from your other device. Changes are highlighted.'); }
      else U.toastAction('This chapter was also changed on another device.', 'Use that version (yours goes to Snapshots)', load, 20000);
    }
  });

  // ================================================================== DROPBOX CONFLICTED COPIES
  async function checkConflicts() {
    let list = []; try { list = await api.conflicts(S.slug); } catch { return; }
    if (!list.length) return;
    const titleOf = c => { if (c.kind !== 'doc') return 'The binder (project file)'; const id = c.original.replace(/\.html$/, ''); const f = U.findNode(id); return f ? f.node.title : 'A deleted document'; };
    const body = document.createElement('div');
    body.innerHTML = `<p>Dropbox found ${list.length === 1 ? 'a document that was' : 'documents that were'} changed on two devices at once, so it kept both versions. Nothing is lost. Choose what to do with each one.</p>
      <div class="sy-list">${list.map((c, i) => `<div class="sy-row" data-i="${i}"><div><b>${esc(titleOf(c))}</b><span>Other version from ${esc(c.device)}</span></div>
        <button class="btn small" data-a="keep">${c.kind === 'doc' ? 'Keep both' : 'Recover missing items'}</button><button class="btn small ghost" data-a="drop">Not needed</button></div>`).join('')}</div>
      <p class="rp-note">“Keep both” adds the other version as a new document right under the original, so you can compare them. “Not needed” moves it to the project’s backups folder rather than deleting it.</p>`;
    const handle = async (c, row, action) => {
      try {
        if (action === 'keep' && c.kind === 'doc') {
          const id = c.original.replace(/\.html$/, ''); const html = await api.readConflict(S.slug, c.file);
          const f = U.findNode(id);
          const node = { id: U.uid(), type: 'doc', title: `${f ? f.node.title : 'Recovered'} (version from ${c.device})`, words: U.countWords(html.replace(/<[^>]+>/g, ' ')) };
          if (f) f.list.splice(f.index + 1, 0, node); else U.findNode('root-manuscript').node.children.push(node);
          await api.saveDoc(S.slug, node.id, html);
        }
        if (action === 'keep' && c.kind === 'project') {
          const other = JSON.parse(await api.readConflict(S.slug, c.file)); const have = new Set(); U.walkTree(S.project.binder, n => { have.add(n.id); });
          const missing = []; U.walkTree(other.binder || [], n => { if (!have.has(n.id) && !n.root && n.type === 'doc') missing.push({ ...n, children: undefined }); });
          if (missing.length) {
            const notes = S.project.binder.find(n => n.root && n.kind === 'notes') || S.project.binder[0];
            notes.children.push({ id: U.uid(), type: 'folder', title: `Recovered from ${c.device}`, open: true, children: missing.map(m => ({ id: m.id, type: 'doc', title: m.title, synopsis: m.synopsis, words: m.words || 0 })) });
            notes.open = true;
          }
          U.toast(missing.length ? `Recovered ${missing.length} document${missing.length > 1 ? 's' : ''} into Notes › Recovered from ${esc(c.device)}.` : 'Nothing was missing. Your binder already has everything.');
        }
        await api.archiveConflict(S.slug, c.file);
        U.scheduleMeta(); U.renderBinder();
        row.classList.add('done'); row.querySelectorAll('button').forEach(b => b.disabled = true);
        row.querySelector('span').textContent = action === 'keep' ? 'Done' : 'Moved to backups';
      } catch (e) { U.toast('Couldn’t sort that one out: ' + esc(e.message || e), 'warn'); }
    };
    U.modal({ title: 'Two versions found', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }],
      onOpen: back => $$('.sy-row', back).forEach(row => row.querySelectorAll('[data-a]').forEach(b => b.onclick = () => handle(list[+row.dataset.i], row, b.dataset.a))) });
  }

  // ================================================================== SETTINGS: WHERE PROJECTS LIVE
  const ICON = { dropbox: '📦', onedrive: '☁️', default: '💻', custom: '📁' };
  async function settingsSection(body) {
    const box = $('#s-lib', body), extra = $('#s-extra', body);
    let info; try { info = await api.libraryInfo(); } catch { return; }
    if (info.web && window.UnwipDropbox) {     // the web version with Dropbox sync
      box.innerHTML = '<div id="dbx-card" class="dbx-card"></div>'; window.UnwipDropbox.fillCard($('#dbx-card', box)); extra.innerHTML = ''; return;
    }
    if (info.web) {     // the web version (iPad / iPhone): projects live in this browser for now
      box.innerHTML = `<div class="sy-cur"><span class="sy-ic">📱</span><div><b>${esc(info.places[0].label)}</b><span class="sy-path">Saved inside this browser. Add Unwip to your Home Screen so it’s kept safe.</span></div></div>
        <p class="sy-note">To bring a project over from your PC: in the PC app, open the project’s ⋯ menu › “Save a full backup file…”, put the file in Dropbox (or AirDrop it), then here use Import… › “Restore from a backup file”. Dropbox sign-in, so both stay in step automatically, is coming next.</p>`;
      extra.innerHTML = '';
      return;
    }
    const cur = info.places.find(p => p.kind === info.kind) || { label: 'A folder you chose', kind: 'custom' };
    const others = info.places.filter(p => p.kind !== info.kind);
    box.innerHTML = `<div class="sy-cur"><span class="sy-ic">${ICON[info.kind] || '📁'}</span><div><b>${esc(cur.label)}</b>${info.kind === 'dropbox' || info.kind === 'onedrive' ? ' <em class="sy-badge">syncing</em>' : ''}<span class="sy-path">${esc(info.path)}</span></div><button class="btn small ghost" id="sy-open" type="button">Open folder</button></div>
      ${info.kind === 'default' && !info.places.some(p => p.kind === 'dropbox') ? '<p class="sy-note">To sync between devices, install the Dropbox app on this PC, then come back here. Unwip will offer to move your projects into it.</p>' : ''}
      <div class="sy-moves">${others.map(p => `<button class="btn ${p.kind === 'dropbox' ? 'primary' : ''}" type="button" data-path="${esc(p.path)}" data-label="${esc(p.label)}" data-tip="${esc(p.path)}">${ICON[p.kind]} ${p.kind === 'default' ? 'Move back to this PC only' : `Sync with ${esc(p.label)}`}</button>`).join('')}
        <button class="btn ghost" type="button" id="sy-pick">Choose another folder…</button></div>`;
    $('#sy-open', box).onclick = () => api.revealProject(null);
    $$('[data-path]', box).forEach(b => b.onclick = () => move(b.dataset.path, b.dataset.label));
    $('#sy-pick', box).onclick = async () => { const p = await api.libraryPick(); if (p) move(p, 'that folder'); };
    const s = S.settings || {};
    const drawExtra = () => {
      const dir = (S.settings || {}).extraBackupDir;
      extra.innerHTML = `<label>Once a day, each project you work on is also saved as a full backup file (with images) in a second place, like a USB stick or another drive. The last 10 are kept.</label>
        <div class="sy-cur"><span class="sy-ic">${dir ? '🛟' : '—'}</span><div>${dir ? `<b>On</b><span class="sy-path">${esc(dir)}</span>` : '<b>Off</b>'}</div>
        <button class="btn small" id="sy-xpick" type="button">${dir ? 'Change…' : 'Choose a folder…'}</button>${dir ? '<button class="btn small ghost" id="sy-xoff" type="button">Turn off</button>' : ''}</div>`;
      $('#sy-xpick', extra).onclick = async () => { const p = await api.backupExtraPick(); if (p) { S.settings = await api.setSettings({ extraBackupDir: p }); drawExtra(); if (S.slug) api.backupExtraNow(S.slug); } };
      const off = $('#sy-xoff', extra); if (off) off.onclick = async () => { S.settings = await api.setSettings({ extraBackupDir: null }); drawExtra(); };
    };
    drawExtra();
  }
  async function move(target, label) {
    const ok = await U.confirmBox(`Move your projects to ${label}?`, `Unwip will copy every project (and your Play pieces) to:<br><b>${esc(target)}</b><br><br>If projects are already there from another device, both are kept. Your current folder isn’t deleted. It’s renamed “… (old copy)” so you can check everything arrived before removing it yourself.`, 'Move projects');
    if (!ok) return;
    const back = document.querySelector('.modal-back'); if (back) back.remove();
    if (S.slug) await U.showLibrary();
    U.toast('Moving your projects…', '', 2500);
    try {
      const r = await api.libraryMove(target);
      await U.showLibrary();
      U.modal({ title: 'Done', body: `<p>${r.moved ? `${r.moved} item${r.moved > 1 ? 's' : ''} copied` : 'Nothing needed copying'}${r.kept ? `, and ${r.kept} project${r.kept > 1 ? 's were' : ' was'} already there and up to date` : ''}.</p><p>Your projects now live in <b>${esc(r.path)}</b>.</p>${r.old && r.old !== r.path ? `<p class="rp-note">Your old folder is kept as <b>${esc(r.old)}</b>. Once you’ve checked everything opens fine, you can delete it.</p>` : ''}
        <p class="rp-note">On your other device: install Unwip, then Settings → Where your projects live → Sync with Dropbox. It will find these projects.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
    } catch (e) { U.toast('Couldn’t move the projects: ' + esc(e.message || e), 'warn', 8000); }
  }

  // ================================================================== BACKUPS DIALOG (from a project card)
  async function backupsDialog(slug, title) {
    const list = await api.backupList(slug);
    const when = st => { const d = new Date(st.slice(0, 10) + 'T' + st.slice(11, 19).replace(/-/g, ':') + 'Z'); return isNaN(d) ? st : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
    const body = document.createElement('div');
    body.innerHTML = `<p>Unwip backs up <b>${esc(title)}</b> automatically when you open it, every 10 minutes while you write, and when you close it. The last 20 are kept, and images are backed up too.</p>
      ${list.length ? `<div class="sy-list">${list.map(b => `<div class="sy-row"><div><b>${esc(when(b.stamp))}</b><span>${b.docs} documents${b.words ? ` · ${fmt(b.words)} words in the manuscript` : ''}</span></div><button class="btn small" data-stamp="${esc(b.stamp)}">Restore as a copy</button></div>`).join('')}</div>` : '<p class="np-empty">No backups yet. One is made the next time you open the project.</p>'}
      <p class="rp-note">Restoring makes a separate project next to this one, so nothing current is overwritten. For a backup you can keep anywhere, use “Save a full backup file…” on the project’s menu.</p>`;
    U.modal({ title: 'Backups', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'primary' }],
      onOpen: back => $$('[data-stamp]', back).forEach(b => b.onclick = async () => {
        b.disabled = true;
        try { await api.backupRestore(slug, b.dataset.stamp); U.toast('Restored as a new project in your library.'); back.querySelector('.m-foot .btn').click(); U.showLibrary(); }
        catch (e) { U.toast('Couldn’t restore: ' + esc(e.message || e), 'warn'); b.disabled = false; }
      }) });
  }

  // main screen: "Recently updated", across every project and computer
  U.on('library', list => {
    let sec = $('#lib-recent');
    const items = (list || []).flatMap(p => (p.recent || []).map(r => ({ ...r, slug: p.slug, project: p.title }))).sort((a, b) => b.mod - a.mod).slice(0, 5);
    if (!items.length) { if (sec) sec.remove(); return; }
    if (!sec) { sec = document.createElement('section'); sec.id = 'lib-recent'; sec.className = 'lib-recent'; const row = $('#write-home .lib-row'); row.parentNode.insertBefore(sec, row); }
    sec.innerHTML = `<div class="lr-head">Recently updated</div><div class="lr-list">${items.map(r => `<button class="lr-item" data-slug="${esc(r.slug)}" data-id="${esc(r.id)}"><b>${esc(r.title || 'Untitled')}</b><span>${esc(r.project)} · ${ago(r.mod)}${r.dev ? ` · ${r.dev === S.device ? 'this computer' : 'on ' + esc(r.dev)}` : ''}</span></button>`).join('')}</div>`;
    $$('.lr-item', sec).forEach(b => b.onclick = async () => { const ok = await U.openProject(b.dataset.slug); if (ok !== false && U.findNode(b.dataset.id)) U.openDoc(b.dataset.id); });
  });
  // a warning on the library screen if the sync folder has gone missing (e.g. Dropbox uninstalled)
  U.on('library', async () => {
    let info; try { info = await api.libraryInfo(); } catch { return; }
    let bar = $('#sy-warn');
    if (!info.parentMissing) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'sy-warn'; bar.className = 'sy-warn'; $('#write-home').prepend(bar); }
    bar.innerHTML = `Unwip can’t find the folder your projects sync to: <b>${esc(info.path)}</b>. Is Dropbox (or OneDrive) running on this PC? <button class="btn small" type="button">Settings</button>`;
    bar.querySelector('button').onclick = () => $('#btn-settings-lib').click();
  });

  const rb = $('#btn-recent'); if (rb) { rb.innerHTML = U.I.history; rb.onclick = () => recentDialog(false); }
  return { settingsSection, backupsDialog, checkConflicts, beforeOpen, recentDialog, highlightChanges };
})();
