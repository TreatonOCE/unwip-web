// Unwip - EPUB writer (works for Kindle via Send to Kindle / KDP, Apple Books, Kobo, Google Play Books).
// Builds the EPUB 3 package (with an EPUB 2 table of contents for older readers) and zips it.
window.FolioEPUB = (function () {
  'use strict';

  // ---- tiny zip writer (files stored uncompressed, which EPUB allows) ----
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(files) {   // files: [{name, data: Uint8Array}]
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name);
      const crc = crc32(f.data), size = f.data.length;
      const local = new DataView(new ArrayBuffer(30));
      local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, 0, true);
      local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true);
      local.setUint32(18, size, true); local.setUint32(22, size, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true);
      chunks.push(new Uint8Array(local.buffer), name, f.data);
      const cen = new DataView(new ArrayBuffer(46));
      cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true);
      cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true); cen.setUint32(20, size, true); cen.setUint32(24, size, true);
      cen.setUint16(28, name.length, true); cen.setUint16(30, 0, true); cen.setUint16(32, 0, true); cen.setUint16(34, 0, true); cen.setUint16(36, 0, true);
      cen.setUint32(38, 0, true); cen.setUint32(42, offset, true);
      central.push(new Uint8Array(cen.buffer), name);
      offset += 30 + name.length + size;
    }
    const cenSize = central.reduce((a, c) => a + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, offset, true);
    const all = [...chunks, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(all.reduce((a, c) => a + c.length, 0));
    let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
    return out;
  }

  // ---- EPUB content ----
  const x = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SCENE = /^\s*((\*|#|~|•|·)\s*){1,5}\s*$/;

  let IMAGES = null;   // pictures collected while building, written into OEBPS/images/
  function imageFile(src) {
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/i.exec(src); if (!m || !IMAGES) return null;
    const ext = m[1].toLowerCase().replace('jpeg', 'jpg');
    const found = IMAGES.find(x => x.src === src); if (found) return found.name;
    const bin = atob(m[2]); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
    const name = `img${IMAGES.length + 1}.${ext}`;
    IMAGES.push({ src, name, data, mime: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) });
    return name;
  }
  function runsXHTML(runs, notes) {
    return runs.map(r => {
      if (r.br) return '<br/>';
      if (r.img) { const f = imageFile(r.img); return f ? `<img src="images/${f}" alt="" style="width:${r.pct || 60}%"/>` : ''; }
      if (r.fn !== undefined) { if (!notes) return ''; notes.push(r.fn); const k = notes.length; return `<a epub:type="noteref" class="noteref" href="#fn${k}" id="fnref${k}"><sup>${k}</sup></a>`; }
      let h = x(r.text);
      if (r.sup) h = `<sup>${h}</sup>`;
      if (r.sub) h = `<sub>${h}</sub>`;
      if (r.strike) h = `<s>${h}</s>`;
      if (r.underline) h = `<span class="u">${h}</span>`;
      if (r.italic) h = `<em>${h}</em>`;
      if (r.bold) h = `<strong>${h}</strong>`;
      return h;
    }).join('');
  }

  // split blocks into chapters at each Heading 1
  function chaptersOf(blocks, bookTitle) {
    const chapters = [];
    let cur = null;
    for (const b of blocks) {
      if (b.tag === 'h1') { cur = { title: b.runs.map(r => r.text || '').join('').trim() || 'Chapter', blocks: [b] }; chapters.push(cur); continue; }
      if (b.newPage) { cur = { title: b.chapterTitle || 'Chapter', blocks: [b] }; chapters.push(cur); continue; }
      if (!cur) { cur = { title: bookTitle, blocks: [] }; chapters.push(cur); }
      cur.blocks.push(b);
    }
    return chapters.filter(c => c.blocks.some(b => b.runs.some(r => (r.text || '').trim() || r.img)));
  }

  const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const words = n => n < 20 ? ONES[n] : n < 100 ? TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '') : String(n);
  // chapter heading in the book design's style: "Chapter One", ornament, title
  function openerXHTML(ch, T) {
    if (!T) return '';
    const t = T.t;
    const num = ch.numbered && t.number !== 'none' ? `${t.label ? t.label + ' ' : ''}${window.UnwipTypeset ? window.UnwipTypeset.numberText(ch.n, t) : words(ch.n)}` : '';
    const title = ch.hidden ? '' : (ch.title || (!num ? ch.raw || '' : ''));
    if (!num && !title) return '';
    // no title of its own: the number line is the heading (said once; Kindle showed "Chapter One" twice before)
    if (!title) return `<div class="opener"><h1 class="num">${x(num)}</h1>${t.orn ? `<p class="orn">${x(t.orn)}</p>` : ''}</div>\n`;
    return `<div class="opener">${num ? `<p class="num">${x(num)}</p>` : ''}${t.orn ? `<p class="orn">${x(t.orn)}</p>` : ''}<h1>${x(title)}</h1></div>\n`;
  }
  // LitRPG [system messages]: a paragraph that's all [bracketed] can go out as a box (Settings › LitRPG tools)
  const SYSMSG = /^\s*\[[^\[\]]*(\][^\[\]]*\[[^\[\]]*)*\]\s*$/;
  let sysBoxes = false;
  function chapterXHTML(ch, lang, T) {
    let body = T ? openerXHTML(ch, T) : '', afterBreak = true, firstPara = !!T;
    const notes = [];
    for (const b of ch.blocks) {
      const text = b.runs.map(r => r.text || '').join('');
      const hasImg = b.runs.some(r => r.img);
      if (!text.trim() && !hasImg) continue;         // blank lines: e-readers handle spacing themselves
      if (hasImg) { body += `<div class="pic" style="text-align:${b.align === 'left' ? 'left' : b.align === 'right' ? 'right' : 'center'}">${runsXHTML(b.runs, notes)}</div>\n`; afterBreak = true; continue; }
      if (/^h[1-3]$/.test(b.tag)) { body += `<${b.tag}>${runsXHTML(b.runs, notes)}</${b.tag}>\n`; afterBreak = true; continue; }
      if (sysBoxes && SYSMSG.test(text)) { body += `<p class="sys">${runsXHTML(b.runs, notes)}</p>\n`; afterBreak = true; firstPara = false; continue; }
      if (SCENE.test(text)) { body += `<p class="scene">${x(T ? (T.t.scene === 'blank line' ? ' ' : T.t.scene) : text.trim())}</p>\n`; afterBreak = true; continue; }
      if (firstPara) {   // the opening paragraph of a chapter: drop cap and small capitals, as in the print book
        firstPara = false;
        let runs = b.runs.map(r => ({ ...r }));
        if (T.t.lead) {
          const first = runs.find(r => r.text && !r.img && r.fn === undefined);
          if (first) { const m = /^(\S+(?:\s+\S+){0,2})(.*)$/s.exec(first.text); if (m) { const i = runs.indexOf(first); runs.splice(i, 1, { ...first, text: '', lead: m[1] }, { ...first, text: m[2] }); } }
        }
        const inner = runs.map(r => r.lead ? `<span class="lead">${x(r.lead)}</span>` : runsXHTML([r], notes)).join('');
        body += `<p class="first${T.t.drop ? ' drop' : ''}">${inner}</p>\n`;
        afterBreak = false; continue;
      }
      const cls = [afterBreak ? 'first' : '', b.align === 'center' ? 'center' : b.align === 'right' ? 'right' : '', b.tag === 'blockquote' ? 'quote' : ''].filter(Boolean).join(' ');
      body += `<p${cls ? ` class="${cls}"` : ''}>${runsXHTML(b.runs, notes)}</p>\n`;
      afterBreak = false;
    }
    return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><meta charset="utf-8"/><title>${x(ch.nav || ch.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<section epub:type="${ch.section ? 'backmatter' : 'chapter'}">
${body}</section>
${notes.length ? `<section class="notes"><hr/>\n${notes.map((t, i) => `<aside epub:type="footnote" id="fn${i + 1}"><p class="note"><a href="#fnref${i + 1}">${i + 1}.</a> ${x(t)}</p></aside>`).join('\n')}\n</section>` : ''}
</body>
</html>`;
  }

  function css(style, T) {
    const h1 = style.headings.h1;
    const t = T && T.t;
    const extra = t ? `
.opener { text-align: ${t.align}; margin: 3em 0 2em; page-break-before: always; }
.opener h1 { margin: .2em 0 0; page-break-before: auto; font-family: "${t.head}", serif; font-weight: normal; font-style: ${t.titleStyle === 'italic' ? 'italic' : 'normal'}; ${t.titleStyle === 'smallcaps' ? 'font-variant: small-caps; letter-spacing: .1em;' : ''}${t.titleCase === 'upper' ? 'text-transform: uppercase; letter-spacing: .05em;' : ''} text-align: ${t.align}; font-size: 1.6em; }
.opener p.num, .opener h1.num { font-weight: normal; text-indent: 0; text-align: ${t.align}; margin: 0; font-size: ${t.number === 'digits' && t.numSize > 2 ? '2.4em' : '1em'}; ${t.numCase === 'smallcaps' ? 'font-variant: small-caps; letter-spacing: .15em;' : t.numCase === 'upper' ? 'text-transform: uppercase; letter-spacing: .12em;' : t.numCase === 'lower' ? 'font-style: italic;' : ''} }
.opener p.orn { text-indent: 0; text-align: ${t.align}; margin: .3em 0; }
p.drop::first-letter { float: left; font-size: 3.2em; line-height: .8; margin: .06em .08em 0 0; }
span.lead { font-variant: small-caps; letter-spacing: .04em; }
.front { text-align: center; margin-top: 20%; } .front p { text-indent: 0; text-align: center; }
.front .bt { font-size: 1.8em; margin: 0 0 .4em; } .front .st { font-style: italic; margin-bottom: 2em; } .front .au { font-variant: small-caps; letter-spacing: .1em; font-size: 1.2em; }
.copy { margin-top: 30%; font-size: .8em; } .copy p { text-indent: 0; margin: 0 0 .7em; text-align: left; }
.ded { text-align: center; margin-top: 30%; font-style: italic; } .ded p { text-indent: 0; text-align: center; }
.epi { margin: 30% 10% 0; font-style: italic; } .epi p { text-indent: 0; } .epi p.by { font-style: normal; text-align: right; font-variant: small-caps; }` : '';
    return `body { margin: 0 5%; font-family: "${style.font}", serif; line-height: 1.4; }
p { margin: 0; text-indent: 1.5em; text-align: ${style.justify ? 'justify' : 'left'}; }
p.first, p.center, p.right, p.scene { text-indent: 0; }
p.center { text-align: center; } p.right { text-align: right; }
p.quote { margin: 0 2em; text-indent: 0; }
p.scene { text-align: center; margin: 1em 0; }
h1 { font-family: "${h1.font}", serif; text-align: ${h1.align}; font-weight: ${h1.bold ? 'bold' : 'normal'}; font-style: ${h1.italic ? 'italic' : 'normal'}; font-size: 1.6em; margin: 3em 0 1.5em; page-break-before: always; }
h2 { font-size: 1.25em; margin: 1.5em 0 .6em; } h3 { font-size: 1.1em; margin: 1.2em 0 .5em; }
.u { text-decoration: underline; }
div.pic { margin: 1em 0; text-indent: 0; } div.pic img { max-width: 100%; height: auto; }
a.noteref { text-decoration: none; } a.noteref sup { font-size: .7em; line-height: 0; }
.notes hr { width: 30%; margin: 2em 0 1em; border: 0; border-top: 1px solid #999; text-align: left; } p.note { text-indent: 0; font-size: .85em; margin: 0 0 .4em; }
.title-page { text-align: center; margin-top: 30%; } .title-page h1 { page-break-before: auto; margin: 0 0 1em; } .title-page p { text-indent: 0; text-align: center; }
p.sys { text-indent: 0; text-align: left; margin: .7em 1.2em; padding: .35em .7em; border: 1px solid #5d84c9; border-left: 4px solid #5d84c9; background-color: #eef3fb; color: #1d2a44; font-family: monospace; font-size: .88em; page-break-inside: avoid; }
p.sys + p.sys { margin-top: -.45em; border-top: 0; }` + extra;
  }

  function uuid() {
    const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    const h = [...b].map(v => v.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  function build({ blocks, style, title, author, lang, id, typeset, systemBoxes }) {
    sysBoxes = !!systemBoxes;
    lang = (lang || 'en').split('-')[0];
    IMAGES = [];
    const T = typeset && window.UnwipTypeset ? typeset : null;
    const book = (T && T.book) || {};
    let chapters;
    if (T) {
      // numbered chapters, parts as their own short sections, back matter after the story
      chapters = window.UnwipTypeset.chaptersFrom(blocks).map(c => c.kind === 'part' ? { title: c.title, blocks: [], part: true } : { ...c, nav: c.title ? (c.numbered && T.t.number !== 'none' ? `${window.UnwipTypeset.numberText(c.n, T.t)}: ${c.title}` : c.title) : (c.numbered && T.t.number !== 'none' ? `${T.t.label || 'Chapter'} ${window.UnwipTypeset.numberText(c.n, T.t)}` : c.raw || c.tocTitle || title) });
      const B = T.d.back, sec = (name, text) => { if (String(text || '').trim()) chapters.push({ title: name, section: true, numbered: false, blocks: text.split(/\n\s*\n/).map(p => ({ tag: 'p', runs: [{ text: p.trim() }] })), raw: name }); };
      if (B.acknowledgements) sec('Acknowledgements', book.acknowledgements);
      if (B.about) sec('About the Author', book.about);
      if (B.alsoBy && String(book.alsoBy || '').trim()) chapters.push({ title: `Also by ${author || 'the author'}`, section: true, raw: `Also by ${author || 'the author'}`, blocks: book.alsoBy.split('\n').filter(l => l.trim()).map(l => ({ tag: 'p', align: 'center', runs: [{ text: l.trim(), italic: true }] })) });
    } else chapters = chaptersOf(blocks, title);
    const enc = new TextEncoder();
    const files = [];
    const add = (name, text) => files.push({ name, data: enc.encode(text) });
    files.push({ name: 'mimetype', data: enc.encode('application/epub+zip') }); // must be first
    add('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`);
    add('OEBPS/style.css', css(style, T));
    add('OEBPS/title.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>${T ? `<div class="front"><h1 class="bt">${x(title)}</h1>${book.subtitle ? `<p class="st">${x(book.subtitle)}</p>` : ''}${author ? `<p class="au">${x(author)}</p>` : ''}${book.publisher ? `<p style="margin-top:3em;font-size:.85em">${x(book.publisher)}</p>` : ''}</div>` : `<div class="title-page"><h1>${x(title)}</h1>${author ? `<p>${x(author)}</p>` : ''}</div>`}</body></html>`);
    chapters.forEach((c, i) => add(`OEBPS/ch${String(i + 1).padStart(3, '0')}.xhtml`, c.part
      ? `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${x(c.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><section epub:type="part" class="title-page"><h1>${x(c.title)}</h1></section></body></html>`
      : chapterXHTML(c, lang, T)));
    // front matter pages after the title page: copyright, dedication, epigraph
    const front = [];
    if (T) {
      const F = T.d.front, page = (id, cls, inner, type) => { add(`OEBPS/${id}.xhtml`, `<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>${x(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head><body><section epub:type="${type}" class="${cls}">${inner}</section></body></html>`); front.push(id); };
      const yr = book.year || new Date().getFullYear();
      if (F.copyright) page('copyright', 'copy', String(book.copyright || '').trim() ? book.copyright.split(/\n\s*\n/).map(p => `<p>${x(p.trim())}</p>`).join('') :
        [`Copyright © ${yr} ${author || 'the author'}`, 'All rights reserved.', 'No part of this book may be reproduced in any form or by any electronic or mechanical means without written permission from the author, except for brief quotations in a review.', 'This is a work of fiction. Names, characters, places and incidents are the products of the author’s imagination or are used fictitiously.', book.isbnEbook ? `ISBN ${book.isbnEbook}` : '', book.publisher ? `Published by ${book.publisher}` : ''].filter(Boolean).map(p => `<p>${x(p)}</p>`).join(''), 'copyright-page');
      if (F.dedication && String(book.dedication || '').trim()) page('dedication', 'ded', book.dedication.split('\n').map(l => `<p>${x(l)}</p>`).join(''), 'dedication');
      if (F.epigraph && String(book.epigraph || '').trim()) page('epigraph', 'epi', book.epigraph.split('\n').map(l => `<p>${x(l)}</p>`).join('') + (book.epigraphBy ? `<p class="by">— ${x(book.epigraphBy)}</p>` : ''), 'epigraph');
    }
    const items = chapters.map((c, i) => `ch${String(i + 1).padStart(3, '0')}`);
    add('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}"><head><meta charset="utf-8"/><title>Contents</title></head>
<body><nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
${chapters.map((c, i) => `<li><a href="${items[i]}.xhtml">${x(c.nav || c.title)}</a></li>`).join('\n')}
</ol></nav>
<nav epub:type="landmarks" hidden=""><ol><li><a epub:type="bodymatter" href="${items[0] || 'title'}.xhtml">Start</a></li></ol></nav></body></html>`);
    for (const im of IMAGES) files.push({ name: 'OEBPS/images/' + im.name, data: im.data });
    const ident = id || 'urn:uuid:' + uuid();
    add('OEBPS/toc.ncx', `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${x(ident)}"/></head>
<docTitle><text>${x(title)}</text></docTitle><navMap>
${chapters.map((c, i) => `<navPoint id="np${i + 1}" playOrder="${i + 1}"><navLabel><text>${x(c.nav || c.title)}</text></navLabel><content src="${items[i]}.xhtml"/></navPoint>`).join('\n')}
</navMap></ncx>`);
    const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    add('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${x(ident)}</dc:identifier>
<dc:title>${x(title)}</dc:title>
${author ? `<dc:creator>${x(author)}</dc:creator>` : ''}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
${front.map(f => `<item id="${f}" href="${f}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
${items.map(i => `<item id="${i}" href="${i}.xhtml" media-type="application/xhtml+xml"/>`).join('\n')}
${IMAGES.map((im, k) => `<item id="pic${k + 1}" href="images/${im.name}" media-type="${im.mime}"/>`).join('\n')}
</manifest>
<spine toc="ncx">
<itemref idref="title"/>
${front.map(f => `<itemref idref="${f}"/>`).join('\n')}
${items.map(i => `<itemref idref="${i}"/>`).join('\n')}
</spine>
</package>`);
    return { bytes: zip(files), chapters: chapters.length };
  }

  return { build, zip };
})();
