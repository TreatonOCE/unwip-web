// Unwip - "No hard feelings": take your book back out, as a real Scrivener project (or a folder of Word or
// Markdown files, or a full Unwip backup). Leaving is fine; your work is yours.
// The Scrivener project uses the same layout Scrivener 3 for Windows opens (and Scrivener 1 and 2, and Mac,
// which offers to update it): a .scriv folder with a .scrivx binder file and one RTF file per document.
window.UnwipNoHardFeelings = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;

  // ------------------------------------------------------------------ HTML -> RTF
  const rtfText = t => {
    let out = '';
    for (const ch of t) {
      const c = ch.codePointAt(0);
      if (ch === '\\' || ch === '{' || ch === '}') out += '\\' + ch;
      else if (ch === '\t') out += '\\tab ';
      else if (c < 128) out += ch === '\n' ? ' ' : ch;
      else if (c <= 0xFFFF) out += `\\u${c > 32767 ? c - 65536 : c}?`;
      else { const s = ch; for (let i = 0; i < s.length; i++) { const u = s.charCodeAt(i); out += `\\u${u > 32767 ? u - 65536 : u}?`; } }
    }
    return out;
  };
  function picture(img) {
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(img.getAttribute('src') || ''); if (!m) return '';
    const bin = atob(m[2]); let hex = ''; for (let i = 0; i < bin.length; i++) { hex += bin.charCodeAt(i).toString(16).padStart(2, '0'); if (i % 64 === 63) hex += '\n'; }
    const w = +img.dataset.w || img.naturalWidth || 600, h = +img.dataset.h || img.naturalHeight || 400;
    const goalW = Math.round(Math.min(w, 600) * 15), goalH = Math.round(goalW * (h / (w || 1)));
    return `{\\pict${/png/i.test(m[1]) ? '\\pngblip' : '\\jpegblip'}\\picw${w}\\pich${h}\\picwgoal${goalW}\\pichgoal${goalH}\n${hex}}`;
  }
  // inline content of one paragraph
  function inline(node, notes) {
    let out = '';
    node.childNodes.forEach(n => {
      if (n.nodeType === 3) { out += rtfText(n.data.replace(/ /g, ' ')); return; }
      if (n.nodeType !== 1) return;
      const t = n.tagName, cl = n.classList;
      if (cl.contains('tc-del') || t === 'DEL') return;                         // a suggested deletion isn't part of the text
      if (t === 'BR') { out += '\\line '; return; }
      if (t === 'IMG') { out += picture(n); return; }
      if (t === 'SUP' && n.hasAttribute('data-fn')) { out += `{\\super\\chftn}{\\footnote\\pard\\plain{\\super\\chftn} ${rtfText(n.getAttribute('data-fn') || '')}}`; return; }
      const st = n.style || {}; let on = '';
      if (t === 'B' || t === 'STRONG' || st.fontWeight === 'bold' || +st.fontWeight >= 600) on += '\\b';
      if (t === 'I' || t === 'EM' || st.fontStyle === 'italic') on += '\\i';
      if (t === 'U' || /underline/.test(st.textDecoration || '')) on += '\\ul';
      if (t === 'S' || t === 'STRIKE' || /line-through/.test(st.textDecoration || '')) on += '\\strike';
      if (t === 'SUP') on += '\\super'; if (t === 'SUB') on += '\\sub';
      if (st.fontSize) { const pt = parseFloat(st.fontSize) * (/px$/.test(st.fontSize) ? 0.75 : 1); if (pt > 0) on += `\\fs${Math.round(pt * 2)}`; }
      out += on ? `{${on} ${inline(n, notes)}}` : inline(n, notes);
    });
    return out;
  }
  // opts.gaps: { paragraph fingerprint: how many empty lines followed it in Scrivener } (see importers.js rawLook)
  function htmlToRTF(html, style, opts = {}) {
    const gaps = opts.gaps || null, key = window.FolioImport && window.FolioImport.paraKey;
    const d = document.createElement('div'); d.innerHTML = html || '';
    const font = (style && style.font) || 'Times New Roman', size = Math.round(((style && style.size) || 12) * 2);
    const indent = Math.round(((style && style.indent) != null ? style.indent : 0.5) * 1440), line = Math.round(((style && style.lineHeight) || 1.5) * 240);
    const blocks = [];
    const walk = el => [...el.children].forEach(c => { if (/^(DIV|UL|OL|SECTION)$/.test(c.tagName) && c.querySelector('p,h1,h2,h3,li,blockquote')) walk(c); else blocks.push(c); });
    walk(d);
    let out = `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\froman\\fcharset0 ${rtfText(font)};}}{\\colortbl;\\red0\\green0\\blue0;}\n`;
    let first = true;
    for (const b of blocks) {
      const text = (b.textContent || '').trim(), isScene = b.classList.contains('scene') || /^([*#~]\s*){1,5}$/.test(text);
      const align = (b.style && b.style.textAlign) || '';
      const al = align === 'center' || isScene ? '\\qc' : align === 'right' ? '\\qr' : align === 'justify' ? '\\qj' : '\\ql';
      const h = /^H([1-3])$/.exec(b.tagName);
      if (h) { out += `\\pard\\plain\\f0\\fs${size + (4 - h[1]) * 6}\\b\\sb240\\sa120${al} ${inline(b)}\\b0\\par\n`; first = true; continue; }
      const fi = first || isScene || !text || /^(center|right)$/.test(align) ? 0 : indent;
      out += `\\pard\\plain\\f0\\fs${size}\\sl${line}\\slmult1\\fi${fi}${al}${b.tagName === 'BLOCKQUOTE' ? '\\li720\\ri720' : ''}${b.tagName === 'LI' ? '\\li360' : ''} ${b.tagName === 'LI' ? '\\bullet\\tab ' : ''}${inline(b)}\\par\n`;
      // the empty lines that followed this paragraph in Scrivener go back after it
      const g = gaps && text && key ? gaps[key(b.textContent)] : 0;
      for (let k = 0; k < (g || 0); k++) out += `\\pard\\plain\\f0\\fs${size}\\sl${line}\\slmult1\\fi${indent}\\ql \\par\n`;
      first = isScene ? true : (text ? false : first);
    }
    return out + '}';
  }
  const plainRTF = text => `{\\rtf1\\ansi\\ansicpg1252\\uc1\\deff0{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}\\pard\\plain\\f0\\fs24 ${rtfText(text)}\\par}`;

  // ------------------------------------------------------------------ building the .scriv folder
  const FRONT = /^\s*(title|title page|half[- ]title|front matter|copyright|dedication|epigraph|contents)\s*$/i;
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); })).toUpperCase();
  const xml = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function stamp(t) {
    const d = t ? new Date(t) : new Date(), p = n => String(n).padStart(2, '0'), o = -d.getTimezoneOffset();
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${o >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(o) / 60))}${p(Math.abs(o) % 60)}`;
  }
  const rgb01 = c => { const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(c || '') || /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); if (!m) return '0.749996 0.910002 0.979995'; const v = m[0].startsWith('rgb') ? [m[1], m[2], m[3]].map(Number) : [m[1], m[2], m[3]].map(x => parseInt(x, 16)); return v.map(x => (x / 255).toFixed(6)).join(' '); };

  async function buildScriv(name, onStep, opts = {}) {
    const P = S.project, files = [], docsOut = [];
    const stamped = stamp();
    let anyTT = false; U.walkTree(P.binder, n => { if (n.tt) anyTT = true; });
    // statuses and labels
    const statuses = (P.statuses && P.statuses.length ? P.statuses : [{ id: 'todo', name: 'To Do' }, { id: 'draft', name: 'First Draft' }, { id: 'revised', name: 'Revised Draft' }, { id: 'final', name: 'Final Draft' }]);
    const statusId = new Map(statuses.map((s, i) => [s.id, i]));
    const labels = []; U.walkTree(P.binder, n => { if (n.label && n.label.n && !labels.some(l => l.n === n.label.n)) labels.push(n.label); });
    const labelId = new Map(labels.map((l, i) => [l.n, i]));
    let mapsSkipped = 0, pics = 0;
    async function item(n, inDraft, depth) {
      const id = uuid(), isFolder = n.type === 'folder';
      const meta = [];
      if (n.label && labelId.has(n.label.n)) meta.push(`<LabelID>${labelId.get(n.label.n)}</LabelID>`);
      if (n.status && statusId.has(n.status)) meta.push(`<StatusID>${statusId.get(n.status)}</StatusID>`);
      if (inDraft && !n.noBook) meta.push('<IncludeInCompile>Yes</IncludeInCompile>');   // left out of the book: unticked in Scrivener
      if (n.icon && !/^[a-z]+$/i.test(n.icon)) meta.push(`<IconFileName>{${xml(n.icon)}}</IconFileName>`);
      let type = isFolder ? 'Folder' : 'Text', kids = '';
      if (n.map) {
        // a map comes across as a picture of it
        const pic = window.UnwipMaps && window.UnwipMaps.pictures ? await window.UnwipMaps.pictures(n.id).catch(() => []) : [];
        if (pic.length) { const b64 = pic[0].canvas.toDataURL('image/png').split(',')[1]; const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); files.push({ name: `Files/Data/${id}/content.png`, data: arr }); type = 'Image'; pics++; }
        else { mapsSkipped++; return ''; }
      } else if (!isFolder) {
        let html = n.id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, n.id).catch(() => '');
        // suggested changes are decided in the copy, as chosen in the summary (the book here keeps them)
        html = opts.tcm === 'reject' ? U.rejectChanges(html) : U.acceptChanges(html);
        // a chapter whose title was typed into its text in Scrivener gets that line back (see titles.js)
        // remembered typed titles go back exactly; a book with none remembered gets each chapter's name typed in
        const line = !opts.restore || !inDraft ? '' : n.tt && n.tt.line ? n.tt.line : (anyTT || FRONT.test(n.title || '') ? '' : (n.title || ''));
        // the typed title looks as it did in Scrivener when Unwip remembered that (size, bold, alignment and the
        // empty lines under it); otherwise like Unwip's own chapter title
        const t0 = opts.look && n.sv && n.sv.t && n.sv.t.s ? n.sv.t : null, h1 = (P.style.headings && P.style.headings.h1) || { size: 18, bold: true, align: 'center' };
        const tl = t0 ? { s: t0.s, b: t0.b, a: { c: 'center', r: 'right', j: 'justify' }[t0.a] || 'left', n: t0.n || 1 } : { s: h1.size || 18, b: h1.bold ? 1 : 0, a: h1.align || 'center', n: 1 };
        const typed = line ? `<p style="text-align: ${tl.a}"><span style="font-size: ${tl.s}pt">${tl.b ? '<b>' : ''}${esc(line)}${tl.b ? '</b>' : ''}</span></p>${'<p><br></p>'.repeat(Math.min(6, tl.n))}` : '';
        const gaps = opts.look && P.style.blankLines !== 'keep' && n.sv && n.sv.g ? Object.fromEntries(n.sv.g.map(x => { const [k, c] = x.split(':'); return [k, +c || 1]; })) : null;
        files.push({ name: `Files/Data/${id}/content.rtf`, data: htmlToRTF(typed + html, opts.look && P.scrivLayout ? { ...P.style, ...P.scrivLayout } : P.style, { gaps }) });
        docsOut.push(n.title); if (onStep) onStep(docsOut.length);
      }
      if (n.synopsis) files.push({ name: `Files/Data/${id}/synopsis.txt`, data: n.synopsis });
      if (isFolder) for (const c of n.children || []) kids += await item(c, inDraft, depth + 1);
      const pad = '    '.repeat(depth + 2);
      const title = opts.restore && inDraft && n.tt && n.tt.was ? n.tt.was : (n.title || 'Untitled');
      return `${pad}<BinderItem UUID="${id}" Type="${type}" Created="${stamp(n.created || P.created)}" Modified="${stamp(n.mod)}">\n${pad}    <Title>${xml(title)}</Title>\n${pad}    ${meta.length ? `<MetaData>${meta.join('')}</MetaData>` : '<MetaData/>'}\n${kids ? `${pad}    <Children>\n${kids}${pad}    </Children>\n` : ''}${pad}</BinderItem>\n`;
    }
    const root = k => P.binder.find(r => r.kind === k) || { children: [] };
    const sect = async (r, type, id, inDraft, title) => {
      let kids = ''; for (const c of r.children || []) kids += await item(c, inDraft, 1);
      return `        <BinderItem UUID="${uuid()}" Type="${type}" Created="${stamped}" Modified="${stamped}">\n            <Title>${xml(title)}</Title>\n            <MetaData/>\n${kids ? `            <Children>\n${kids}            </Children>\n` : ''}        </BinderItem>\n`;
    };
    let binder = await sect(root('manuscript'), 'DraftFolder', 0, true, 'Draft');
    // everything else in the order of your binder, each section as a top-level folder
    for (const r of P.binder) {
      if (['manuscript', 'research', 'trash', 'conflicts'].includes(r.kind)) continue;
      if (!(r.children || []).length) continue;
      let kids = ''; for (const c of r.children) kids += await item(c, false, 1);
      binder += `        <BinderItem UUID="${uuid()}" Type="Folder" Created="${stamped}" Modified="${stamped}">\n            <Title>${xml(r.title)}</Title>\n            <MetaData/>\n            <Children>\n${kids}            </Children>\n        </BinderItem>\n`;
    }
    binder += await sect(root('research'), 'ResearchFolder', 1, false, 'Research');
    binder += await sect(root('trash'), 'TrashFolder', 2, false, 'Trash');
    const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Template="No" Version="2.0" Identifier="${uuid()}" Creator="Unwip" Device="Unwip" Modified="${stamped}" ModID="${uuid()}">
    <Binder>
${binder}    </Binder>
    <LabelSettings>
        <Title>Label</Title>
        <DefaultLabelID>-1</DefaultLabelID>
        <Labels>
            <Label ID="-1">No Label</Label>
${labels.map((l, i) => `            <Label ID="${i}" Color="${rgb01(l.c)}">${xml(l.n)}</Label>`).join('\n')}
        </Labels>
    </LabelSettings>
    <StatusSettings>
        <Title>Status</Title>
        <DefaultStatusID>-1</DefaultStatusID>
        <StatusItems>
            <Status ID="-1">No Status</Status>
${statuses.map((s, i) => `            <Status ID="${i}">${xml(s.name)}</Status>`).join('\n')}
        </StatusItems>
    </StatusSettings>
    <ProjectProperties>
        <ProjectTitle>${xml((P.book && P.book.title) || P.title || name)}</ProjectTitle>
        <FullName>${xml((P.book && P.book.author) || (S.settings && S.settings.author) || '')}</FullName>
    </ProjectProperties>
</ScrivenerProject>
`;
    // the other files Scrivener expects in a project: its settings, a styles list and a fingerprint of each document
    const bookTitle = (P.book && P.book.title) || P.title || name, author = (P.book && P.book.author) || (S.settings && S.settings.author) || '';
    const ini = s => String(s || '').replace(/[\r\n]+/g, ' ');
    files.unshift(
      { name: `${name}.scrivx`, data: scrivx }, { name: 'Files/version.txt', data: '23' },
      { name: 'Files/styles.xml', data: '<?xml version="1.0" encoding="UTF-8"?>\n<Styles>\n</Styles>\n' },
      { name: 'Snapshots/', dir: true, data: new Uint8Array(0) },
      { name: 'Settings/ui.ini', data: '[General]\nexpandedBinderItems=\nfirstEditorSource=\nsecondEditorSource=\ninspectorMode=0\n\n[Inspector]\nmode=0\n' },
      { name: 'Settings/compile.ini', data: `[General]\noutputType=-1\n\n[Content]\nDocumentSet=0\n\n[MetaData]\ntitle=${ini(bookTitle)}\nauthors=${ini(author)}\nlanguageCode=en\n` });
    return { files: files.map(f => ({ name: f.name, dir: !!f.dir, data: typeof f.data === 'string' ? new TextEncoder().encode(f.data) : f.data })), docs: docsOut.length, mapsSkipped, pics };
  }

  // ------------------------------------------------------------------ the window
  async function open() {
    if (!S.project) return U.toast('Open the book you want to take with you first.');
    await U.flushSave();
    let hasTyped = false, hasLook = !!S.project.scrivLayout; U.walkTree(S.project.binder, n => { if (n.tt) hasTyped = true; if (n.sv) hasLook = true; });
    const L = S.project.scrivLayout || {};
    const body = document.createElement('div'); body.className = 'nhf';
    const title = S.project.title || 'My book';
    body.innerHTML = `
      <p class="nhf-lead">No hard feelings. Your writing is yours, and taking it somewhere else should be easy. Pick how you’d like “${esc(title)}” packed up. Nothing in Unwip is changed or removed.</p>
      <label class="nhf-opt"><input type="radio" name="nhf" value="scriv" checked><span><b>A Scrivener project</b><small>Opens in Scrivener 3 for Windows (tested). Scrivener on Mac should open it too, but that’s not yet tested by beta testers. Your manuscript becomes the Draft; characters, places, notes and other sections become folders; research and trash go to Scrivener’s own. Text with its formatting, footnotes, pictures, synopses, status, labels and icons come across, and maps as pictures.</small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="one"><span><b>One Word file for Vellum or Atticus</b><small>Your manuscript as a single Word file, laid out the way those apps import a book: each chapter title a Heading 1, scene breaks as ***, no stray blank lines. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="docx"><span><b>A folder of Word files</b><small>One per chapter, in folders like your binder, numbered “01 - Chapter One” so they stay in order. For Word, Google Docs, Ulysses and almost anything else. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="md"><span><b>A folder of Markdown files</b><small>For Obsidian, iA Writer, Bear, Notion and plain-text apps. <i class="untested">Should work, but not yet tested by beta testers.</i></small></span></label>
      <label class="nhf-opt"><input type="radio" name="nhf" value="backup"><span><b>A full Unwip backup</b><small>Everything exactly as it is here, in one file, in case you ever come back.</small></span></label>
      ${hasTyped
        ? `<label class="check nhf-tt"><input type="checkbox" id="nhf-tt" checked><span>Put the typed chapter titles back at the top of each chapter, as they were in Scrivener<small>When this book came in, Unwip took the titles typed into the text (“Chapter 1: …”) out, because it shows chapter names as headings itself. This puts each original line, and the chapter’s old binder name, back.</small></span></label>`
        : `<label class="check nhf-tt"><input type="checkbox" id="nhf-tt"><span>Type each chapter’s name at the top of its text<small>Your chapters don’t have their titles typed into the text. Scrivener adds titles itself when it compiles, so leave this off unless you want them typed in.</small></span></label>`}
      ${hasLook ? `<label class="check nhf-tt"><input type="checkbox" id="nhf-look" checked><span>Put back how it looked in Scrivener<small>Title lines at their old size, the empty lines between paragraphs where you had them${L.lineHeight ? `, and Scrivener’s ${L.lineHeight}× line spacing` : ''}${L.size ? ` at ${L.size}pt` : ''}. Untick to use Unwip’s layout instead.</small></span></label>` : ''}
      <p class="sim-small">Next you’ll see exactly what’s going and what isn’t, before anything is saved.</p>`;
    if (open.last) { const r = body.querySelector(`[name="nhf"][value="${open.last}"]`); if (r) r.checked = true; }
    const ok = await U.modal({ title: 'No hard feelings: take your book with you', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Next', value: true, kind: 'primary' }] });
    if (!ok) return;
    const how = open.last = body.querySelector('[name="nhf"]:checked').value;
    const XF = window.UnwipExportFolder;
    if (how === 'docx' || how === 'md') return XF && XF.open({ fmt: how, what: 'all' });
    if (how === 'one') return XF && XF.oneWord();
    if (how === 'backup') { try { const p = await api.backupExport(S.slug); if (p) U.toast('Full backup saved.'); } catch (e) { U.toast('Couldn’t save the backup.', 'warn'); } return; }
    // the summary: what's going, what isn't, and what to do with suggested changes
    const restore = !!(body.querySelector('#nhf-tt') || {}).checked, look = !!(body.querySelector('#nhf-look') || {}).checked;
    const t = await XF.tally(S.project.binder);
    const sum = document.createElement('div'); sum.className = 'nhf';
    sum.innerHTML = `<p class="nhf-lead">Here’s what goes into the Scrivener project. Your manuscript becomes the Draft; characters, places, notes and other sections become folders; research and trash go to Scrivener’s own.</p>${XF.summaryHTML(t, 'scriv')}`;
    const go = await U.modal({ title: 'Before you pack it up', body: sum, wide: true, buttons: [{ label: 'Back', value: 'back', kind: 'ghost' }, { label: 'Pack it up', value: true, kind: 'primary' }] });
    if (go === 'back') return open();
    if (go !== true) return;
    const tcm = XF.changesChoice(sum);
    const safe = (title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '') || 'My book').slice(0, 80);
    U.toast('Packing it up…', '', 3000);
    let res;
    try { res = await buildScriv(safe, null, { restore, tcm, look }); } catch (e) { return U.toast('Couldn’t make the Scrivener project: ' + esc(String(e.message || e)), 'warn', 8000); }
    try {
      let where;
      if (api.exportScriv) where = await api.exportScriv(safe, res.files);
      else { const zip = window.FolioEPUB.zip(res.files.map(f => ({ name: `${safe}.scriv/${f.name}`, data: f.data }))); await api.exportBinary(zip, safe + '.scriv', 'zip', 'Scrivener project (zip)'); where = safe + '.scriv (in a .zip: unzip it, then open it in Scrivener)'; }
      if (!where) return;
      window.UnwipStart && window.UnwipStart.done('export');
      await U.modal({ title: 'Packed up', body: `<p>“${esc(where)}” is ready: ${res.docs} document${res.docs === 1 ? '' : 's'}${res.pics ? ` and ${res.pics} map${res.pics === 1 ? '' : 's'} as pictures` : ''}.</p>
        <p>In Scrivener, choose <b>File › Open</b> and pick it. It may take a moment to rebuild its search index the first time.</p>
        <p class="sim-small">Your book is still here in Unwip, untouched. All the best with it.</p>`, buttons: [{ label: 'Close', value: true, kind: 'primary' }] });
    } catch (e) { U.toast('Couldn’t save it: ' + esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')), 'warn', 8000); }
  }

  return { open, htmlToRTF, buildScriv };
})();
