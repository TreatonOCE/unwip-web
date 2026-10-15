// Unwip - pictures inside chapters (maps, sketches, chapter art).
// A picture sits in its own paragraph: <p style="text-align:center"><img class="doc-img" data-w data-h style="width:60%"></p>.
// It's shrunk to at most 1600 px on the way in and stored inside the chapter, so it travels with
// backups, sync, snapshots and every export (PDF, e-book, Word, Google Docs).
window.UnwipImages = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, editor, S, api, I } = U;
  const MAX = 1600;

  // ---- shrink a picture to a sensible size (keeps transparency as PNG, photos become JPEG)
  async function shrink(blob) {
    if (/gif/.test(blob.type) && blob.size < 1.5e6) {   // keep small GIFs (they may be animated)
      const src = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      const bmp = await createImageBitmap(blob); return { src, w: bmp.width, h: bmp.height };
    }
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(bmp, 0, 0, w, h);
    let alpha = false;
    if (/png|webp|gif/.test(blob.type)) { const d = g.getImageData(0, 0, w, h).data; for (let i = 3; i < d.length; i += 16) if (d[i] < 250) { alpha = true; break; } }
    const src = alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.86);
    return { src, w, h };
  }
  // pictures already inside a document (data: addresses): load through an <img>, then shrink the same way
  async function shrinkDataURL(src) {
    const img = new Image(); img.src = src; await img.decode();
    const type = (/^data:([^;]+)/.exec(src) || [])[1] || 'image/png';
    const bin = atob(src.split(',')[1]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return shrink(new Blob([bytes], { type }));
  }
  const imgHTML = (p, pct = 60) => `<img class="doc-img" src="${p.src}" data-w="${p.w}" data-h="${p.h}" style="width: ${pct}%" alt="">`;

  // ---- put a picture into the chapter, in its own centred paragraph after the current one
  function insertPicture(p) {
    if (!S.docId) { U.toast('Open a chapter first.'); return; }
    const sel = getSelection();
    let block = sel.rangeCount && editor.contains(sel.anchorNode) ? U.currentBlock(sel.anchorNode) : null;
    const para = document.createElement('p'); para.style.textAlign = 'center'; para.className = 'img-p';
    para.innerHTML = imgHTML(p);
    if (block && !block.textContent.trim() && !block.querySelector('img')) block.replaceWith(para);
    else if (block) block.after(para);
    else editor.appendChild(para);
    if (!para.nextElementSibling) { const after = document.createElement('p'); after.innerHTML = '<br>'; para.after(after); }
    const r = document.createRange(); r.selectNodeContents(para.nextElementSibling); r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
    U.scheduleSave(); U.updateCountsSoon();
    select(para.querySelector('img'));
  }
  async function fromFiles(files) {
    const imgs = [...files].filter(f => /^image\//.test(f.type));
    for (const f of imgs) { try { insertPicture(await shrink(f)); } catch { U.toast(`Couldn’t read ${esc(f.name || 'that picture')}.`, 'warn'); } }
    return imgs.length;
  }
  async function pick() {
    const f = await api.imagePick(); if (!f) return;
    try { insertPicture(await shrink(new Blob([f.bytes], { type: f.type }))); } catch { U.toast('Couldn’t read that picture.', 'warn'); }
  }
  const btn = $('#btn-image'); if (btn) { btn.onmousedown = e => e.preventDefault(); btn.onclick = pick; }

  // paste and drop: pictures are handled here, before the normal text paste
  document.addEventListener('paste', async e => {
    if (!editor.contains(e.target) && e.target !== editor) return;
    const dt = e.clipboardData, files = [...(dt.files || [])].filter(f => /^image\//.test(f.type));
    const text = dt.getData('text/plain');
    if (!files.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (!text.trim()) { await fromFiles(files); return; }
    // text with pictures (a note from the iPhone's Notes app, a web page…): the text's own picture tags point at
    // things only the other app can see, and the pictures themselves come as files. Put them in, in order.
    const pics = [];
    for (const f of files) { try { pics.push(await shrink(f)); } catch {} }
    let html = dt.getData('text/html'); let used = 0;
    if (html) html = html.replace(/<img\b[^>]*>/gi, tag => { if (/src=["']data:image/i.test(tag)) return tag; const p = pics[used++]; return p ? `<p style="text-align:center">${imgHTML(p)}</p>` : ''; });
    else html = U.esc(text).split(/\n{2,}|\r\n\r\n/).map(x => `<p>${x.replace(/\n/g, '<br>')}</p>`).join('');
    for (; used < pics.length; used++) html += `<p style="text-align:center">${imgHTML(pics[used])}</p>`;   // any left over go at the end
    await U.pasteContent({ html, text });
  }, true);
  document.addEventListener('drop', async e => {
    if (!editor.contains(e.target)) return;
    const files = [...(e.dataTransfer.files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const r = document.caretRangeFromPoint(e.clientX, e.clientY); if (r) { getSelection().removeAllRanges(); getSelection().addRange(r); }
    await fromFiles(files);
  }, true);

  // ---- click a picture: a small bar for size, alignment and removing it
  const bar = document.createElement('div'); bar.className = 'img-bar hidden';
  bar.innerHTML = `${[['25', 'Small'], ['50', 'Medium'], ['75', 'Large'], ['100', 'Full width']].map(([v, l]) => `<button data-w="${v}" data-tip="${l}">${l === 'Full width' ? 'Full' : l[0]}</button>`).join('')}<span></span>
    <button data-a="left" data-tip="Align left">⇤</button><button data-a="center" data-tip="Centre">↔</button><button data-a="right" data-tip="Align right">⇥</button><span></span>
    <button data-del data-tip="Remove picture">${I.x}</button>`;
  document.body.appendChild(bar);
  const ring = document.createElement('div'); ring.className = 'img-ring hidden'; document.body.appendChild(ring);
  let cur = null;
  function place() {
    if (!cur || !document.body.contains(cur)) return deselect();
    const r = cur.getBoundingClientRect();
    ring.style.cssText = `left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px`;
    bar.style.left = Math.max(8, r.left + r.width / 2 - bar.offsetWidth / 2) + 'px';
    bar.style.top = Math.max(60, r.top - bar.offsetHeight - 10) + 'px';
    const w = parseInt(cur.style.width) || 60;
    $$('[data-w]', bar).forEach(b => b.classList.toggle('on', +b.dataset.w === w));
    const al = (cur.parentElement.style.textAlign || 'center');
    $$('[data-a]', bar).forEach(b => b.classList.toggle('on', b.dataset.a === al));
  }
  function select(img) { cur = img; bar.classList.remove('hidden'); ring.classList.remove('hidden'); requestAnimationFrame(place); }
  function deselect() { cur = null; bar.classList.add('hidden'); ring.classList.add('hidden'); }
  editor.addEventListener('click', e => { const img = e.target.closest('img.doc-img'); if (img) select(img); else deselect(); });
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !cur) return;
    if (b.dataset.w) cur.style.width = b.dataset.w + '%';
    if (b.dataset.a) cur.parentElement.style.textAlign = b.dataset.a;
    if (b.hasAttribute('data-del')) { const p = cur.parentElement; cur.remove(); if (p && !p.textContent.trim() && !p.querySelector('img')) p.innerHTML = '<br>'; deselect(); }
    U.scheduleSave(); place();
  });
  document.addEventListener('keydown', e => {
    if (!cur) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement === editor) { e.preventDefault(); bar.querySelector('[data-del]').click(); }
    else if (e.key === 'Escape') deselect();
    else if (!e.ctrlKey && !e.altKey && e.key.length === 1) deselect();
  }, true);
  U.editorWrap.addEventListener('scroll', () => { if (cur) place(); }, { passive: true });
  window.addEventListener('resize', () => { if (cur) place(); });
  U.on('doc', deselect); U.on('view', deselect); U.on('leave', deselect);

  return { shrink, shrinkDataURL, insertPicture, pick };
})();
