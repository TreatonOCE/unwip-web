// Unwip - Copy for Royal Road. Royal Road's chapter editor keeps tables, bold, italics and alignment, but not boxes made
// of styles, page fonts, footnotes or pasted pictures. So a chapter goes over the way Royal Road authors build it by hand:
//   - [system messages] (a paragraph that's one bracketed message, as in litrpg.js) become a one-cell table, so the
//     "blue box" survives. Messages next to each other share one box. Looks: Royal Road's own table look (no colours
//     of ours, so it follows the reader's light or dark theme), blue box, dark window, plain border and more, or one
//     matched to each message (warnings red, quests gold…).
//     Our colours always set both the background and the text, so a box stays readable in Royal Road's dark theme.
//   - italics, bold, underline, strikethrough, centred lines and scene breaks come across; fonts and sizes don't
//     (Royal Road uses its own)
//   - footnotes become numbers with the notes at the end; pictures become a marked gap (Royal Road only takes
//     pictures uploaded to an image host and added by link) and can be saved as files to upload
// Two ways in: Copy (paste into the editor as it is) or Copy HTML code (for the editor's source code view).
// Nothing is changed in the book.
window.UnwipRR = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, S, api } = U;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const SYS = window.FolioClip.SYSMSG;   // the same test as the LitRPG boxes while writing (clipboard.js)
  const BREAK = /^\s*([*#~•·❦⁂—–-]\s*){1,5}$/;                           // * * *, #, ❦, ⁂ and the like
  const LOOKS = {
    rr: { name: 'Royal Road’s own table look', td: 'padding: 8px 12px;', note: 'No colours of ours: Royal Road draws the box, so it suits light and dark themes.' },
    blue: { name: 'Blue box', td: 'border: 2px solid #4a7fd0; background-color: #e8f0fc; color: #13213b; padding: 8px 12px;', note: 'Light blue with dark text, the classic LitRPG blue box.' },
    dark: { name: 'Dark system window', td: 'border: 1px solid #36c5ff; background-color: #0b1626; color: #d8f3ff; padding: 8px 12px; font-family: monospace;', note: 'Dark panel, cyan line and light text, like a game interface.' },
    plain: { name: 'Plain border', td: 'border: 1px solid #8a8f98; padding: 8px 12px;', note: 'Just a line around it, no colours.' },
    // more looks (only plain borders, colours and fonts: Royal Road's source code view keeps those; shadows, gradients
    // and rounded corners are dropped, so none are used)
    terminal: { name: 'Green terminal', td: 'border: 1px solid #2ecc71; background-color: #04140a; color: #6dff9b; padding: 8px 12px; font-family: monospace;', note: 'Black screen, green letters, like an old computer.' },
    arcane: { name: 'Arcane purple', td: 'border: 2px solid #8e5cd9; background-color: #1c1130; color: #eadfff; padding: 8px 12px;', note: 'Deep purple with a violet line: spells, skills and anything magical.' },
    gold: { name: 'Golden notice', td: 'border: 3px double #b8892b; background-color: #fff6e0; color: #3a2a05; padding: 8px 12px;', note: 'Cream with a double gold line: quests, rewards, titles.' },
    alert: { name: 'Red warning', td: 'border: 2px solid #c0392b; border-left: 8px solid #c0392b; background-color: #fdeceb; color: #4a0d08; padding: 8px 12px;', note: 'Pale red with a thick red edge, for warnings and danger.' },
    parchment: { name: 'Parchment note', td: 'border: 1px solid #a07a46; background-color: #f4e7cc; color: #3b2a14; padding: 10px 14px; font-family: Georgia, serif;', note: 'Old paper and a serif font, for fantasy without the game screen.' },
    steel: { name: 'Steel panel', td: 'border: 2px solid #5d6b7a; border-top: 6px solid #5d6b7a; background-color: #e9edf1; color: #1b232c; padding: 8px 12px;', note: 'Grey panel with a heavy top edge, like a status window.' },
    dashed: { name: 'Dashed outline', td: 'border: 2px dashed #8a8f98; padding: 8px 12px;', note: 'A dashed line and no colours, so it suits light and dark themes.' },
    auto: { name: 'Matched to each message', td: '', note: 'Each box picks a look from its first message: warnings red, quests and rewards gold, skills and spells purple, level-ups green, items on parchment, anything else blue.' }
  };
  // "Matched to each message": the first message in a box decides its look
  const AUTO = [[/warning|alert|danger|error|critical|caution|failed|death|dead|damage/i, 'alert'], [/quest|mission|objective|reward|title earned|achievement/i, 'gold'],
    [/skill|spell|ability|mana|magic|class/i, 'arcane'], [/level ?up|levelled|leveled|level \d|evolution|rank up/i, 'terminal'], [/item|loot|obtained|inventory|equipment|gold coin/i, 'parchment']];
  const autoLook = h => { const t = String(h || '').replace(/<[^>]+>/g, ''); const m = AUTO.find(([re]) => re.test(t)); return LOOKS[m ? m[1] : 'blue']; };
  const DEF = { look: 'rr', center: false, brackets: true, title: false, pics: true };
  const opts = () => Object.assign({}, DEF, (S.project && S.project.rrCopy) || {});

  const text = b => b.runs.map(r => r.br ? '\n' : (r.text || '')).join('');
  function runsHTML(runs, notes, pics) {
    let out = '';
    for (const r of runs) {
      if (r.br) { out += '<br>'; continue; }
      if (r.img) { pics.push(r.img); out += `<em>[Picture ${pics.length}]</em>`; continue; }
      if (r.fn !== undefined) { notes.push(r.fn); out += `<sup>[${notes.length}]</sup>`; continue; }
      let t = esc(r.text || ''); if (!t) continue;
      if (r.sup) t = `<sup>${t}</sup>`; if (r.sub) t = `<sub>${t}</sub>`;
      if (r.strike) t = `<s>${t}</s>`; if (r.underline) t = `<u>${t}</u>`;
      if (r.italic) t = `<em>${t}</em>`; if (r.bold) t = `<strong>${t}</strong>`;
      out += t;
    }
    return out.replace(/<\/em><em>/g, '').replace(/<\/strong><strong>/g, '');
  }
  const alignOf = b => b.align === 'center' || b.align === 'right' ? ` style="text-align: ${b.align};"` : '';

  // blocks -> { html, plain, pics, systems }
  function build(blocks, o, title) {
    const notes = [], pics = [], out = [], plain = [];
    let sys = null, systems = 0;
    const L0 = LOOKS[o.look] || LOOKS.rr;
    let sysT = [];
    const Lit = window.UnwipLitRPG, mode = Lit ? Lit.shortStyle() : 'full';
    const flush = () => {
      if (!sys) return;
      const L = o.look === 'auto' ? autoLook(sys[0]) : L0;
      // a short message on its own (Settings › LitRPG): a box that fits the words, or just bold
      const short = mode !== 'full' && sys.length === 1 && Lit.isShort(sysT[0], '', '');
      if (short && mode === 'plain') { out.push(`<p${o.center ? ' style="text-align: center;"' : ''}><strong>${sys[0]}</strong></p>`); sys = null; sysT = []; return; }
      const inner = sys.map(h => `<p${o.center ? ' style="text-align: center;"' : ''}>${h}</p>`).join('');
      out.push(`<table style="${short ? '' : 'width: 100%; '}border-collapse: collapse;"><tbody><tr><td style="${L.td}${o.center ? ' text-align: center;' : ''}">${inner}</td></tr></tbody></table>`);
      sys = null; sysT = [];
    };
    if (o.title && title) { out.push(`<h2>${esc(title)}</h2>`); plain.push(title, ''); }
    for (const b of blocks) {
      const t = text(b);
      const hasPic = b.runs.some(r => r.img);
      if (!t.trim() && !hasPic) { flush(); continue; }                 // Royal Road spaces paragraphs itself
      if (/^h[1-3]$/.test(b.tag)) { flush(); out.push(`<${b.tag === 'h1' ? 'h2' : 'h3'}>${runsHTML(b.runs, notes, pics)}</${b.tag === 'h1' ? 'h2' : 'h3'}>`); plain.push(t.trim(), ''); continue; }
      if (!hasPic && SYS.test(t)) {
        systems++;
        let runs = b.runs;
        if (!o.brackets) {                                               // [Level Up!] -> Level Up!, and [a] [b] side by side -> a · b
          runs = runs.map(r => r.text ? { ...r, text: r.text.replace(/\]\s*\[/g, ' · ').replace(/\[\s*/g, '').replace(/\s*\]/g, '') } : r);
        }
        (sys = sys || []).push(runsHTML(runs, notes, pics)); sysT.push(t); plain.push(t.trim()); continue;
      }
      flush();
      if (!hasPic && BREAK.test(t)) { out.push(`<p style="text-align: center;">${esc(t.trim())}</p>`); plain.push('', t.trim(), ''); continue; }
      if (hasPic && !o.pics) { const rest = b.runs.filter(r => !r.img); if (!text({ runs: rest }).trim()) { b.runs.filter(r => r.img).forEach(r => pics.push(r.img)); continue; } }
      out.push(`<p${alignOf(b)}>${runsHTML(b.runs, notes, pics)}</p>`); plain.push(t.trim());
    }
    flush();
    if (notes.length) {
      out.push('<hr>', ...notes.map((n, i) => `<p><sup>[${i + 1}]</sup> ${esc(n)}</p>`));
      plain.push('', ...notes.map((n, i) => `[${i + 1}] ${n}`));
    }
    let html = out.join('\n');
    if (o.pics) html = html.replace(/<em>\[Picture (\d+)\]<\/em>/g, '<em>[Picture $1: upload it to an image host, then insert it here with Royal Road’s image button]</em>');
    else html = html.replace(/<em>\[Picture \d+\]<\/em>/g, '');
    return { html, plain: plain.join('\n\n').replace(/\n{3,}/g, '\n\n'), pics, systems };
  }

  async function copyCode(code, ta) {
    if (await U.copyText(code)) return true;
    if (ta) { ta.focus(); ta.select(); }   // couldn't copy: leave the code selected, ready for Ctrl+C
    return false;
  }
  function picBytes(dataURL) {
    const m = /^data:image\/(png|jpe?g|gif|webp);base64,(.*)$/i.exec(dataURL); if (!m) return null;
    const bin = atob(m[2]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return { bytes: a, ext: m[1].toLowerCase().replace('jpeg', 'jpg') };
  }

  async function open(id) {
    id = id || S.docId; if (!id) return;
    await U.flushSave();
    const f = U.findNode(id); if (!f) return;
    const title = f.node.title || '';
    const blocks = await U.docBlocks(id, 'none');
    const o = opts();
    const body = document.createElement('div'); body.className = 'rr';
    body.innerHTML = `<p class="rr-lead">Gets “${esc(title)}” ready for Royal Road’s chapter editor. [System messages] become boxes (tables), which Royal Road keeps. Nothing in your book changes.</p>
      <div class="rr-grid">
        <div class="rr-side">
          <div class="field"><label>System message boxes</label><select id="rr-look">${Object.entries(LOOKS).map(([k, v]) => `<option value="${k}" ${o.look === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select><div class="hint" id="rr-look-note"></div></div>
          <label class="check"><input type="checkbox" id="rr-center" ${o.center ? 'checked' : ''}> Centre the text in boxes</label>
          <label class="check"><input type="checkbox" id="rr-brackets" ${o.brackets ? 'checked' : ''}> Keep the [brackets] inside boxes</label>
          <label class="check"><input type="checkbox" id="rr-title" ${o.title ? 'checked' : ''}> Put the chapter title at the top</label>
          <label class="check"><input type="checkbox" id="rr-pics" ${o.pics ? 'checked' : ''}> Mark where pictures go</label>
          <div class="rr-title-copy"><span>Chapter title for Royal Road’s title box:</span> <b>${esc(title)}</b> <button class="btn small ghost" type="button" id="rr-copy-title">Copy title</button></div>
          <div class="rr-stats" id="rr-stats"></div>
          <div class="rr-acts"><button class="btn primary" type="button" id="rr-copy">Copy for Royal Road</button><button class="btn" type="button" id="rr-code">Copy HTML code</button><button class="btn ghost hidden" type="button" id="rr-savepics">Save the pictures…</button></div>
          <p class="hint rr-which" id="rr-which"></p>
          <details class="rr-how"><summary>How to put it in</summary><ol>
            <li><b>Copy for Royal Road</b>, then in Royal Road’s chapter editor click in the text area and paste (Ctrl+V, or ⌘V on a Mac).</li>
            <li>For coloured or centred boxes, or if the boxes don’t come through: <b>Copy HTML code</b> instead, open the editor’s source code view (the <code>&lt;&gt;</code> button, or Tools › Source code), paste it there and press OK.</li>
            <li>Pictures: upload each one to an image host (Royal Road doesn’t keep pasted pictures), then use the editor’s image button at the marked spot.</li>
            <li>Check it with Royal Road’s preview, in its light and dark themes, before you publish.</li></ol></details>
        </div>
        <div class="rr-prev-wrap"><div class="rr-prev-head"><span>Preview</span><div class="chip-row"><button class="chip on" type="button" data-th="light">Light</button><button class="chip" type="button" data-th="dark">Dark</button></div></div>
          <div class="rr-prev" id="rr-prev"></div>
          <textarea class="rr-codebox" id="rr-codebox" readonly rows="6" aria-label="HTML code" spellcheck="false"></textarea></div>
      </div>`;
    let cur = null;
    const read = () => ({ look: $('#rr-look', body).value, center: $('#rr-center', body).checked, brackets: $('#rr-brackets', body).checked, title: $('#rr-title', body).checked, pics: $('#rr-pics', body).checked });
    const render = () => {
      const oo = read();
      cur = build(JSON.parse(JSON.stringify(blocks)), oo, title);
      $('#rr-prev', body).innerHTML = cur.html;
      $('#rr-prev', body).classList.toggle('rr-own', oo.look === 'rr');
      $('#rr-codebox', body).value = cur.html;
      $('#rr-look-note', body).textContent = LOOKS[oo.look].note;
      $('#rr-stats', body).textContent = `${cur.systems} system message${cur.systems === 1 ? '' : 's'} in boxes${cur.pics.length ? ` · ${cur.pics.length} picture${cur.pics.length === 1 ? '' : 's'} to upload separately` : ''}`;
      $('#rr-savepics', body).classList.toggle('hidden', !cur.pics.length);
      // tested with TinyMCE, the editor Royal Road's chapter page is built on: a normal paste keeps the table but drops
      // colours and centring; the source code view keeps everything. So styled boxes point to Copy HTML code.
      const styled = oo.look !== 'rr' || oo.center;
      $('#rr-copy', body).classList.toggle('primary', !styled); $('#rr-code', body).classList.toggle('primary', styled);
      $('#rr-which', body).textContent = styled ? 'Colours and centring only come through Royal Road’s source code view, so use Copy HTML code. A normal paste keeps the boxes but drops their colours.' : 'A normal paste keeps these boxes. Copy HTML code works too.';
    };
    const remember = async () => { try { S.project.rrCopy = read(); U.scheduleMeta(); } catch {} };
    body.addEventListener('change', e => { if (e.target.closest('#rr-look, .check')) { render(); remember(); } });
    $$('[data-th]', body).forEach(c => c.onclick = () => { $$('[data-th]', body).forEach(x => x.classList.toggle('on', x === c)); $('#rr-prev', body).classList.toggle('rr-dark', c.dataset.th === 'dark'); });
    $('#rr-copy', body).onclick = async () => { await api.clipboardWrite(cur.html, cur.plain); U.toast('Copied. Paste it into Royal Road’s chapter editor.'); };
    $('#rr-code', body).onclick = async () => { const ok = await copyCode(cur.html, $('#rr-codebox', body)); U.toast(ok ? 'HTML code copied. Paste it into the editor’s source code view.' : 'Select the code under the preview and copy it (Ctrl+C).', ok ? '' : 'warn'); };
    $('#rr-copy-title', body).onclick = async () => { const ok = await copyCode(title); U.toast(ok ? 'Title copied.' : 'Couldn’t copy here.', ok ? '' : 'warn'); };
    $('#rr-savepics', body).onclick = async () => {
      let n = 0;
      for (const [i, src] of cur.pics.entries()) { const p = picBytes(src); if (!p) continue; try { if (await api.exportBinary(p.bytes, `${title || 'Chapter'} - picture ${i + 1}`, p.ext, 'Picture')) n++; } catch {} }
      if (n) U.toast(`${n} picture${n === 1 ? '' : 's'} saved.`);
    };
    render();
    await U.modal({ title: 'Copy for Royal Road', body, wide: true, buttons: [{ label: 'Close', value: true, kind: 'ghost' }] });
  }
  return { open, build, LOOKS };
})();
