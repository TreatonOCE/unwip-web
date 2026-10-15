// Unwip - one side panel with labelled tabs: Revise · Insights · Comments · Changes · Snapshots · Style.
// They all share the same slot on the right, so panels never stack, and each is one click from the others.
// The panel button at the top right opens the tab you used last; Revise and F7 still go straight to Revise.
window.UnwipSide = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, esc, api } = U;
  const main = $('#workspace .main');
  const TABS = [['revise', 'Revise'], ['insights', 'Insights'], ['comments', 'Comments'], ['changes', 'Changes'], ['snapshots', 'Snapshots'], ['style', 'Style']];
  const LS = 'unwip-side-tab';
  let last = (() => { try { return localStorage.getItem(LS) || 'comments'; } catch { return 'comments'; } })();
  let busy = false;

  // the two new panels live beside the existing Revise and Comments panels
  function makePanel(id, title) {
    const p = document.createElement('aside');
    p.className = 'revise-panel side-extra hidden'; p.id = id;
    p.innerHTML = `<div class="rp-scroll side-body"></div>`;
    main.appendChild(p);
    return p;
  }
  const P = { revise: $('#revise-panel'), comments: $('#notes-panel'), changes: makePanel('changes-panel'), insights: makePanel('insights-panel'), snapshots: makePanel('snap-panel'), style: makePanel('style-panel') };

  // labelled tabs at the top of every panel
  for (const [k, el] of Object.entries(P)) {
    const nav = document.createElement('nav'); nav.className = 'side-tabs'; nav.setAttribute('aria-label', 'Side panel');
    nav.innerHTML = TABS.map(([t, l]) => `<button class="side-tab ${t === k ? 'on' : ''} t-${t}" data-t="${t}">${l}${t === 'comments' ? '<span class="side-n" data-n></span>' : ''}</button>`).join('') +
      `<button class="icon-btn small side-x" title="Close the panel" aria-label="Close the panel">${U.I.x}</button>`;
    el.insertBefore(nav, el.firstChild);
    nav.addEventListener('click', e => {
      const b = e.target.closest('.side-tab'); if (b) { open(b.dataset.t); return; }
      if (e.target.closest('.side-x')) close();
    });
  }

  const visible = el => el && !el.classList.contains('hidden');
  function current() { for (const [k, el] of Object.entries(P)) if (visible(el)) return k; return null; }

  function hideAllBut(keep) {
    if (keep !== 'revise' && S.revise) U.setRevise(false);
    if (keep !== 'comments' && visible(P.comments) && window.UnwipNotes) window.UnwipNotes.open(false);
    for (const k of ['changes', 'insights', 'snapshots', 'style']) if (k !== keep) P[k].classList.add('hidden');
  }
  function open(tab) {
    if (!S.project) return;
    if (busy) return; busy = true;
    try {
      hideAllBut(tab);
      if (tab === 'revise') { if (!S.revise) U.setRevise(true); }
      else if (tab === 'comments') { if (window.UnwipNotes) window.UnwipNotes.open(true); }
      else if (tab === 'changes') { P.changes.classList.remove('hidden'); if (window.UnwipTrack) window.UnwipTrack.attach($('.side-body', P.changes)); }
      else if (tab === 'snapshots') { P.snapshots.classList.remove('hidden'); renderSnaps(); }
      else if (tab === 'insights') { P.insights.classList.remove('hidden'); if (window.UnwipInsights) window.UnwipInsights.compact($('.side-body', P.insights)); }
      else if (tab === 'style') { P.style.classList.remove('hidden'); renderStyle(); }
      last = tab; try { localStorage.setItem(LS, tab); } catch {}
    } finally { busy = false; sync(); }
  }
  function close() { hideAllBut(null); sync(); }
  function toggle() { if (current()) close(); else open(last); }

  // keep the panel button and the tabs' counts in step with whatever opened a panel
  function sync() {
    const c = current();
    const pb = $('#btn-panel'); if (pb) pb.classList.toggle('on', !!c);
    if (c && U.makeRoom) U.makeRoom(false);
    const n = new Set($$('#editor span.cmt[data-cid]').map(x => x.dataset.cid)).size + $$('#editor sup.fn').length;
    $$('[data-n]').forEach(x => { x.textContent = n ? ` ${n}` : ''; });
  }
  // when Revise (button or F7) or Comments open by themselves, close the others
  new MutationObserver(muts => {
    if (busy) return;
    for (const m of muts) {
      const el = m.target; if (!visible(el)) continue;
      const k = Object.keys(P).find(x => P[x] === el); if (!k) continue;
      busy = true; try { hideAllBut(k); last = k; } finally { busy = false; }
    }
    sync();
  }).observe(main, { subtree: true, attributes: true, attributeFilter: ['class'] });

  // ---------------------------------------------------------------- Snapshots tab
  const when = ts => new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  async function renderSnaps() {
    const box = $('.side-body', P.snapshots);
    if (!S.docId) { box.innerHTML = '<p class="side-empty">Open a chapter to see its snapshots.</p>'; return; }
    const f = U.findNode(S.docId);
    const list = await api.snapList(S.slug, S.docId).catch(() => []);
    box.innerHTML = `
      <p class="side-lead">Saved versions of <b>${esc(f ? f.node.title || 'Untitled' : 'this chapter')}</b>. Take one before a big rewrite.</p>
      <div class="side-snaptake"><input type="text" id="side-snap-label" placeholder="Name it (optional)"><button class="btn primary small" id="side-snap-take">Take snapshot</button></div>
      <div class="side-snaps">${list.length ? list.map(s => `<button class="side-snap" data-ts="${s.ts}"><b>${esc(s.label || 'Snapshot')}</b><span>${when(s.ts)}${s.auto ? ' · automatic' : ''}</span></button>`).join('') : '<p class="side-empty">No snapshots yet.</p>'}</div>
      <p class="side-note">Click one to compare it with your chapter now, and restore it if you want. Unwip also takes one automatically the first time you change a chapter each day.</p>`;
    const take = async () => { await U.takeSnapshot($('#side-snap-label', box).value.trim()); renderSnaps(); };
    $('#side-snap-take', box).onclick = take;
    $('#side-snap-label', box).onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); take(); } };
    $$('.side-snap', box).forEach(b => b.onclick = async () => { await U.snapshotsDialog(+b.dataset.ts); renderSnaps(); });
  }

  // ---------------------------------------------------------------- Style tab (changes show on the page as you make them)
  let styleBefore = null;
  async function renderStyle() {
    const box = $('.side-body', P.style);
    styleBefore = JSON.parse(JSON.stringify(S.project.style));
    const f = await U.styleForm();
    box.innerHTML = `<p class="side-lead">Your manuscript’s look. Changes show on the page straight away and are saved with the project.</p>
      ${window.UnwipBookFont ? '<button class="btn small" id="side-bookfont" type="button" style="margin-bottom:10px">Font for the whole book…</button>' : ''}`;
    { const b = $('#side-bookfont', box); if (b) b.onclick = async () => { await window.UnwipBookFont.open(); renderStyle(); }; }
    box.appendChild(f.body);
    const foot = document.createElement('div'); foot.className = 'side-foot';
    foot.innerHTML = `<button class="btn small ghost" id="side-style-undo" disabled>Put it back how it was</button>`;
    box.appendChild(foot);
    let t = null;
    const apply = () => { clearTimeout(t); t = setTimeout(() => { U.applyStyleNow(f.read()); $('#side-style-undo', box).disabled = false; }, 120); };
    f.body.addEventListener('input', apply); f.body.addEventListener('change', apply);
    $('#side-style-undo', box).onclick = () => { U.applyStyleNow(JSON.parse(JSON.stringify(styleBefore))); renderStyle(); };
  }

  // new chapter open: refresh what the panel shows
  U.on('doc', () => { if (visible(P.snapshots)) renderSnaps(); sync(); });
  U.on('leave', () => close());
  let syncT = null;   // typing: refresh the comment count and panel button a moment after, not on every key
  U.on('input', () => { clearTimeout(syncT); syncT = setTimeout(sync, 300); });

  // buttons
  const pb = $('#btn-panel'); if (pb) pb.onclick = toggle;
  const nb = $('#btn-notes'); if (nb) nb.onclick = () => (current() === 'comments' ? close() : open('comments'));
  const sb = $('#btn-style'); if (sb) sb.onclick = () => (current() === 'style' ? close() : open('style'));
  sync();
  return { open, close, toggle, current };
})();
