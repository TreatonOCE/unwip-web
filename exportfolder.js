// Unwip - export the book as a folder of files: one Word (or Markdown, or text) file per chapter, in folders
// that match your binder, numbered so they stay in order. Scrivener, Word, Google Docs, Obsidian and most other
// writing apps can open them, so your work is never locked in here.
window.UnwipExportFolder = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;
  const Clip = window.FolioClip;
  const safe = t => (t || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Untitled';
  const pad = (i, n) => String(i + 1).padStart(String(n).length < 2 ? 2 : String(n).length, '0');

  // Markdown from Unwip's own blocks: headings, bold, italics, strikethrough, scene breaks and pictures
  function blocksToMarkdown(blocks) {
    const out = [];
    for (const b of blocks) {
      let line = '';
      for (const r of b.runs || []) {
        if (r.br) { line += '  \n'; continue; }
        if (r.img) { line += `![picture](${r.img.length < 300 ? r.img : 'picture'})`; continue; }
        let t = (r.text || '').replace(/([*_`\\[\]#])/g, '\\$1');
        if (!t.trim()) { line += t; continue; }
        const lead = t.match(/^\s*/)[0], tail = t.match(/\s*$/)[0]; t = t.trim();
        if (r.strike) t = `~~${t}~~`; if (r.italic) t = `*${t}*`; if (r.bold) t = `**${t}**`;
        line += lead + t + tail;
      }
      const text = line.trim();
      if (/^h[1-3]$/.test(b.tag)) out.push('#'.repeat(+b.tag[1]) + ' ' + text);
      else if (/^(\*\s*){3}$|^#$|^~+$/.test(text.replace(/\\/g, ''))) out.push('* * *');
      else if (b.tag === 'blockquote') out.push('> ' + text);
      else if (text) out.push(text);
    }
    return out.join('\n\n') + '\n';
  }
  const blocksToText = blocks => blocks.map(b => (b.runs || []).map(r => (r.br ? '\n' : r.text || '')).join('').trim()).filter(Boolean).join('\n\n') + '\n';

  async function open() {
    if (!S.project) return U.toast('Open a book first.');
    await U.flushSave();
    const body = document.createElement('div'); body.className = 'efx';
    const sections = S.project.binder.filter(r => r.kind !== 'trash' && (r.children || []).length);
    body.innerHTML = `
      <p class="hint">Saves your book as a folder of ordinary files, one per chapter, in folders that match your binder and numbered so they stay in order. Scrivener (File › Import › Files), Word, Google Docs, Obsidian and most writing apps can open them.</p>
      <div class="form-grid">
        <div class="field"><label>Each file as</label><select id="efx-fmt"><option value="docx">Word (.docx)</option><option value="md">Markdown (.md)</option><option value="txt">Plain text (.txt)</option></select></div>
        <div class="field"><label>What to include</label><select id="efx-what"><option value="ms">The manuscript</option><option value="all">Everything (${sections.length} sections: ${esc(sections.map(r => r.title).join(', '))})</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="efx-title" checked><span>Put each chapter’s name at the top of its file</span></label>
      <label class="check"><input type="checkbox" id="efx-syn"><span>Add synopses (as a line under the name)</span></label>
      <p class="sim-small">${api.web ? 'In a browser it downloads as one .zip file holding the folder.' : 'You’ll choose where the folder goes.'} Maps are left out (save them as pictures from the map itself).</p>`;
    const ok = await U.modal({ title: 'Export as a folder of files', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Export', value: true, kind: 'primary' }] });
    if (!ok) return;
    const fmt = $('#efx-fmt', body).value, what = $('#efx-what', body).value, withTitle = $('#efx-title', body).checked, withSyn = $('#efx-syn', body).checked;
    const roots = what === 'all' ? sections : sections.filter(r => r.kind === 'manuscript');
    const files = [], book = safe(S.project.title || 'Book');
    let docs = 0;
    const lang = (((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current || [])[0]) || 'en-AU';
    async function one(n, dir, i, count) {
      const name = `${pad(i, count)} ${safe(n.title)}`;
      if (n.type === 'folder') { for (let k = 0; k < (n.children || []).length; k++) await one(n.children[k], `${dir}${name}/`, k, n.children.length); return; }
      if (n.map) return;
      let blocks = await U.docBlocks(n.id, withTitle ? 'names' : 'none');
      if (withSyn && n.synopsis) blocks.splice(withTitle ? 1 : 0, 0, { tag: 'p', runs: [{ text: n.synopsis, italic: true }] });
      let data;
      if (fmt === 'docx') data = window.FolioDOCX.build(blocks, S.project.style, { title: n.title || '', author: (S.settings && S.settings.author) || '', lang });
      else data = new TextEncoder().encode(fmt === 'md' ? blocksToMarkdown(blocks) : blocksToText(blocks));
      files.push({ name: `${dir}${name}.${fmt}`, data }); docs++;
    }
    for (let r = 0; r < roots.length; r++) {
      const dir = what === 'all' ? `${pad(r, roots.length)} ${safe(roots[r].title)}/` : '';
      for (let i = 0; i < roots[r].children.length; i++) await one(roots[r].children[i], dir, i, roots[r].children.length);
    }
    if (!docs) return U.toast('There’s nothing to export there yet.');
    try {
      if (api.exportFolder) { const where = await api.exportFolder(book, files.map(f => ({ name: f.name, data: f.data }))); if (where) U.toast(`Exported ${docs} file${docs === 1 ? '' : 's'} to the folder “${esc(where)}”.`, '', 7000); }
      else { const zip = window.FolioEPUB.zip(files.map(f => ({ name: `${book}/${f.name}`, data: f.data }))); await api.exportBinary(zip, book, 'zip', 'Folder of files (zip)'); U.toast(`Exported ${docs} file${docs === 1 ? '' : 's'} as a .zip. Unzip it to get the folder.`, '', 7000); }
    } catch (e) { U.toast('Couldn’t export: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 8000); }
  }

  return { open, blocksToMarkdown };
})();
