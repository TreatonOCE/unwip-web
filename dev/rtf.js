// Unwip - minimal RTF reader.
// Some programs (Scrivener, WordPad, older Word) only put RTF on the clipboard, not HTML.
// This turns RTF into simple HTML (paragraphs, headings, font, size, bold, italic, underline,
// alignment, first-line indent) which then goes through the normal clean-paste step.
window.FolioRTF = (function () {
  const SKIP_DEST = new Set(['info', 'object', 'header', 'headerl', 'headerr', 'headerf', 'footer', 'footerl', 'footerr', 'footerf',
    'fldinst', 'themedata', 'colorschememapping', 'datastore', 'latentstyles', 'listtable', 'listoverridetable', 'rsidtbl', 'generator',
    'xmlnstbl', 'mmathPr', 'pgdsctbl', 'revtbl', 'filetbl', 'background', 'shp', 'shpinst', 'nonshppict', 'bkmkstart', 'bkmkend',
    'annotation', 'atnid', 'atnauthor', 'listtext', 'pntext', 'pntxta', 'pntxtb', 'docvar', 'userprops', 'wgrffmtfilter', 'xe', 'tc']);
  const cp1252 = new TextDecoder('windows-1252');

  // Scrivener on Windows writes PostScript names ("TimesNewRomanPSMT", "PalatinoLinotype-Italic").
  // Turn them back into the family name Windows knows, and note bold/italic faces.
  function fontName(raw) {
    let n = String(raw).replace(/^["']|["']$/g, '').trim();
    if (/^\./.test(n)) return { family: null };                       // system UI fonts (".SFUI")
    if (/\s/.test(n)) return { family: n };                           // already a normal name
    const [base, style = ''] = n.split('-');
    let fam = base.replace(/(PSMT|PS|MT)$/, '');
    fam = fam.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim();
    return { family: fam || n, bold: /bold|black|heavy|semibold/i.test(style) || /Bold/.test(base), italic: /italic|oblique/i.test(style) };
  }
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function q(f) { return /^[\w-]+$/.test(f) ? f : `'${f.replace(/'/g, '')}'`; }

  function toHTML(rtf) {
    if (!rtf || !/^\s*\{\\rtf/.test(rtf)) return '';
    const fonts = {}, faces = {}, colors = [], styles = {};
    let defFont = null;

    const baseChar = () => ({ font: defFont, size: 12, bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, color: null });
    const basePara = () => ({ align: null, indent: null, style: null });

    let st = { char: baseChar(), skip: false, dest: null, uc: 1 };
    const stack = [];
    let para = basePara();
    let runs = [];               // [{text, char}] for the current paragraph
    const paras = [];            // [{para, runs}]
    let pendingSkip = 0;         // characters to skip after \uN
    let destBuf = '';            // text collected for font table / stylesheet entries
    let destNum = null;

    function addText(t) {
      if (st.skip || !t) return;
      if (st.dest === 'pict') { if (st.pict) st.pict.hex += t.replace(/[^0-9a-f]/gi, ''); return; }
      if (st.dest === 'fonttbl' || st.dest === 'stylesheet') { destBuf += t; return; }
      if (st.dest === 'colortbl') return;
      if (st.dest === 'footnote') { if (pendingSkip > 0) { const n = Math.min(pendingSkip, t.length); t = t.slice(n); pendingSkip -= n; } if (st.fn) st.fn.text += t; return; }
      if (pendingSkip > 0) { const n = Math.min(pendingSkip, t.length); t = t.slice(n); pendingSkip -= n; if (!t) return; }
      const last = runs[runs.length - 1];
      if (last && !last.br && !last.img && last.fn === undefined && JSON.stringify(last.char) === JSON.stringify(st.char)) last.text += t;   // (never onto a picture or footnote, or the words vanish)
      else runs.push({ text: t, char: { ...st.char } });
    }
    function endPara() {
      paras.push({ para: { ...para }, runs });
      runs = [];
    }
    function closeEntry() {
      // a ';' inside the font table or stylesheet ends one entry
      const name = destBuf.replace(/;\s*$/, '').trim();
      if (st.dest === 'fonttbl' && destNum !== null && name) { const fi = fontName(name); fonts[destNum] = fi.family; faces[destNum] = fi; }
      if (st.dest === 'stylesheet' && destNum !== null && name) styles[destNum] = name;
      destBuf = '';
    }

    let i = 0;
    const n = rtf.length;
    let groupDepth = 0;
    while (i < n) {
      const ch = rtf[i];
      if (ch === '{') {
        stack.push({ ...st, char: { ...st.char } });
        groupDepth++;
        i++;
        // destination groups marked with \* are optional extras we can ignore
        if (rtf.startsWith('\\*', i)) { st.skip = true; }
        continue;
      }
      if (ch === '}') {
        if (st.dest === 'fonttbl' || st.dest === 'stylesheet') { if (destBuf.trim()) closeEntry(); }
        const prevDest = st.dest, closing = st;
        st = stack.pop() || st;
        // a picture group just ended: keep PNG and JPEG pictures
        if (prevDest === 'pict' && st.dest !== 'pict' && closing.pict && closing.pict.type && closing.pict.hex.length > 32 && !st.skip) {
          const pc = closing.pict, hex = pc.hex;
          let bin = ''; for (let k = 0; k + 1 < hex.length; k += 2) bin += String.fromCharCode(parseInt(hex.substr(k, 2), 16));
          const wTw = pc.wgoal || (pc.w ? pc.w * 15 : 0), hTw = pc.hgoal || (pc.h ? pc.h * 15 : 0);
          runs.push({ img: `data:image/${pc.type};base64,` + btoa(bin), pct: wTw ? Math.max(10, Math.min(100, Math.round(wTw / 8640 * 100))) : 60, w: wTw, h: hTw, char: { ...st.char } });
        }
        // a footnote group just ended: it becomes Unwip's footnote mark at this point in the text
        if (prevDest === 'footnote' && st.dest !== 'footnote' && closing.fn && !st.skip) { const t = closing.fn.text.replace(/\s+/g, ' ').trim(); if (t) runs.push({ fn: t, char: { ...st.char } }); }
        if (prevDest !== st.dest && (prevDest === 'fonttbl' || prevDest === 'stylesheet')) { destBuf = ''; destNum = null; }
        groupDepth--;
        i++;
        continue;
      }
      if (ch === '\\') {
        const next = rtf[i + 1];
        if (next === '\\' || next === '{' || next === '}') { addText(next); i += 2; continue; }
        if (next === '~') { addText(' '); i += 2; continue; }
        if (next === '-' || next === '_') { if (next === '_') addText('-'); i += 2; continue; }
        if (next === '*') { st.skip = true; i += 2; continue; }
        if (next === '\'') {
          const hex = rtf.substr(i + 2, 2);
          const byte = parseInt(hex, 16);
          if (!isNaN(byte)) {
            if (pendingSkip > 0) pendingSkip--;
            else addText(cp1252.decode(new Uint8Array([byte])));
          }
          i += 4; continue;
        }
        if (next === '\n' || next === '\r') { if (!st.skip && !st.dest) endPara(); i += 2; continue; }
        const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(rtf.slice(i, i + 40));
        if (!m) { i++; continue; }
        i += m[0].length;
        const word = m[1], hasNum = m[2] !== undefined, num = hasNum ? parseInt(m[2], 10) : null;
        handle(word, num, hasNum);
        continue;
      }
      if (ch === '\r' || ch === '\n') { i++; continue; }
      // plain text run
      let j = i;
      while (j < n && rtf[j] !== '\\' && rtf[j] !== '{' && rtf[j] !== '}' && rtf[j] !== '\r' && rtf[j] !== '\n') j++;
      const text = rtf.slice(i, j);
      if (st.dest === 'fonttbl' || st.dest === 'stylesheet') {
        for (const c of text) { destBuf += c; if (c === ';') closeEntry(); }
      } else if (st.dest === 'colortbl') {
        for (const c of text) if (c === ';') colors.push(curColor ? `rgb(${curColor.r},${curColor.g},${curColor.b})` : null), curColor = null;
      } else addText(text);
      i = j;
    }
    if (runs.length) endPara();

    var curColor; // eslint-disable-line
    function handle(word, num, hasNum) {
      // destinations
      if (word === 'fonttbl' || word === 'colortbl' || word === 'stylesheet') { st.dest = word; destBuf = ''; destNum = null; return; }
      if (word === 'shppict') { st.skip = false; return; }
      if (word === 'footnote') { st.dest = 'footnote'; st.fn = { text: '' }; st.skip = false; return; }   // its text is kept as a footnote
      if (st.dest === 'footnote') { if (word === 'par' || word === 'line' || word === 'tab') st.fn.text += ' '; else if (word === 'u') { const cp = num < 0 ? num + 65536 : num; st.fn.text += String.fromCharCode(cp); pendingSkip = st.uc; } else if (word === 'uc') st.uc = num; else if (/^(emdash|endash|lquote|rquote|ldblquote|rdblquote)$/.test(word)) st.fn.text += { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”' }[word]; return; }          // Word/Scrivener wrap the real picture in {\*\shppict …}
      if (word === 'pict') { st.dest = 'pict'; st.pict = { type: null, hex: '', w: 0, h: 0, wgoal: 0, hgoal: 0 }; return; }
      if (st.dest === 'pict') {
        if (st.pict) { if (word === 'pngblip') st.pict.type = 'png'; else if (word === 'jpegblip') st.pict.type = 'jpeg'; else if (word === 'picwgoal') st.pict.wgoal = num; else if (word === 'pichgoal') st.pict.hgoal = num; else if (word === 'picw') st.pict.w = num; else if (word === 'pich') st.pict.h = num; }
        return;
      }
      if (SKIP_DEST.has(word)) { st.skip = true; return; }
      if (st.skip) { if (word === 'uc') st.uc = num; return; }
      if (st.dest === 'fonttbl') { if (word === 'f') { destNum = num; destBuf = ''; } return; }
      if (st.dest === 'stylesheet') { if (word === 's' || word === 'cs' || word === 'ds') { destNum = word === 's' ? num : null; destBuf = ''; } return; }
      if (st.dest === 'colortbl') {
        curColor = curColor || { r: 0, g: 0, b: 0 };
        if (word === 'red') curColor.r = num; if (word === 'green') curColor.g = num; if (word === 'blue') curColor.b = num;
        return;
      }
      const c = st.char;
      switch (word) {
        case 'deff': defFont = num; st.char.font = num; break;
        case 'par': case 'sect': case 'page': case 'cell': case 'row': endPara(); break;
        case 'line': runs.push({ br: true }); break;
        case 'tab': if (runs.length) addText(' '); break;  // a leading tab is an indent, which Unwip does automatically
        case 'pard': para = basePara(); break;
        case 'plain': st.char = baseChar(); break;
        case 'f': c.font = num; break;
        case 'fs': c.size = num / 2; break;
        case 'b': c.bold = !hasNum || num !== 0; break;
        case 'i': c.italic = !hasNum || num !== 0; break;
        case 'ul': c.underline = !hasNum || num !== 0; break;
        case 'uld': case 'uldb': case 'ulw': c.underline = true; break;
        case 'ulnone': c.underline = false; break;
        case 'strike': c.strike = !hasNum || num !== 0; break;
        case 'super': c.sup = true; c.sub = false; break;
        case 'sub': c.sub = true; c.sup = false; break;
        case 'nosupersub': c.sup = false; c.sub = false; break;
        case 'cf': c.color = num; break;
        case 'qc': para.align = 'center'; break;
        case 'qr': para.align = 'right'; break;
        case 'qj': para.align = 'justify'; break;
        case 'ql': para.align = null; break;
        case 'fi': para.indent = num / 20; break;  // twips -> points
        case 's': para.style = num; break;
        case 'uc': st.uc = num; break;
        case 'u': { let cp = num < 0 ? num + 65536 : num; addText(String.fromCharCode(cp)); pendingSkip = st.uc; break; }
        case 'emdash': addText('—'); break;
        case 'endash': addText('–'); break;
        case 'lquote': addText('‘'); break;
        case 'rquote': addText('’'); break;
        case 'ldblquote': addText('“'); break;
        case 'rdblquote': addText('”'); break;
        case 'bullet': addText('•'); break;
        case 'emspace': case 'enspace': addText(' '); break;
        default: break;
      }
    }

    // build HTML
    const html = paras.map(({ para, runs }) => {
      const sname = para.style != null ? (styles[para.style] || '') : '';
      const hm = /heading\s*([1-6])/i.exec(sname);
      let tag = 'p';
      if (hm) tag = 'h' + Math.min(3, +hm[1]);
      else if (/^(title|chapter title|chapter heading)$/i.test(sname.trim())) tag = 'h1';
      else if (/block\s*quote|^quote/i.test(sname)) tag = 'blockquote';
      const css = [];
      if (para.align) css.push(`text-align:${para.align}`);
      if (para.indent != null && para.indent >= 0) css.push(`text-indent:${para.indent}pt`);
      const inner = runs.map(r => {
        if (r.br) return '<br>';
        if (r.fn !== undefined) return `<sup class="fn" contenteditable="false" data-fn="${esc(r.fn).replace(/"/g, '&quot;')}">\u200b</sup>`;
        if (r.img) return `<img class="doc-img" src="${r.img}" data-w="${r.w || ''}" data-h="${r.h || ''}" style="width: ${r.pct}%" alt="">`;
        let h = esc(r.text);
        const ch = r.char;
        if (ch.sup) h = `<sup>${h}</sup>`;
        if (ch.sub) h = `<sub>${h}</sub>`;
        if (ch.strike) h = `<s>${h}</s>`;
        if (ch.underline) h = `<u>${h}</u>`;
        if (ch.italic) h = `<i>${h}</i>`;
        const face = ch.font != null ? faces[ch.font] : null;
        if (!ch.italic && face && face.italic) h = `<i>${h}</i>`;
        if (ch.bold || (face && face.bold)) h = `<b>${h}</b>`;
        const sc = [];
        const fam = ch.font != null ? fonts[ch.font] : null;
        if (fam) sc.push(`font-family:${q(fam)}`);
        if (ch.size) sc.push(`font-size:${ch.size}pt`);
        const col = ch.color != null ? colors[ch.color] : null;
        if (col) sc.push(`color:${col}`);
        return sc.length ? `<span style="${sc.join(';')}">${h}</span>` : h;
      }).join('');
      return `<${tag}${css.length ? ` style="${css.join(';')}"` : ''}>${inner || '<br>'}</${tag}>`;
    }).join('');
    // Scrivener for Windows marks its named styles with text like <$Scr_Ps::0> … <!$Scr_Ps::0> and hides it on
    // reading; anywhere else it would show, so it goes (the formatting itself is kept)
    return html.replace(/&lt;!?\$Scr_[A-Za-z]+::\d+&gt;/g, '');
  }

  return { toHTML };
})();
