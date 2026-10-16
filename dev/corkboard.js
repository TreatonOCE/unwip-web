// Unwip - Corkboard: index cards for the binder's items, to read, reorder and edit at a glance (Plan › Corkboard).
// Moved out of app.js unchanged in the October 2026 tidy-up; it uses the shared toolbox (window.__unwip).
// Checked by tests/web/corkboard.py.
window.UnwipCork = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, I, $, $$, api, esc, fmt, uid, toast, findNode, rootOf, isInside, openDoc, setView, renderBinder, scheduleMeta, sheetFor, sheetTemplate, editStatuses, folderWords, iconHTML, newTitleFor, statusColor, statusName, statusOptions } = U;
  function corkContainer() {
    S.corkPath = (S.corkPath && S.corkPath.length && S.corkPath.every(id => findNode(id))) ? S.corkPath : ['root-manuscript'];
    return findNode(S.corkPath[S.corkPath.length - 1]).node;
  }
  function renderCork() {
    const cv = $('#cork-view');
    const box = corkContainer();
    const size = (() => { try { return localStorage.getItem('folio-cork-size') || 'm'; } catch { return 'm'; } })();
    const crumbs = S.corkPath.map((id, i) => { const n = findNode(id).node; return `<button class="ck-crumb" data-i="${i}" data-id="${id}">${esc(n.title)}</button>`; }).join('<span class="ck-sep">›</span>');
    const roots = S.project.binder.filter(r => r.root && r.kind !== 'trash');
    const kids = box.children || [];
    cv.innerHTML = `
      <div class="ck-head">
        <div class="ck-crumbs"><select class="ck-root" title="Which section to show">${roots.map(r => `<option value="${r.id}" ${r.id === S.corkPath[0] ? 'selected' : ''}>${esc(r.title)}</option>`).join('')}</select>${S.corkPath.length > 1 ? '<span class="ck-sep">›</span>' + crumbs.split('<span class="ck-sep">›</span>').slice(1).join('<span class="ck-sep">›</span>') : ''}</div>
        <div class="ck-tools">
          <div class="seg" title="Card size">${['s', 'm', 'l'].map(k => `<button data-size="${k}" class="${k === size ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div>
          <button class="btn small" id="ck-add-folder">+ Folder card</button>
          <button class="btn small primary" id="ck-add">+ Card</button>
        </div>
      </div>
      <div class="ck-grid size-${size}" id="ck-grid">
        ${kids.map((n, i) => {
          const words = folderWords(n);
          const isF = n.type === 'folder';
          const count = isF ? (n.children || []).length : 0;
          return `<div class="ck-card ${isF ? 'folder' : ''}" style="--st:${isF ? 'var(--line)' : statusColor(n.status)}" draggable="true" data-id="${n.id}">
            <i class="ck-pin"></i>
            <div class="ck-top"><span class="ck-num">${i + 1}</span>${n.icon ? `<span class="ck-icon">${iconHTML(n, '')}</span>` : ''}<input class="ck-title" value="${esc(n.title || '')}" placeholder="Untitled" spellcheck="false">${n.label ? `<span class="lbl-chip" style="--lc:${esc(n.label.c)}" title="Label">${esc(n.label.n)}</span>` : ''}</div>
            <textarea class="ck-syn" placeholder="${isF ? 'What this part covers…' : 'What happens…'}">${esc(n.synopsis || '')}</textarea>
            <div class="ck-foot">
              ${isF ? `<span class="ck-chip">${count} item${count === 1 ? '' : 's'}</span>` : `<button class="ck-chip ck-status" title="Click to change status (right-click to edit labels)">${esc(statusName(n.status))}</button>`}
              ${n.pov ? `<span class="ck-chip pov">${esc(n.pov)}</span>` : ''}
              <span class="ck-words">${fmt(words)}</span>
              <button class="ck-open" title="${isF ? 'Open this folder' : 'Open in the editor'}">${isF ? 'Open ›' : 'Write ›'}</button>
            </div>
          </div>`;
        }).join('')}
        <button class="ck-new" id="ck-new" tabindex="-1">${I.plus}<span>New card</span></button>
      </div>
      <p class="ol-tip">Drag cards to reorder (the binder and outline follow). Double-click a card to open it. Cards edit the same synopsis and status you see in the outline.</p>`;
    const sizeBtns = $$('.seg [data-size]', cv);
    sizeBtns.forEach(b => b.onclick = () => { try { localStorage.setItem('folio-cork-size', b.dataset.size); } catch {} renderCork(); });
    $('.ck-root', cv).onchange = e => { S.corkPath = [e.target.value]; renderCork(); };
    $$('.ck-crumb', cv).forEach(b => b.onclick = () => { S.corkPath = S.corkPath.slice(0, +b.dataset.i + 1); renderCork(); });
    const addCard = async type => {
      const root = rootOf(box.id) || box;
      const node = type === 'folder' ? { id: uid(), type: 'folder', title: root.kind === 'manuscript' ? 'New part' : 'New folder', open: true, children: [] } : { id: uid(), type: 'doc', title: root.kind === 'manuscript' ? (S.corkPath.length > 1 ? 'New scene' : 'New chapter') : newTitleFor(root), words: 0 };
      box.children = box.children || []; box.children.push(node);
      if (type === 'doc' && sheetFor(root)) await api.saveDoc(S.slug, node.id, sheetTemplate(root));
      scheduleMeta(); renderBinder(); renderCork();
      const t = $(`.ck-card[data-id="${node.id}"] .ck-title`, cv); if (t) { t.focus(); t.select(); }
    };
    $('#ck-add', cv).onclick = () => addCard('doc');
    $('#ck-new', cv).onclick = () => addCard('doc');
    $('#ck-add-folder', cv).onclick = () => addCard('folder');
    const grid = $('#ck-grid', cv);
    $$('.ck-card', cv).forEach(card => {
      const n = findNode(card.dataset.id).node;
      const title = $('.ck-title', card), syn = $('.ck-syn', card);
      title.oninput = () => { n.title = title.value; scheduleMeta(); renderBinder(); };
      title.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); syn.focus(); } };
      syn.oninput = () => { n.synopsis = syn.value; scheduleMeta(); };
      const open = () => { if (n.type === 'folder') { S.corkPath.push(n.id); renderCork(); } else { setView('write'); openDoc(n.id); } };
      $('.ck-open', card).onclick = open;
      card.ondblclick = e => { if (!e.target.closest('input, textarea')) open(); };
      const st = $('.ck-status', card);
      if (st) st.oncontextmenu = e => { e.preventDefault(); editStatuses(); };
      if (st) st.onclick = () => {
        const order = statusOptions().map(x => x[0]); n.status = order[(order.indexOf(n.status || '') + 1) % order.length];
        scheduleMeta(); renderBinder(); renderCork();
      };
      // drag from anywhere on the card, including its title and synopsis; once you've clicked into one of those to
      // type, dragging there selects text instead
      card.addEventListener('mousedown', e => {
        const field = e.target.closest('input, textarea');
        card.draggable = !(field && document.activeElement === field);
        if (!e.target.closest('input, textarea, button')) {
          $$('.ck-card.sel', cv).forEach(c => c.classList.remove('sel')); card.classList.add('sel');
          S.ckSelected = n.id; S.binderActive = false;
          if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        }
      });
      card.addEventListener('dragstart', e => { S.ckDrag = n.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-folio-card', n.id); });
      card.addEventListener('dragend', () => { S.ckDrag = null; card.classList.remove('dragging'); $$('.ck-before, .ck-after', cv).forEach(c => c.classList.remove('ck-before', 'ck-after')); });
    });
    // Dropping works anywhere over the cards, gaps included: the nearest card decides the spot, and a line shows it.
    let ckAt = null;
    const ckSpot = e => {
      let best = null, bd = 1e9;
      for (const c of $$('.ck-card', grid)) {
        if (c.dataset.id === S.ckDrag) continue;
        const r = c.getBoundingClientRect();
        const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right), dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom), d = dx * dx + dy * dy * 4;
        if (d < bd) { bd = d; best = { card: c, after: e.clientX > r.left + r.width / 2 }; }
      }
      return best;
    };
    grid.addEventListener('dragover', e => {
      if (!S.ckDrag) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      const at = ckSpot(e);
      if (ckAt && at && ckAt.card === at.card && ckAt.after === at.after) return;
      $$('.ck-before, .ck-after', cv).forEach(c => c.classList.remove('ck-before', 'ck-after'));
      ckAt = at; if (at) at.card.classList.add(at.after ? 'ck-after' : 'ck-before');
    });
    grid.addEventListener('dragleave', e => { if (!grid.contains(e.relatedTarget)) { $$('.ck-before, .ck-after', cv).forEach(c => c.classList.remove('ck-before', 'ck-after')); ckAt = null; } });
    grid.addEventListener('drop', e => {
      if (!S.ckDrag) return;
      e.preventDefault();
      const at = ckSpot(e); ckAt = null;
      if (!at) return;
      const src = findNode(S.ckDrag), id = at.card.dataset.id; if (!src || id === S.ckDrag) return;
      if (isInside(id, src.node)) return;
      src.list.splice(src.index, 1);
      const tgt = findNode(id);
      tgt.list.splice(tgt.index + (at.after ? 1 : 0), 0, src.node);
      S.ckDrag = null; scheduleMeta(); renderBinder(); renderCork();
    });
    // drop on a breadcrumb: move the card up to that level
    $$('.ck-crumb, .ck-root', cv).forEach(c => {
      c.addEventListener('dragover', e => { if (S.ckDrag) { e.preventDefault(); c.classList.add('drop'); } });
      c.addEventListener('dragleave', () => c.classList.remove('drop'));
      c.addEventListener('drop', e => {
        if (!S.ckDrag) return; e.preventDefault();
        const target = c.dataset.id || c.value; const src = findNode(S.ckDrag);
        if (!src || target === box.id) return;
        src.list.splice(src.index, 1); findNode(target).node.children.push(src.node);
        S.ckDrag = null; scheduleMeta(); renderBinder(); renderCork(); toast(`Moved to “${esc(findNode(target).node.title)}”.`);
      });
    });
  }
  return { render: renderCork };
})();
