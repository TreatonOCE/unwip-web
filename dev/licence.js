// Unwip - licence keys. Offline only: a key is a short code signed with Unwip's private key, and the app checks the
// signature here with the public key below. No account, no server, no network call, no device limits, no tracking.
//
// A key:  UNWIP-XXXXX-XXXXX-…  (Crockford base32, so case, spaces, dashes, O/0 and I/L/1 mix-ups don't matter)
//   bytes 0..4  the payload: kind (1 = beta tester, 2 = purchased), the last major version it covers, a 3-byte serial
//   bytes 5..   an ECDSA P-256 / SHA-256 signature of the payload (64 bytes, raw r|s)
//
// The beta end date: BETA_ENDS. While it's null nothing here does anything you'd notice (the Settings box still
// accepts keys). When it's set:
//   - from WARN_DAYS before it, a polite notice you can dismiss (it comes back once a week)
//   - after it, without a valid key: everything still opens, reads and exports. Only new writing is paused.
//   - with a valid key: no change at all.
window.UnwipLicence = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { esc, S } = U;
  const api = window.folio;

  const PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEdFXi5d709HucCQboSxLrNvVr0DyzY6oOQ9CmrC0B+3Zy07/Fe7BMBwVnlT/Bl1Xc5wRzUchJ54rDZltAtZTJ+A==';
  const BETA_ENDS = null;          // e.g. '2027-03-01'. null = no end date yet (nothing is ever paused)
  const WARN_DAYS = 28;
  const KINDS = { 1: 'Beta tester', 2: 'Purchased' };

  // ---- the code itself
  const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  function clean(text) {
    let t = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (t.startsWith('UNWIP')) t = t.slice(5);
    return t.replace(/O/g, '0').replace(/[IL]/g, '1');
  }
  function decode(t) {
    const out = []; let bits = 0, val = 0;
    for (const ch of t) { const v = ALPHA.indexOf(ch); if (v < 0) return null; val = (val << 5) | v; bits += 5; if (bits >= 8) { bits -= 8; out.push((val >> bits) & 255); } }
    return new Uint8Array(out);
  }
  let keyP = null;
  function pubKey() {
    if (!keyP) keyP = crypto.subtle.importKey('spki', Uint8Array.from(atob(PUBLIC_KEY), c => c.charCodeAt(0)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return keyP;
  }
  function appMajor() {
    const v = window.UNWIP_VERSION || (S.settings && S.settings._appVersion) || '0.0.0';
    return parseInt(String(v).split('.')[0], 10) || 0;
  }
  // { ok, kind, label, major, serial } or { ok: false, why }
  async function check(text) {
    const t = clean(text);
    if (!t) return { ok: false, why: 'empty' };
    const b = decode(t);
    if (!b || b.length < 69) return { ok: false, why: 'short' };
    const payload = b.slice(0, 5), sig = b.slice(5, 69);
    let good = false;
    try { good = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await pubKey(), sig, payload); } catch (e) { return { ok: false, why: 'cant-check' }; }
    if (!good) return { ok: false, why: 'bad' };
    const kind = payload[0], major = payload[1], serial = (payload[2] << 16) | (payload[3] << 8) | payload[4];
    if (!KINDS[kind]) return { ok: false, why: 'bad' };
    if (appMajor() > major) return { ok: false, why: 'old', kind, major };
    return { ok: true, kind, label: KINDS[kind], major, serial };
  }
  const WHY = {
    empty: 'Paste your licence key first.',
    short: 'That key looks incomplete. Copy the whole key, from UNWIP- to the end, and paste it again.',
    bad: 'That key isn’t valid. Check you copied all of it; if it still doesn’t work, email us and we’ll sort it out.',
    old: 'That key is for an earlier version of Unwip.',
    'cant-check': 'This device can’t check keys (it may need a system update).'
  };

  // ---- state
  let state = { ok: false };
  async function refresh() {
    const k = S.settings && S.settings.licence;
    state = k ? await check(k) : { ok: false, why: 'empty' };
    apply();
    return state;
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const ended = () => !!BETA_ENDS && today() >= BETA_ENDS;
  const daysLeft = () => BETA_ENDS ? Math.ceil((new Date(BETA_ENDS + 'T00:00:00') - Date.now()) / 864e5) : Infinity;
  const paused = () => ended() && !state.ok;

  // ---- after the end date without a key: read and export, but no new writing
  function apply() {
    const on = paused();
    document.body.classList.toggle('lic-paused', on);
    const ed = U.editor;
    if (ed) { if (on) ed.setAttribute('contenteditable', 'false'); else if (ed.getAttribute('contenteditable') === 'false' && ed.dataset.licLocked) ed.setAttribute('contenteditable', 'true'); if (on) ed.dataset.licLocked = '1'; else delete ed.dataset.licLocked; }
    let bar = document.getElementById('lic-bar');
    if (on && !bar) {
      bar = document.createElement('div'); bar.id = 'lic-bar'; bar.className = 'lic-bar';
      bar.innerHTML = `<span>The Unwip beta has ended. Your books are all here: you can read them and export everything (Scrivener, Word, Markdown, a full backup). To keep writing, enter a licence key.</span><button class="btn small primary" type="button">Enter licence key…</button>`;
      bar.querySelector('button').onclick = () => dialog();
      document.body.appendChild(bar);
    } else if (!on && bar) bar.remove();
  }
  // anything that would change the writing is turned away while paused (exports and copying still work)
  document.addEventListener('beforeinput', e => { if (paused() && e.target.closest && e.target.closest('[contenteditable], input, textarea') && !e.target.closest('.modal-back, #lic-bar')) { e.preventDefault(); nudge(); } }, true);
  document.addEventListener('paste', e => { if (paused() && U.editor && U.editor.contains(e.target)) { e.preventDefault(); nudge(); } }, true);
  let nudged = 0;
  function nudge() { if (Date.now() - nudged < 4000) return; nudged = Date.now(); U.toastAction('The beta has ended, so new writing is paused. Reading and exporting still work.', 'Enter licence key…', () => dialog(), 8000); }
  U.on('doc', () => setTimeout(apply, 0));

  // ---- the heads-up before the end date
  function maybeWarn() {
    if (!BETA_ENDS || state.ok || ended()) return;
    const d = daysLeft(); if (d > WARN_DAYS) return;
    let seen = 0; try { seen = +localStorage.getItem('unwip-lic-warned') || 0; } catch {}
    if (Date.now() - seen < 7 * 864e5) return;
    try { localStorage.setItem('unwip-lic-warned', String(Date.now())); } catch {}
    const when = new Date(BETA_ENDS + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    U.toastAction(`The Unwip beta ends on ${esc(when)}, and a licensed version is coming. Beta testers keep it free: you’ll get a key. Nothing happens to your books either way.`, 'Enter licence key…', () => dialog(), 20000);
  }

  // ---- entering a key
  async function dialog() {
    const body = document.createElement('div'); body.className = 'lic-dialog';
    const now = state.ok ? `<p class="lic-ok">✓ Licensed: <b>${esc(state.label)}</b> key.</p>` : '';
    body.innerHTML = `${now}<p>Paste the key you were sent. It’s checked on this device; nothing is sent anywhere.</p>
      <textarea id="lic-in" rows="3" spellcheck="false" autocomplete="off" placeholder="UNWIP-…"></textarea><p class="lic-msg" id="lic-msg" aria-live="polite"></p>`;
    const msg = () => body.querySelector('#lic-msg');
    const ok = await U.modal({ title: 'Licence key', body, buttons: [{ label: 'Close', value: false, kind: 'ghost' }, { label: 'Check and save', value: true, kind: 'primary' }],
      onOpen: back => {
        const b = [...back.querySelectorAll('.m-foot .btn')].pop();
        b.onclick = async e => {
          e.preventDefault(); e.stopPropagation();
          const r = await check(body.querySelector('#lic-in').value);
          if (!r.ok) { msg().className = 'lic-msg bad'; msg().textContent = WHY[r.why] || WHY.bad; return; }
          S.settings = await api.setSettings({ licence: clean(body.querySelector('#lic-in').value) });
          await refresh();
          msg().className = 'lic-msg good'; msg().textContent = `Thank you. This is a ${r.label.toLowerCase()} key, and it’s saved.`;
          U.toast(`Licence key saved (${esc(r.label.toLowerCase())}).`);
        };
      } });
    return ok;
  }
  function settingsSection(host) {
    const f = host.querySelector('#s-licence'); if (!f) return;
    const draw = () => { f.innerHTML = `<label>${state.ok ? `Licensed: ${esc(state.label)} key` : BETA_ENDS ? 'No licence key yet' : 'Free while in beta: no key needed yet'}</label><button class="btn" type="button">${state.ok ? 'Change key…' : 'Enter licence key…'}</button>`; f.querySelector('button').onclick = async () => { await dialog(); draw(); }; };
    draw();
  }

  (async () => {
    try { if (!window.UNWIP_VERSION && api.updateState) { const st = await api.updateState(); if (st && st.current) S.settings = Object.assign(S.settings || {}, { _appVersion: st.current }); } } catch {}
    await refresh(); setTimeout(maybeWarn, 8000);
  })();
  return { check, clean, dialog, refresh, settingsSection, get state() { return state; }, get paused() { return paused(); }, BETA_ENDS, _test: { decode, appMajor } };
})();
