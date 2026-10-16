window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.44.79";
window.UNWIP_LATEST_NOTES = "- Book cards on the main screen show when each book was last changed, with the time, so two copies of a book are easy to tell apart.\n- Spark no longer glows while you're typing in the split window. Pages Spark makes (an interview, the scene you're excited about, your ideas note) go below Trash, under New, ready to drag into place.\n- Choosing an icon: type a word to find an emoji (trash, dragon, castle) without the Windows emoji keyboard. There's a trash can among the icons again.\n- Find (Ctrl+F) looks only in your chapter, not the buttons and binder. You can backspace and retype freely, and Enter goes to the next match.\n- Character sheet: clicking Looking back takes you to the latest chapter.\n- Character sheet stats: money and shop messages like [New Balance: 1,680] or [Cost: 10] aren't counted as stats any more, and a joke status like [Status: feeling smug] isn't taken for a character's name.\n- Story Bible: the \u22ef next to a book works again (open, take out of the series, delete), and End the series\u2026 splits a series back into books of their own.\n- Settings: scrolling down straight after opening doesn't jump back to the top.\n- LitRPG: the Kindle / EPUB preview now shows [system messages] as boxes when \"boxes in e-books\" is ticked. Before, the preview always showed plain brackets, even though the EPUB had the boxes.\n- LitRPG: new choice in Settings \u203a LitRPG for a short message on its own, like [I am]: a full-width box (as before), a box that fits the words, or no box, just bold brackets. Several messages in a row, like a status screen, keep the full box. It applies while you write, in the preview, in the EPUB and in the Royal Road copy.\n- Maps: a selected label's box now fits its lettering exactly, at any size or angle.\n- Maps: the brush circle follows the mouse as you move it, not only while you press.\n- Maps: fields, parks and woods, and buildings on town maps can be turned and resized with the handles (or R, + and \u2212), like market stalls.";
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
