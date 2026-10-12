// Unwip - importers: Word (.docx) and Scrivener (.scriv) projects.
window.FolioImport = (function () {
  'use strict';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const qf = f => /^[\w-]+$/.test(f) ? f : `'${f.replace(/'/g, '')}'`;

  // ---------------------------------------------------------------- unzip (for .docx)
  async function unzip(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('This file is not a valid Word document.');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      p += 46 + nlen + xlen + clen;
      const lnlen = dv.getUint16(local + 26, true), lxlen = dv.getUint16(local + 28, true);
      const data = bytes.subarray(local + 30 + lnlen + lxlen, local + 30 + lnlen + lxlen + csize);
      out[name] = async () => {
        if (method === 0) return data;
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buf);
      };
    }
    return out;
  }

  // ---------------------------------------------------------------- .docx -> HTML
  async function docxToHTML(bytes) {
    const zip = await unzip(bytes);
    const text = async name => zip[name] ? new TextDecoder().decode(await zip[name]()) : null;
    const docXml = await text('word/document.xml');
    if (!docXml) throw new Error('No document text found in this Word file.');
    const parse = s => new DOMParser().parseFromString(s, 'application/xml');
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const kids = (el, name) => el ? [...el.childNodes].filter(n => n.localName === name) : [];
    const kid = (el, name) => kids(el, name)[0] || null;
    const val = el => el ? (el.getAttributeNS(W, 'val') ?? el.getAttribute('w:val')) : null;
    const onOff = el => el && !['0', 'false', 'off', 'none'].includes(String(val(el) ?? 'true'));

    // styles: names (for headings) and fonts / sizes
    const styles = {}; let defFont = null, defSize = null;
    const stylesXml = await text('word/styles.xml');
    if (stylesXml) {
      const sd = parse(stylesXml);
      const rd = sd.getElementsByTagNameNS(W, 'rPrDefault')[0];
      if (rd) { const rpr = kid(rd, 'rPr'); const f = kid(rpr, 'rFonts'); if (f) defFont = f.getAttributeNS(W, 'ascii') || null; const sz = kid(rpr, 'sz'); if (sz) defSize = +val(sz) / 2; }
      for (const st of sd.getElementsByTagNameNS(W, 'style')) {
        const id = st.getAttributeNS(W, 'styleId');
        const rpr = kid(st, 'rPr'), ppr = kid(st, 'pPr');
        const f = kid(rpr, 'rFonts');
        styles[id] = {
          name: val(kid(st, 'name')) || id, basedOn: val(kid(st, 'basedOn')),
          font: f ? f.getAttributeNS(W, 'ascii') : null, size: kid(rpr, 'sz') ? +val(kid(rpr, 'sz')) / 2 : null,
          bold: kid(rpr, 'b') ? onOff(kid(rpr, 'b')) : null, italic: kid(rpr, 'i') ? onOff(kid(rpr, 'i')) : null,
          align: ppr && kid(ppr, 'jc') ? val(kid(ppr, 'jc')) : null
        };
      }
    }
    const styleProp = (id, prop, depth = 0) => { const s = styles[id]; if (!s || depth > 8) return null; return s[prop] ?? styleProp(s.basedOn, prop, depth + 1); };
    const normalFont = styleProp('Normal', 'font') || defFont, normalSize = styleProp('Normal', 'size') || defSize;

    const doc = parse(docXml);
    const body = doc.getElementsByTagNameNS(W, 'body')[0];
    let html = '';
    const paras = body.getElementsByTagNameNS(W, 'p');
    // pictures: relationship id -> media file
    const rels = {}; const relXml = await text('word/_rels/document.xml.rels');
    if (relXml) for (const r of parse(relXml).getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = r.getAttribute('Target');
    const picCache = {};
    const picture = async rid => {
      const t = rels[rid]; if (!t) return '';
      const name = 'word/' + t.replace(/^\.?\//, '').replace(/^word\//, '');
      if (picCache[name] != null) return picCache[name];
      const ext = (name.split('.').pop() || '').toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext];
      if (!mime || !zip[name]) return (picCache[name] = '');
      try {
        const bytes = await zip[name]();
        const p = window.UnwipImages ? await window.UnwipImages.shrink(new Blob([bytes], { type: mime })) : null;
        return (picCache[name] = p ? `<img class="doc-img" src="${p.src}" data-w="${p.w}" data-h="${p.h}" style="width: 60%" alt="">` : '');
      } catch { return (picCache[name] = ''); }
    };
    let sectionBreak = false;
    for (const p of paras) {
      const ppr = kid(p, 'pPr');
      const sid = ppr ? val(kid(ppr, 'pStyle')) : null;
      const sname = (sid && styles[sid] ? styles[sid].name : sid || '').toLowerCase();
      let tag = 'p';
      const hm = sname.match(/heading\s*(\d)/);
      if (hm) tag = 'h' + Math.min(3, +hm[1]); else if (sname === 'title') tag = 'h1'; else if (sname === 'subtitle') tag = 'h2'; else if (/quote/.test(sname)) tag = 'blockquote';
      const jc = (ppr && kid(ppr, 'jc') ? val(kid(ppr, 'jc')) : null) || (sid ? styleProp(sid, 'align') : null);
      const align = jc === 'center' ? 'center' : jc === 'right' || jc === 'end' ? 'right' : jc === 'both' ? 'justify' : null;
      const pageBreakBefore = (ppr && kid(ppr, 'pageBreakBefore')) || sectionBreak;
      sectionBreak = !!(ppr && kid(ppr, 'sectPr'));
      let inner = '';
      const runs = [];
      // collect runs (also inside hyperlinks / smart tags)
      // tracked changes from an editor (w:ins / w:del) come in as suggestions
      const tcOf = new Map();
      (function collect(el, tc) { for (const c of el.childNodes) {
        if (c.localName === 'r') { runs.push(c); if (tc) tcOf.set(c, tc); }
        else if (c.localName === 'ins' || c.localName === 'del') collect(c, { k: c.localName, a: c.getAttributeNS(W, 'author') || c.getAttribute('w:author') || 'Editor', t: Date.parse(c.getAttributeNS(W, 'date') || c.getAttribute('w:date') || '') || 0 });
        else if (['hyperlink', 'smartTag', 'sdt', 'sdtContent', 'fldSimple'].includes(c.localName)) collect(c, tc);
      } })(p, null);
      let hasPageBreak = false, breakAfter = false;
      for (const r of runs) {
        const rpr = kid(r, 'rPr');
        const rs = rpr ? val(kid(rpr, 'rStyle')) : null;
        const bold = rpr && kid(rpr, 'b') ? onOff(kid(rpr, 'b')) : (rs && styleProp(rs, 'bold')) || false;
        const italic = rpr && kid(rpr, 'i') ? onOff(kid(rpr, 'i')) : (rs && styleProp(rs, 'italic')) || false;
        const underline = rpr && kid(rpr, 'u') && val(kid(rpr, 'u')) !== 'none';
        const strike = rpr && kid(rpr, 'strike') && onOff(kid(rpr, 'strike'));
        const va = rpr && kid(rpr, 'vertAlign') ? val(kid(rpr, 'vertAlign')) : null;
        const fEl = rpr && kid(rpr, 'rFonts');
        const font = (fEl && fEl.getAttributeNS(W, 'ascii')) || (sid && styleProp(sid, 'font')) || normalFont;
        const size = rpr && kid(rpr, 'sz') ? +val(kid(rpr, 'sz')) / 2 : (sid && styleProp(sid, 'size')) || normalSize;
        let t = '';
        for (const c of r.childNodes) {
          if (c.localName === 'drawing' || c.localName === 'pict') {
            const blip = c.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0] || c.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata')[0];
            const rid = blip && (blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'embed') || blip.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
            if (rid) { const im = await picture(rid); if (im) { inner += im; } }
            continue;
          }
          if (c.localName === 't' || (c.localName === 'delText' && tcOf.get(r))) t += esc(c.textContent);
          else if (c.localName === 'tab') t += ' ';
          else if (c.localName === 'br') { if ((c.getAttributeNS(W, 'type') || c.getAttribute('w:type')) === 'page') { if (inner || t) breakAfter = true; else hasPageBreak = true; } else t += '<br>'; }
          else if (c.localName === 'noBreakHyphen') t += '-';
          else if (c.localName === 'sym') t += '';
        }
        if (!t) continue;
        if (va === 'superscript') t = `<sup>${t}</sup>`; if (va === 'subscript') t = `<sub>${t}</sub>`;
        if (strike) t = `<s>${t}</s>`; if (underline) t = `<u>${t}</u>`; if (italic) t = `<i>${t}</i>`; if (bold) t = `<b>${t}</b>`;
        const css = []; if (font) css.push(`font-family:${qf(font)}`); if (size) css.push(`font-size:${size}pt`);
        let piece = css.length ? `<span style="${css.join(';')}">${t}</span>` : t;
        const tc = tcOf.get(r); if (tc) piece = `<${tc.k} class="tc-${tc.k}" data-a="${esc(tc.a)}" data-t="${tc.t || ''}">${piece}</${tc.k}>`;
        inner += piece;
      }
      html += `<${tag}${align ? ` style="text-align:${align}"` : ''}${pageBreakBefore || hasPageBreak ? ' data-break="1"' : ''}${breakAfter ? ' data-break-after="1"' : ''}>${inner.replace(/^ +/, '') || '<br>'}</${tag}>`;
    }
    return html;
  }

  // split imported HTML into chapters at Heading 1 or "Chapter …" lines
  function splitChapters(html) {
    const div = document.createElement('div'); div.innerHTML = html;
    const chapters = []; let cur = null;
    for (const el of [...div.children]) {
      const t = el.textContent.trim();
      const isHead = el.tagName === 'H1' || (/^(chapter|prologue|epilogue|part)\b/i.test(t) && t.length < 90 && (el.tagName !== 'P' || el.style.textAlign === 'center' || el.querySelector('b') || t.split(/\s+/).length <= 8));
      if (isHead) { cur = { title: t || 'Chapter', html: '' }; chapters.push(cur); continue; }
      if (!cur) { if (!t) continue; cur = { title: 'Opening', html: '' }; chapters.push(cur); }
      cur.html += el.outerHTML;
    }
    return chapters;
  }

  // ---------------------------------------------------------------- Scrivener
  // returns { binder: [Unwip root folders], docs: {id: html}, report }
  function scrivener(data, uid) {
    const xml = new DOMParser().parseFromString(data.scrivx, 'application/xml');
    const report = { documents: 0, folders: 0, skipped: [], empty: 0, withNotes: 0 };
    const docs = {};
    const noteDocs = [];
    const labels = {}, statuses = {};
    for (const l of xml.querySelectorAll('LabelSettings Labels Label')) labels[l.getAttribute('ID')] = l.textContent.trim();
    for (const s of xml.querySelectorAll('StatusSettings StatusItems Status')) statuses[s.getAttribute('ID')] = s.textContent.trim();
    // keep Scrivener's own status names (with colours from a matching palette), so nothing gets renamed
    const PALETTE = ['#9b968d', '#d39b2a', '#4a7fd0', '#7a5cc7', '#3f9a5a', '#c0392b', '#1f7a8c', '#b5651d'];
    const statusList = Object.entries(statuses).filter(([, n]) => n && !/^no status$/i.test(n)).map(([id, name], i) => ({ id: 's' + id, name, color: /done|final|complete/i.test(name) ? '#3f9a5a' : /to ?do/i.test(name) ? '#9b968d' : /first draft/i.test(name) ? '#d39b2a' : /revis/i.test(name) ? '#4a7fd0' : PALETTE[(i + 3) % PALETTE.length] }));
    const STATUS_MAP = t => { t = (t || '').toLowerCase(); if (!t || t === 'no status') return ''; if (/to ?do/.test(t)) return 'todo'; if (/final|done|complete/.test(t)) return 'final'; if (/revis|second/.test(t)) return 'revised'; return 'draft'; };

    const roots = { manuscript: [], characters: [], places: [], items: [], notes: [], research: [], trash: [] };
    const rtfToHTML = rtf => rtf ? window.FolioRTF.toHTML(rtf) : '';
    const clean = html => html ? window.FolioClip.cleanPaste(html, {}) : '';
    const clean2 = (html, docFont, docSize) => html ? window.FolioClip.cleanPaste(html, { docFont, docSize }) : '';
    const textOf = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.trim(); };

    function convert(item) {
      const type = item.getAttribute('Type');
      // Scrivener 3 on Mac keeps text under the UUID, Scrivener on Windows (and older Mac versions) under the number ID
      const key = data.files[item.getAttribute('UUID')] ? item.getAttribute('UUID') : item.getAttribute('ID');
      const title = (item.querySelector(':scope > Title') || {}).textContent || 'Untitled';
      const childrenEl = item.querySelector(':scope > Children');
      const children = childrenEl ? [...childrenEl.children].filter(c => c.tagName === 'BinderItem').map(convert).filter(Boolean) : [];
      const f = data.files[key] || {};
      const meta = item.querySelector(':scope > MetaData');
      const statusId = meta && meta.querySelector('StatusID') ? meta.querySelector('StatusID').textContent.trim() : null;
      const synopsis = (f.synopsis || '').trim();
      const notesHTML = clean(rtfToHTML(f.notes));
      const iconEl = meta && meta.querySelector('IconFileName');
      const iconM = iconEl && /^\{(.+)\}$/.exec(iconEl.textContent.trim());   // emoji icons look like {🚧}
      if (type === 'Image' && f.image) {   // a picture in the binder becomes a document showing that picture
        const id = uid(); docs[id] = `<p style="text-align: center"><img class="doc-img" src="${f.image}" style="width: 100%" alt=""></p>`;
        report.documents++; report.images = (report.images || 0) + 1;
        return { node: { id, type: 'doc', title, words: 0, icon: '🖼️', ...(synopsis ? { synopsis } : {}) }, type };
      }
      if (['Image', 'PDF', 'WebArchive', 'Media'].includes(type)) { report.skipped.push(`${title} (${type === 'WebArchive' ? 'web page' : type.toLowerCase()})`); return null; }
      const bodyHTML = rtfToHTML(f.content);   // cleaned at the end, once the project's main font is known
      const hasText = !!textOf(bodyHTML);
      const isFolder = /Folder/.test(type) || (children.length > 0);
      const extra = {};
      if (synopsis) extra.synopsis = synopsis;
      if (statusId && statusList.some(x => x.id === 's' + statusId)) extra.status = 's' + statusId;
      if (iconM && [...iconM[1]].length <= 4) extra.icon = iconM[1];
      if (notesHTML && textOf(notesHTML)) { const nid = uid(); docs[nid] = notesHTML; noteDocs.push({ id: nid, type: 'doc', title: `${title} (notes)`, words: 0 }); report.withNotes++; }
      if (isFolder) {
        report.folders++;
        const node = { id: uid(), type: 'folder', title, open: false, children, ...extra };
        if (hasText) { const id = uid(); docs[id] = bodyHTML; node.children.unshift({ node: { id, type: 'doc', title, words: 0 }, type: 'Text' }); report.documents++; }
        return { node, type };
      }
      const id = uid();
      docs[id] = bodyHTML || '<p><br></p>';
      if (!hasText) report.empty++;
      report.documents++;
      return { node: { id, type: 'doc', title, words: 0, ...extra }, type };
    }
    // unwrap {node, type} recursively
    const unwrap = r => { if (!r) return null; const n = r.node; if (n.children) n.children = n.children.map(unwrap).filter(Boolean); return n; };

    const top = xml.querySelector('Binder');
    if (!top) throw new Error('Could not read this Scrivener project.');
    for (const item of [...top.children].filter(c => c.tagName === 'BinderItem')) {
      const r = convert(item); if (!r) continue;
      const node = unwrap(r);
      const t = (node.title || '').toLowerCase();
      if (r.type === 'DraftFolder') roots.manuscript.push(...(node.children || []));
      else if (r.type === 'ResearchFolder') roots.research.push(...(node.children || []));
      else if (r.type === 'TrashFolder') roots.trash.push(...(node.children || []));
      else if (/character|cast|people/.test(t)) roots.characters.push(...(node.type === 'folder' ? node.children : [node]));
      else if (/place|location|setting|world/.test(t)) roots.places.push(...(node.type === 'folder' ? node.children : [node]));
      else if (/^items?$|objects|artifacts|artefacts/.test(t)) roots.items.push(...(node.type === 'folder' ? node.children : [node]));
      else roots.notes.push(node);
    }
    if (noteDocs.length) roots.notes.push({ id: uid(), type: 'folder', title: 'Document notes from Scrivener', open: false, children: noteDocs });
    // the font and size used most in the manuscript become the project's style, so they don't need repeating on every word
    const tally = {}, sizes = {};
    for (const html of Object.values(docs)) {
      for (const m of html.matchAll(/<span style="([^"]*)">([^<]*)/g)) {
        const fam = /font-family:\s*'?([^;']+)'?/.exec(m[1]), sz = /font-size:\s*([\d.]+)pt/.exec(m[1]), w = m[2].length;
        if (fam) tally[fam[1].trim()] = (tally[fam[1].trim()] || 0) + w;
        if (sz) sizes[sz[1]] = (sizes[sz[1]] || 0) + w;
      }
    }
    const top1 = o => Object.entries(o).sort((a, b) => b[1] - a[1])[0];
    const docFont = (top1(tally) || [])[0] || null, docSize = top1(sizes) ? +top1(sizes)[0] : null;
    for (const id of Object.keys(docs)) docs[id] = clean2(docs[id], docFont, docSize) || '<p><br></p>';
    return { roots, docs, report, labels, statuses, statusList, docFont, docSize };
  }

  return { docxToHTML, splitChapters, scrivener, unzip };
})();
