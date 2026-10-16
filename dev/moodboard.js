// Unwip - Moodboard: boards of pictures, notes and links (Plan › Moodboard).
// Moved out of app.js unchanged in the October 2026 tidy-up; it uses the shared toolbox (window.__unwip).
window.UnwipMood = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { S, I, $, api, esc, on, uid, confirmBox, promptText, showMenu, toastAction, scheduleMeta } = U;
  S.mediaCache = {};
  function boards() {
    S.project.boards = S.project.boards || [];
    if (!S.project.boards.length) S.project.boards.push({ id: uid(), title: 'Inspiration', items: [] });
    if (!S.moodBoard || !S.project.boards.find(b => b.id === S.moodBoard)) S.moodBoard = S.project.boards[0].id;
    return S.project.boards;
  }
  const curBoard = () => boards().find(b => b.id === S.moodBoard);
  async function mediaURL(file) {
    if (!S.mediaCache[file]) S.mediaCache[file] = await api.mediaGet(S.slug, file);
    return S.mediaCache[file];
  }
  const NOTE_COLOURS = ['#fff3a3', '#ffd6c9', '#d3ecff', '#d9f2d0', '#eadcff'];
  function renderMood() {
    const mv = $('#mood-view');
    const list = boards(), b = curBoard();
    const zoom = S.moodZoom || 1;
    mv.innerHTML = `
      <div class="mb-head">
        <select id="mb-board" title="Board">${list.map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
        <button class="icon-btn small" id="mb-more" title="Board options">${I.dots}</button>
        <span class="mb-sep"></span>
        <button class="btn small" id="mb-img">${I.image}<span>Images</span></button>
        <button class="btn small" id="mb-note">${I.sticky}<span>Note</span></button>
        <button class="btn small" id="mb-colour">${I.palette}<span>Colour</span></button>
        <span class="mb-hint">Drag images in from your folders, or paste them (Ctrl+V)</span>
        <span class="mb-zoom"><input type="range" id="mb-zoom" min="0.3" max="1.5" step="0.05" value="${zoom}"><span>${Math.round(zoom * 100)}%</span></span>
      </div>
      <div class="mb-wrap" id="mb-wrap"><div class="mb-canvas" id="mb-canvas" style="transform:scale(${zoom})"></div>
        ${b.items.length ? '' : '<div class="mb-empty"><b>Empty board</b><span>Add pictures of places, faces, clothes, weapons, colours, anything that sets the mood. Drag images straight in from File Explorer or a browser, or paste them.</span></div>'}
      </div>`;
    const canvas = $('#mb-canvas', mv), wrap = $('#mb-wrap', mv);
    for (const it of b.items) canvas.appendChild(moodItem(it));
    $('#mb-board', mv).onchange = e => { S.moodBoard = e.target.value; renderMood(); };
    $('#mb-more', mv).onclick = e => showMenu(e.clientX, e.clientY, [
      { label: 'New board…', action: async () => { const t = await promptText('New board', 'Board name (e.g. Mara, The Moor, Costumes)', ''); if (!t) return; const nb = { id: uid(), title: t, items: [] }; S.project.boards.push(nb); S.moodBoard = nb.id; scheduleMeta(); renderMood(); } },
      { label: 'Rename board…', action: async () => { const t = await promptText('Rename board', 'Board name', b.title); if (!t) return; b.title = t; scheduleMeta(); renderMood(); } },
      { sep: true },
      { label: 'Delete board…', danger: true, disabled: list.length < 2, action: async () => { if (await confirmBox('Delete board?', `“${esc(b.title)}” and everything on it will be removed.`, 'Delete', true)) { S.project.boards.splice(S.project.boards.indexOf(b), 1); S.moodBoard = null; scheduleMeta(); renderMood(); } } }
    ]);
    // place new things in the middle of what you can see
    const viewCentre = () => ({ x: (wrap.scrollLeft + wrap.clientWidth / 2) / zoom, y: (wrap.scrollTop + wrap.clientHeight / 2) / zoom });
    const addItem = it => { b.items.push(it); scheduleMeta(); renderMood(); };
    $('#mb-img', mv).onclick = async () => {
      const files = await api.mediaPick(S.slug); const c = viewCentre();
      files.forEach((f, i) => b.items.push({ id: uid(), type: 'image', file: f.file, x: c.x - 160 + i * 30, y: c.y - 120 + i * 30, w: 320, h: 240 }));
      if (files.length) { scheduleMeta(); renderMood(); }
    };
    $('#mb-note', mv).onclick = () => { const c = viewCentre(); addItem({ id: uid(), type: 'note', text: '', color: NOTE_COLOURS[b.items.filter(i => i.type === 'note').length % NOTE_COLOURS.length], x: c.x - 110, y: c.y - 90, w: 220, h: 180, focus: true }); };
    $('#mb-colour', mv).onclick = () => { const c = viewCentre(); addItem({ id: uid(), type: 'colour', color: '#6a4c93', label: '', x: c.x - 70, y: c.y - 80, w: 140, h: 160 }); };
    $('#mb-zoom', mv).oninput = e => { S.moodZoom = +e.target.value; canvas.style.transform = `scale(${S.moodZoom})`; e.target.nextElementSibling.textContent = Math.round(S.moodZoom * 100) + '%'; };
    $('#mb-zoom', mv).onchange = () => renderMood();
    // drop image files from Explorer or a browser
    wrap.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('drop'); } });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drop'));
    wrap.addEventListener('drop', async e => {
      wrap.classList.remove('drop');
      const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
      if (!files.length) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const x = (e.clientX - r.left + wrap.scrollLeft) / zoom, y = (e.clientY - r.top + wrap.scrollTop) / zoom;
      await addImageFiles(files, x, y);
    });
  }
  async function addImageFiles(files, x, y) {
    const b = curBoard();
    for (const [i, f] of files.entries()) {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const file = await api.mediaAdd(S.slug, bytes, ext);
      // keep the picture's shape
      let w = 320, h = 240;
      try { const bmp = await createImageBitmap(f); const ratio = bmp.height / bmp.width; w = Math.min(380, bmp.width); h = Math.round(w * ratio); } catch {}
      b.items.push({ id: uid(), type: 'image', file, x: x - w / 2 + i * 30, y: y - h / 2 + i * 30, w, h });
    }
    scheduleMeta(); renderMood();
  }
  document.addEventListener('paste', async e => {
    if (S.view !== 'mood' || e.target.closest('.mb-note-text, input, textarea')) return;
    const imgs = [...e.clipboardData.items].filter(i => i.type.startsWith('image/')).map(i => i.getAsFile()).filter(Boolean);
    const wrap = $('#mb-wrap'); if (!wrap) return;
    const z = S.moodZoom || 1, c = { x: (wrap.scrollLeft + wrap.clientWidth / 2) / z, y: (wrap.scrollTop + wrap.clientHeight / 2) / z };
    if (imgs.length) { e.preventDefault(); await addImageFiles(imgs, c.x, c.y); return; }
    const text = e.clipboardData.getData('text/plain');
    if (text) { e.preventDefault(); curBoard().items.push({ id: uid(), type: 'note', text, color: NOTE_COLOURS[0], x: c.x - 110, y: c.y - 90, w: 240, h: 180 }); scheduleMeta(); renderMood(); }
  });
  function moodItem(it) {
    const el = document.createElement('div');
    el.className = 'mb-item mb-' + it.type;
    el.style.cssText = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;`;
    if (it.type === 'image') {
      el.innerHTML = '<div class="mb-img-loading"></div>';
      mediaURL(it.file).then(url => { if (url) el.innerHTML = `<img src="${url}" draggable="false" alt="">`; else el.innerHTML = '<div class="mb-missing">Image missing</div>'; addHandles(); });
    } else if (it.type === 'note') {
      el.style.background = it.color;
      el.innerHTML = `<div class="mb-note-text" contenteditable="true" spellcheck="true" data-placeholder="Write a note…"></div>`;
      const t = el.firstChild; t.innerText = it.text || '';
      t.oninput = () => { it.text = t.innerText; scheduleMeta(); };
      if (it.focus) { delete it.focus; setTimeout(() => t.focus(), 30); }
    } else if (it.type === 'colour') {
      el.innerHTML = `<label class="mb-swatch" style="background:${esc(it.color)}"><input type="color" value="${esc(it.color)}"></label><input class="mb-colour-label" value="${esc(it.label || '')}" placeholder="${esc(it.color)}">`;
      const ci = $('input[type=color]', el), sw = $('.mb-swatch', el), lab = $('.mb-colour-label', el);
      ci.oninput = () => { it.color = ci.value; sw.style.background = ci.value; lab.placeholder = ci.value; scheduleMeta(); };
      lab.oninput = () => { it.label = lab.value; scheduleMeta(); };
    }
    function addHandles() {
      if ($('.mb-del', el)) return;
      const del = document.createElement('button'); del.className = 'mb-del'; del.title = 'Remove'; del.innerHTML = I.x;
      const rs = document.createElement('i'); rs.className = 'mb-resize'; rs.title = 'Drag to resize';
      el.append(del, rs);
      del.onclick = e => { e.stopPropagation(); const b = curBoard(); b.items.splice(b.items.indexOf(it), 1); scheduleMeta(); renderMood(); toastAction('Removed from the board.', 'Undo', () => { b.items.push(it); scheduleMeta(); renderMood(); }, 6000); };
      rs.onmousedown = e => drag(e, 'resize');
    }
    if (it.type !== 'image') addHandles();
    el.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('.mb-del, .mb-resize, input, [contenteditable]:focus')) return;
      if (e.target.closest('[contenteditable]') && e.detail > 1) return;   // double-click to edit a note
      drag(e, 'move');
    });
    function drag(e, mode) {
      e.preventDefault();
      const b = curBoard();
      b.items.push(...b.items.splice(b.items.indexOf(it), 1)); el.parentNode.appendChild(el);   // bring to front
      const z = S.moodZoom || 1, sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, ow = it.w, oh = it.h, ratio = oh / ow;
      el.classList.add('active');
      const mm = ev => {
        const dx = (ev.clientX - sx) / z, dy = (ev.clientY - sy) / z;
        if (mode === 'move') { it.x = Math.max(0, Math.round(ox + dx)); it.y = Math.max(0, Math.round(oy + dy)); el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
        else {
          it.w = Math.max(80, Math.round(ow + dx));
          it.h = it.type === 'image' && !ev.shiftKey ? Math.round(it.w * ratio) : Math.max(60, Math.round(oh + dy));
          el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
        }
      };
      const mu = () => { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); el.classList.remove('active'); scheduleMeta(); };
      document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
    }
    return el;
  }
  return { render: renderMood };
})();
