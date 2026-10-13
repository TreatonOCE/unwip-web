// Unwip - About, "Report a problem", and the no-AI note on the main screen.
// The report holds the version, the device, recent errors and sync status: never any of your writing.
window.UnwipAbout = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc } = U;
  const SUPPORT = window.UNWIP_SUPPORT || '';           // where "Email it" goes (set when the app is built)

  // ---------------------------------------------------------------- remember recent errors (in memory and on this device)
  const LOG_KEY = 'unwip-errlog';
  let log = []; try { log = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); } catch {}
  function note(kind, msg) {
    msg = String(msg || '').replace(/\s+/g, ' ').slice(0, 300);
    if (!msg || /ResizeObserver loop/.test(msg)) return;
    const last = log[log.length - 1]; if (last && last.m === msg) { last.n = (last.n || 1) + 1; last.t = Date.now(); }
    else log.push({ t: Date.now(), k: kind, m: msg });
    log = log.slice(-30); try { localStorage.setItem(LOG_KEY, JSON.stringify(log)); } catch {}
  }
  addEventListener('error', e => note('error', `${e.message} (${String(e.filename || '').split('/').pop()}:${e.lineno})`));
  addEventListener('unhandledrejection', e => note('promise', e.reason && (e.reason.stack || e.reason.message) || e.reason));
  const warn0 = console.warn.bind(console), err0 = console.error.bind(console);
  console.warn = (...a) => { try { note('warn', a.map(x => x && x.message ? x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); } catch {} warn0(...a); };
  console.error = (...a) => { try { note('error', a.map(x => x && x.message ? x.message : typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); } catch {} err0(...a); };

  async function version() {
    if (window.UNWIP_VERSION) return window.UNWIP_VERSION;
    try { const s = await api.updateState(); return s.current || '?'; } catch { return '?'; }
  }
  const device = () => {
    const ua = navigator.userAgent;
    const web = !!(api && api.web);
    const kind = /iPhone/.test(ua) ? 'iPhone' : /iPad|Macintosh.*Mobile|Macintosh.*Safari.*Version/.test(ua) && 'ontouchend' in document ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Other';
    const os = (/OS (\d+[_\d]*)/.exec(ua) || /Windows NT ([\d.]+)/.exec(ua) || [])[1] || '';
    return `${kind}${os ? ' ' + os.replace(/_/g, '.') : ''}, ${web ? (navigator.standalone || matchMedia('(display-mode: standalone)').matches ? 'Home Screen app' : 'browser') : 'PC app'}, ${innerWidth}×${innerHeight}`;
  };

  async function reportText(what) {
    let projects = [];
    try { projects = await api.listProjects(); } catch {}
    const D = window.UnwipDropbox;
    const lines = [
      `Unwip ${await version()}`,
      `Device: ${device()}`,
      `When: ${new Date().toString().replace(/ GMT.*/, '')}`,
      `Projects: ${projects.length} (${projects.reduce((a, p) => a + (p.words || 0), 0).toLocaleString()} words in total)`,
      S.project ? `Open: a project with ${(S.project.binder || []).reduce((a, r) => a + (r.children || []).length, 0)} top-level items, ${S.mode || ''} mode, view ${S.view || 'write'}` : 'Open: main screen',
      D ? `Dropbox: ${D.connected() ? 'connected' : 'not connected'}${D.lastError ? ` · last problem: ${D.lastError}` : ''}` : '',
      '',
      'What happened:',
      what || '(not filled in)',
      '',
      `Recent errors (${log.length}):`,
      ...(log.length ? log.slice(-15).map(e => `${new Date(e.t).toLocaleString()} [${e.k}] ${e.m}${e.n > 1 ? ` ×${e.n}` : ''}`) : ['none'])
    ];
    return lines.filter(x => x !== '').join('\n').replace(/\nWhat happened:/, '\n\nWhat happened:').replace(/\nRecent errors/, '\n\nRecent errors');
  }

  async function report() {
    const body = document.createElement('div'); body.className = 'rep';
    body.innerHTML = `<p>Something not working, or confusing? Say what you were doing and what went wrong. Unwip adds the details that help fix it: the version, your device and any recent errors. <b>None of your writing is included.</b></p>
      <div class="field"><label>What happened?</label><textarea id="rep-what" rows="4" placeholder="e.g. I pressed Copy for Docs in chapter 3 and nothing was copied"></textarea></div>
      <details class="rep-details"><summary>See exactly what will be sent</summary><pre id="rep-pre"></pre></details>`;
    const pre = body.querySelector('#rep-pre'), what = body.querySelector('#rep-what');
    const refresh = async () => { pre.textContent = await reportText(what.value.trim()); };
    what.addEventListener('input', () => { clearTimeout(what._t); what._t = setTimeout(refresh, 300); });
    await refresh();
    const v = await U.modal({ title: 'Report a problem', body, wide: true, onOpen: () => setTimeout(() => what.focus(), 50),
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Copy report', value: 'copy', kind: 'ghost' }, { label: SUPPORT ? 'Email it' : 'Email it…', value: 'mail', kind: 'primary' }] });
    if (!v) return;
    const text = await reportText(what.value.trim());
    if (v === 'copy') { try { await navigator.clipboard.writeText(text); U.toast('Report copied. Paste it into an email or message.'); } catch { U.toast('Couldn’t copy. Select the text under “See exactly what will be sent” and copy it.', 'warn'); } return; }
    const subj = `Unwip problem: ${(what.value.trim().split('\n')[0] || 'report').slice(0, 60)}`;
    const url = `mailto:${encodeURIComponent(SUPPORT)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(text.slice(0, 1800))}`;
    if (api.web) location.href = url; else window.open(url, '_blank');   // the PC hands mailto: links to your email app
    if (text.length > 1800) { try { await navigator.clipboard.writeText(text); U.toast('Your email app is opening. The full report was also copied, in case it’s cut short.'); } catch {} }
  }

  // ---------------------------------------------------------------- About
  const NO_AI = 'Unwip doesn’t use AI. Nothing in it writes, rewrites, suggests or draws for you. Spelling and grammar checks follow fixed rules, Insights simply counts, name suggestions come from your own sheets, and random maps are rolled from fixed rules and random numbers, like dice. All of it runs on your own device.';
  async function about() {
    const v = await version();
    const body = document.createElement('div'); body.className = 'about';
    body.innerHTML = `
      <div class="about-head"><b>Unwip</b> <span>version ${esc(v)}</span></div>
      <p class="about-slogan">Write to finish.</p>
      <h4>Made without AI</h4><p>${NO_AI}</p>
      <h4>Your writing stays yours</h4><p>Your books are saved on your device. If you connect Dropbox, they’re copied to <b>your own</b> Dropbox and nowhere else. Unwip has no account, no server of its own and no tracking. Reports you send with “Report a problem” contain no writing.</p>
      <h4>Thank you</h4>
      <ul class="about-credits">
        <li><b>Fonts:</b> EB Garamond, Lora, Crimson Pro, Libre Baskerville, Cinzel and Oswald, under the SIL Open Font License (licence files are included with the fonts).</li>
        <li><b>Harper</b> (grammar checking, the “More suggestions” option) by Automattic, Apache License 2.0.</li>
        ${api.web ? '' : '<li><b>Electron</b> and <b>Chromium</b>, which run the PC app, MIT and BSD licences.</li>'}
        <li>Spell checking uses the spell checker built into ${api.web ? 'your browser' : 'the app’s Chromium engine'}.</li>
      </ul>
      <div class="sy-moves"><button class="btn" type="button" id="ab-report">Report a problem…</button></div>`;
    body.querySelector('#ab-report').onclick = () => { const x = body.closest('.modal-back'); const b = x && x.querySelector('.m-foot button'); if (b) b.click(); report(); };
    await U.modal({ title: 'About Unwip', body, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
  }

  // ---------------------------------------------------------------- the note on the main screen
  function footer() {
    const home = document.getElementById('write-home'); if (!home || home.querySelector('.lib-foot')) return;
    const f = document.createElement('footer'); f.className = 'lib-foot';
    f.innerHTML = `<div class="noai"><span class="noai-badge">No AI</span><span>Unwip doesn’t use AI to write, edit, suggest or draw, maps included. Checks, insights and random maps follow fixed rules on your device.</span></div>
      <div class="lib-links"><button class="link-btn" type="button" data-a="about">About Unwip</button><span>·</span><button class="link-btn" type="button" data-a="report">Report a problem</button></div>`;
    f.querySelector('[data-a="about"]').onclick = about;
    f.querySelector('[data-a="report"]').onclick = report;
    home.appendChild(f);
  }
  footer();

  // a library folder set up by a newer Unwip (on the PC; the phone checks this in Dropbox itself)
  async function layoutCheck() {
    if (!api.libraryLayout) return;
    try {
      const L = await api.libraryLayout();
      const bar = document.getElementById('layout-warn'); if (bar) bar.remove();
      if (L && L.layout > 2) {
        const b = document.createElement('div'); b.id = 'layout-warn'; b.className = 'sy-warn';
        b.innerHTML = `Your books were moved to a new folder layout by a newer version of Unwip on another device. <b>Update Unwip on this PC</b> (Settings › Check for updates) before writing here, so nothing gets out of step.`;
        const home = document.getElementById('write-home'); if (home) home.prepend(b);
      }
    } catch {}
  }
  U.on('library', layoutCheck); layoutCheck();

  return { about, report, note, log: () => log.slice() };
})();
