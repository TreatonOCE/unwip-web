// Unwip - updates. Checks quietly a little after start-up; installs in the background if allowed,
// then offers a restart. After a restart it shows what's new, once.
window.UnwipUpdates = (function () {
  'use strict';
  const U = window.__unwip;
  const { api, esc } = U;
  const notesHTML = t => esc(String(t || '').replace(/sha256:\s*[a-f0-9]{64}/ig, '').trim()).replace(/^#+\s*(.*)$/gm, '<b>$1</b>').replace(/^[-*]\s+/gm, '• ').replace(/\n/g, '<br>');

  async function settings() { try { return await api.getSettings(); } catch { return {}; } }
  function readyToast(st) {
    U.toastAction(`Unwip ${esc(st.version)} is installed. Restart to start using it.`, 'Restart now', () => api.relaunch(), 60000);
  }
  async function auto() {
    let st; try { st = await api.updateState(); } catch { return; }
    if (!st.auto || st.status === 'ready' || st.status === 'downloading') return;
    const cfg = await settings();
    const c = await api.updateCheck();
    if (c.status !== 'available') return;
    if (cfg.autoUpdate === false) { U.toastAction(`Unwip ${esc(c.version)} is available.`, 'Install', () => checkNow(true), 20000); return; }
    const r = await api.updateInstall();
    if (r.status === 'ready') readyToast(r);
  }
  async function checkNow(install) {
    U.toast('Checking for updates…', '', 1500);
    const c = await api.updateCheck();
    if (c.status === 'none') { U.toast(`You’re up to date (Unwip ${esc(c.current)}).`); return; }
    if (c.status === 'error') { U.toast(`Couldn’t check for updates: ${esc(c.error)}`, 'warn', 6000); return; }
    if (!install) {
      const ok = await U.modal({ title: `Unwip ${esc(c.version)} is available`, body: `<div class="up-notes">${notesHTML(c.notes) || 'Fixes and improvements.'}</div><p>Your projects aren’t touched. Only the app’s own files are replaced, and the old version is kept as a backup.</p>`,
        buttons: [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Install', value: true, kind: 'primary' }] });
      if (!ok) return;
    }
    U.toast('Downloading the update…', '', 2500);
    const r = await api.updateInstall();
    if (r.status === 'ready') readyToast(r);
    else U.toast(`The update didn’t install: ${esc(r.error || 'unknown problem')}`, 'warn', 8000);
  }
  // what's new, once, after an update
  (async () => {
    const cfg = await settings();
    if (cfg.justUpdated && cfg.justUpdated.version) {
      const j = cfg.justUpdated;
      await api.setSettings({ justUpdated: null });
      setTimeout(() => U.modal({ title: `What’s new in Unwip ${esc(j.version)}`, body: `<div class="up-notes">${notesHTML(j.notes) || 'Fixes and improvements.'}</div>`, buttons: [{ label: 'Nice', value: true, kind: 'primary' }] }), 1200);
    }
  })();
  setTimeout(auto, 8000);
  setInterval(auto, 6 * 60 * 60 * 1000);   // and every six hours if Unwip stays open
  return { checkNow };
})();
