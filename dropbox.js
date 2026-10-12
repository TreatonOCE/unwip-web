// Unwip - Dropbox for the iPhone / iPad (web) version.
// The PC keeps its library in Dropbox/Unwip (the Dropbox app syncs it). Here, with no Dropbox app to lean on,
// Unwip talks to Dropbox itself and keeps the same files in step:
//   Unwip/<project>/project.json, docs/<id>.html, media/…, snapshots/…   (backups stay on each device)
// Rules: nothing is ever thrown away. If a chapter was changed on both devices, the Dropbox version is used
// and this device's version is kept as a snapshot ("changed on two devices"), so it can be compared and restored.
window.UnwipDropbox = (function () {
  'use strict';
  const F = window.folio;
  if (!F || !F.web || !F.__fs) return null;
  const FS = F.__fs, emit = F.__emit, DEVICE = F.__device || 'phone';
  const KEY = window.UNWIP_DROPBOX_KEY || '';
  const API = 'https://api.dropboxapi.com/2', CONTENT = 'https://content.dropboxapi.com/2';
  // the books live straight in Unwip's own Dropbox folder (Dropbox/Apps/Unwip). Older versions used a folder
  // inside it (Apps/Unwip/Unwip); flatten() moves anything there up a level, inside Dropbox, before each sync.
  const REMOTE = '', OLD = '/Unwip', LOCAL = 'Unwip/', STATE = 'app/dropbox.json';
  const CONFLICT = /\(([^()]*?)(?:['’]s)?\s*conflicted copy[^()]*\)/i;

  // which files travel: the project, its chapters, pictures and snapshots (not backups, not deleted projects)
  const tracked = rel => {
    if (CONFLICT.test(rel)) return false;
    const m = /^([^/]+)\/(.+)$/.exec(rel); if (!m) return false;
    if (m[1].startsWith('_') || (st && [...(st.localOnly || []), ...(st.removedHere || [])].includes(m[1]))) return false;
    return /^project\.json$|^docs\/[\w-]+\.html$|^media\/[^/]+$|^snapshots\/[\w-]+\/[^/]+$/.test(m[2]);
  };
  const isText = rel => /\.(html|json)$/.test(rel);

  // ---------------------------------------------------------------- state (kept on this device only)
  let st = null;
  async function load() { if (!st) { st = await FS.json(STATE, {}); st.records = st.records || {}; st.localOnly = st.localOnly || []; st.removedHere = st.removedHere || []; } return st; }
  const persist = () => rawWrite(STATE, JSON.stringify(st));
  const rawWrite = (p, d) => origWrite(p, d), rawRemove = p => origRemove(p);
  const connected = () => !!(st && st.refresh);

  // every save marks the file as changed, and a sync follows a few seconds later
  const origWrite = FS.write, origRemove = FS.remove;
  const dirty = new Set();
  FS.write = async (p, d) => { const r = await origWrite(p, d); if (p.startsWith(LOCAL)) { dirty.add(p.slice(LOCAL.length).toLowerCase()); soon(); } return r; };
  FS.remove = async (p) => { const r = await origRemove(p); if (p.startsWith(LOCAL)) { dirty.add(p.slice(LOCAL.length).toLowerCase()); soon(); } return r; };
  let soonT = null, firstDirtyAt = 0;
  function soon() {
    if (!connected()) return;
    if (!firstDirtyAt) firstDirtyAt = Date.now();
    clearTimeout(soonT);
    const wait = Date.now() - firstDirtyAt > 20000 ? 0 : 4000;   // a pause in typing, or at least every 20 seconds
    soonT = setTimeout(() => { firstDirtyAt = 0; sync({ quiet: true }); }, wait);
  }

  // ---------------------------------------------------------------- talking to Dropbox
  const b64url = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const headerJSON = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  async function token() {
    if (st.access && st.exp > Date.now() + 60000) return st.access;
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: st.refresh, client_id: KEY }) });
    if (!r.ok) { if (r.status === 400 || r.status === 401) { st.broken = true; await persist(); } throw new Error('Dropbox sign-in has expired'); }
    const j = await r.json(); st.access = j.access_token; st.exp = Date.now() + (j.expires_in || 14400) * 1000; st.broken = false; await persist();
    return st.access;
  }
  async function call(url, opts, retry = true) {
    const t = await token();
    const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + t } });
    if (r.status === 401 && retry) { st.exp = 0; return call(url, opts, false); }
    if (r.status === 429 && retry) { await new Promise(res => setTimeout(res, 1500)); return call(url, opts, false); }
    return r;
  }
  const rpc = (path, body) => call(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function listAll(path, recursive) {
    let r = await rpc('/files/list_folder', { path, recursive, include_deleted: false, limit: 2000 });
    if (r.status === 409) return [];                         // the folder isn't there yet
    if (!r.ok) throw new Error('Dropbox list failed (' + r.status + ')');
    let j = await r.json(); const out = [...j.entries];
    while (j.has_more) { r = await rpc('/files/list_folder/continue', { cursor: j.cursor }); if (!r.ok) throw new Error('Dropbox list failed'); j = await r.json(); out.push(...j.entries); }
    return out;
  }
  async function download(pathLower) {
    const r = await call(CONTENT + '/files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': headerJSON({ path: pathLower }) } });
    if (!r.ok) throw new Error('Dropbox download failed (' + r.status + ')');
    return new Uint8Array(await r.arrayBuffer());
  }
  async function upload(rel, bytes, rev) {
    const mode = rev ? { '.tag': 'update', update: rev } : rev === null ? 'overwrite' : 'add';
    const r = await call(CONTENT + '/files/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': headerJSON({ path: `${REMOTE}/${rel}`, mode, autorename: false, mute: true }) }, body: bytes });
    if (r.status === 409) return { conflict: true };
    if (!r.ok) throw new Error('Dropbox upload failed (' + r.status + ')');
    return r.json();
  }
  const remove = rel => rpc('/files/delete_v2', { path: `${REMOTE}/${rel}` });

  // Dropbox's own fingerprint of a file, so unchanged files are never sent twice
  async function contentHash(bytes) {
    const B = 4 * 1024 * 1024, parts = [];
    for (let i = 0; i < bytes.length; i += B) parts.push(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.subarray(i, i + B))));
    const all = new Uint8Array(parts.length * 32); parts.forEach((p, i) => all.set(p, i * 32));
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', all))].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  const asBytes = v => v == null ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v instanceof Uint8Array ? v : new Uint8Array(v);

  // ---------------------------------------------------------------- the sync itself
  let running = null, lastError = '', progress = null;
  function sync(opts = {}) {
    if (!connected() || !KEY) return Promise.resolve(false);
    if (running) { running.again = true; return running.p; }
    running = { again: false };
    running.p = (async () => {
      try { do { running.again = false; await syncOnce(opts); } while (running.again); lastError = ''; return true; }
      catch (e) { lastError = e.message || String(e); console.warn('Dropbox sync:', e); return false; }
      finally { running = null; render(); }
    })();
    render();
    return running.p;
  }
  async function flatten() {
    const top = await listAll(OLD, false);
    if (!top.length || top.some(e => e.name.toLowerCase() === 'project.json')) return;   // nothing to move (or it's a book called Unwip)
    const there = new Set((await listAll('', false)).map(e => e.name.toLowerCase()));
    const move = (from, to, autorename) => rpc('/files/move_v2', { from_path: from, to_path: to, autorename: !!autorename, allow_ownership_transfer: false });
    for (const e of top) {
      if (e.name.toLowerCase() === 'unwip') continue;
      if (!there.has(e.name.toLowerCase())) {
        const r = await move(e.path_lower, '/' + e.name); if (!r.ok && r.status !== 409) throw new Error('Dropbox move failed (' + r.status + ')');
        if (r.ok) continue;
      }
      // already there (e.g. written by an older version after the move): bring over what's missing, keep clashes aside
      for (const f of await listAll(e.path_lower, true)) {
        if (f['.tag'] !== 'file') continue;
        const rel = f.path_display.slice(OLD.length + 1);
        const r = await move(f.path_lower, '/' + rel);
        if (r.status === 409) await move(f.path_lower, `/${rel.split('/')[0]}/backups/sync-conflicts/${Date.now()} ${rel.split('/').pop()}`, true);
      }
    }
    if (!(await listAll(OLD, true)).some(x => x['.tag'] === 'file')) await rpc('/files/delete_v2', { path: OLD });
    else throw new Error('Some files could not be moved out of the old Unwip folder yet');
  }
  async function syncOnce(opts) {
    await load();
    await flatten();
    const changedNow = new Set(dirty); dirty.clear();
    // what's in Dropbox
    const remote = {};
    for (const e of await listAll(REMOTE, true)) {
      if (e['.tag'] !== 'file') continue;
      const rel = e.path_display.slice(REMOTE.length + 1), k = e.path_lower.slice(REMOTE.length + 1);
      if (tracked(rel)) remote[k] = { rel, rev: e.rev, hash: e.content_hash, lower: e.path_lower };
    }
    // a whole project deleted on this device stays in Dropbox (and on the PC); it just stops syncing here
    const hereDirs = new Set((await FS.list('Unwip')).dirs.map(x => x.toLowerCase()));
    for (const k of Object.keys(st.records)) {
      const m = /^([^/]+)\/project\.json$/.exec(k);
      if (m && !hereDirs.has(m[1])) {
        const name = (remote[k] && remote[k].rel.split('/')[0]) || m[1];
        st.removedHere = [...new Set([...(st.removedHere || []), name])];
        for (const r of Object.keys(st.records)) if (r.startsWith(m[1] + '/')) delete st.records[r];
        for (const r of Object.keys(remote)) if (r.startsWith(m[1] + '/')) delete remote[r];
      }
    }
    // what's here
    const local = {};
    for (const p of await FS.keys(LOCAL)) { const rel = p.slice(LOCAL.length); if (tracked(rel)) local[rel.toLowerCase()] = { rel }; }
    const keys = [...new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(st.records)])];
    const todo = keys.length; let done = 0; progress = { done, todo };
    const touched = new Set();
    for (const k of keys) {
      const R = remote[k], L = local[k], rec = st.records[k];
      progress.done = ++done; if (done % 25 === 0) render();
      let lb = null, lh = null;
      if (L) {
        if (rec && rec.hash && !changedNow.has(k) && R && rec.rev === R.rev) continue;   // nothing happened on either side
        lb = asBytes(await FS.read(LOCAL + L.rel)); lh = await contentHash(lb);
      }
      if (R && L) {
        if (lh === R.hash) { st.records[k] = { rev: R.rev, hash: lh }; continue; }
        const remoteChanged = !rec || rec.rev !== R.rev, localChanged = !rec || rec.hash !== lh;
        if (localChanged && !remoteChanged) { await push(k, L.rel, lb, lh, rec.rev); continue; }
        if (localChanged && remoteChanged) await keepMine(L.rel, lb);
        await pull(k, R, touched);
      } else if (R && !L) {
        if (rec && rec.rev === R.rev) { await remove(R.rel); delete st.records[k]; }      // deleted here: delete there too (Dropbox keeps it 30 days)
        else await pull(k, R, touched);
      } else if (L && !R) {
        if (rec && rec.hash === lh) { await rawRemove(LOCAL + L.rel); delete st.records[k]; touched.add(L.rel); }   // deleted on the other device
        else await push(k, L.rel, lb, lh, undefined);
      } else delete st.records[k];
    }
    st.last = Date.now(); progress = null;
    await persist();
    if (touched.size) tell(touched);
  }
  async function push(k, rel, bytes, hash, rev) {
    const res = await upload(rel, bytes, rev);
    if (res.conflict) { st.records[k] = { rev: 'conflict', hash: '' }; running && (running.again = true); dirty.add(k); return; }
    st.records[k] = { rev: res.rev, hash: res.content_hash || hash };
  }
  async function pull(k, R, touched) {
    const b = await download(R.lower);
    const localRel = R.rel;   // Dropbox's spelling of the name
    await rawWrite(LOCAL + localRel, isText(localRel) ? new TextDecoder().decode(b) : b);
    st.records[k] = { rev: R.rev, hash: R.hash };
    touched.add(localRel);
  }
  // both devices changed the same file: Dropbox's version wins, this device's is kept as a snapshot
  async function keepMine(rel, bytes) {
    const m = /^([^/]+)\/docs\/([\w-]+)\.html$/.exec(rel);
    const ts = Date.now();
    if (m) {
      const dir = `${LOCAL}${m[1]}/snapshots/${m[2]}`;
      await FS.write(`${dir}/${ts}.html`, new TextDecoder().decode(bytes));
      const meta = await FS.json(`${dir}/snapshots.json`, []);
      meta.push({ ts, label: `My ${DEVICE} version (changed on two devices)`, auto: false });
      await FS.write(`${dir}/snapshots.json`, JSON.stringify(meta));
      conflicts.push({ slug: m[1], id: m[2] });
    } else {
      await rawWrite(`${LOCAL}${rel.replace(/\/[^/]+$/, '')}/backups/sync-conflicts/${ts} ${rel.split('/').pop()}`, isText(rel) ? new TextDecoder().decode(bytes) : bytes);
    }
  }
  const conflicts = [];
  // let the open project know what arrived (reloads the chapter or binder, same as on the PC)
  function tell(touched) {
    for (const rel of touched) {
      const m = /^([^/]+)\/(project\.json|docs\/([\w-]+)\.html)$/.exec(rel); if (!m) continue;
      emit('external', { slug: m[1], file: m[2], id: m[3] || null });
    }
    try { const U = window.__unwip; if (U && !U.S.slug && !document.getElementById('library').classList.contains('hidden')) U.showLibrary(); } catch {}
    if (conflicts.length) {
      const n = conflicts.length; conflicts.length = 0;
      try { window.__unwip.toast(`${n === 1 ? 'A chapter was' : n + ' chapters were'} changed on two devices. Dropbox’s version is showing; yours is saved in Snapshots.`, 'warn', 12000); } catch {}
    }
  }

  // ---------------------------------------------------------------- two devices on one project
  let presT = 0, folderCache = { slug: null, at: 0, entries: [] };
  async function folder(slug) {
    if (folderCache.slug === slug && Date.now() - folderCache.at < 25000) return folderCache.entries;
    const entries = await listAll(`${REMOTE}/${slug}`, false).catch(() => []);
    folderCache = { slug, at: Date.now(), entries }; return entries;
  }
  const mine = `.open-on-${DEVICE.replace(/[^\w-]/g, '')}.json`;
  const origPresence = F.presence, origOthers = F.othersOpen, origReq = F.requestTakeover, origCheck = F.checkTakeover;
  F.presence = async (slug, on) => {
    if (!connected()) return origPresence(slug, on);
    try {
      if (on) { if (Date.now() - presT < 60000) return true; presT = Date.now(); await upload(`${slug}/${mine}`, asBytes(JSON.stringify({ device: DEVICE, at: Date.now() })), null); }
      else { presT = 0; await remove(`${slug}/${mine}`); }
    } catch {}
    return true;
  };
  F.othersOpen = async slug => {
    if (!connected()) return origOthers(slug);
    folderCache.at = 0;
    return (await folder(slug)).filter(e => /^\.open-on-.+\.json$/.test(e.name) && e.name !== mine && Date.now() - Date.parse(e.server_modified) < 120000)
      .map(e => ({ device: e.name.replace(/^\.open-on-|\.json$/g, ''), at: Date.parse(e.server_modified) }));
  };
  F.requestTakeover = async (slug, on) => {
    if (!connected()) return origReq(slug, on);
    try { if (on) await upload(`${slug}/.takeover.json`, asBytes(JSON.stringify({ by: DEVICE, at: Date.now() })), null); else await remove(`${slug}/.takeover.json`); } catch {}
    return true;
  };
  F.checkTakeover = async slug => {
    if (!connected()) return origCheck(slug);
    const e = (await folder(slug)).find(x => x.name === '.takeover.json');
    if (!e || Date.now() - Date.parse(e.server_modified) > 180000) return null;
    try { const t = JSON.parse(new TextDecoder().decode(await download(e.path_lower))); return t.by !== DEVICE ? t : null; } catch { return null; }
  };

  // ---------------------------------------------------------------- connecting
  const standalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
  const redirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');
  async function pkce() {
    const v = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const c = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
    return { v, c };
  }
  // on a Home Screen app, Dropbox can't send you back into the app, so it shows a code to copy instead
  async function connect() {
    const U = window.__unwip;
    if (!KEY) { setupNeeded(); return; }
    const { v, c } = await pkce(); const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
    const q = { client_id: KEY, response_type: 'code', code_challenge: c, code_challenge_method: 'S256', token_access_type: 'offline' };
    if (standalone()) {
      // a Home Screen app may only open another page from a direct tap, so this is a real link to tap
      const url = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams(q);
      const body = document.createElement('div');
      body.innerHTML = `<ol class="dbx-steps"><li>Tap <b>Open Dropbox</b>. Sign in and tap <b>Allow</b>.</li><li>Dropbox shows a code. Copy it.</li><li>Come back here and paste it below.</li></ol>
        <p><a class="btn primary dbx-open" href="${url}" target="_blank" rel="noopener">Open Dropbox</a></p>
        <div class="field"><input type="text" id="dbx-code" placeholder="Paste the code from Dropbox" autocomplete="off" autocapitalize="off" spellcheck="false"></div>`;
      const ok = await U.modal({ title: 'Connect Dropbox', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Connect', value: true, kind: 'primary' }] });
      const code = ok && body.querySelector('#dbx-code').value.trim();
      if (code) await finish(code, v, null);
    } else {
      sessionStorage.setItem('unwip-dbx', JSON.stringify({ v, state }));
      location.href = 'https://www.dropbox.com/oauth2/authorize?' + new URLSearchParams({ ...q, redirect_uri: redirectUri(), state });
    }
  }
  async function finish(code, verifier, redirect) {
    const U = window.__unwip;
    const body = { code, grant_type: 'authorization_code', client_id: KEY, code_verifier: verifier };
    if (redirect) body.redirect_uri = redirect;
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    if (!r.ok) { U.toast('Dropbox didn’t accept that. Try connecting again (the code only works once, for a few minutes).', 'warn', 9000); return; }
    const j = await r.json();
    await load();
    Object.assign(st, { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in || 14400) * 1000, account: j.account_id, broken: false, records: {}, since: Date.now() });
    await persist();
    try { const a = await (await rpc('/users/get_current_account', null)).json(); st.email = a.email; st.name = a.name && a.name.display_name; await persist(); } catch {}
    await firstSync();
  }
  // the first time: projects only on this device can go up to Dropbox, or stay here
  async function firstSync() {
    const U = window.__unwip;
    const here = (await FS.list('Unwip')).dirs.filter(d => !d.startsWith('_'));
    const there = new Set((await listAll(REMOTE, false).catch(() => [])).filter(e => e['.tag'] === 'folder').map(e => e.name.toLowerCase()));
    const onlyHere = here.filter(d => !there.has(d.toLowerCase()));
    if (onlyHere.length) {
      const body = document.createElement('div');
      body.innerHTML = `<p>${onlyHere.length === 1 ? 'This project is' : 'These projects are'} only on this ${esc(DEVICE)}:</p><ul class="dbx-list">${onlyHere.map(d => `<li><label class="check"><input type="checkbox" value="${esc(d)}" checked> ${esc(d)}</label></li>`).join('')}</ul>
        <p class="sy-note">Ticked ones are added to Dropbox, so they’ll show up on your PC too. Unticked ones stay on this ${esc(DEVICE)} only.</p>`;
      await U.modal({ title: 'Add these to Dropbox?', body, buttons: [{ label: 'Continue', value: true, kind: 'primary' }] });
      st.localOnly = [...body.querySelectorAll('input:not(:checked)')].map(i => i.value);
      await persist();
    }
    const bar = document.createElement('div');
    bar.innerHTML = `<div class="dbx-first"><span class="sy-spin"></span><div><b>Bringing your books from Dropbox…</b><span id="dbx-prog">Starting</span></div></div>`;
    const p = U.modal({ title: 'Connected to Dropbox', body: bar, buttons: [{ label: 'Carry on in the background', value: true, kind: 'ghost' }] });
    const tick = setInterval(() => { const el = bar.querySelector('#dbx-prog'); if (el && progress) el.textContent = `${progress.done} of ${progress.todo} files checked`; }, 300);
    const ok = await sync();
    clearInterval(tick);
    document.querySelectorAll('.modal-back').forEach(m => { if (m.contains(bar)) { const b = m.querySelector('.btn'); if (b) b.click(); } });
    await p;
    U.toast(ok ? 'Dropbox is connected. Your books are in step with your PC.' : 'Connected, but the first sync hit a problem: ' + lastError, ok ? '' : 'warn', 9000);
    try { if (!U.S.slug) U.showLibrary(); } catch {}
  }
  async function disconnect() {
    const U = window.__unwip;
    const ok = await U.modal({ title: 'Disconnect Dropbox?', body: `<p>Your books stay on this ${esc(DEVICE)} and in Dropbox. They just stop syncing until you connect again.</p>`, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Disconnect', value: true, kind: 'primary' }] });
    if (!ok) return;
    try { await rpc('/auth/token/revoke', null); } catch {}
    st = { records: {}, localOnly: [], removedHere: [] }; await persist(); render();
  }
  function setupNeeded() {
    window.__unwip.modal({ title: 'Dropbox needs one setup step', body: `<p>Before this version can reach your Dropbox, Unwip has to be registered with Dropbox (a free, two-minute step on dropbox.com). Once that’s done, this button will connect straight away.</p>`, buttons: [{ label: 'OK', value: true, kind: 'primary' }] });
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------------------------------------------------------------- what you see: a status pill on the main screen and a Settings card
  const ago = t => { if (!t) return 'not yet'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString(); };
  function statusText() {
    if (!st || !connected()) return { cls: 'off', text: 'Connect Dropbox' };
    if (st.broken) return { cls: 'warn', text: 'Dropbox: sign in again' };
    if (running) return { cls: 'busy', text: progress ? `Syncing… ${progress.done}/${progress.todo}` : 'Syncing…' };
    if (lastError) return { cls: 'warn', text: navigator.onLine === false ? 'Offline · will sync later' : 'Dropbox: couldn’t sync' };
    return { cls: 'ok', text: `Synced ${ago(st.last)}` };
  }
  const CLOUD = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.2 4.4 4.4 0 0 0 7 18z"/></svg>';
  function render() {
    const head = document.querySelector('.lib-head-right'); if (!head) return;
    let pill = document.getElementById('dbx-pill');
    if (!pill) { pill = document.createElement('button'); pill.id = 'dbx-pill'; pill.className = 'dbx-pill'; head.insertBefore(pill, head.firstChild); pill.onclick = pillClick; }
    const s = statusText();
    pill.className = 'dbx-pill ' + s.cls; pill.innerHTML = CLOUD + `<span>${esc(s.text)}</span>`;
    pill.title = connected() ? `Dropbox${st.email ? ' · ' + st.email : ''}. Tap to sync now.` : 'Keep your books in step with your PC through Dropbox';
    const card = document.getElementById('dbx-card'); if (card) fillCard(card);
  }
  function pillClick() { if (!connected() || st.broken) connect(); else sync(); }
  function fillCard(card) {
    const s = statusText();
    card.innerHTML = connected()
      ? `<div class="sy-cur"><span class="sy-ic">📦</span><div><b>Dropbox</b> <em class="sy-badge">${st.broken ? 'sign in again' : 'syncing'}</em><span class="sy-path">${esc(st.email || 'Connected')} · ${esc(s.text)}</span></div></div>
         ${lastError ? `<p class="sy-note">Last problem: ${esc(lastError)}</p>` : ''}
         ${st.localOnly.length ? `<p class="sy-note">Kept on this ${esc(DEVICE)} only: ${st.localOnly.map(esc).join(', ')}</p>` : ''}
         ${st.removedHere.length ? `<p class="sy-note">Deleted on this ${esc(DEVICE)} but still in Dropbox: ${st.removedHere.map(esc).join(', ')}. <button class="link-btn" type="button" data-dbx="restore">Bring back</button></p>` : ''}
         <div class="sy-moves"><button class="btn primary" type="button" data-dbx="${st.broken ? 'connect' : 'sync'}">${st.broken ? 'Sign in to Dropbox again' : 'Sync now'}</button><button class="btn ghost" type="button" data-dbx="off">Disconnect</button></div>
         <p class="sy-note">Chapters, the binder, pictures and snapshots sync with the Unwip folder in your Dropbox, the same one your PC uses (on the PC: Settings › Where your projects live › Sync with Dropbox). If a chapter is changed on both at once, nothing is lost: the other version goes into Snapshots.</p>`
      : `<div class="sy-cur"><span class="sy-ic">📱</span><div><b>On this ${esc(DEVICE)} only</b><span class="sy-path">Saved inside this app. Connect Dropbox to work on the same books as your PC.</span></div></div>
         <div class="sy-moves"><button class="btn primary" type="button" data-dbx="connect">Connect Dropbox</button></div>`;
    const restore = async () => { st.removedHere = []; await persist(); sync(); };
    card.querySelectorAll('[data-dbx]').forEach(b => b.onclick = () => ({ connect, sync, off: disconnect, restore })[b.dataset.dbx]());
  }

  // ---------------------------------------------------------------- start up
  (async () => {
    await load();
    // back from Dropbox's sign-in page
    const q = new URLSearchParams(location.search);
    if (q.get('code')) {
      const saved = JSON.parse(sessionStorage.getItem('unwip-dbx') || 'null'); sessionStorage.removeItem('unwip-dbx');
      history.replaceState(null, '', location.pathname);
      if (saved && q.get('state') === saved.state) setTimeout(() => finish(q.get('code'), saved.v, redirectUri()), 800);
    } else if (q.get('error')) history.replaceState(null, '', location.pathname);
    render();
    if (connected()) setTimeout(() => sync({ quiet: true }), 1500);
    setInterval(() => { if (connected() && !document.hidden) sync({ quiet: true }); else render(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && connected()) sync({ quiet: true }); });
    window.addEventListener('online', () => { if (connected()) sync({ quiet: true }); });
  })();

  return { connect, disconnect, sync, render, fillCard, connected: () => connected(), get state() { return st; }, get lastError() { return lastError; }, hasKey: !!KEY };
})();
