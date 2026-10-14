// Unwip - one font for the whole book. Sets the font of the text, the chapter titles and headings, and (if you
// like) synopses, cards and split view, and clears the fonts that came in with pasted or imported text, so every
// chapter, sheet, note and template entry follows it. Can also be your default for new books, or go to every book.
window.UnwipBookFont = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;

  // take out font names (and, if asked, sizes) written onto the text itself
  function clean(html, sizes) {
    if (!html || !/font-family|font-size|<font/i.test(html)) return null;
    const d = document.createElement('div'); d.innerHTML = html; let changed = false;
    d.querySelectorAll('[style]').forEach(el => {
      const st = el.style;
      if (st.fontFamily) { st.removeProperty('font-family'); changed = true; }
      if (sizes && st.fontSize) { st.removeProperty('font-size'); changed = true; }
      if (st.font) { st.removeProperty('font'); changed = true; }
      if (!el.getAttribute('style').trim()) el.removeAttribute('style');
    });
    d.querySelectorAll('font').forEach(f => { if (f.hasAttribute('face') || (sizes && f.hasAttribute('size'))) { changed = true; f.removeAttribute('face'); if (sizes) f.removeAttribute('size'); } if (!f.attributes.length) f.replaceWith(...f.childNodes); });
    // a <span> with nothing left on it does nothing
    d.querySelectorAll('span').forEach(sp => { if (!sp.attributes.length) sp.replaceWith(...sp.childNodes); });
    return changed ? d.innerHTML : null;
  }
  const docsOf = project => { const out = []; for (const r of project.binder) { if (r.kind === 'trash') continue; U.walkTree(r.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); }); } return out; };
  function setFonts(style, font, o) {
    style.font = font;
    if (o.heads) for (const h of ['h1', 'h2', 'h3']) style.headings[h].font = font;
    if (o.display) style.displayFont = font; else delete style.displayFont;
    if (o.size) style.size = o.size;
  }

  async function open() {
    if (!S.project) return U.toast('Open a book first.');
    const st = S.project.style, all = docsOf(S.project);
    let mixed = 0;
    await U.flushSave();
    for (const n of all) { const h = n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => ''); if (/font-family|font-size|<font[^>]*(face|size)/i.test(h || '')) mixed++; }
    const body = document.createElement('div'); body.className = 'bf';
    body.innerHTML = `
      <p class="hint">Changes the font everywhere in “${esc(S.project.title || 'this book')}”: chapters, character and place sheets, notes, template entries, titles and headings. Exports use it too, except Agent submission format, which always uses its own.</p>
      <div class="form-grid">
        <div class="field"><label>Font</label><select id="bf-font">${U.fontOptionsHTML(st.font)}</select></div>
        <div class="field"><label>Text size</label><select id="bf-size"><option value="">Keep ${st.size}pt</option>${[10, 10.5, 11, 11.5, 12, 13, 14].map(z => `<option value="${z}">${z}pt</option>`).join('')}</select></div>
      </div>
      <div class="bf-prev" id="bf-prev"><b>Chapter One</b>The lantern swung once in the dark, and every door along the street went quiet.</div>
      <label class="check"><input type="checkbox" id="bf-heads" checked><span>Titles and headings too<small>Chapter titles, and Heading 1, 2 and 3 inside documents.</small></span></label>
      <label class="check"><input type="checkbox" id="bf-display" ${st.displayFont ? 'checked' : ''}><span>Synopses, index cards and split view too<small>Otherwise they keep Unwip’s own tidy font.</small></span></label>
      <label class="check"><input type="checkbox" id="bf-clean" ${mixed ? 'checked' : ''}><span>Remove fonts and text sizes that came in with pasted or imported text${mixed ? ` <b>(${mixed} document${mixed === 1 ? '' : 's'} have some)</b>` : ''}<small>Without this, words pasted from Word, Google Docs or Scrivener keep the font and size they came with. Bold, italics, colours and everything else stay.</small></span></label>
      <div class="bf-scope"><b>Use it for</b>
        <label class="check"><input type="radio" name="bf-scope" value="book" checked><span>This book</span></label>
        <label class="check"><input type="radio" name="bf-scope" value="default"><span>This book, and every new book from now on</span></label>
        <label class="check"><input type="radio" name="bf-scope" value="all"><span>Every book I have, and every new one<small>Changes all your books in this library. Each changed chapter gets a snapshot first.</small></span></label>
      </div>`;
    const prev = () => { const f = $('#bf-font', body).value; $('#bf-prev', body).style.fontFamily = `'${f}', Georgia, serif`; };
    let ok;
    ok = await U.modal({ title: 'Font for the whole book', body, wide: true, onOpen: () => { $('#bf-font', body).onchange = prev; prev(); },
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Change the font', value: true, kind: 'primary' }] });
    if (!ok) return;
    const o = { font: $('#bf-font', body).value, size: +$('#bf-size', body).value || 0, heads: $('#bf-heads', body).checked, display: $('#bf-display', body).checked, clean: $('#bf-clean', body).checked, scope: body.querySelector('[name="bf-scope"]:checked').value };
    if (window.FolioFonts && window.FolioFonts.ensure) await window.FolioFonts.ensure(o.font).catch(() => {});

    // this book (with Undo)
    const before = JSON.parse(JSON.stringify(st)), undo = [];
    const style = JSON.parse(JSON.stringify(st)); setFonts(style, o.font, o);
    if (o.clean) for (const n of all) {
      const html = n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => null);
      const out = clean(html, true); if (out == null) continue;
      undo.push({ n, html });
      if (U.rootOf(n.id) && U.rootOf(n.id).kind === 'manuscript') await api.snapSave(S.slug, n.id, html, 'Before changing the book font', true).catch(() => {});
      await api.saveDoc(S.slug, n.id, out);
      if (n.id === S.docId) { U.editor.innerHTML = out; U.markScenes && U.markScenes(U.editor); }
    }
    U.applyStyleNow(style);
    if (o.scope !== 'book') {
      const d = (S.settings && S.settings.defaultStyle) || {};
      const ds = JSON.parse(JSON.stringify({ ...d, headings: d.headings || JSON.parse(JSON.stringify(U.DEFAULT_STYLE.headings)) }));
      setFonts(ds, o.font, o); if (!o.size) delete ds.size;
      S.settings = await api.setSettings({ defaultStyle: ds });
    }
    let others = 0, skipped = [];
    if (o.scope === 'all') {
      const list = await api.listProjects().catch(() => []);
      for (const p of list) {
        if (p.slug === S.slug) continue;
        try {
          const busy = api.othersOpen ? await api.othersOpen(p.slug).catch(() => null) : null;
          if (busy && busy.length) { skipped.push(p.title || p.slug); continue; }
          const proj = await api.openProject(p.slug); if (!proj || !proj.style) continue;
          proj.style.headings = proj.style.headings || JSON.parse(JSON.stringify(U.DEFAULT_STYLE.headings));
          setFonts(proj.style, o.font, o);
          if (o.clean) for (const n of docsOf(proj)) {
            const html = await api.loadDoc(p.slug, n.id).catch(() => null); const out = clean(html, true); if (out == null) continue;
            await api.snapSave(p.slug, n.id, html, 'Before changing the book font', true).catch(() => {});
            await api.saveDoc(p.slug, n.id, out);
          }
          await api.saveProjectMeta(p.slug, proj); others++;
        } catch (e) { skipped.push(p.title || p.slug); }
      }
    }
    const msg = `The whole book is now in ${esc(o.font)}${undo.length ? ` (fonts cleared from ${undo.length} document${undo.length === 1 ? '' : 's'})` : ''}${o.scope === 'default' ? ', and new books will be too' : ''}${o.scope === 'all' ? `, and so ${others === 1 ? 'is 1 other book' : `are ${others} other books`}${skipped.length ? ` (skipped, open on another computer or unreadable: ${esc(skipped.join(', '))})` : ''}` : ''}.`;
    U.toastAction(msg, 'Undo', async () => {
      for (const u of undo) { await api.saveDoc(S.slug, u.n.id, u.html); if (u.n.id === S.docId) { U.editor.innerHTML = u.html; U.markScenes && U.markScenes(U.editor); } }
      U.applyStyleNow(before);
      U.toast(o.scope === 'all' ? 'This book is back as it was. Other books keep the new font (each changed chapter has a snapshot).' : 'Font change undone.');
    }, 15000);
  }

  return { open, clean };
})();
