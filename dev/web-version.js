window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.44.84";
window.UNWIP_LATEST_NOTES = "- Story Bible: the \u2039 \u203a arrows next to a book's name move it earlier or later in the series. They now say so when you point at them, and a note tells you where the book went. Long titles stay on one line, so every book's pill is the same size.\n- Character sheet: \"Don't show stats, just gear\" now sticks.\n- Character sheet: when you're looking back, tap the chapter's name to open that chapter. \"Back to latest\" is its own button.\n- Character sheet: \u2039 and \u203a at the top step to the character before or after, without closing the sheet.\n- Fonts: Lora and Libre Baskerville are no longer listed as favourites, since Unwip has them as Larkspur and Bookhaven. If you change the font in Style and some text has a font of its own (from pasting, importing or the toolbar), Unwip tells you and offers Font for the whole book to bring it all into line.\n- The side panel button now opens your other tabs (Insights, Comments, Changes, Snapshots, Style). Revise has its own button.\n- Setup: the little layout pictures show properly again, and are easy to see in dark looks.";
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
(function () {
  if (location.protocol !== 'https:') return;
  let last = 0, offered = '';
  async function check() {
    if (Date.now() - last < 60000) return; last = Date.now();
    try {
      const t = await (await fetch('web-version.js?v=' + Date.now(), { cache: 'no-store' })).text();
      const m = t.match(/UNWIP_VERSION = "([^"]+)"/); const v = m && m[1];
      const U = window.__unwip; if (!v || v === window.UNWIP_VERSION || v === offered || !U || !U.toastAction) return;
      offered = v;
      let notes = ''; try { const n = t.match(/UNWIP_LATEST_NOTES = ("(?:[^"\\]|\\.)*");/); if (n) notes = JSON.parse(n[1]); } catch (e) {}
      const go = async () => { try { await U.flushSave(); if (U.saveMetaNow) await U.saveMetaNow(); } catch (e) {} if (U.saveFailing) { U.toast('Unwip can’t update yet: some writing isn’t saved (the bar at the top says why). It updates once saving works again.', 'warn', 9000); offered = ''; return; } location.reload(); };
      if (window.UnwipUpdates && window.UnwipUpdates.notice) window.UnwipUpdates.notice({ title: 'A new version of Unwip is ready', version: v, notes, action: 'Update now', run: go });
      else U.toastAction('A new version of Unwip is ready (' + v + ').', 'Update now', go, 60000);
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  addEventListener('load', () => setTimeout(check, 20000)); setInterval(check, 3600000);
})();
