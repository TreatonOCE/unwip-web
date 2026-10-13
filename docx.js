// Unwip - Word (.docx) writer. Real Word styles (Normal, Heading 1-3), so the file is easy to restyle in Word or Google Docs.
window.FolioDOCX = (function () {
  'use strict';
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SCENE = /^\s*((\*|#|~|•|·)\s*){1,5}\s*$/;
  const tw = inches => Math.round(inches * 1440);
  function hex(c) {
    if (!c) return null;
    let m = String(c).match(/^#([0-9a-f]{6})$/i); if (m) return m[1].toUpperCase();
    m = String(c).match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i); if (m) return (m[1] + m[1] + m[2] + m[2] + m[3] + m[3]).toUpperCase();
    m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); if (m) return [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('').toUpperCase();
    return null;
  }
  const fonts = f => (f = window.FolioFonts ? window.FolioFonts.external(f) : f, `<w:rFonts w:ascii="${x(f)}" w:hAnsi="${x(f)}" w:cs="${x(f)}" w:eastAsia="${x(f)}"/>`);
  const field = name => `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> ${name} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

  let TC_ID = 1, BM_ID = 1;
  function runXML(r, base) {
    if (r.br) return '<w:r><w:br/></w:r>';
    if (r.img) return base.picture ? base.picture(r) : '';
    if (r.fn !== undefined) { if (!base.notes) return ''; base.notes.push(r.fn); return `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${base.notes.length}"/></w:r>`; }
    const p = [];
    if (r.font && r.font !== base.font && !base.smf) p.push(fonts(r.font));            // standard manuscript format: one font throughout
    if (r.bold) p.push('<w:b/>');
    if (r.italic) p.push('<w:i/>');
    if (r.strike) p.push('<w:strike/>');
    const col = hex(r.color); if (col && col !== '000000' && !base.smf) p.push(`<w:color w:val="${col}"/>`);
    if (r.size && r.size !== base.size && !base.smf) p.push(`<w:sz w:val="${Math.round(r.size * 2)}"/><w:szCs w:val="${Math.round(r.size * 2)}"/>`);
    if (r.underline) p.push('<w:u w:val="single"/>');
    if (r.sup) p.push('<w:vertAlign w:val="superscript"/>'); else if (r.sub) p.push('<w:vertAlign w:val="subscript"/>');
    const run = `<w:r>${p.length ? `<w:rPr>${p.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${x(r.text)}</w:t></w:r>`;
    // tracked changes go to Word as real tracked changes, so an editor can accept or reject them there
    if (r.tc) {
      base.tcN = (base.tcN || 0) + 1; const id = 900 + (TC_ID++);
      const attrs = `w:id="${id}" w:author="${x(r.tc.a || 'Author')}" w:date="${new Date(r.tc.t || Date.now()).toISOString().replace(/\.\d+Z$/, 'Z')}"`;
      return r.tc.k === 'del' ? `<w:del ${attrs}>${run.replace('<w:t ', '<w:delText ').replace('</w:t>', '</w:delText>')}</w:del>` : `<w:ins ${attrs}>${run}</w:ins>`;
    }
    return run;
  }

  // blocks: Unwip blocks; style: manuscript style; opts: { title, author, page: 'A4'|'Letter', smf, pageBreaks }
  function build(blocks, style, opts = {}) {
    const S = style;
    const body = [];
    const notes = [];
    // pictures become real Word pictures (word/media/imageN), sized to the page width you chose
    const pics = [];
    const [pw0] = opts.page === 'Letter' ? [8.5] : [8.27];
    const picture = r => {
      const m = /^data:image\/(png|jpe?g|gif);base64,(.*)$/i.exec(r.img); if (!m) return '';
      const ext = m[1].toLowerCase().replace('jpeg', 'jpg'), n = pics.length + 1;
      const bin = atob(m[2]); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      pics.push({ name: `image${n}.${ext}`, data, ext });
      const wIn = (pw0 - 2) * (r.pct || 60) / 100, ratio = r.w && r.h ? r.h / r.w : 0.75;
      const cx = Math.round(wIn * 914400), cy = Math.round(wIn * ratio * 914400);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Picture ${n}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.${ext}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImg${n}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    };
    let afterBreak = true, firstH1 = true;
    for (const b of blocks) {
      const text = b.runs.map(r => r.br ? '' : r.text).join('');
      const heading = /^h[1-3]$/.test(b.tag);
      const scene = !heading && b.tag === 'p' && SCENE.test(text) && text.trim();
      const pPr = [];
      if (heading) pPr.push(`<w:pStyle w:val="Heading${b.tag[1]}"/>`);
      else if (b.tag === 'blockquote') pPr.push('<w:pStyle w:val="Quote"/>');
      if (((heading && b.tag === 'h1') || b.newPage) && opts.pageBreaks && !firstH1) pPr.push('<w:pageBreakBefore/>');
      if ((heading && b.tag === 'h1') || b.newPage) firstH1 = false;
      const align = scene ? 'center' : b.align;
      if (align) pPr.push(`<w:jc w:val="${align === 'justify' ? 'both' : align === 'right' ? 'right' : align === 'center' ? 'center' : 'left'}"/>`);
      const hasPic = b.runs.some(r => r.img);
      if (hasPic && !align) pPr.push('<w:jc w:val="center"/>');
      if (!heading && b.tag === 'p' && (hasPic || scene || (S.noIndentFirst && afterBreak) || align === 'center' || align === 'right')) pPr.push('<w:ind w:firstLine="0"/>');
      const runs = scene ? `<w:r><w:t>${opts.smf ? '#' : x(text.trim())}</w:t></w:r>` : b.runs.map(r => runXML(r, { font: heading ? null : S.font, size: heading ? null : S.size, notes, picture, smf: !!opts.smf })).join('');
      // a hidden marker on each chapter heading, so a reader's copy can be matched back to the right chapter
      const bm = b.anchor ? (n => `<w:bookmarkStart w:id="${n}" w:name="unwip_${String(b.anchor).replace(/[^A-Za-z0-9_]/g, '').slice(0, 34)}"/><w:bookmarkEnd w:id="${n}"/>`)(5000 + (BM_ID++)) : '';
      body.push(`<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${bm}${runs}</w:p>`);
      if (text.trim()) afterBreak = heading || !!scene;
    }
    const [pw, ph] = opts.page === 'Letter' ? [8.5, 11] : [8.27, 11.69];
    const sect = `<w:sectPr>${opts.smf ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : '<w:footerReference w:type="default" r:id="rIdFooter"/>'}
      <w:pgSz w:w="${tw(pw)}" w:h="${tw(ph)}"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>${opts.smf ? '<w:titlePg w:val="0"/>' : ''}</w:sectPr>`;
    const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"';
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${NS}><w:body>${body.join('\n')}${sect}</w:body></w:document>`;

    const h = k => S.headings[k];
    const hStyle = (k, lvl) => `<w:style w:type="paragraph" w:styleId="Heading${lvl}"><w:name w:val="heading ${lvl}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>
      <w:pPr><w:keepNext/><w:spacing w:before="${Math.round(h(k).spaceBefore * 20)}" w:after="${Math.round(h(k).spaceAfter * 20)}" w:line="276" w:lineRule="auto"/><w:jc w:val="${h(k).align === 'center' ? 'center' : h(k).align === 'right' ? 'right' : 'left'}"/><w:ind w:firstLine="0"/><w:outlineLvl w:val="${lvl - 1}"/></w:pPr>
      <w:rPr>${fonts(h(k).font)}${h(k).bold ? '<w:b/>' : '<w:b w:val="0"/>'}${h(k).italic ? '<w:i/>' : ''}<w:sz w:val="${Math.round(h(k).size * 2)}"/><w:szCs w:val="${Math.round(h(k).size * 2)}"/></w:rPr></w:style>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>${fonts(S.font)}<w:sz w:val="${Math.round(S.size * 2)}"/><w:szCs w:val="${Math.round(S.size * 2)}"/><w:lang w:val="${x(opts.lang || 'en-AU')}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="${Math.round((S.paraSpacing || 0) * 20)}" w:line="${Math.round(240 * S.lineHeight)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="${tw(S.indent)}"/>${S.justify ? '<w:jc w:val="both"/>' : ''}<w:widowControl/></w:pPr></w:style>
${hStyle('h1', 1)}${hStyle('h2', 2)}${hStyle('h3', 3)}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="720" w:right="720" w:firstLine="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/><w:jc w:val="left"/></w:pPr><w:rPr><w:sz w:val="${Math.max(16, Math.round(S.size * 1.67))}"/><w:szCs w:val="${Math.max(16, Math.round(S.size * 1.67))}"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Header"><w:name w:val="header"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:firstLine="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr></w:style>
</w:styles>`;
    const surname = (opts.author || '').trim().split(/\s+/).pop() || '';
    const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${NS}><w:p><w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr><w:r><w:t xml:space="preserve">${x((surname ? surname + ' / ' : '') + (opts.title || '').toUpperCase() + ' / ')}</w:t></w:r>${field('PAGE')}</w:p></w:hdr>`;
    const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${NS}><w:p><w:pPr><w:pStyle w:val="Footer"/><w:jc w:val="center"/></w:pPr>${field('PAGE')}</w:p></w:ftr>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    const files = {
      '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${[...new Set(pics.map(p => p.ext))].map(e => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('')}
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
${notes.length ? '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>' : ''}
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
</Types>`,
      '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
      'word/_rels/document.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${pics.map((p, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${p.name}"/>`).join('')}${notes.length ? '\n<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>' : ''}
</Relationships>`,
      'word/document.xml': documentXml,
      'word/styles.xml': stylesXml,
      'word/settings.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:defaultTabStop w:val="720"/>${notes.length ? '<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>' : ''}<w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`,
      'word/header1.xml': headerXml,
      'word/footer1.xml': footerXml,
      'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${x(opts.title || '')}</dc:title><dc:creator>${x(opts.author || '')}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`
    };
    if (notes.length) {
      const sepP = inner => `<w:p><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0"/></w:pPr><w:r>${inner}</w:r></w:p>`;
      files['word/footnotes.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1">${sepP('<w:separator/>')}</w:footnote><w:footnote w:type="continuationSeparator" w:id="0">${sepP('<w:continuationSeparator/>')}</w:footnote>
${notes.map((t, i) => `<w:footnote w:id="${i + 1}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> ${x(String(t).replace(/\s*\n\s*/g, ' '))}</w:t></w:r></w:p></w:footnote>`).join('\n')}
</w:footnotes>`;
    }
    const enc = new TextEncoder();
    return window.FolioEPUB.zip([...Object.entries(files).map(([name, text]) => ({ name, data: enc.encode(text) })), ...pics.map(p => ({ name: 'word/media/' + p.name, data: p.data }))]);
  }
  return { build };
})();
