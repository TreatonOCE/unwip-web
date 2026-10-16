window.UNWIP_DEV = true;
(function () { const P = 'dev:', S = Storage.prototype, g = S.getItem, s = S.setItem, r = S.removeItem;
  S.getItem = function (k) { return g.call(this, P + k); }; S.setItem = function (k, v) { return s.call(this, P + k, v); }; S.removeItem = function (k) { return r.call(this, P + k); }; })();
window.UNWIP_VERSION = "0.44.71";
window.UNWIP_LATEST_NOTES = "- New: **Add to\u2026** on words you pick in a chapter, at Detail and Lore (the little bar, right-click \u203a Add to on a PC, or Ctrl+K). Put the words on a character, place or thing page, under the heading you choose, or start a timeline event linked to the chapter with the characters named in it. Lore also offers a character sheet's gear and the Story Bible.\n- Story Bible:\n  - Relationships on every page (+ Relationship): family, love, allies, enemies, where someone lives, what they carry. Each can start and stop at a chapter, so As of shows who was what to whom at that point.\n  - The new Web tab draws everyone's relationships as a map. Click a name to open their page.\n  - New person, place or thing: pick the books with a search instead of a list of every book. From the main screen nothing is ticked until you choose.\n  - On a phone the Story Bible is in Build and read only. iPads keep everything.\n- Build tools:\n  - Symbols come in categories with a dropdown (Recent first, then each kind, then All with a search), the same in coats of arms, sigils and insignia.\n  - One colour row everywhere: black, white, yellow, red, blue, green and a custom colour with a colour square, recent colours and \"From picture\" to take a colour from the picture.\n  - Size and turn handles on the picture, like on maps, for coat of arms symbols, sigil symbols and the insignia symbol. The sliders stay and follow the handles.\n  - Four ribbon shapes for the motto, with their own ribbon and letter colours.\n  - The magic system's Parchment style is now a proper scroll: rolled ends, a decorated first letter, costs written as a ledger, marks in the margin and a wax seal.\n- Settings \u203a What's new shows the notes for recent versions. A new version now shows a bigger notice with what it brings.\n- The typewriter's margin bell sounds like a real struck bell.\n- Import \u203a a folder on an Unwip book now brings it in as a book (it used to read the book's own files as chapters).\n- Fixed: picking Lore could push Record and Settings off the right edge of the main screen.\n- Fixed: the page size \u2212 and + overlapped the percentage in the status bar.\n- Fixed: opening a rune alphabet or other Lore piece from the Story Bible and closing it left you in Build. It now goes back to the Story Bible.\n- Fixed: on an iPad the Build top bar's Random button sat on top of Record.";
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
