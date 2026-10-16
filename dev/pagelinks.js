// Unwip - maps and pictures on a page. A character, place or thing page (and pages in sections of your own) can have
// Build pieces linked to it: the map of a town on the town's page, a coat of arms on a house, a sigil on a cult.
// They show as small pictures above the page's text (click one to open it, Back returns to the page), can be linked
// from there, from the binder's right-click menu, from Ctrl+K and from the Story Bible, and a new map can be made for
// the page in one go. Kept on the page in the binder as node.build = [ids of Build pieces]; the pieces themselves
// stay in Build, shared by every book.
window.UnwipPageLinks = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, esc } = U;
  const PAGE_ROOTS = new Set(['characters', 'places', 'items']);
  const isPage = id => { const f = id && U.findNode(id); if (!f || f.node.type !== 'doc' || f.node.map) return false; const r = U.rootOf(id); return !!r && (PAGE_ROOTS.has(r.kind) || !!r.custom); };
  const ids = n => (Array.isArray(n && n.build) ? n.build.filter(x => typeof x === 'string') : []);
  const B = () => window.UnwipBuild;
  const NAMES = { map: 'Map', magic: 'Magic system', runes: 'Rune alphabet', sigil: 'Sigil', insignia: 'Insignia', arms: 'Coat of arms', stats: 'Stat system' };

  async function pieces(list) {
    if (!B() || !list.length) return [];
    let all = []; try { all = await B().refresh(); } catch {}
    return list.map(id => all.find(x => x.id === id)).filter(Boolean);
  }

  // ---- the strip above a page's text
  let strip = null;
  async function paint() {
    const ed = document.getElementById('editor'); if (!ed) return;
    if (!strip) { strip = document.createElement('div'); strip.id = 'page-links'; strip.className = 'pg-links hidden'; ed.before(strip); }
    const id = S.docId;
    if (!isPage(id) || U.level() < 1) { strip.classList.add('hidden'); strip.innerHTML = ''; return; }
    const n = U.findNode(id).node, list = await pieces(ids(n));
    if (S.docId !== id) return;
    strip.classList.remove('hidden');
    strip.innerHTML = list.map(it => `<button type="button" class="pg-link" data-open="${esc(it.id)}" title="Open ${esc(it.title || NAMES[it.kind] || '')}">
        <span class="pg-thumb">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : esc((B().KINDS[it.kind] || {}).icon || '🗺️')}</span>
        <span class="pg-t"><b>${esc(it.title || 'Untitled')}</b><small>${esc(NAMES[it.kind] || '')}</small></span></button>`).join('')
      + `<button type="button" class="pg-add" data-link title="Link a map or another Build piece to this page">+ Map or picture</button>`;
    strip.querySelectorAll('[data-open]').forEach(b => b.onclick = () => openPiece(b.dataset.open));
    strip.querySelector('[data-link]').onclick = () => link(id);
  }
  async function openPiece(pid) {
    if (!B()) return;
    await U.flushSave();
    await B().open(pid, 'book');
  }

  // ---- linking: pick from Build (with a search), or make a new map for this page
  async function link(id) {
    id = id || S.docId;
    if (!isPage(id)) { U.toast('Open a character, place or thing page first: maps and pictures are linked to a page.'); return; }
    const f = U.findNode(id), n = f.node;
    let all = []; try { all = await B().refresh(); } catch {}
    const have = new Set(ids(n));
    const body = document.createElement('div'); body.className = 'pg-pick'; body.dataset.ownEnter = '1';
    const kinds = [...new Set(all.map(x => x.kind))];
    body.innerHTML = `<div class="pg-pick-top"><input type="search" class="pg-q" placeholder="Find a map or picture" aria-label="Find">
        <select class="pg-kind" aria-label="Kind"><option value="">Everything</option>${kinds.map(k => `<option value="${k}">${esc((B().KINDS[k] || {}).plural || k)}</option>`).join('')}</select></div>
      <div class="pg-grid"></div>
      <div class="pg-new"><button type="button" class="btn small" data-newmap>+ Make a new map for ${esc(n.title || 'this page')}</button></div>
      <p class="hint">Linked pieces show above the page. They stay in Build, so other pages and books can use them too.</p>`;
    const grid = body.querySelector('.pg-grid'), q = body.querySelector('.pg-q'), kindSel = body.querySelector('.pg-kind');
    const draw = () => {
      const t = q.value.trim().toLowerCase(), k = kindSel.value;
      const list = all.filter(x => (!k || x.kind === k) && (!t || (x.title || '').toLowerCase().includes(t))).sort((a, b) => (have.has(b.id) - have.has(a.id)) || (b.updated || 0) - (a.updated || 0));
      grid.innerHTML = list.length ? list.slice(0, 60).map(it => `<label class="pg-cell ${have.has(it.id) ? 'on' : ''}"><input type="checkbox" value="${esc(it.id)}" ${have.has(it.id) ? 'checked' : ''}>
          <span class="pg-thumb">${it.thumb ? `<img src="${esc(it.thumb)}" alt="">` : esc((B().KINDS[it.kind] || {}).icon || '🗺️')}</span><b>${esc(it.title || 'Untitled')}</b><small>${esc(NAMES[it.kind] || '')}</small></label>`).join('')
        : `<p class="hint">${all.length ? 'Nothing matches.' : 'Nothing in Build yet. Make a new map for this page below.'}</p>`;
      grid.querySelectorAll('input').forEach(c => c.onchange = () => { if (c.checked) have.add(c.value); else have.delete(c.value); c.closest('.pg-cell').classList.toggle('on', c.checked); });
    };
    q.oninput = draw; kindSel.onchange = draw; draw();
    let made = null;
    body.querySelector('[data-newmap]').onclick = async () => {
      const it = await B().create('map', { noOpen: true }); if (!it || !it.id) return;
      // name it after the page when the default was kept
      if (/^Map of the world$/.test(it.title || '') && n.title) { it.title = 'Map of ' + n.title; try { await B().put(it); } catch {} }
      made = it.id; have.add(it.id);
      const back = body.closest('.modal-back'); const ok = back && back.querySelector('.m-foot .btn.primary'); if (ok) ok.click();
    };
    const ok = await U.modal({ title: `Maps and pictures for ${esc(n.title || 'this page')}`, body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }], onOpen: () => setTimeout(() => q.focus(), 50) });
    if (!ok) return;
    const next = [...have];
    if (next.length) n.build = next; else delete n.build;
    n.mod = Date.now(); U.scheduleMeta();
    if (S.docId === id) paint();
    U.toast(next.length ? `${next.length} linked to <b>${esc(n.title || 'the page')}</b>.` : 'Nothing linked now.');
    if (made) { if (S.docId !== id) await U.openDoc(id); await openPiece(made); }
  }

  U.on('doc', () => setTimeout(paint, 0));
  U.on('level', () => setTimeout(paint, 0));
  U.on('project', () => setTimeout(paint, 0));
  return { link, paint, isPage, ids };
})();
