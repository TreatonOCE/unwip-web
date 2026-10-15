// Unwip - one chapter in its own window (for a second screen). Opened from the main window; while it's open, this
// is the only place that chapter is edited. It saves as you type, tells the main window the word count, and saves
// once more when closed.
(function () {
  'use strict';
  const api = window.folio, Clip = window.FolioClip;
  const q = new URLSearchParams(location.search), slug = q.get('slug'), id = q.get('id');
  const $ = s => document.querySelector(s);
  const editor = $('#editor');
  const countWords = t => (String(t).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).length;
  let dirty = false, timer = null, saving = null, lastSaved = '';

  try { const pref = localStorage.getItem('folio-theme') || 'system'; document.documentElement.dataset.theme = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'; } catch {}

  function applyStyle(st) {
    const qf = Clip.quoteFamily, set = (k, v) => editor.style.setProperty(k, v);
    set('--doc-font', qf(st.font)); set('--doc-size', st.size + 'pt'); set('--doc-lh', st.lineHeight);
    set('--doc-indent', st.indent + 'in'); set('--doc-pspace', st.paraSpacing + 'pt'); set('--doc-align', st.justify ? 'justify' : 'left');
    for (const h of ['h1', 'h2', 'h3']) { const s = (st.headings || {})[h]; if (!s) continue;
      set(`--${h}-font`, qf(s.font)); set(`--${h}-size`, s.size + 'pt'); set(`--${h}-align`, s.align); set(`--${h}-weight`, s.bold ? 700 : 400); set(`--${h}-style`, s.italic ? 'italic' : 'normal'); set(`--${h}-before`, s.spaceBefore + 'pt'); set(`--${h}-after`, s.spaceAfter + 'pt'); }
    editor.classList.toggle('no-first-indent', !!st.noIndentFirst);
    $('#page').style.setProperty('--page-width', (st.pageWidth || 720) + 'px');
  }
  const words = () => countWords(editor.innerText);
  const showCount = () => { $('#po-count').textContent = `${words().toLocaleString()} words`; };
  async function save() {
    clearTimeout(timer);
    if (!dirty) return saving;
    dirty = false;
    const html = editor.innerHTML;
    saving = (async () => {
      try { await api.saveDoc(slug, id, html); lastSaved = html; api.popoutSaved(slug, id, words()); $('#po-saved').textContent = 'Saved'; }
      catch (e) { dirty = true; $('#po-saved').textContent = 'Not saved yet, trying again…'; timer = setTimeout(save, 5000); }
    })();
    return saving;
  }
  window.__flush = async () => { await save(); await saving; return 1; };
  window.__unsaved = () => dirty ? editor.innerHTML : null;

  window.addEventListener('blur', () => { if (dirty) save(); });
  editor.addEventListener('input', () => { dirty = true; $('#po-saved').textContent = ''; clearTimeout(timer); timer = setTimeout(save, 700); showCount(); });
  editor.addEventListener('paste', e => {
    e.preventDefault();
    const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
    const st = window.__style || {};
    document.execCommand('insertHTML', false, html ? Clip.cleanPaste(html, { docFont: st.font, docSize: st.size }) : Clip.textToHTML(text));
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); dirty = true; save(); } });
  for (const [b, cmd] of [['#po-b', 'bold'], ['#po-i', 'italic'], ['#po-u', 'underline']]) { const el = $(b); el.addEventListener('mousedown', e => e.preventDefault()); el.onclick = () => { document.execCommand(cmd); editor.dispatchEvent(new Event('input')); }; }
  $('#po-back').onclick = async () => { await window.__flush(); api.popoutBack(slug, id); };
  // changed by another device (Dropbox) while open here: take it in if nothing's been typed since the last save
  api.onExternalChange(async info => {
    if (info.id !== id) return;
    // typing here too: this window's words win, and the other device's version goes to Snapshots so it isn't lost
    if (dirty) { const theirs = await api.loadDoc(slug, id); if (theirs && theirs !== lastSaved && theirs !== editor.innerHTML) { await api.snapSave(slug, id, theirs, 'Version from another device', false).catch(() => {}); lastSaved = theirs; $('#po-saved').textContent = 'Another device changed this chapter: its version is in Snapshots'; } return; }
    const html = await api.loadDoc(slug, id);
    if (html && html !== lastSaved && html !== editor.innerHTML) { const top = $('.po-main').scrollTop; editor.innerHTML = html; lastSaved = html; showCount(); $('.po-main').scrollTop = top; $('#po-saved').textContent = 'Up to date'; }
  });

  (async () => {
    try { if (window.FolioFonts) await window.FolioFonts.loadImported(await api.importedFonts()); } catch {}
    const p = await api.openProject(slug);
    let title = 'Chapter';
    (function walk(l) { for (const n of l || []) { if (n.id === id) title = n.title || 'Untitled'; if (n.children) walk(n.children); } })(p.binder);
    window.__style = p.style || {};
    applyStyle(p.style || {});
    $('#po-title').textContent = title; document.title = `${title} — ${p.title || 'Unwip'}`;
    editor.innerHTML = (await api.loadDoc(slug, id)) || '<p><br></p>';
    lastSaved = editor.innerHTML;
    showCount();
    editor.focus();
  })().catch(e => { $('#po-title').textContent = 'Couldn’t open this chapter: ' + (e.message || e); editor.contentEditable = 'false'; });
})();
