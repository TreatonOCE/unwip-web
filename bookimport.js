// Unwip - bring a book in from anywhere: Word, Google Docs (pasted or downloaded), LibreOffice,
// RTF, plain text, Markdown, web pages. One file, several files, a whole folder, or a paste.
// Finds the chapters by itself (headings, "Chapter …" lines, page breaks, styled title lines),
// then shows a preview where every chapter break can be ticked or unticked before importing.
window.UnwipBookImport = (function () {
  'use strict';
  const U = window.__unwip;
  const { $, $$, esc, S, api } = U;
  const Clip = window.FolioClip, FI = window.FolioImport;
  const PB = '⟦page-break⟧';                     // marker paragraph for page breaks while cleaning

  // ================================================================== READING FILES
  function decodeText(bytes) {
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (bytes[0] === 0xFF && bytes[1] === 0xFE) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    if (bytes[0] === 0xFE && bytes[1] === 0xFF) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) bytes = bytes.subarray(3);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return new TextDecoder('windows-1252').decode(bytes); }
  }
  const NUMWORD = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred)';

  // plain text: blank lines separate paragraphs; if there are none, every line is a paragraph
  function textToHTML(t) {
    t = t.replace(/\r\n?/g, '\n').replace(/\f/g, `\n\n${PB}\n\n`).replace(/\t/g, '    ');
    const lines = t.split('\n');
    const blanks = lines.filter(l => !l.trim()).length;
    const out = [];
    if (blanks >= lines.length * 0.15) {
      // hard-wrapped text (old e-texts, emails): lines of similar length inside a paragraph are joined
      for (const para of t.split(/\n\s*\n/)) {
        const ls = para.split('\n').map(l => l.trim()).filter(Boolean);
        if (!ls.length) continue;
        const wrapped = ls.length > 1 && ls.slice(0, -1).every(l => l.length > 45 && !/^([*#~\-•]\s*){1,5}$/.test(l));
        if (wrapped) out.push(`<p>${esc(ls.join(' '))}</p>`); else ls.forEach(l => out.push(`<p>${esc(l)}</p>`));
      }
    } else lines.forEach(l => { if (l.trim()) out.push(`<p>${esc(l.trim())}</p>`); });
    return out.join('');
  }

  // Markdown (Obsidian, Ulysses, iA Writer, Notion, Bear exports)
  function mdInline(s) {
    s = esc(s);
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<b><i>$1</i></b>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/__(.+?)__/g, '<b>$1</b>');
    s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<i>$2</i>');
    s = s.replace(/~~(.+?)~~/g, '<s>$1</s>').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2');
    return s;
  }
  function mdToHTML(t) {
    t = t.replace(/\r\n?/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');   // drop a front-matter block
    const out = []; let para = [];
    const flush = () => { if (para.length) { out.push(`<p>${mdInline(para.join(' '))}</p>`); para = []; } };
    for (const raw of t.split('\n')) {
      const l = raw.trim();
      if (!l) { flush(); continue; }
      let m;
      if ((m = l.match(/^(#{1,6})\s+(.*?)\s*#*$/))) { flush(); const n = Math.min(3, m[1].length); out.push(`<h${n}>${mdInline(m[2])}</h${n}>`); continue; }
      if (/^((\*|-|_)\s*){3,}$/.test(l) || /^#$/.test(l)) { flush(); out.push('<p style="text-align:center">* * *</p>'); continue; }
      if ((m = l.match(/^>\s?(.*)$/))) { flush(); out.push(`<blockquote>${mdInline(m[1])}</blockquote>`); continue; }
      if ((m = l.match(/^([-*+]|\d+[.)])\s+(.*)$/)) && !/^\*[^*\s]/.test(l)) { flush(); out.push(`<p>${mdInline(m[2])}</p>`); continue; }
      if (/\s{2}$/.test(raw) || /\\$/.test(raw)) { para.push(l.replace(/\\$/, '')); flush(); continue; }
      para.push(l);
    }
    flush();
    return out.join('');
  }

  // LibreOffice / OpenDocument (.odt) - also what Google Docs gives you as "OpenDocument"
  async function odtToHTML(bytes) {
    const zip = await FI.unzip(bytes);
    if (!zip['content.xml']) throw new Error('This doesn’t look like an OpenDocument file.');
    const xml = new TextDecoder().decode(await zip['content.xml']());
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const NS = { text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0', style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0', fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0' };
    const styles = {};
    let stylesXml = null; try { if (zip['styles.xml']) stylesXml = new DOMParser().parseFromString(new TextDecoder().decode(await zip['styles.xml']()), 'application/xml'); } catch {}
    for (const d of [stylesXml, doc].filter(Boolean)) for (const st of d.getElementsByTagNameNS(NS.style, 'style')) {
      const tp = st.getElementsByTagNameNS(NS.style, 'text-properties')[0], pp = st.getElementsByTagNameNS(NS.style, 'paragraph-properties')[0];
      styles[st.getAttributeNS(NS.style, 'name')] = {
        parent: st.getAttributeNS(NS.style, 'parent-style-name'), display: st.getAttributeNS(NS.style, 'display-name') || '',
        bold: tp && /bold|[6-9]00/.test(tp.getAttributeNS(NS.fo, 'font-weight') || '') || null, italic: tp && tp.getAttributeNS(NS.fo, 'font-style') === 'italic' || null,
        align: pp && pp.getAttributeNS(NS.fo, 'text-align') || null, brk: pp && pp.getAttributeNS(NS.fo, 'break-before') === 'page'
      };
    }
    const prop = (name, k, d = 0) => { const s = styles[name]; if (!s || d > 8) return null; return s[k] || prop(s.parent, k, d + 1); };
    const isHeadingStyle = name => { for (let n = name, d = 0; n && d < 8; n = (styles[n] || {}).parent, d++) { const m = /^(heading|title)[ _]*(20)?[ _]*(\d)?/i.exec(n) || /^(heading|title)\s*(\d)?/i.exec((styles[n] || {}).display || ''); if (m) return /title/i.test(m[1]) ? 1 : +(m[3] || m[2] || 1); } return 0; };
    const inline = el => {
      let h = '';
      for (const c of el.childNodes) {
        if (c.nodeType === 3) { h += esc(c.nodeValue); continue; }
        const ln = c.localName;
        if (ln === 's') h += ' '.repeat(+(c.getAttributeNS(NS.text, 'c') || 1));
        else if (ln === 'tab') h += ' ';
        else if (ln === 'line-break') h += '<br>';
        else if (ln === 'note' || ln === 'annotation' || ln === 'bookmark' || ln === 'soft-page-break') continue;
        else {
          let inner = inline(c);
          const sn = c.getAttributeNS(NS.text, 'style-name');
          if (sn && prop(sn, 'italic')) inner = `<i>${inner}</i>`;
          if (sn && prop(sn, 'bold')) inner = `<b>${inner}</b>`;
          h += inner;
        }
      }
      return h;
    };
    const out = [];
    const walk = el => {
      for (const c of el.children) {
        const ln = c.localName;
        if (ln === 'p' || ln === 'h') {
          const sn = c.getAttributeNS(NS.text, 'style-name');
          if (sn && prop(sn, 'brk')) out.push(`<p>${PB}</p>`);
          let lvl = ln === 'h' ? +(c.getAttributeNS(NS.text, 'outline-level') || 1) : isHeadingStyle(sn);
          const al = sn && prop(sn, 'align'); const align = al === 'center' ? 'center' : al === 'end' || al === 'right' ? 'right' : null;
          let body = inline(c).trim();
          if (sn && prop(sn, 'bold') && body) body = `<b>${body}</b>`;
          if (sn && prop(sn, 'italic') && body) body = `<i>${body}</i>`;
          const tag = lvl ? 'h' + Math.min(3, lvl) : 'p';
          out.push(`<${tag}${align ? ` style="text-align:${align}"` : ''}>${body || '<br>'}</${tag}>`);
        } else if (['list', 'list-item', 'section', 'list-header', 'table', 'table-row', 'table-cell', 'table-header-rows'].includes(ln)) walk(c);
      }
    };
    const body = doc.getElementsByTagNameNS('urn:oasis:names:tc:opendocument:xmlns:office:1.0', 'text')[0];
    if (body) walk(body);
    return out.join('');
  }

  async function fileToHTML(f) {
    const ext = (f.ext || '').toLowerCase();
    if (ext === 'docx') return FI.docxToHTML(f.bytes);
    if (ext === 'odt') return odtToHTML(f.bytes);
    const t = decodeText(f.bytes);
    if (ext === 'rtf' || /^\s*\{\\rtf/.test(t)) return window.FolioRTF.toHTML(t.replace(/\\page(?![a-z])\s?/g, '\\par \\u10214?page-break\\u10215?\\par '));
    if (ext === 'md' || ext === 'markdown') return mdToHTML(t);
    if (ext === 'htm' || ext === 'html') return t;
    if (ext === 'doc') throw new Error('Old Word files (.doc) can’t be read. Open it in Word and use Save As › Word Document (.docx).');
    if (ext === 'pages') throw new Error('Pages files can’t be read. In Pages, use File › Export To › Word.');
    if (ext === 'pdf') throw new Error('PDFs can’t be imported. Use the original Word or Google Docs file instead.');
    if (/[\x00-\x08\x0E-\x1F]/.test(t.slice(0, 2000))) throw new Error('This file type can’t be read. Save it as Word (.docx), text (.txt) or RTF first.');
    return /^\s*#\s|\n#{1,3}\s/.test(t) && /\n\s*\n/.test(t) ? mdToHTML(t) : textToHTML(t);
  }

  // ================================================================== TURNING HTML INTO BLOCKS
  // Page breaks are swapped for a marker first, because cleaning drops them.
  function markBreaks(html) {
    const d = document.createElement('div'); d.innerHTML = html;
    d.querySelectorAll('script,style,meta,title,link').forEach(e => e.remove());
    for (const el of d.querySelectorAll('[data-break], [data-break-after], [style*="page-break"], [style*="break-before"], [style*="break-after"], hr')) {
      const st = (el.getAttribute('style') || '').toLowerCase().replace(/\s/g, '');
      const before = el.hasAttribute('data-break') || /page-break-before:always|break-before:page/.test(st);
      const after = el.hasAttribute('data-break-after') || /page-break-after:always|break-after:page/.test(st);
      const m = document.createElement('p'); m.textContent = PB;
      if (el.tagName === 'HR') { if (before || after) el.replaceWith(m); else { const sb = document.createElement('p'); sb.textContent = '* * *'; sb.style.textAlign = 'center'; el.replaceWith(sb); } continue; }
      if (before) el.before(m); else if (after) el.after(m);
    }
    return d.innerHTML;
  }
  const SCENE = /^\s*(((\*|#|~|•|·|⁂|§|o)\s*){1,5}|(-\s*){3,}|(_\s*){3,}|(=\s*){3,})\s*$/i;
  const CH_RE = new RegExp(`^\\s*((chapter|chap\\.|ch\\.|chapitre|cap[ií]tulo|capitolo|kapitel|hoofdstuk)(\\s+([ivxlc]+|\\d+|${NUMWORD}|the\\s+\\w+)\\b|\\s*[:.\\-–—]?\\s*$)|(prologue|epilogue|interlude|introduction|foreword|preface|afterword|coda)\\b|(part|book|act|volume)\\s+([ivxlc]+|\\d+|${NUMWORD})\\b)`, 'i');
  const PART_RE = new RegExp(`^\\s*(part|book|act|volume)\\s+([ivxlc]+|\\d+|${NUMWORD}(-${NUMWORD})?)\\b`, 'i');
  const NUM_RE = new RegExp(`^\\s*(\\d{1,3}|[ivxlc]{1,7}|${NUMWORD}([\\s-]+${NUMWORD})?)\\s*[.:)]?\\s*$`, 'i');

  function toBlocks(html) {
    const clean = Clip.cleanPaste(markBreaks(html), {});
    const d = document.createElement('div'); d.innerHTML = clean;
    const blocks = [];
    for (const el of [...d.children]) {
      const text = el.textContent.replace(/ /g, ' ').trim();
      if (text === PB) { blocks.push({ pb: true }); continue; }
      const words = text ? text.split(/\s+/).length : 0;
      const tag = el.tagName.toLowerCase();
      const boldText = [...el.querySelectorAll('b,strong')].map(b => b.textContent).join('').replace(/\s/g, '');
      const sizes = [...el.querySelectorAll('[style*="font-size"]')].map(s => parseFloat(s.style.fontSize) || 0);
      blocks.push({ html: el.outerHTML, text, words, tag, level: /^h[1-6]$/.test(tag) ? +tag[1] : 0,
        center: (el.style.textAlign || '') === 'center', bold: !!text && boldText.length >= text.replace(/\s/g, '').length * 0.9,
        caps: text.length > 2 && text === text.toUpperCase() && /[A-Z]/.test(text), size: Math.max(0, ...sizes), scene: SCENE.test(text) && text.length < 20 });
    }
    // a page break counts on the block that follows it
    const out = []; let pend = false;
    for (const b of blocks) { if (b.pb) { pend = true; continue; } if (pend && b.text) { b.afterPB = true; pend = false; } out.push(b); }
    // a short line repeated over and over in capitals or centred is a running page header
    const freq = {}; for (const b of out) if (b.text && b.words <= 12 && !b.scene) freq[b.text.toLowerCase()] = (freq[b.text.toLowerCase()] || 0) + 1;
    for (const b of out) if (b.text && freq[b.text.toLowerCase()] >= 4 && (b.caps || b.center) && !b.scene && !NUM_RE.test(b.text) && !/[.!?,;]$/.test(b.text)) b.header = true;
    return out;
  }

  // ================================================================== FINDING THE CHAPTERS
  const titleLike = b => b.text && b.words <= 12 && b.text.length <= 90 && !/[,;]$/.test(b.text) && !(/[.!?]["”’]?$/.test(b.text) && b.words > 4);
  const looksChapterLine = b => titleLike(b) && (CH_RE.test(b.text) || (NUM_RE.test(b.text) && b.words <= 4));
  const WORDNUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  function numValue(t) {
    t = t.trim().replace(/[.:)]$/, '').toLowerCase();
    if (/^\d+$/.test(t)) return +t;
    if (/^[ivxlc]+$/.test(t)) { const R = { i: 1, v: 5, x: 10, l: 50, c: 100 }; let v = 0; for (let k = 0; k < t.length; k++) { const a = R[t[k]], b = R[t[k + 1]] || 0; v += a < b ? -a : a; } return v; }
    const parts = t.split(/[\s-]+/); if (parts.every(p => WORDNUM[p] != null)) return parts.reduce((a, p) => a + WORDNUM[p], 0);
    return null;
  }
  function bodySize(blocks) { const s = blocks.filter(b => b.size && b.words > 20).map(b => b.size).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; }

  // each method returns the indexes of blocks that start a chapter
  const METHODS = {
    headings: { label: 'At headings', explain: 'paragraphs styled as headings', find: blocks => {
      const count = l => blocks.filter(b => b.level === l && b.text).length;
      let top = [1, 2, 3].find(l => count(l) >= 2) || [1, 2, 3].find(l => count(l) >= 1);
      if (!top) return [];
      // the top level is only "Part One / Part Two": the chapters are one level down
      const tops = blocks.filter(b => b.level === top && b.text);
      if (tops.every(b => PART_RE.test(b.text)) && top < 3 && count(top + 1) >= 2) top = top + 1;
      const firstTop = blocks.findIndex(b => b.level === top && b.text);
      return blocks.map((b, i) => {
        if (!b.level || b.level > top || !b.text) return -1;
        // a single higher heading at the very start is the book's title, not a chapter
        if (b.level < top && i < firstTop && !PART_RE.test(b.text) && count(b.level) === 1) return -1;
        return i;
      }).filter(i => i >= 0);
    } },
    chapters: { label: 'At “Chapter …” lines', explain: 'lines like “Chapter 3”, “Prologue” or a number on its own', find: blocks => {
      const idx = blocks.map((b, i) => looksChapterLine(b) && !(b.level && b.level > 1 && blocks.some(x => x.level === 1)) ? i : -1).filter(i => i >= 0);
      // lone numbers mid-sentence are page numbers from a converted PDF, not chapters
      const nums = idx.filter(i => NUM_RE.test(blocks[i].text));
      const midSentence = nums.filter(i => i > 0 && blocks[i - 1].text && !/[.!?"”’)\]…*]$/.test(blocks[i - 1].text)).length;
      if (nums.length >= 4 && midSentence >= nums.length * 0.4) {
        blocks.forEach((b, i) => { if (i && /^\s*\d{1,4}\s*$/.test(b.text) && blocks[i - 1].text && !/[.!?"”’)\]…*]$/.test(blocks[i - 1].text)) b.pageNum = true; });
        return idx.filter(i => !NUM_RE.test(blocks[i].text));
      }
      const form = t => /\d/.test(t) ? 'digit' : /^\s*[ivxlc]+\s*[.:)]?\s*$/i.test(t) ? 'roman' : 'word';
      const tally = {}; nums.forEach(i => { const f = form(blocks[i].text); tally[f] = (tally[f] || 0) + 1; });
      const main = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      let last = -1;
      return idx.filter(i => {
        if (!NUM_RE.test(blocks[i].text) || CH_RE.test(blocks[i].text)) return true;
        if (form(blocks[i].text) !== main) return false;
        const v = numValue(blocks[i].text); if (v != null) { if (v <= last) return false; last = v; }
        return true;
      });
    } },
    pagebreaks: { label: 'At page breaks', explain: 'page breaks', find: blocks => blocks.map((b, i) => b.afterPB ? i : -1).filter(i => i >= 0) },
    mixed: { label: 'At headings and “Chapter …” lines', explain: 'headings and “Chapter …” lines', find: blocks => [...METHODS.headings.find(blocks), ...METHODS.chapters.find(blocks).filter(i => CH_RE.test(blocks[i].text))] },
    styled: { label: 'At short title lines', explain: 'short centred, bold, capitals or large lines', find: blocks => {
      const base = bodySize(blocks);
      const plain = !blocks.some(b => b.center || b.bold || b.level);
      return blocks.map((b, i) => {
        if (!titleLike(b) || b.scene || b.words > 8) return -1;
        const signals = (b.center ? 1 : 0) + (b.bold ? 1 : 0) + (b.caps ? (plain ? 2 : 1) : 0) + (base && b.size >= base + 3 ? 1 : 0) + (b.afterPB ? 1 : 0);
        const prev = blocks[i - 1], next = blocks[i + 1];
        if (next && titleLike(next) && !next.words) return -1;
        return signals >= 2 && (!prev || !prev.center || prev.words > 12) ? i : -1;
      }).filter(i => i >= 0);
    } },
    scenes: { label: 'At scene breaks (* * *)', explain: 'scene breaks like * * *', find: blocks => blocks.map((b, i) => b.scene ? i : -1).filter(i => i >= 0) },
    none: { label: 'Don’t split', explain: '', find: () => [] }
  };

  // automatic: the most trustworthy signal that actually finds chapters
  function autoMethod(blocks) {
    const tries = [];
    for (const m of ['headings', 'chapters', 'pagebreaks', 'styled']) {
      const idx = clean(blocks, METHODS[m].find(blocks)).breaks;
      const need = m === 'styled' ? 3 : 2;
      if (idx.length < need) continue;
      // typical words between breaks: crumbs (a break every few lines) mean these aren't chapters
      const gaps = idx.map((b, k) => { let w = 0; for (let j = b + 1; j < (idx[k + 1] ?? blocks.length); j++) w += blocks[j].words; return w; }).sort((a, b) => a - b);
      tries.push({ m, n: idx.length, med: gaps[Math.floor(gaps.length / 2)] });
    }
    const ok = tries.filter(t => t.n < 6 || t.med >= 150);
    if (!ok.length) return 'none';
    // "Chapter" lines win over headings when headings are fewer (e.g. only Part headings are styled)
    const h = ok.find(t => t.m === 'headings'), c = ok.find(t => t.m === 'chapters');
    if (h && c && c.n > h.n * 1.5) return 'chapters';
    // some chapters styled as headings, others just typed: use both
    if (h && ok[0] === h) {
      const hs = new Set(clean(blocks, METHODS.headings.find(blocks)).breaks);
      const extra = METHODS.chapters.find(blocks).filter(i => !hs.has(i) && CH_RE.test(blocks[i].text) && !hs.has(i - 1));
      if (extra.length && [...hs].some(i => CH_RE.test(blocks[i].text))) return 'mixed';
    }
    return ok[0].m;
  }

  // tidy the breaks: drop a table of contents (runs of headings with nothing between them), merge subtitles
  function clean(blocks, idx) {
    idx = [...new Set(idx)].sort((a, b) => a - b);
    const notes = [];
    const freq = {}; for (const b of blocks) if (b.text && b.words <= 12) freq[b.text.toLowerCase()] = (freq[b.text.toLowerCase()] || 0) + 1;
    const rep = idx.filter(i => blocks[i].header || (freq[blocks[i].text.toLowerCase()] >= 4 && !NUM_RE.test(blocks[i].text)));
    if (rep.length && rep.some(i => !blocks[i].header)) { idx = idx.filter(i => !rep.includes(i)); const r0 = rep.find(i => !blocks[i].header); notes.push(`Ignored “${esc(blocks[r0].text)}”, which repeats ${freq[blocks[r0].text.toLowerCase()]} times (probably a page header).`); }
    idx = idx.filter(i => !blocks[i].header);
    const segWords = (i, k) => { let w = 0; for (let j = idx[k] + 1; j < (k + 1 < idx.length ? idx[k + 1] : blocks.length); j++) w += blocks[j].words; return w; };
    // table of contents: 3+ breaks in a row with almost nothing between them, before the real text
    let run = 0, tocEnd = -1;
    for (let k = 0; k < idx.length; k++) { if (segWords(0, k) < 6) { run++; if (run >= 3) tocEnd = k; } else { if (run >= 3) break; run = 0; } }
    if (tocEnd >= 0) {
      let start = tocEnd; while (start > 0 && segWords(0, start - 1) < 6) start--;
      notes.push(`Left out what looks like a table of contents (${tocEnd - start + 1} lines).`);
      // the contents list starts at "Contents" or the first line that names a later chapter (a title above it stays)
      const later = new Set(idx.slice(tocEnd + 1).map(i => blocks[i].text.toLowerCase()));
      let k0 = start; while (k0 < tocEnd && !later.has(blocks[idx[k0]].text.toLowerCase()) && !/^\s*(table of )?contents\s*$/i.test(blocks[idx[k0]].text)) k0++;
      for (let j = idx[k0]; j < (idx[tocEnd + 1] ?? blocks.length); j++) blocks[j].toc = true;
      if (idx[start] > 0 && /^\s*(table of )?contents\s*$/i.test(blocks[idx[start] - 1].text || '')) blocks[idx[start] - 1].toc = true;
      idx = idx.filter((_, k) => k < start || k > tocEnd);
    }
    // two title lines in a row: "Chapter 3" then "The Storm" - one chapter, not two
    const out = [];
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k];
      if (out.length && i === out[out.length - 1] + 1 && !PART_RE.test(blocks[i].text) && !PART_RE.test(blocks[i - 1].text) && segWords(0, k - 1) === 0) continue;
      out.push(i);
    }
    return { breaks: out, notes };
  }

  // build chapters from break positions. Each chapter: { title, head:[block idx], body:[block idx], part }
  function segment(blocks, breaks, fallbackTitle) {
    const segs = [], isBreak = new Set(breaks);
    const first = breaks.length ? breaks[0] : blocks.length;
    const pre = range(0, first).filter(i => blocks[i].text);
    if (pre.length) {
      const words = pre.reduce((a, i) => a + blocks[i].words, 0);
      const f = pre[0], fb = blocks[f];
      if (breaks.length && words < 120) segs.push({ title: 'Title page', head: [], body: range(0, first), front: true, bookTitle: titleLike(fb) && !CH_RE.test(fb.text) ? tidyTitle(fb.text) : '' });
      // the first chapter often has no page break / heading above it, but does start with its title line
      else if (titleLike(fb) && fb.words <= 8 && !fb.scene && (fb.level || fb.center || fb.bold || fb.caps || CH_RE.test(fb.text) || (breaks.length && blocks[breaks[0]].level === 0 && !blocks[breaks[0]].center === !fb.center)))
        segs.push({ title: tidyTitle(fb.text), head: [f], body: range(f + 1, first) });
      else segs.push({ title: fallbackTitle, head: [], body: range(0, first) });
    }
    breaks.forEach((bi, k) => {
      const end = k + 1 < breaks.length ? breaks[k + 1] : blocks.length;
      const head = [bi];
      let title = blocks[bi].text;
      const isPart = PART_RE.test(title);
      // "Chapter 3" + "The Storm" on the next line => "Chapter 3: The Storm"
      const nx = blocks[bi + 1];
      if (nx && !isPart && !nx.header && bi + 1 < end && !isBreak.has(bi + 1) && titleLike(nx) && nx.words <= 8 && !nx.scene && !/^scene\b/i.test(nx.text) &&
        (CH_RE.test(title) || NUM_RE.test(title)) && title.split(/\s+/).length <= 3 && (nx.level || nx.center || nx.bold || nx.caps) &&
        !(nx.level && range(bi + 2, end).some(j => blocks[j].level === nx.level))) {
        title = `${title.replace(/[.:]\s*$/, '')}: ${nx.text}`; head.push(bi + 1);
      }
      segs.push({ title: tidyTitle(title), head, body: range(bi + head.length, end), part: isPart });
    });
    if (!segs.length) segs.push({ title: fallbackTitle, head: [], body: range(0, blocks.length) });
    return segs;
  }
  const range = (a, b) => { const r = []; for (let i = a; i < b; i++) r.push(i); return r; };
  function tidyTitle(t) {
    t = t.replace(/\s+/g, ' ').trim();
    if (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) t = t.toLowerCase().replace(/(^|[\s:(-])(\w)/g, (m, a, c) => a + c.toUpperCase()).replace(/\b([ivxlc]+)\b/gi, (m) => /^(i|v|x|l|c|vi|ii|iii|iv|ix|xi|xii|xiv|xv|xvi|xvii|xviii|xix|xx|xl|li|lx|xc)$/i.test(m) ? m.toUpperCase() : m);
    return t.slice(0, 80) || 'Chapter';
  }
  const fileTitle = n => { const t = String(n || '').replace(/[_]+/g, ' ').replace(/^\s*\d{1,3}\s*[-–—.:)_]\s*/, '').trim(); return t || String(n || 'Chapter'); };

  // ================================================================== THE WHOLE JOB, START TO PREVIEW
  // sources: [{ name, html }]. Returns state used by the preview.
  async function analyse(sources) {
    const units = [];
    for (const src of sources) {
      const blocks = toBlocks(src.html);
      units.push({ name: src.name, blocks, words: blocks.reduce((a, b) => a + b.words, 0) });
    }
    return units;
  }
  function plan(units, method, multi) {
    const notes = [];
    const chapters = [];
    for (const u of units) {
      let m = method === 'auto' ? autoMethod(u.blocks) : method;
      if (method === 'files') m = 'none';
      let br = METHODS[m].find(u.blocks);
      const c = clean(u.blocks, br); br = c.breaks; notes.push(...c.notes);
      // with several files, a file whose only break is at its very top is just one chapter titled by that line
      const segs = segment(u.blocks, br, multi ? fileTitle(u.name) : 'Opening');
      if (multi && segs[0].front) { segs[0].title = fileTitle(u.name); segs[0].front = false; }
      const hd = u.blocks.filter(b => b.header);
      if (hd.length) notes.push(`Left out “${esc(hd[0].text)}”, which repeats ${hd.length} times (looks like a page header).`);
      const pn = u.blocks.filter(b => b.pageNum).length;
      if (pn) notes.push(`Left out ${pn} page numbers (this looks like it was converted from a PDF, so some paragraphs may be split where pages ended).`);
      segs.forEach(s => { s.body = s.body.filter(i => !u.blocks[i].pageNum && !u.blocks[i].header && !u.blocks[i].toc); s.unit = u; s.method = m; s.on = true; s.words = s.body.reduce((a, i) => a + u.blocks[i].words, 0); chapters.push(s); });
    }
    return { chapters, notes };
  }
  function warnings(chs) {
    const w = [];
    const real = chs.filter(c => c.on && !c.front && !c.part);
    const sizes = real.map(c => c.words).sort((a, b) => a - b), med = sizes[Math.floor(sizes.length / 2)] || 0;
    const tiny = real.filter(c => c.words < 30).length;
    if (tiny >= 2) w.push(`${tiny} chapters have almost no words. If those are headings inside a chapter, untick them.`);
    const huge = real.filter(c => c.words > 9000 && c.words > med * 3);
    if (huge.length) w.push(`“${esc(huge[0].title)}” is very long (${huge[0].words.toLocaleString()} words). It may have chapters inside it that weren’t found. Try another way of splitting above.`);
    if (real.length === 1 && real[0].words > 15000) w.push('No chapters were found, so it will come in as one long document. Try the other ways of splitting above, or split it later with right-click › Split.');
    const dup = {}; real.forEach(c => dup[c.title] = (dup[c.title] || 0) + 1);
    const d = Object.keys(dup).filter(k => dup[k] > 1 && !/^(scene|chapter)$/i.test(k));
    if (d.length && !chs.some(c => c.part)) w.push(`Some chapter names appear twice (e.g. “${esc(d[0])}”). That can mean a table of contents or a repeated header was picked up.`);
    return w;
  }

  // ================================================================== BUILDING THE PROJECT
  function htmlOf(u, idxs) { return idxs.map(i => u.blocks[i].html).join(''); }
  function buildNodes(chs, opts) {
    const docs = {}; const nodes = [];
    let part = null;
    const mkDoc = (title, html) => { const id = U.uid(); docs[id] = html || '<p><br></p>'; const words = U.countWords(html.replace(/<[^>]+>/g, ' ')); return { id, type: 'doc', title, words }; };
    // unticked breaks fold into the chapter before them (their title line goes back into the text)
    const merged = [];
    for (const c of chs) {
      if (!c.on && merged.length) { const p = merged[merged.length - 1]; p.html += htmlOf(c.unit, [...c.head, ...c.body]); continue; }
      merged.push({ ...c, html: htmlOf(c.unit, c.body) });
    }
    for (const c of merged) {
      if (c.part && opts.parts) { part = { id: U.uid(), type: 'folder', title: c.title, holds: 'chapters', open: true, children: [] }; nodes.push(part);
        if (c.html.replace(/<[^>]+>/g, '').trim()) part.children.push(mkDoc(c.title + ' (opening)', c.html)); continue; }
      let node;
      const d = document.createElement('div'); d.innerHTML = c.html;
      const kids = [...d.children]; const hasScenes = opts.scenes && kids.some(k => SCENE.test(k.textContent.trim()) && k.textContent.trim().length < 20);
      if (hasScenes) {
        node = { id: U.uid(), type: 'folder', title: c.title, holds: 'scenes', open: false, children: [] };
        let cur = [], n = 1;
        const push = () => { if (cur.join('').replace(/<[^>]+>/g, '').trim()) node.children.push(mkDoc(`Scene ${n++}`, cur.join(''))); cur = []; };
        for (const k of kids) { if (SCENE.test(k.textContent.trim()) && k.textContent.trim().length < 20) push(); else cur.push(k.outerHTML); }
        push();
      } else node = mkDoc(c.title, c.html);
      (part && !c.front ? part.children : nodes).push(node);
    }
    return { nodes, docs };
  }

  async function commit(chs, opts) {
    const { nodes, docs } = buildNodes(chs, opts);
    if (opts.dest === 'new') {
      const t = U.newProjectTemplate();
      t.binder[0].children = nodes;
      let first = null; U.walkTree(nodes, n => { if (!first && n.type === 'doc' && !/^title page$/i.test(n.title)) first = n.id; });
      t.lastDoc = first; t.importedFrom = opts.from || 'Import';
      const slug = await api.createProject(opts.title || 'Imported book', t);
      for (const [id, html] of Object.entries(docs)) await api.saveDoc(slug, id, window.FolioClip.dropBlankLines(html).html);
      await U.openProject(slug, { skipCheck: true });
    } else {
      const parent = U.findNode(opts.parentId || 'root-manuscript').node;
      for (const [id, html] of Object.entries(docs)) await api.saveDoc(S.slug, id, window.FolioClip.dropBlankLines(html).html);
      parent.children.push(...nodes); parent.open = true;
      U.scheduleMeta(); U.renderBinder(); U.updateStatus();
    }
    let n = 0; U.walkTree(nodes, x => { if (x.type === 'doc') n++; });
    U.toast(`Imported ${n} document${n === 1 ? '' : 's'}. ${opts.dest === 'new' ? 'Your book is ready.' : ''}`, '', 5000);
    return { nodes, docs };
  }

  // ================================================================== THE PREVIEW SCREEN
  let ov = null;
  function close() { if (ov) { ov.remove(); ov = null; } }

  async function preview(sources, ctx = {}) {
    const multi = sources.length > 1;
    let units;
    try { units = await analyse(sources); } catch (e) { U.toast(esc(e.message || 'Couldn’t read that.'), 'warn', 7000); return; }
    const total = units.reduce((a, u) => a + u.words, 0);
    if (!total) { U.toast('There were no words in that to import.', 'warn', 6000); return; }
    let method = 'auto';
    const st = { scenes: S.settings.structure === 'scenes' || S.settings.structure === 'parts', parts: true,
      dest: ctx.parentId && S.slug ? 'here' : 'new', title: ctx.title || (multi ? (ctx.folder || 'My book') : fileTitle(sources[0].name)) };
    let p = plan(units, method, multi);
    const bt = !multi && !ctx.title && (p.chapters.find(c => c.bookTitle) || {}).bookTitle;
    if (bt) st.title = bt;
    close();
    ov = document.createElement('div'); ov.id = 'bi'; document.body.appendChild(ov);

    const autoSays = () => {
      const used = [...new Set(p.chapters.map(c => c.method))].filter(m => m !== 'none');
      const n = p.chapters.filter(c => !c.front).length;
      if (multi) return `${sources.length} files${n > sources.length ? `, split into ${n} chapters` : ', one chapter each'}.`;
      if (!used.length) return 'No chapters found. It will come in as one document.';
      return `Found ${n} chapter${n === 1 ? '' : 's'} using ${METHODS[used[0]].explain}.`;
    };
    const counts = () => Object.keys(METHODS).filter(m => m !== 'none').map(m => [m, units.reduce((a, u) => a + clean(u.blocks, METHODS[m].find(u.blocks)).breaks.length, 0)]);
    function render() {
      const chs = p.chapters, onCount = chs.filter(c => c.on).length;
      const hasScenes = units.some(u => u.blocks.some(b => b.scene));
      const hasParts = chs.some(c => c.part);
      const warn = warnings(chs);
      ov.innerHTML = `<div class="bi-card">
        <div class="bi-head"><h2>Bring in your book</h2><button class="in-skip" data-x>Cancel</button></div>
        <div class="bi-body">
          <p class="bi-found"><b>${total.toLocaleString()} words</b>${multi ? ` from ${sources.length} files` : ''}. ${esc(autoSays())}</p>
          <div class="bi-row"><label>Split into chapters</label><select id="bi-method">
            <option value="auto"${method === 'auto' ? ' selected' : ''}>Automatically (recommended)</option>
            ${multi ? `<option value="files"${method === 'files' ? ' selected' : ''}>One file = one chapter</option>` : ''}
            ${counts().map(([m, n]) => `<option value="${m}"${method === m ? ' selected' : ''}${n ? '' : ' disabled'}>${METHODS[m].label} (${n} found)</option>`).join('')}
            <option value="none"${method === 'none' ? ' selected' : ''}>Don’t split${multi ? ' (each file stays whole)' : ''}</option></select></div>
          ${hasScenes ? `<label class="bi-check"><input type="checkbox" id="bi-scenes"${st.scenes ? ' checked' : ''}> Also split each chapter into scenes at * * *</label>` : ''}
          ${hasParts ? `<label class="bi-check"><input type="checkbox" id="bi-parts"${st.parts ? ' checked' : ''}> Put chapters inside their Part folders</label>` : ''}
          ${p.notes.length || warn.length ? `<div class="bi-warn">${[...p.notes.map(esc), ...warn].map(x => `<p>${x}</p>`).join('')}</div>` : ''}
          <div class="bi-list-head"><span>${onCount} document${onCount === 1 ? '' : 's'}. Untick a line to join it to the one above. Click a name to change it.</span></div>
          <div class="bi-list">${chs.map((c, i) => `<div class="bi-item${c.on ? '' : ' off'}${c.part ? ' part' : ''}" data-i="${i}">
              ${i ? `<input type="checkbox" data-on ${c.on ? 'checked' : ''} title="Start a new chapter here">` : '<span class="bi-first"></span>'}
              <input class="bi-title" data-t value="${esc(c.title)}" ${c.on ? '' : 'disabled'}>
              <span class="bi-words">${c.words.toLocaleString()}</span>
              <span class="bi-snip">${esc(firstWords(c))}</span></div>`).join('')}</div>
          <div class="bi-dest">
            <label class="bi-radio"><input type="radio" name="bi-dest" value="new"${st.dest === 'new' ? ' checked' : ''}> As a new project called <input id="bi-ptitle" value="${esc(st.title)}"></label>
            ${S.slug ? `<label class="bi-radio"><input type="radio" name="bi-dest" value="here"${st.dest === 'here' ? ' checked' : ''}> Into “${esc(ctx.parentId ? (U.findNode(ctx.parentId) || { node: { title: 'this folder' } }).node.title : 'Manuscript')}” in ${esc(S.project.title)}</label>` : ''}
          </div>
        </div>
        <div class="bi-foot"><span class="bi-tip">Nothing in the original files is changed.</span><button class="btn primary" id="bi-go">Import ${onCount} document${onCount === 1 ? '' : 's'}</button></div></div>`;
      wire();
    }
    const firstWords = c => { const t = c.body.map(i => c.unit.blocks[i].text).filter(Boolean).join(' '); return t.slice(0, 110) + (t.length > 110 ? '…' : ''); };
    function wire() {
      $('[data-x]', ov).onclick = close;
      $('#bi-method', ov).onchange = e => { method = e.target.value; p = plan(units, method, multi); render(); };
      const sc = $('#bi-scenes', ov); if (sc) sc.onchange = () => { st.scenes = sc.checked; };
      const pa = $('#bi-parts', ov); if (pa) pa.onchange = () => { st.parts = pa.checked; };
      $$('[data-on]', ov).forEach(cb => cb.onchange = () => { p.chapters[+cb.closest('.bi-item').dataset.i].on = cb.checked; const top = $('.bi-list', ov).scrollTop; render(); $('.bi-list', ov).scrollTop = top; });
      $$('[data-t]', ov).forEach(inp => inp.oninput = () => { p.chapters[+inp.closest('.bi-item').dataset.i].title = inp.value; });
      $$('[name="bi-dest"]', ov).forEach(r => r.onchange = () => { st.dest = r.value; });
      const pt = $('#bi-ptitle', ov); pt.oninput = () => { st.title = pt.value; }; pt.onfocus = () => { st.dest = 'new'; const r = $('[name="bi-dest"][value="new"]', ov); if (r) r.checked = true; };
      $('#bi-go', ov).onclick = async () => {
        const b = $('#bi-go', ov); b.disabled = true; b.textContent = 'Importing…';
        try { await commit(p.chapters, { ...st, parentId: ctx.parentId, from: ctx.from }); close(); if (ctx.onDone) ctx.onDone(); }
        catch (e) { b.disabled = false; b.textContent = 'Try again'; U.toast(esc(e.message || 'Import failed.'), 'warn', 7000); }
      };
    }
    render();
    return { get plan() { return p; }, units };
  }

  // ================================================================== WAYS IN
  async function readFiles(files) {
    const sources = [], bad = [];
    files = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const f of files) { try { const html = await fileToHTML(f); sources.push({ name: f.name, html }); } catch (e) { bad.push(`${f.name}: ${e.message}`); } }
    if (bad.length) U.toast(bad.map(esc).join('<br>'), 'warn', 9000);
    return sources;
  }
  async function fromFiles(ctx = {}) {
    const files = await api.importFiles(); if (!files) return;
    const sources = await readFiles(files); if (!sources.length) return;
    return preview(sources, { ...ctx, from: 'Files' });
  }
  async function fromFolder(ctx = {}) {
    const res = await api.importFolder(); if (!res) return;
    if (!res.files.length) { U.toast('That folder has no Word, text, RTF or Markdown files in it.', 'warn', 6000); return; }
    const sources = await readFiles(res.files); if (!sources.length) return;
    return preview(sources, { ...ctx, folder: res.folder, title: res.folder, from: 'Folder' });
  }
  function fromPaste(ctx = {}) {
    close();
    ov = document.createElement('div'); ov.id = 'bi'; document.body.appendChild(ov);
    ov.innerHTML = `<div class="bi-card small">
      <div class="bi-head"><h2>Paste your whole book</h2><button class="in-skip" data-x>Cancel</button></div>
      <div class="bi-body">
        <ol class="bi-steps"><li>Open your book in Google Docs, Word, or wherever it lives.</li><li>Select everything: <kbd>Ctrl</kbd> + <kbd>A</kbd>, then copy: <kbd>Ctrl</kbd> + <kbd>C</kbd>.</li><li>Click in the box below and paste: <kbd>Ctrl</kbd> + <kbd>V</kbd>.</li></ol>
        <div id="bi-paste" class="bi-paste" contenteditable="true" data-ph="Paste here"></div>
        <p class="bi-small" id="bi-got"></p>
      </div>
      <div class="bi-foot"><span class="bi-tip">Italics and bold come with it. Unwip finds the chapters next.</span><button class="btn primary" id="bi-next" disabled>Next</button></div></div>`;
    let got = null;
    const box = $('#bi-paste', ov);
    box.focus();
    box.addEventListener('paste', e => {
      e.preventDefault(); e.stopPropagation();
      const html = e.clipboardData.getData('text/html'), text = e.clipboardData.getData('text/plain');
      if (!html && !text) return;
      got = html ? html : textToHTML(text);
      const words = (text || '').trim().split(/\s+/).filter(Boolean).length || U.countWords(got.replace(/<[^>]+>/g, ' '));
      box.innerHTML = `<div class="bi-pasted">✓ Got it: about ${words.toLocaleString()} words. <button class="btn small ghost" id="bi-again">Paste something else</button></div>`;
      box.contentEditable = 'false';
      $('#bi-again', ov).onclick = () => { got = null; box.innerHTML = ''; box.contentEditable = 'true'; box.focus(); $('#bi-next', ov).disabled = true; };
      $('#bi-next', ov).disabled = false;
    }, true);
    $('[data-x]', ov).onclick = close;
    $('#bi-next', ov).onclick = () => { if (got) preview([{ name: ctx.title || 'My book', html: got }], { ...ctx, from: 'Paste' }); };
    return { pasteHTML: html => { got = html; $('#bi-next', ov).disabled = false; } };
  }
  // the menu shown by Import… on the main screen and by right-clicking a folder
  function menuItems(ctx = {}) {
    return [
      { label: 'Word, Google Docs, LibreOffice, text files… (one or several)', action: () => fromFiles(ctx) },
      { label: 'A folder of chapter files…', action: () => fromFolder(ctx) },
      { label: 'Paste a whole book (from Google Docs or anywhere)…', action: () => fromPaste(ctx) }
    ];
  }

  return { menuItems, fromFiles, fromFolder, fromPaste, preview, close,
    _test: { decodeText, textToHTML, mdToHTML, odtToHTML, fileToHTML, toBlocks, METHODS, autoMethod, clean, segment, plan, warnings, buildNodes, readFiles } };
})();
