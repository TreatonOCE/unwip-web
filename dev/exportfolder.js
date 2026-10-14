// Unwip - export the book as a folder of files: one Word (or Markdown, or text) file per chapter, in folders
// that match your binder, numbered so they stay in order ("01 - Chapter One.docx"). Word, Google Docs, Scrivener
// (File › Import › Files), Obsidian, iA Writer and most other writing apps can open them, so your work is never
// locked in here. Also: one Word file of the manuscript laid out the way Vellum and Atticus import it.
// Before anything is written, a short summary says what's going, what isn't, and asks what to do with any
// tracked changes, because a copy can't show suggestions the way Unwip does.
window.UnwipExportFolder = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;
  const Clip = window.FolioClip;
  const safe = t => (t || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80) || 'Untitled';
  const pad = (i, n) => String(i + 1).padStart(Math.max(2, String(n).length), '0');
  const plural = (n, one, many) => `${n.toLocaleString()} ${n === 1 ? one : (many || one + 's')}`;
  const SCENE = /^\s*((\*|#|~|•|·)\s*){1,5}\s*$/;

  // ------------------------------------------------------------------ what's in it
  // counts everything under the given binder nodes, so the summary can say what's going and what isn't
  async function tally(roots) {
    const t = { docs: 0, folders: 0, words: 0, pics: 0, fns: 0, maps: 0, syn: 0, comments: new Set(), ins: 0, del: 0, tcDocs: [] };
    const visit = async n => {
      if (n.type === 'folder') { t.folders++; if (n.synopsis) t.syn++; for (const c of n.children || []) await visit(c); return; }
      if (n.map) { t.maps++; return; }
      t.docs++; if (n.synopsis) t.syn++;
      const html = (n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => '')) || '';
      t.pics += (html.match(/<img\b/gi) || []).length;
      t.fns += (html.match(/data-fn=/g) || []).length;
      for (const m of html.matchAll(/class="cmt"[^>]*data-cid="([^"]+)"/g)) t.comments.add(m[1]);
      const i = (html.match(/class="tc-ins"/g) || []).length, d = (html.match(/class="tc-del"/g) || []).length;
      if (i || d) { t.ins += i; t.del += d; t.tcDocs.push(n.title || 'Untitled'); }
      const words = (U.acceptChanges(html).replace(/<[^>]+>/g, ' ').match(/[\p{L}\p{N}’']+/gu) || []).length; t.words += words;
    };
    for (const r of roots) for (const c of r.children || []) await visit(c);
    t.comments = t.comments.size;
    return t;
  }
  // fmt: 'scriv' | 'docx' (folder) | 'md' | 'txt' | 'one' (one Word file for Vellum/Atticus)
  function summaryHTML(t, fmt, o = {}) {
    const goes = [plural(t.docs, 'document'), t.folders && fmt !== 'one' ? plural(t.folders, 'folder') : '', `${t.words.toLocaleString()} words`];
    if (t.pics && fmt !== 'txt') goes.push(plural(t.pics, 'picture'));
    if (t.fns) goes.push(fmt === 'txt' ? '' : plural(t.fns, 'footnote'));
    if (t.maps && fmt === 'scriv') goes.push(plural(t.maps, 'map') + ' as pictures');
    if (fmt === 'scriv') goes.push('synopses, labels and status');
    const left = [];
    if (t.comments) left.push(plural(t.comments, 'comment'));
    if (t.maps && fmt !== 'scriv') left.push(plural(t.maps, 'map'));
    if (t.pics && fmt === 'txt') left.push(plural(t.pics, 'picture'));
    if (t.fns && fmt === 'txt') left.push(plural(t.fns, 'footnote'));
    if (fmt !== 'scriv' && t.syn && !o.syn) left.push(plural(t.syn, 'synopsis', 'synopses'));
    if (fmt !== 'scriv') left.push('labels and status');
    if (fmt === 'one') left.push('anything outside the Manuscript');
    left.push('connections, the timeline, calendar and mood boards');
    let tc = '';
    if (t.ins + t.del) {
      const where = t.tcDocs.slice(0, 4).map(x => `“${esc(x)}”`).join(', ') + (t.tcDocs.length > 4 ? ` and ${t.tcDocs.length - 4} more` : '');
      const def = o.tcm || (fmt === 'docx' ? 'keep' : 'accept');
      tc = `<div class="xs-tc">
        <p><b>${plural(t.tcDocs.length, 'chapter')} still ${t.tcDocs.length === 1 ? 'has' : 'have'} suggested changes</b> nobody has accepted or rejected yet (${plural(t.ins, 'addition')}, ${plural(t.del, 'deletion')}), in ${where}. ${fmt === 'docx' ? 'Word can keep them as suggestions, but the other apps can’t, so' : 'The exported copy can’t show them the way Unwip does, so'} choose what the copy should say:</p>
        ${fmt === 'docx' ? `<label class="check"><input type="radio" name="xs-tcm" value="keep" ${def === 'keep' ? 'checked' : ''}><span>Keep them as suggestions in Word<small>Word shows them under Review › Track Changes, still waiting to be accepted or rejected. Google Docs shows them too.</small></span></label>` : ''}
        <label class="check"><input type="radio" name="xs-tcm" value="accept" ${def === 'accept' ? 'checked' : ''}><span>Accept them all in the copy<small>The copy reads as if you’d said yes to every suggestion.</small></span></label>
        <label class="check"><input type="radio" name="xs-tcm" value="reject" ${def === 'reject' ? 'checked' : ''}><span>Leave them all out of the copy<small>The copy reads as it did before anyone suggested anything.</small></span></label>
        <p class="sim-small">Either way your book here keeps every suggestion. To decide them one by one first, cancel, open those chapters and use the <b>Changes</b> tab in the side panel.</p>
      </div>`;
    }
    return `<div class="xs">
      <p class="xs-go"><b>Going:</b> ${goes.filter(Boolean).join(', ')}.</p>
      <p class="xs-left"><b>Not included:</b> ${left.join(', ')}. ${t.comments ? 'Comments stay here in Unwip. ' : ''}Nothing in Unwip changes.</p>
      ${tc}</div>`;
  }
  const changesChoice = box => { const r = box.querySelector('[name="xs-tcm"]:checked'); return r ? r.value : 'accept'; };
  // runs fn with the tracked changes decided as asked (docBlocks reads these; the book itself isn't touched)
  async function withChanges(mode, fn) {
    const a = Clip.keepChanges, b = Clip.changesMode;
    Clip.keepChanges = mode === 'keep'; Clip.changesMode = mode === 'reject' ? 'reject' : null;
    try { return await fn(); } finally { Clip.keepChanges = a; Clip.changesMode = b; }
  }

  // ------------------------------------------------------------------ Markdown
  // Written in the part of Markdown that Obsidian, iA Writer, Typora, Bear and GitHub all read the same way:
  //   *italics*, **bold**, ~~strikethrough~~, # headings, > quotes, - lists,
  //   scene breaks as a line of "* * *", footnotes as [^1] with the note at the end of the file,
  //   pictures as real files in a "Pictures" folder, linked with a relative path (no spaces in it).
  // Underline has no Markdown, so underlined words are kept as ordinary text.
  function blocksToMarkdown(blocks, o = {}) {
    const out = [], notes = [];
    const pic = o.picture || (() => '');
    for (const b of blocks) {
      let line = '';
      for (const r of b.runs || []) {
        if (r.br) { line += '  \n'; continue; }
        if (r.fn !== undefined) { notes.push(r.fn); line += `[^${notes.length}]`; continue; }
        if (r.img) { const p = pic(r.img); line += p ? `![picture](${p})` : ''; continue; }
        // square brackets ("[Level up]") stay as typed unless they'd turn into a link, footnote or [[wiki link]]
        let t = (r.text || '').replace(/([*_`\\<>~])/g, '\\$1').replace(/\[(?=[[^])/g, '\\[').replace(/\](?=[(\[:])/g, '\\]');
        if (!t.trim()) { line += t; continue; }
        const lead = t.match(/^\s*/)[0], tail = t.match(/\s*$/)[0]; t = t.trim();
        if (r.strike) t = `~~${t}~~`; if (r.italic) t = `*${t}*`; if (r.bold) t = `**${t}**`;
        line += lead + t + tail;
      }
      let text = line.trim();
      const plainText = text.replace(/\\/g, '');
      if (/^h[1-3]$/.test(b.tag)) { out.push('#'.repeat(+b.tag[1]) + ' ' + text); continue; }
      if (SCENE.test(plainText) && plainText) { out.push('* * *'); continue; }
      if (!text) continue;
      // a paragraph that happens to start like Markdown syntax ("1995. That year…", "# 3", "- and then") stays a paragraph
      text = text.replace(/^(\d+)([.)])(\s)/, '$1\\$2$3').replace(/^([#+-])(\s)/, '\\$1$2').replace(/^(=+|-+)$/, '\\$1');
      if (b.tag === 'blockquote') out.push('> ' + text.replace(/\n/g, '\n> '));
      else if (b.tag === 'li') out.push('- ' + text);
      else out.push(text);
    }
    // list items sit together; everything else gets a blank line between
    let md = '';
    out.forEach((p, i) => { md += (i ? (p.startsWith('- ') && out[i - 1].startsWith('- ') ? '\n' : '\n\n') : '') + p; });
    if (notes.length) md += '\n\n' + notes.map((n, i) => `[^${i + 1}]: ${n.replace(/\s*\n\s*/g, ' ')}`).join('\n');
    return md + '\n';
  }
  const blocksToText = blocks => blocks.map(b => (b.runs || []).map(r => (r.br ? '\n' : r.text || '')).join('').trim()).filter(Boolean).join('\n\n') + '\n';

  const dataBytes = src => { const m = /^data:image\/([a-z+]+);base64,(.*)$/i.exec(src || ''); if (!m) return null; const bin = atob(m[2]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return { ext: m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg'), data: a }; };
  const slugName = t => (t || 'picture').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'picture';

  async function save(files, book, docs) {
    if (api.exportFolder) { const where = await api.exportFolder(book, files.map(f => ({ name: f.name, data: f.data }))); if (where) { window.UnwipStart && window.UnwipStart.done('export'); U.toast(`Exported ${plural(docs, 'file')} to the folder “${esc(where)}”.`, '', 7000); } return where; }
    const zip = window.FolioEPUB.zip(files.map(f => ({ name: `${book}/${f.name}`, data: f.data })));
    const p = await api.exportBinary(zip, book, 'zip', 'Folder of files (zip)');
    if (p) { window.UnwipStart && window.UnwipStart.done('export'); U.toast(`Exported ${plural(docs, 'file')} as a .zip. Unzip it to get the folder.`, '', 7000); }
    return p;
  }
  const errText = e => esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));

  // ------------------------------------------------------------------ a folder of files
  async function open(preset = {}) {
    if (!S.project) return U.toast('Open a book first.');
    await U.flushSave();
    const body = document.createElement('div'); body.className = 'efx';
    const sections = S.project.binder.filter(r => r.kind !== 'trash' && r.kind !== 'conflicts' && (r.children || []).length);
    body.innerHTML = `
      <p class="hint">Saves your book as a folder of ordinary files, one per chapter, in folders that match your binder. Each name starts with a number (“01 - Chapter One”) so they stay in order in every app. Word, Google Docs, Scrivener (File › Import › Files), Obsidian and iA Writer can open them. Opening them in apps other than Word should work, but that’s not yet tested by beta testers.</p>
      <div class="form-grid">
        <div class="field"><label>Each file as</label><select id="efx-fmt"><option value="docx">Word (.docx)</option><option value="md">Markdown (.md)</option><option value="txt">Plain text (.txt)</option></select></div>
        <div class="field"><label>What to include</label><select id="efx-what"><option value="ms">The manuscript</option><option value="all">Everything (${sections.length} sections: ${esc(sections.map(r => r.title).join(', '))})</option></select></div>
      </div>
      <label class="check"><input type="checkbox" id="efx-title" checked><span>Put each chapter’s name at the top of its file</span></label>
      <label class="check"><input type="checkbox" id="efx-syn"><span>Add synopses (as a line under the name)</span></label>
      <p class="sim-small" id="efx-vellum" hidden>Using <b>Vellum</b> or <b>Atticus</b>? They import <i>one</i> Word file and split it into chapters themselves. Use <b>One Word file for Vellum or Atticus</b> in the Export menu instead.</p>
      <div id="efx-sum"><p class="sim-small">Counting what’s in it…</p></div>
      <p class="sim-small">${api.web ? 'In a browser it downloads as one .zip file holding the folder.' : 'You’ll choose where the folder goes.'}</p>`;
    if (preset.fmt) $('#efx-fmt', body).value = preset.fmt; if (preset.what) $('#efx-what', body).value = preset.what;
    const tallies = {};
    const rootsFor = what => what === 'all' ? sections : sections.filter(r => r.kind === 'manuscript');
    let token = 0;
    const refresh = async () => {
      const what = $('#efx-what', body).value, fmt = $('#efx-fmt', body).value, my = ++token;
      $('#efx-vellum', body).hidden = fmt !== 'docx';
      const was = body.querySelector('[name="xs-tcm"]:checked');
      const t = tallies[what] || (tallies[what] = await tally(rootsFor(what)));
      if (my !== token) return;
      $('#efx-sum', body).innerHTML = summaryHTML(t, fmt, { syn: $('#efx-syn', body).checked, tcm: was && !(fmt !== 'docx' && was.value === 'keep') ? was.value : null });
    };
    const ok = await U.modal({ title: 'Export as a folder of files', body, wide: true,
      onOpen: () => { ['#efx-fmt', '#efx-what', '#efx-syn'].forEach(s => { $(s, body).onchange = refresh; }); refresh(); },
      buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Export', value: true, kind: 'primary' }] });
    if (!ok) return;
    const fmt = $('#efx-fmt', body).value, what = $('#efx-what', body).value, withTitle = $('#efx-title', body).checked, withSyn = $('#efx-syn', body).checked;
    const tcm = changesChoice(body);
    const roots = rootsFor(what);
    const files = [], book = safe(S.project.title || 'Book');
    let docs = 0, picN = 0;
    const lang = (((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current || [])[0]) || 'en-AU';
    async function one(n, dir, i, count, depth) {
      const name = `${pad(i, count)} - ${safe(n.title)}`;
      if (n.type === 'folder') { for (let k = 0; k < (n.children || []).length; k++) await one(n.children[k], `${dir}${name}/`, k, n.children.length, depth + 1); return; }
      if (n.map) return;
      let blocks = await withChanges(tcm, () => U.docBlocks(n.id, withTitle ? 'names' : 'none'));
      if (withSyn && n.synopsis) blocks.splice(withTitle ? 1 : 0, 0, { tag: 'p', runs: [{ text: n.synopsis, italic: true }] });
      let data;
      if (fmt === 'docx') data = window.FolioDOCX.build(blocks, S.project.style, { title: n.title || '', author: (S.settings && S.settings.author) || '', lang });
      else if (fmt === 'md') {
        // pictures go in one "Pictures" folder at the top, linked from each file with a relative path
        let k = 0;
        const picture = src => { const b = dataBytes(src); if (!b) return ''; const f = `${pad(picN++, 999)}-${slugName(n.title)}-${++k}.${b.ext}`; files.push({ name: `Pictures/${f}`, data: b.data }); return `${'../'.repeat(depth)}Pictures/${f}`; };
        data = new TextEncoder().encode(blocksToMarkdown(blocks, { picture }));
      } else data = new TextEncoder().encode(blocksToText(blocks));
      files.push({ name: `${dir}${name}.${fmt}`, data }); docs++;
    }
    for (let r = 0; r < roots.length; r++) {
      const dir = what === 'all' ? `${pad(r, roots.length)} - ${safe(roots[r].title)}/` : '';
      for (let i = 0; i < roots[r].children.length; i++) await one(roots[r].children[i], dir, i, roots[r].children.length, what === 'all' ? 1 : 0);
    }
    if (!docs) return U.toast('There’s nothing to export there yet.');
    try { return await save(files, book, docs); } catch (e) { U.toast('Couldn’t export: ' + errText(e), 'warn', 8000); }
  }

  // ------------------------------------------------------------------ one Word file for Vellum or Atticus
  // Both import a single .docx and split it into chapters at each Heading 1 (Vellum: help.vellum.pub/importing;
  // Atticus: help.selfpublishing.com). So: every chapter title is a real Heading 1 on a new page, scene breaks are
  // a line of *** (which both turn into their ornamental break), and no empty paragraphs are left in, because
  // Vellum reads a blank line as a scene break and Atticus reads several as a new chapter. Title pages are left
  // out, since both make their own.
  function forBookApps(blocks, o = {}) {
    const out = []; let skipping = false;
    // a folder's title (a part, or "Book 2") with no chapters under it would become an empty chapter
    blocks = blocks.filter((b, i) => !b.part || (o.parts !== false && blocks[i + 1] && !(blocks[i + 1].tag === 'h1' && blocks[i + 1].part)));
    for (const b of blocks) {
      if (b.titleDoc) { skipping = true; continue; }
      if (skipping && !(b.tag === 'h1')) continue;
      skipping = false;
      const text = (b.runs || []).map(r => r.br ? '' : r.text || '').join('');
      const hasMore = (b.runs || []).some(r => r.img || r.fn !== undefined);
      if (!text.trim() && !hasMore) continue;
      if (!/^h[1-3]$/.test(b.tag) && SCENE.test(text)) { out.push({ ...b, align: 'center', runs: [{ text: '***' }] }); continue; }
      out.push(b);
    }
    // a scene break straight after a heading, or two in a row, means nothing in a book
    return out.filter((b, i) => !(b.runs.length === 1 && b.runs[0].text === '***' && (i === 0 || /^h[1-3]$/.test(out[i - 1].tag) || (out[i - 1].runs.length === 1 && out[i - 1].runs[0].text === '***'))));
  }
  async function oneWord(preset = {}) {
    if (!S.project) return U.toast('Open a book first.');
    await U.flushSave();
    const ms = S.project.binder.find(r => r.kind === 'manuscript');
    const t = await tally([ms]);
    const hasParts = (ms.children || []).some(n => n.type === 'folder');
    const body = document.createElement('div'); body.className = 'efx';
    body.innerHTML = `<p class="hint">One Word file of your manuscript, laid out the way <b>Vellum</b> and <b>Atticus</b> import a book: each chapter title is a Heading 1 on a new page, scene breaks are a line of ***, and there are no stray blank lines (both apps read those as breaks). Title pages are left out, as they make their own. Google Docs and Word open it too. <b>Should work, but not yet tested in Vellum or Atticus by beta testers.</b></p>
      ${hasParts ? `<label class="check"><input type="checkbox" id="ow-parts" checked><span>Folder titles as headings too (like “${esc((ms.children.find(n => n.type === 'folder') || {}).title || 'Part One')}”)<small>Vellum makes a heading that starts with “Part” into a part of the book; any other heading becomes a short chapter of its own. Atticus makes every heading a chapter. Untick to leave folder titles out.</small></span></label>` : ''}
      ${summaryHTML(t, 'one', { tcm: preset.tcm })}`;
    const ok = preset.yes || await U.modal({ title: 'One Word file for Vellum or Atticus', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Export', value: true, kind: 'primary' }] });
    if (!ok) return;
    const tcm = preset.tcm || changesChoice(body);
    const st = S.project.style, was = st.chapterTitles, wasH = st.titlesAsHeadings;
    let blocks;
    // chapters need a heading for these apps to find them, whatever the book's own setting is
    if ((st.chapterTitles || (st.titlesAsHeadings === false ? 'none' : 'names')) === 'none') { st.chapterTitles = 'names'; delete st.titlesAsHeadings; }
    try { blocks = await withChanges(tcm, () => U.compileManuscript()); }
    finally { if (was === undefined) delete st.chapterTitles; else st.chapterTitles = was; if (wasH !== undefined) st.titlesAsHeadings = wasH; }
    blocks = forBookApps(blocks, { parts: preset.parts !== undefined ? preset.parts : !(body.querySelector('#ow-parts') && !body.querySelector('#ow-parts').checked) });
    const lang = (((await api.spellSettings().catch(() => ({ current: ['en-AU'] }))).current || [])[0]) || 'en-AU';
    const bk = S.project.book || {}, name = safe(bk.title || S.project.title || 'Book');
    const bytes = window.FolioDOCX.build(blocks, S.project.style, { title: bk.title || S.project.title || '', author: bk.author || (S.settings && S.settings.author) || '', pageBreaks: true, lang });
    if (preset.bytesOnly) return { bytes, blocks };
    try {
      const p = await api.exportBinary(bytes, name, 'docx', 'Word document');
      if (p) U.toast(`Saved. In Vellum choose File › Import; in Atticus, Import from Word (should work, not yet tested by beta testers). Each Heading 1 becomes a chapter (${plural(blocks.filter(b => b.tag === 'h1').length, 'heading')}).`, '', 9000);
      return p;
    } catch (e) { U.toast('Couldn’t export: ' + errText(e), 'warn', 8000); }
  }

  return { open, oneWord, tally, summaryHTML, changesChoice, withChanges, blocksToMarkdown, forBookApps };
})();
