// Unwip - the web version (iPad, iPhone, any browser). Only loaded by the web build, never by the PC app.
// The PC app talks to Windows through main.js; here the same calls are answered inside the browser.
// Files are kept in the browser's own storage (IndexedDB) using exactly the same folder layout as the PC
// (Unwip/<project>/project.json, docs/<id>.html, snapshots/, media/…), so a Dropbox connection can later
// read and write the very same files.
(function () {
  'use strict';
  if (window.folio) return;                       // the PC app already has the real thing

  // ------------------------------------------------------------------ storage: a tiny file system in IndexedDB
  const DB_NAME = 'unwip', STORE = 'files';
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
      let out; const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage is full or blocked'));
    });
  }
  const FS = {
    read: p => tx('readonly', s => s.get(p)).then(v => v === undefined ? null : v),
    async text(p) { const v = await FS.read(p); return v == null ? null : typeof v === 'string' ? v : new TextDecoder().decode(v); },
    async json(p, fallback) { try { const t = await FS.text(p); return t == null ? fallback : JSON.parse(t); } catch { return fallback; } },
    write: (p, data) => tx('readwrite', s => s.put(data, p)),
    remove: p => tx('readwrite', s => s.delete(p)),
    keys: prefix => tx('readonly', s => s.getAllKeys(IDBKeyRange.bound(prefix, prefix + '￿'))),
    async exists(p) { return (await tx('readonly', s => s.count(p))) > 0; },
    // names directly inside a folder: { files: [...], dirs: [...] }
    async list(dir) {
      const pre = dir.replace(/\/?$/, '/'), files = new Set(), dirs = new Set();
      for (const k of await FS.keys(pre)) { const rest = k.slice(pre.length); const i = rest.indexOf('/'); if (i < 0) files.add(rest); else dirs.add(rest.slice(0, i)); }
      return { files: [...files], dirs: [...dirs] };
    },
    async removeTree(dir) { const ks = await FS.keys(dir.replace(/\/?$/, '/')); await tx('readwrite', s => { for (const k of ks) s.delete(k); }); },
    async copyTree(from, to) {
      const pre = from.replace(/\/?$/, '/'), ks = await FS.keys(pre);
      const vals = await tx('readonly', s => s.getAll(IDBKeyRange.bound(pre, pre + '￿')));
      await tx('readwrite', s => { ks.forEach((k, i) => s.put(vals[i], to.replace(/\/?$/, '/') + k.slice(pre.length))); });
    }
  };
  // ask the browser to keep Unwip's storage (so Safari doesn't clear it to save space)
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}

  const LIB = 'Unwip';
  const slugify = name => (name || 'Untitled').replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().slice(0, 60) || 'Untitled';
  const safeId = id => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  const pdir = slug => `${LIB}/${String(slug).replace(/[/\\]/g, '')}`;
  const deviceName = (() => { const u = navigator.userAgent; return /iPad|Macintosh.*Mobile|Macintosh.*Touch/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac (browser)' : /Windows/.test(u) ? 'PC (browser)' : 'This browser'; })();

  // ------------------------------------------------------------------ files in and out: pickers and downloads
  function pickFiles({ accept = '', multiple = false, directory = false } = {}) {
    return new Promise(resolve => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = accept; inp.multiple = multiple;
      if (directory) { inp.webkitdirectory = true; inp.multiple = true; }
      inp.style.cssText = 'position:fixed;left:-1000px;top:0;opacity:0';
      document.body.appendChild(inp);
      let done = false;
      const finish = files => { if (done) return; done = true; inp.remove(); resolve(files); };
      inp.onchange = () => finish([...inp.files]);
      inp.addEventListener('cancel', () => finish([]));
      // older browsers have no "cancel": give up once the page has focus again with nothing picked
      window.addEventListener('focus', function f() { window.removeEventListener('focus', f); setTimeout(() => { if (!inp.files || !inp.files.length) finish([]); }, 1500); });
      inp.click();
    });
  }
  const bytesOf = async f => new Uint8Array(await f.arrayBuffer());
  const extOf = name => (name.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();
  const baseName = name => name.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const say = (msg, ms) => { try { window.__unwip.toast(msg, 'warn', ms || 7000); } catch {} };
  function download(data, filename, type) {
    if (window.UNWIP_ARTIFACT) { say('Saving files isn’t possible in this test version yet. To get your writing out, use Copy for Docs and paste it into Google Docs, Word or Notes.', 9000); return null; }
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
    return filename;
  }

  // ------------------------------------------------------------------ zip (backup files), compatible with the PC's .unwip files
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const enc = s => typeof s === 'string' ? new TextEncoder().encode(s) : s instanceof Uint8Array ? s : new Uint8Array(s);
  function zipFiles(files) {          // stored (no compression): simple and readable by the PC app
    const parts = [], central = []; let off = 0;
    for (const f of files) {
      const name = enc(f.name), data = enc(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name); off += 30 + name.length + data.length;
    }
    const cenLen = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenLen, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  async function inflateRaw(data) {
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([data]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf) {
    const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This isn’t an Unwip backup.');
    const count = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
    const files = [];
    for (let n = 0; n < count; n++) {
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nlen = v.getUint16(p + 28, true), xlen = v.getUint16(p + 30, true), clen = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      if (name.endsWith('/')) continue;
      const lnlen = v.getUint16(off + 26, true), lxlen = v.getUint16(off + 28, true);
      const raw = buf.subarray(off + 30 + lnlen + lxlen, off + 30 + lnlen + lxlen + csize);
      files.push({ name, data: method === 0 ? raw.slice() : await inflateRaw(raw) });
    }
    return files;
  }

  // ------------------------------------------------------------------ projects
  async function uniqueSlug(title) { const base = slugify(title); let slug = base, n = 2; while (await FS.exists(`${pdir(slug)}/project.json`)) slug = `${base} (${n++})`; return slug; }
  async function listProjects() {
    const out = [];
    for (const d of (await FS.list(LIB)).dirs) {
      if (d.startsWith('_')) continue;
      const p = await FS.json(`${LIB}/${d}/project.json`, null); if (!p) continue;
      const recent = []; (function walk(l) { for (const n of l || []) { if (n.type === 'doc' && n.mod && !n.map) recent.push({ id: n.id, title: n.title, mod: n.mod, dev: n.dev || '' }); if (n.children) walk(n.children); } })(p.binder);
      recent.sort((a, b) => b.mod - a.mod);
      out.push({ slug: d, title: p.title || d, words: p.totalWords || 0, modified: p.modified || 0, dev: p.lastDevice || '', recent: recent.slice(0, 3), days: (p.statsVersion === 2 && p.stats && p.stats.days) || {}, goals: p.goals || {}, hours: (p.stats && p.stats.hours) || {}, mins: (p.stats && p.stats.mins) || {}, series: p.series || '', sprints: (p.stats && p.stats.sprints) || [] });
    }
    return out.sort((a, b) => b.modified - a.modified);
  }
  async function projectArchive(slug) {
    const pre = pdir(slug) + '/', files = [];
    for (const k of await FS.keys(pre)) {
      const rel = k.slice(pre.length);
      if (rel.startsWith('backups/') || /(^|\/)\.open-on-|\.tmp$/.test(rel)) continue;
      const v = await FS.read(k); files.push({ name: rel, data: v });
    }
    return zipFiles(files);
  }
  async function restoreArchive(files, suffix) {
    const pj = files.find(f => f.name === 'project.json');
    if (!pj) throw new Error('This isn’t an Unwip backup.');
    const project = JSON.parse(new TextDecoder().decode(enc(pj.data)));
    project.title = (project.title || 'Restored project') + (suffix || '');
    const slug = await uniqueSlug(project.title);
    for (const f of files) {
      if (f.name.includes('..') || f.name.startsWith('/')) continue;
      const isText = /\.(json|html|txt)$/i.test(f.name);
      const data = f.name === 'project.json' ? JSON.stringify({ ...project, modified: Date.now() }, null, 2) : isText ? new TextDecoder().decode(enc(f.data)) : enc(f.data);
      await FS.write(`${pdir(slug)}/${f.name}`, data);
    }
    return slug;
  }

  // ------------------------------------------------------------------ settings (kept separately from projects, like the PC's settings.json)
  const SETTINGS = 'app/settings.json';
  const loadSettings = () => FS.json(SETTINGS, {});
  async function setSettings(patch) { const st = { ...(await loadSettings()), ...(patch || {}) }; await FS.write(SETTINGS, JSON.stringify(st)); return st; }

  // ------------------------------------------------------------------ printing (PDF): the browser's own print, which can save a PDF
  async function printHTML(html, pageSize, opts = {}) {
    if (window.UNWIP_ARTIFACT) { say('Printing and PDFs need the PC app for now (this test version can’t open the print screen).'); return; }
    let doc = html;
    if (!opts.raw) {
      const m = opts.margins || { top: 0.9, bottom: 0.9, left: 0.9, right: 0.9 };
      const size = typeof pageSize === 'object' && pageSize ? `${pageSize.width / 25400}in ${pageSize.height / 25400}in` : (pageSize || 'A4');
      doc = doc.replace(/<\/head>/i, `<style>@page { size: ${size}; margin: ${m.top}in ${m.right}in ${m.bottom}in ${m.left}in; }</style></head>`);
    }
    const fr = document.createElement('iframe');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    document.body.appendChild(fr);
    fr.srcdoc = doc;
    await new Promise(r => fr.onload = r);
    try { await fr.contentDocument.fonts.ready; } catch {}
    await new Promise(r => setTimeout(r, 250));
    fr.contentWindow.focus(); fr.contentWindow.print();
    setTimeout(() => fr.remove(), 60000);
  }

  // ------------------------------------------------------------------ find in page
  // Safari has no window.find, so Unwip finds words itself and highlights them (all matches soft, the current one strong)
  let findCb = null, findState = { text: '', idx: -1 };
  function findRanges(text) {
    const ed = document.getElementById('editor'); if (!ed || !text) return [];
    const needle = text.toLowerCase(), out = [];
    const tw = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const hay = n.data.toLowerCase(); let i = hay.indexOf(needle);
      while (i >= 0) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + text.length); out.push(r); i = hay.indexOf(needle, i + needle.length); }
    }
    return out;
  }
  function clearFind() { try { CSS.highlights.delete('unwip-find'); CSS.highlights.delete('unwip-find-cur'); } catch {} findState = { text: '', idx: -1 }; }
  function find(text, o = {}) {
    if (!text) { clearFind(); return; }
    const rs = findRanges(text);
    if (!rs.length) { clearFind(); if (findCb) findCb({ matches: 0, activeMatchOrdinal: 0, finalUpdate: true }); return; }
    let idx = findState.text === text && o.findNext ? findState.idx + (o.forward === false ? -1 : 1) : 0;
    idx = (idx + rs.length) % rs.length;
    findState = { text, idx };
    try {
      if (window.Highlight && CSS.highlights) { CSS.highlights.set('unwip-find', new Highlight(...rs)); CSS.highlights.set('unwip-find-cur', new Highlight(rs[idx])); }
    } catch {}
    const el = rs[idx].startContainer.parentElement;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    if (findCb) findCb({ matches: rs.length, activeMatchOrdinal: idx + 1, finalUpdate: true });
  }

  const noop = () => {};
  const LISTENERS = {};
  const on = name => cb => { (LISTENERS[name] = LISTENERS[name] || []).push(cb); };

  // ---- the optional natural voice (Kokoro): downloaded on request into this browser's storage, then run
  // in a background worker. Files are checked against their fingerprints (kokoro-files.js) before they're kept.
  const VC = 'unwip-kokoro', VKEY = 'https://unwip.kokoro/';
  const voiceProg = [];
  let vWorker = null, vReady = null, vSeq = 0; const vWait = new Map();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function voiceHave() {
    if (!window.caches || !window.UNWIP_KOKORO) return false;
    try { const c = await caches.open(VC); for (const [f] of UNWIP_KOKORO.FILES) if (!(await c.match(VKEY + f))) return false; return true; } catch { return false; }
  }
  function voiceWorker() {
    if (vReady) return vReady;
    vWorker = new Worker('kokoro-worker.js');
    vReady = new Promise((res, rej) => vWait.set('ready', { res, rej }));
    vWorker.onmessage = e => { const m = e.data || {}; const w = vWait.get(m.id); vWait.delete(m.id); if (w) (m.error ? w.rej(new Error(m.error)) : w.res(m)); };
    vWorker.onerror = e => { const err = new Error(e.message || 'The voice stopped.'); for (const [, w] of vWait) w.rej(err); vWait.clear(); vWorker = null; vReady = null; };
    return vReady;
  }
  const voiceApi = {
    async voiceStatus() { return { installed: await voiceHave(), bytes: window.UNWIP_KOKORO ? UNWIP_KOKORO.TOTAL : 0, running: !!vWorker, web: true }; },
    onVoiceProgress: cb => voiceProg.push(cb),
    async voiceInstall() {
      const c = await caches.open(VC), K = UNWIP_KOKORO, mirror = window.UNWIP_KOKORO_MIRROR;
      try { navigator.storage && navigator.storage.persist && await navigator.storage.persist(); } catch {}
      let done = 0;
      for (const [file, url, sha, size] of K.FILES) {
        const have = await c.match(VKEY + file); if (have) { done += size; voiceProg.forEach(cb => cb({ done, total: K.TOTAL, file })); continue; }
        const res = await fetch(mirror ? mirror + file : url); if (!res.ok) throw new Error(`Couldn’t download ${file} (${res.status}).`);
        const reader = res.body.getReader(), parts = []; let got = 0, last = 0;
        for (;;) { const { done: end, value } = await reader.read(); if (end) break; parts.push(value); got += value.length; if (Date.now() - last > 200) { last = Date.now(); voiceProg.forEach(cb => cb({ done: done + got, total: K.TOTAL, file })); } }
        const blob = new Blob(parts), buf = await blob.arrayBuffer();
        if (got !== size || hex(await crypto.subtle.digest('SHA-256', buf)) !== sha) throw new Error(`${file} didn’t match the expected file, so it wasn’t kept. Try again later.`);
        await c.put(VKEY + file, new Response(blob, { headers: { 'Content-Type': /\.(m?js)$/.test(file) ? 'text/javascript' : /\.wasm$/.test(file) ? 'application/wasm' : 'application/octet-stream', 'Content-Length': String(size) } }));
        done += size; voiceProg.forEach(cb => cb({ done, total: K.TOTAL, file }));
      }
      return { installed: await voiceHave() };
    },
    async voiceRemove() { if (vWorker) vWorker.terminate(); vWorker = null; vReady = null; await caches.delete(VC).catch(() => {}); await caches.delete('kokoro-voices').catch(() => {}); return true; },
    async voiceWarm() { return (await voiceHave()) ? voiceWorker() : null; },
    async voiceSpeak(text, voice, speed) {
      await voiceWorker(); const id = ++vSeq;
      return new Promise((res, rej) => { vWait.set(id, { res, rej }); vWorker.postMessage({ id, text, voice, speed }); });
    }
  };

  window.folio = {
    web: true,
    ...voiceApi,
    listProjects,
    async createProject(title, template) {
      const slug = await uniqueSlug(title);
      await FS.write(`${pdir(slug)}/project.json`, JSON.stringify({ ...template, title, created: Date.now(), modified: Date.now() }, null, 2));
      return slug;
    },
    async openProject(slug) { const p = await FS.json(`${pdir(slug)}/project.json`, null); if (!p) throw new Error('Could not open project'); return p; },
    async saveProjectMeta(slug, project) { project.modified = Date.now(); await FS.write(`${pdir(slug)}/project.json`, JSON.stringify(project, null, 2)); return true; },
    // deleting keeps a copy in a hidden “_Deleted” folder (the browser has no Recycle Bin)
    async deleteProject(slug) { await FS.copyTree(pdir(slug), `${LIB}/_Deleted/${Date.now()} ${slug}`); await FS.removeTree(pdir(slug)); return true; },
    revealProject: async () => '',
    loadDoc: async (slug, id) => (await FS.text(`${pdir(slug)}/docs/${safeId(id)}.html`)) || '',
    saveDoc: async (slug, id, html) => { await FS.write(`${pdir(slug)}/docs/${safeId(id)}.html`, html); return true; },
    // automatic backups inside the browser (the last 20)
    async backup(slug) {
      const dir = pdir(slug), b = `${dir}/backups`;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      await FS.write(`${b}/${stamp}/project.json`, (await FS.text(`${dir}/project.json`)) || '{}');
      for (const f of (await FS.list(`${dir}/docs`)).files) if (f.endsWith('.html')) await FS.write(`${b}/${stamp}/docs/${f}`, await FS.text(`${dir}/docs/${f}`));
      const all = (await FS.list(b)).dirs.filter(f => /^\d{4}-/.test(f)).sort();
      while (all.length > 20) await FS.removeTree(`${b}/${all.shift()}`);
      return stamp;
    },
    async clipboardWrite(html, text) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]); }
      catch { try { await navigator.clipboard.writeText(text); } catch {} }
      return true;
    },
    async clipboardRead() { try { return { html: '', rtf: '', text: await navigator.clipboard.readText() }; } catch { return { html: '', rtf: '', text: '' }; } },
    paste: async () => true,
    async importFonts() {
      for (const f of await pickFiles({ accept: '.ttf,.otf,.woff,.woff2', multiple: true })) await FS.write(`app/fonts/${f.name}`, await bytesOf(f));
      return window.folio.importedFonts();
    },
    async importedFonts() {
      const out = [];
      for (const f of (await FS.list('app/fonts')).files) { const b = await FS.read(`app/fonts/${f}`); let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); out.push({ file: f, data: btoa(s) }); }
      return out;
    },
    async exportPDF(html, name, pageSize, opts) { await printHTML(html, pageSize, opts || {}); return null; },
    async pdfPages() { throw new Error('Exact page counts need the PC app.'); },
    async exportHTML(html, name) { return download(html, slugify(name) + '.html', 'text/html'); },
    async exportBinary(bytes, name, ext) { return download(new Uint8Array(bytes), slugify(name) + '.' + ext); },
    async fullscreen(on) { try { if (on) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch {} return !!document.fullscreenElement; },
    async setZoom(f) { const z = Math.min(1.5, Math.max(0.75, +f || 1)); document.documentElement.style.zoom = z; return z; },
    // working on two devices: only matters once Dropbox is connected
    requestTakeover: async () => true, checkTakeover: async () => null,
    seenLoad: async (slug, id) => { const h = await FS.text(`app/seen/${safeId(slug)}/${safeId(id)}.html`); return h == null ? null : { html: h, at: Date.now() }; },
    seenSave: async (slug, id, html) => { await FS.write(`app/seen/${safeId(slug)}/${safeId(id)}.html`, html); return true; },
    async imagePick() { const [f] = await pickFiles({ accept: 'image/*' }); return f ? { name: f.name, type: f.type || 'image/png', bytes: await bytesOf(f) } : null; },
    libraryInfo: async () => ({ web: true, path: `In this browser on your ${deviceName}`, kind: 'browser', places: [{ kind: 'browser', label: `On this ${deviceName}`, path: 'Saved in the browser', exists: true }], parentMissing: false, device: deviceName }),
    libraryPick: async () => null, libraryMove: async () => { throw new Error('Not available in the web version yet.'); },
    presence: async () => true, othersOpen: async () => [], conflicts: async () => [],
    readConflict: async () => '', archiveConflict: async () => true, watchProject: async () => true,
    onExternalChange: on('external'),
    // for dropbox.js (web only): the file store, and a way to tell the app something changed
    __fs: FS, __emit: (name, data) => (LISTENERS[name] || []).forEach(cb => { try { cb(data); } catch (e) { console.warn(e); } }), __device: deviceName,
    async backupExport(slug) { const p = await FS.json(`${pdir(slug)}/project.json`, {}); return download(await projectArchive(slug), `${slugify(p.title || slug)} ${new Date().toLocaleDateString('en-CA')}.unwip`, 'application/zip'); },
    async backupImportFile() { const [f] = await pickFiles({ accept: '.unwip,.zip,application/zip' }); if (!f) return null; return restoreArchive(await unzip(await bytesOf(f)), ' (restored)'); },
    async backupList(slug) {
      const b = `${pdir(slug)}/backups`;
      const out = [];
      for (const stamp of (await FS.list(b)).dirs.filter(f => /^\d{4}-/.test(f)).sort().reverse()) {
        const docs = (await FS.list(`${b}/${stamp}/docs`)).files; const pj = await FS.json(`${b}/${stamp}/project.json`, {});
        out.push({ stamp, docs: docs.length, size: 0, words: pj.totalWords || 0 });
      }
      return out;
    },
    async backupRestore(slug, stamp) {
      const b = `${pdir(slug)}/backups/${stamp}`;
      const files = [{ name: 'project.json', data: (await FS.text(`${b}/project.json`)) || '{}' }];
      for (const f of (await FS.list(`${b}/docs`)).files) files.push({ name: 'docs/' + f, data: await FS.text(`${b}/docs/${f}`) });
      for (const f of (await FS.list(`${pdir(slug)}/media`)).files) files.push({ name: 'media/' + f, data: await FS.read(`${pdir(slug)}/media/${f}`) });
      return restoreArchive(files, ` (backup ${stamp.slice(0, 10)})`);
    },
    backupExtraPick: async () => null, backupExtraNow: async () => null,
    // the web version updates itself whenever it's opened online
    updateCheck: async () => ({ status: 'none', current: window.UNWIP_VERSION || 'web' }),
    updateInstall: async () => ({ status: 'none' }),
    updateState: async () => ({ status: 'idle', current: window.UNWIP_VERSION || 'web', auto: false }),
    relaunch: async () => location.reload(),
    playLoad: async () => FS.json(`${LIB}/_Play/play.json`, { pieces: [], days: {} }),
    playSave: async index => { await FS.write(`${LIB}/_Play/play.json`, JSON.stringify(index, null, 2)); return true; },
    playLoadPiece: async id => (await FS.text(`${LIB}/_Play/pieces/${safeId(id)}.html`)) || '',
    playSavePiece: async (id, html) => { await FS.write(`${LIB}/_Play/pieces/${safeId(id)}.html`, html); return true; },
    playDeletePiece: async id => { await FS.remove(`${LIB}/_Play/pieces/${safeId(id)}.html`); return true; },
    onNoteCmd: on('note'), onPastePlain: on('pastePlain'), onSplit: on('split'),
    find: async (t, o) => find(t, o), stopFind: async () => { clearFind(); },
    onFindResult: cb => { findCb = cb; },
    // spelling: the browser's own spellcheck does the work
    addSpellWords: async () => true,
    spellSettings: async () => { const st = await loadSettings(); const l = navigator.language || 'en-AU'; return { available: [l], current: [l], enabled: st.spellcheck !== false }; },
    setSpell: async (langs, enabled) => { await setSettings({ spellcheck: enabled !== false }); return [navigator.language || 'en-AU']; },
    spellWords: async () => [], removeSpellWord: async () => true,
    getSettings: loadSettings,
    setSettings,
    snapSave: async (slug, id, html, label, auto) => {
      const dir = `${pdir(slug)}/snapshots/${safeId(id)}`, ts = Date.now();
      await FS.write(`${dir}/${ts}.html`, html);
      const meta = await FS.json(`${dir}/snapshots.json`, []);
      meta.push({ ts, label: label || '', auto: !!auto });
      const autos = meta.filter(m => m.auto);
      while (autos.length > 40) { const old = autos.shift(); meta.splice(meta.indexOf(old), 1); await FS.remove(`${dir}/${old.ts}.html`); }
      await FS.write(`${dir}/snapshots.json`, JSON.stringify(meta));
      return ts;
    },
    snapList: async (slug, id) => (await FS.json(`${pdir(slug)}/snapshots/${safeId(id)}/snapshots.json`, [])).sort((a, b) => b.ts - a.ts),
    snapLoad: async (slug, id, ts) => FS.text(`${pdir(slug)}/snapshots/${safeId(id)}/${Number(ts)}.html`),
    snapDelete: async (slug, id, ts) => { const dir = `${pdir(slug)}/snapshots/${safeId(id)}`; await FS.write(`${dir}/snapshots.json`, JSON.stringify((await FS.json(`${dir}/snapshots.json`, [])).filter(m => m.ts !== Number(ts)))); await FS.remove(`${dir}/${Number(ts)}.html`); return true; },
    snapRename: async (slug, id, ts, label) => { const dir = `${pdir(slug)}/snapshots/${safeId(id)}`; const meta = await FS.json(`${dir}/snapshots.json`, []); const m = meta.find(x => x.ts === Number(ts)); if (m) { m.label = label; m.auto = false; } await FS.write(`${dir}/snapshots.json`, JSON.stringify(meta)); return true; },
    // imports: pick files from the iPad's Files app (Dropbox shows up there too)
    // a browser can read a whole folder: pick the .scriv folder (on a computer; phones can't pick folders)
    importScrivener() {
      return new Promise((resolve, reject) => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.webkitdirectory = true; inp.multiple = true; inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.onchange = async () => {
          try {
            const list = [...inp.files]; inp.remove();
            if (!list.length) return resolve(null);
            const scrivx = list.find(f => /\.scrivx$/i.test(f.name));
            if (!scrivx) return reject(new Error('That folder isn’t a Scrivener project (there’s no .scrivx file inside). Choose the folder whose name ends in .scriv.'));
            const root = scrivx.webkitRelativePath.split('/').slice(0, -1).join('/');
            const rel = f => f.webkitRelativePath.slice(root.length + 1);
            const pic = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(f); });
            const files = {};
            for (const f of list) {
              const p = rel(f); let m;
              if ((m = p.match(/^Files\/Data\/([^/]+)\/(content\.rtf|synopsis\.txt|notes\.rtf|content\.(png|jpe?g|gif|webp))$/i))) {
                const e = files[m[1]] = files[m[1]] || {};
                if (/^content\.rtf$/i.test(m[2])) e.content = await f.text(); else if (/synopsis/i.test(m[2])) e.synopsis = await f.text(); else if (/notes/i.test(m[2])) e.notes = await f.text(); else e.image = await pic(f);
              } else if ((m = p.match(/^Files\/Docs\/(\d+)(_synopsis\.txt|_notes\.rtf|\.rtf|\.(png|jpe?g|gif|webp))$/i))) {
                const e = files[m[1]] = files[m[1]] || {};
                if (/synopsis/i.test(m[2])) e.synopsis = await f.text(); else if (/notes/i.test(m[2])) e.notes = await f.text(); else if (/\.rtf$/i.test(m[2])) e.content = await f.text(); else e.image = await pic(f);
              }
            }
            resolve({ name: (root.split('/').pop() || scrivx.name).replace(/\.scriv$/i, '').replace(/\.scrivx$/i, ''), scrivx: await scrivx.text(), files });
          } catch (e) { reject(e); }
        };
        inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
        inp.click();
      });
    },
    async importDocx() { const [f] = await pickFiles({ accept: '.docx' }); return f ? { name: baseName(f.name), bytes: await bytesOf(f) } : null; },
    async importFiles() { const fs = await pickFiles({ accept: '.docx,.odt,.rtf,.txt,.md,.markdown,.text,.htm,.html', multiple: true }); return fs.length ? Promise.all(fs.map(async f => ({ name: baseName(f.name), ext: extOf(f.name), bytes: await bytesOf(f) }))) : null; },
    async importFolder() {
      const fs = (await pickFiles({ multiple: true, directory: 'webkitdirectory' in document.createElement('input') })).filter(f => /\.(docx|odt|rtf|txt|md|markdown|text|htm|html)$/i.test(f.name) && !/^[~.]/.test(f.name));
      if (!fs.length) return null;
      const folder = ((fs[0].webkitRelativePath || '').split('/')[0]) || 'Chapters';
      return { folder, files: await Promise.all(fs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(async f => ({ name: baseName(f.name), ext: extOf(f.name), bytes: await bytesOf(f) }))) };
    },
    async mediaPick(slug) { const out = []; for (const f of await pickFiles({ accept: 'image/*', multiple: true })) out.push({ file: await window.folio.mediaAdd(slug, await bytesOf(f), extOf(f.name)), name: f.name }); return out; },
    async mediaAdd(slug, bytes, ext) {
      ext = String(ext || 'png').toLowerCase().replace(/[^a-z0-9]/g, ''); if (!['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext)) ext = 'png';
      const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      await FS.write(`${pdir(slug)}/media/${id}.${ext}`, new Uint8Array(bytes)); return `${id}.${ext}`;
    },
    async mediaGet(slug, file) {
      const name = String(file).replace(/^.*[\\/]/, ''); const b = await FS.read(`${pdir(slug)}/media/${name}`); if (!b) return null;
      const ext = extOf(name);
      return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(null); fr.readAsDataURL(new Blob([b], { type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) })); });
    },
    _fs: FS, _zip: { zipFiles, unzip }
  };
  // a one-time note in the test version about where the writing is kept
  if (window.UNWIP_ARTIFACT) addEventListener('load', () => setTimeout(async () => {
    const st = await loadSettings(); if (st.testNoteSeen) return;
    say('Test version: your writing is saved on this device only, inside this page. Dropbox sign-in comes next, so don’t keep your only copy of anything important here yet.', 14000);
    await setSettings({ testNoteSeen: true });
  }, 2500));
  document.documentElement.classList.add('web');
  if (/iPad|iPhone|Android/.test(deviceName)) document.documentElement.classList.add('touch-device');
})();
