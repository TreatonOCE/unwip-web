// Unwip - settings that follow you between devices: themes and colours, typewriter and animations, LitRPG tools and
// text shortcuts, the default manuscript style, author name, daily goal, your templates, favourite fonts and the like.
// They live in one small file next to Build in Dropbox (_Settings/shared.json); on the PC the Dropbox app carries it,
// on the phone and iPad dropbox.js does. Each setting carries the time it was last changed, and the newest change of
// each one wins, so two devices changing different settings never undo each other.
// Not shared (they belong to one device): screen size, window places, the library and backup folders, sign-ins,
// read-aloud voices, spellcheck, auto-update, and "seen this tip" markers.
window.UnwipPrefs = (function () {
  'use strict';
  const U = window.__unwip, api = U && U.api;
  if (!api || !api.prefsRead || !api.setSettings) return null;
  const { S } = U;

  // kept in the settings file
  const SHARED = ['litrpg', 'snippets', 'defaultStyle', 'author', 'dailyGoal', 'quotes', 'myTemplates', 'fontFavs', 'trackStuck', 'stuckNudge', 'proofOn', 'proofRemind', 'wordList'];
  // kept in this browser's storage (look.js); the screen size stays per device
  const STORE = { 'unwip-look': v => { const o = { ...v }; delete o.uiSize; return o; }, 'unwip-typing': v => v };
  const ALL = [...SHARED, ...Object.keys(STORE)];

  // the time of each setting this device has already taken in or sent
  const SEEN = 'unwip-prefs-seen';
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(SEEN) || '{}') || {}; } catch {}
  const keepSeen = () => { try { localStorage.setItem(SEEN, JSON.stringify(seen)); } catch {} };

  let applying = false, pending = {}, timer = null, lastText = null, busy = null, rewrite = false;
  const parse = t => { try { const j = JSON.parse(t || ''); return j && j.keys ? j : { v: 1, keys: {} }; } catch { return { v: 1, keys: {} }; } };
  const merge = (a, b) => { const out = { v: 1, keys: { ...a.keys } }; for (const [k, e] of Object.entries(b.keys || {})) if (!out.keys[k] || (e.at || 0) > (out.keys[k].at || 0)) out.keys[k] = e; return out; };
  function localValue(k) {
    if (STORE[k]) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? undefined : STORE[k](v); } catch { return undefined; } }
    return S.settings ? S.settings[k] : undefined;
  }
  async function readFile() {
    const got = await api.prefsRead().catch(() => null); if (!got) return null;
    let file = parse(got.main);
    for (const x of got.extra || []) file = merge(file, parse(x.text));   // Dropbox's conflicted copies, folded in
    return { file, got };
  }
  // one at a time: a pull and a push never overlap
  const one = fn => async () => { while (busy) await busy; busy = fn().finally(() => { busy = null; }); return busy; };

  // ---- a change on this device: write it out shortly after (several changes in a row go together)
  function mark(keys) { if (applying) return; const now = Date.now(); for (const k of keys) pending[k] = now; clearTimeout(timer); timer = setTimeout(push, 1200); }
  const push = one(async () => {
    const keys = Object.keys(pending); if (!keys.length && !rewrite) return;
    rewrite = false;
    const r = await readFile(); if (!r) return;
    const { file, got } = r;
    for (const k of keys) {
      const val = localValue(k); if (val === undefined) continue;
      if (!file.keys[k] || pending[k] >= (file.keys[k].at || 0)) { file.keys[k] = { at: pending[k], val }; seen[k] = pending[k]; }
    }
    pending = {}; keepSeen();
    const text = JSON.stringify(file); lastText = text;
    await api.prefsWrite(text, (got.extra || []).map(x => x.name)).catch(() => {});
  });

  // ---- changes from another device: take in anything newer than what this device has
  const pull = one(async () => {
    const r = await readFile(); if (!r) return;
    const { file, got } = r;
    if (got.main === lastText && !(got.extra || []).length) return;
    lastText = got.main;
    const take = {};
    for (const [k, e] of Object.entries(file.keys)) if (ALL.includes(k) && (e.at || 0) > (seen[k] || 0) && !pending[k]) take[k] = e;
    if (Object.keys(take).length) await apply(take);
    // settings this device has that the file doesn't have yet go in too, as the oldest (anything set elsewhere wins)
    const missing = ALL.filter(k => !file.keys[k] && !seen[k] && localValue(k) !== undefined);
    for (const k of missing) pending[k] = pending[k] || 1;
    if (missing.length || (got.extra || []).length) { rewrite = true; setTimeout(push, 0); }   // also folds Dropbox's conflicted copies back into one file
  });

  async function apply(take) {
    applying = true;
    try {
      const patch = {};
      for (const [k, e] of Object.entries(take)) {
        if (STORE[k]) {
          let cur = {}; try { cur = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch {}
          const v = { ...(e.val || {}) }; if (k === 'unwip-look' && cur.uiSize) v.uiSize = cur.uiSize;
          try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
        } else patch[k] = e.val;
        seen[k] = e.at;
      }
      if (Object.keys(patch).length) S.settings = await api.setSettings(patch);
      keepSeen();
      try { if (window.UnwipLook && window.UnwipLook.reload) window.UnwipLook.reload(); } catch {}
      try { if (window.UnwipLitRPG && window.UnwipLitRPG.apply) window.UnwipLitRPG.apply(); } catch {}
    } finally { applying = false; }
  }

  // every part of Unwip puts the saved settings back in S.settings; a shared one that changed there is noted (the
  // settings functions themselves can't be wrapped on the PC, where they're locked)
  let cur = S.settings, snap = {};
  const take = v => { for (const k of SHARED) snap[k] = JSON.stringify(v ? v[k] : undefined); };
  take(cur);
  Object.defineProperty(S, 'settings', {
    configurable: true, enumerable: true,
    get: () => cur,
    set: v => {
      const first = !cur; cur = v;
      const changed = SHARED.filter(k => JSON.stringify(v ? v[k] : undefined) !== snap[k]);
      take(v);
      if (!first && changed.length) mark(changed);
    }
  });

  // when to look: soon after starting, every so often, when the app comes back to the front, and (phone) as soon as
  // the Dropbox sync brings a new copy
  setTimeout(pull, 2500);
  setInterval(() => { if (document.visibilityState !== 'hidden') pull(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
  window.addEventListener('focus', () => pull());
  if (api.onPrefsChange) api.onPrefsChange(() => pull());

  return { changed: key => { if (STORE[key]) mark([key]); }, pull, push, SHARED, _state: () => ({ seen, pending }) };
})();
