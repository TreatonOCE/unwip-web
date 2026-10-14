// Unwip - moving from the old web address (treatonoce.github.io/unwip-web) to unwip.app.
// A browser keeps each website's books apart, so the new address starts empty. This brings everything across:
//   • "Move now": the old page opens unwip.app and hands every book, setting and Dropbox link straight over
//     (computers, and iPad/iPhone in Safari).
//   • "Moving file": the old page saves one file with everything in it; the new page reads it back
//     (for Home Screen apps, which can't hand over directly).
// Nothing at the old address is deleted. On the new side, anything already there is kept (never overwritten).
// Web only, and never in Unwip Dev (it has its own books and stays where it is).
window.UnwipMove = (function () {
  'use strict';
  const F = window.folio;
  if (!F || !F.web || !F.__fs || window.UNWIP_DEV) return null;
  const OLD = 'https://treatonoce.github.io', NEW = 'https://unwip.app', NEW_URL = NEW + '/';
  const FS = F.__fs, ZIP = F._zip;
  const here = location.origin;
  const isOld = here === OLD, isNew = here === NEW;
  const standalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const U = () => window.__unwip;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const say = (m, k, ms) => { const u = U(); if (u) u.toast(m, k || '', ms || 6000); };
  const SIGNIN = ['refresh', 'access', 'exp'];   // Dropbox sign-in: handed over directly, never written into a file

  // ---------------------------------------------------------------- reading and writing everything
  async function everything() {
    const keys = await FS.keys('');
    const out = [];
    for (const k of keys) { const v = await FS.read(k); if (v != null) out.push([k, v]); }
    const local = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && !k.startsWith('dev:')) local[k] = localStorage.getItem(k); } } catch {}
    return { entries: out, local };
  }
  const books = entries => new Set(entries.map(([k]) => (/^Unwip\/([^/_][^/]*)\/project\.json$/.exec(k) || [])[1]).filter(Boolean));
  // put what came across into this browser: new things are added, nothing already here is replaced
  async function take(entries, local) {
    let added = 0, kept = 0;
    for (const [k, v] of entries) {
      if (typeof k !== 'string' || k.includes('..')) continue;
      if (k === 'app/settings.json') {
        const mine = await FS.json(k, null), theirs = (() => { try { return JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v)); } catch { return null; } })();
        if (theirs) { await FS.write(k, JSON.stringify({ ...(mine || {}), ...theirs })); added++; }
        continue;
      }
      if (k === 'app/dropbox.json') {
        const mine = await FS.json(k, null);
        if (mine && mine.refresh) { kept++; continue; }               // already connected here: keep that
        await FS.write(k, v); added++; continue;
      }
      if (await FS.exists(k)) { kept++; continue; }
      await FS.write(k, v); added++;
    }
    try { for (const [k, v] of Object.entries(local || {})) if (localStorage.getItem(k) == null) localStorage.setItem(k, v); } catch {}
    return { added, kept, books: books(entries).size };
  }
  const finished = r => {
    const u = U();
    const msg = r.books ? `Moved ${r.books} book${r.books === 1 ? '' : 's'} to unwip.app.` : 'Your settings came across (there were no books to move).';
    if (u && u.modal) u.modal({ title: 'Welcome to unwip.app', body: `<p>${msg}${r.kept ? ' Anything that was already here was kept as it was.' : ''}</p><p>This is Unwip’s home from now on. If you use Unwip from your Home Screen, add this page to your Home Screen too, then you can remove the old one.</p>`, buttons: [{ label: 'Start writing', value: true, kind: 'primary' }] }).then(() => location.replace(location.pathname));
    else location.replace(location.pathname);
  };

  // ---------------------------------------------------------------- the moving file (one .unwipmove file with everything)
  async function saveFile() {
    const { entries, local } = await everything();
    const files = [];
    for (const [k, v] of entries) {
      let val = v;
      if (k === 'app/dropbox.json') { try { const d = JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v)); SIGNIN.forEach(f => delete d[f]); val = JSON.stringify(d); } catch {} }
      files.push({ name: (typeof val === 'string' ? 't/' : 'b/') + k, data: val });
    }
    files.push({ name: '_local.json', data: JSON.stringify(local) });
    files.push({ name: '_unwipmove.json', data: JSON.stringify({ v: 1, from: here, at: Date.now(), books: books(entries).size }) });
    const name = `Unwip moving file ${new Date().toLocaleDateString('en-CA')}.unwipmove`;
    F.__download(ZIP.zipFiles(files), name, 'application/zip');
    return { name, books: books(entries).size };
  }
  async function readFile() {
    const [f] = await F.__pick({ accept: '' }); if (!f) return;   // any file: iPhones grey out file types they don't know
    let files;
    try { files = await ZIP.unzip(new Uint8Array(await f.arrayBuffer())); } catch { say('That isn’t an Unwip moving file.', 'warn'); return; }
    if (!files.find(x => x.name === '_unwipmove.json')) { say('That isn’t an Unwip moving file. (A backup of one book is brought in from the library’s Restore a backup instead.)', 'warn', 9000); return; }
    const dec = d => typeof d === 'string' ? d : new TextDecoder().decode(d);
    const entries = [];
    let local = {};
    for (const x of files) {
      if (x.name === '_local.json') { try { local = JSON.parse(dec(x.data)); } catch {} continue; }
      if (x.name.startsWith('t/')) entries.push([x.name.slice(2), dec(x.data)]);
      else if (x.name.startsWith('b/')) entries.push([x.name.slice(2), x.data instanceof Uint8Array ? x.data : new Uint8Array(x.data)]);
    }
    const r = await take(entries, local);
    finished(r);
  }

  // ---------------------------------------------------------------- moving straight across (the old page opens the new one)
  // old side: send everything in batches, each one confirmed before the next, only ever to unwip.app
  function moveNow(onState) {
    return new Promise(async resolve => {
      const w = window.open(NEW_URL + '?move=1', '_blank');
      if (!w) { onState('blocked'); resolve(false); return; }
      const { entries, local } = await everything();
      const BATCH = 150, n = Math.ceil(entries.length / BATCH) || 1;
      let i = 0, started = false;
      const stop = setTimeout(() => { if (!started) { removeEventListener('message', on); onState('noreply'); resolve(false); } }, 25000);
      const send = () => {
        if (i < n) { w.postMessage({ type: 'unwip-move-batch', i, n, entries: entries.slice(i * BATCH, (i + 1) * BATCH) }, NEW); onState('sending', i / n); }
        else w.postMessage({ type: 'unwip-move-end', local }, NEW);
      };
      function on(e) {
        if (e.origin !== NEW || e.source !== w || !e.data || typeof e.data.type !== 'string') return;
        if (e.data.type === 'unwip-move-ready' && !started) { started = true; clearTimeout(stop); send(); }
        else if (e.data.type === 'unwip-move-ack') { i = e.data.i + 1; send(); }
        else if (e.data.type === 'unwip-move-done') { removeEventListener('message', on); onState('done', e.data); resolve(true); }
      }
      addEventListener('message', on);
    });
  }
  // new side: opened by the old page with ?move=1
  function receive() {
    if (!window.opener) return false;
    const got = [];
    addEventListener('message', async e => {
      if (e.origin !== OLD || e.source !== window.opener || !e.data) return;
      if (e.data.type === 'unwip-move-batch' && Array.isArray(e.data.entries)) {
        got.push(...e.data.entries);
        const u = U(); if (u && u.toast && e.data.i === 0) u.toast('Bringing your books across…', '', 4000);
        e.source.postMessage({ type: 'unwip-move-ack', i: e.data.i }, OLD);
      } else if (e.data.type === 'unwip-move-end') {
        const r = await take(got, e.data.local || {});
        e.source.postMessage({ type: 'unwip-move-done', ...r }, OLD);
        finished(r);
      }
    });
    window.opener.postMessage({ type: 'unwip-move-ready' }, OLD);
    return true;
  }

  // ---------------------------------------------------------------- what people see
  async function dialog() {
    const u = U(); if (!u) return;
    const { entries } = await everything();
    const nb = books(entries).size;
    const home = standalone();
    const dbx = await FS.json('app/dropbox.json', null);
    const body = document.createElement('div'); body.className = 'mv-dlg';
    body.innerHTML = `<p>Unwip now lives at <b>unwip.app</b>. This old address keeps working for now, but new versions arrive there first, and later this address will send you there.</p>
      <p>Your browser keeps each address’s books separate, so bring ${nb ? `your <b>${nb} book${nb === 1 ? '' : 's'}</b>` : 'your settings'} across. Nothing here is deleted.</p>
      ${dbx && dbx.refresh ? '<p class="hint">Your books are also in Dropbox, so they’d come back anyway once you connect Dropbox at unwip.app. Moving them now is quicker and brings your settings too.</p>' : ''}
      ${home ? `<div class="mv-steps"><b>From a Home Screen app, in 3 steps:</b><ol><li>Tap <b>Save a moving file</b> below and save it to Files.</li><li>Open <b>unwip.app</b> in Safari, tap Share › <b>Add to Home Screen</b>, and open it from there.</li><li>In the new one, tap <b>Bring books from the old Unwip</b> on the library screen and pick the file.</li></ol></div>` : ''}
      <p class="hint" id="mv-state"></p>`;
    const go = await u.modal({ title: 'Unwip has moved to unwip.app', body, wide: true,
      buttons: [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Save a moving file', value: 'file', kind: home ? 'primary' : 'ghost' }, ...(home ? [] : [{ label: 'Move now', value: 'now', kind: 'primary' }])] });
    if (go === 'file') { const r = await saveFile(); u.modal({ title: 'Moving file saved', body: `<p>Saved <b>${esc(r.name)}</b>.</p><p>Now open <b>unwip.app</b>, and on the library screen choose <b>Bring books from the old Unwip</b>, then pick this file.</p>`, buttons: [{ label: 'Open unwip.app', value: true, kind: 'primary' }, { label: 'Close', value: false, kind: 'ghost' }] }).then(v => { if (v) window.open(NEW_URL, '_blank'); }); }
    else if (go === 'now') {
      u.toast('Opening unwip.app…', '', 4000);
      const ok = await moveNow((s, x) => {
        if (s === 'blocked') u.toast('Your browser blocked the new tab. Allow pop-ups for this page, or use Save a moving file.', 'warn', 10000);
        else if (s === 'noreply') u.toast('unwip.app didn’t answer. Use Save a moving file instead (Move my books, at the top of the library).', 'warn', 10000);
      });
      if (ok) { try { localStorage.setItem('unwip-moved', String(Date.now())); } catch {} renderBanner(); u.toast('Done: everything is at unwip.app now. Carry on there.', '', 10000); }
    }
  }
  function renderBanner() {
    const lib = document.getElementById('library'); if (!lib) return;
    let b = document.getElementById('mv-banner');
    let moved = null; try { moved = localStorage.getItem('unwip-moved'); } catch {}
    if (isOld) {
      if (!b) { b = document.createElement('div'); b.id = 'mv-banner'; b.className = 'mv-banner'; lib.prepend(b); }
      b.innerHTML = moved
        ? `<span>🏡 <b>You’ve moved to unwip.app.</b> Changes made here won’t show there.</span><a class="btn small primary" href="${NEW_URL}" target="_blank" rel="noopener">Open unwip.app</a><button class="btn small" data-mv="again">Move again</button>`
        : `<span>🏡 <b>Unwip has moved to unwip.app.</b> Bring your books across: it takes a moment and nothing here is deleted.</span><button class="btn small primary" data-mv="go">Move my books…</button>`;
    } else if (isNew) {
      if (!b) { b = document.createElement('div'); b.id = 'mv-banner'; b.className = 'mv-banner'; lib.prepend(b); }
      let hide = false; try { hide = !!localStorage.getItem('unwip-move-hide'); } catch {}
      b.classList.toggle('hidden', hide);
      b.innerHTML = `<span>Used Unwip at the old address (treatonoce.github.io)? Bring your books across.</span><button class="btn small primary" data-mv="file">Bring books from the old Unwip…</button><button class="icon-btn" data-mv="hide" title="Hide this">✕</button>`;
    }
    b.onclick = e => {
      const t = e.target.closest('[data-mv]'); if (!t) return;
      const a = t.dataset.mv;
      if (a === 'go' || a === 'again') dialog();
      else if (a === 'file') readFile();
      else if (a === 'hide') { try { localStorage.setItem('unwip-move-hide', '1'); } catch {} b.classList.add('hidden'); }
    };
  }

  if (isNew && /[?&]move=1\b/.test(location.search)) addEventListener('load', () => setTimeout(() => { if (!receive()) history.replaceState(null, '', location.pathname); }, 300));
  if (isOld || isNew) addEventListener('load', () => setTimeout(renderBanner, 500));
  return { dialog, saveFile, readFile, moveNow, receive, take, everything, renderBanner, isOld, isNew };
})();
