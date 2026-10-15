// Unwip - tools for LitRPG and GameLit (switched on in Settings › LitRPG tools):
//   - brackets close themselves: type [ and you get [|], type ] at the end and it steps over (like a code editor)
//   - system messages: a paragraph that's one [bracketed message] shows as a system box while you write. In the book it
//     stays plain bracketed text, the way LitRPG is published, so every export, e-book and Word file keeps it.
//   - text shortcuts: type ;lvl then space and it becomes "[Level Up! You are now Level |]". Comes with a starter set,
//     and you can add your own (any book, any genre). | marks where the cursor goes.
window.UnwipLitRPG = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return null;
  const { $, $$, esc, S, editor } = U;
  if (!editor) return null;

  const STARTER = [
    [';lvl', '[Level Up! You are now Level |]'],
    [';skill', '[New Skill Acquired: |]'],
    [';quest', '[Quest Received: |]'],
    [';qdone', '[Quest Complete: |]'],
    [';item', '[Item Obtained: |]'],
    [';title', '[Title Earned: |]'],
    [';stat', '[+1 |]'],
    [';warn', '[Warning: |]'],
    [';sys', '[System: |]'],
    [';status', '[Status]\n[Name: |]\n[Level: ]\n[Class: ]\n[HP: ] [MP: ] [Stamina: ]\n[Strength: ] [Agility: ] [Intelligence: ]'],
  ];
  const cfg = () => Object.assign({ on: false, pair: true, look: true }, (S.settings && S.settings.litrpg) || {});
  const snippets = () => (S.settings && Array.isArray(S.settings.snippets)) ? S.settings.snippets : (cfg().on ? STARTER : []);
  async function setCfg(patch) { S.settings = await U.api.setSettings({ litrpg: Object.assign(cfg(), patch) }); apply(); }

  // ---- system messages look
  const SYS = /^\s*\[[^\[\]]*(\][^\[\]]*\[[^\[\]]*)*\]\s*$/;   // the paragraph is [one message] (or [a] [b] side by side)
  function markSys(root) {
    const on = cfg().on && cfg().look;
    for (const p of (root || editor).children) {
      if (!/^(P|DIV)$/.test(p.tagName)) continue;
      const is = on && SYS.test(p.textContent || '');
      if (is !== p.classList.contains('lit-sys')) { p.classList.toggle('lit-sys', is); if (!p.className) p.removeAttribute('class'); }
    }
  }
  let markT = null;
  const markSoon = () => { clearTimeout(markT); markT = setTimeout(() => markSys(), 120); };
  function apply() { document.body.classList.toggle('litrpg', cfg().on); markSys(); }

  // ---- brackets that close themselves
  const PAIRS = { '[': ']', '{': '}' };
  const charAfter = () => { const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return ''; const n = s.anchorNode, o = s.anchorOffset; return n.nodeType === 3 ? (n.nodeValue[o] || '') : ''; };
  const charBefore = () => { const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return ''; const n = s.anchorNode, o = s.anchorOffset; return n.nodeType === 3 && o > 0 ? n.nodeValue[o - 1] : ''; };
  editor.addEventListener('beforeinput', e => {
    const c = cfg(); if (!c.on || e.isComposing || S.programmatic) return;
    if (e.inputType === 'insertText' && e.data && e.data.length === 1) {
      const ch = e.data, sel = getSelection();
      if (c.pair && PAIRS[ch]) {
        const after = charAfter();
        if (after && /[\p{L}\p{N}]/u.test(after)) return;   // straight before a word: just the bracket
        e.preventDefault();
        if (!sel.isCollapsed) { const t = sel.toString(); document.execCommand('insertText', false, ch + t + PAIRS[ch]); return; }   // wrap the selection
        document.execCommand('insertText', false, ch + PAIRS[ch]);
        const s = getSelection(); if (s.anchorNode && s.anchorNode.nodeType === 3) { const r = document.createRange(); r.setStart(s.anchorNode, s.anchorOffset - 1); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
        return;
      }
      if (c.pair && (ch === ']' || ch === '}') && charAfter() === ch) {   // typing the closing bracket that's already there: step over it
        e.preventDefault(); sel.modify('move', 'forward', 'character'); return;
      }
    }
    if (c.pair && e.inputType === 'deleteContentBackward' && getSelection().isCollapsed) {   // Backspace on an empty pair takes both
      const b = charBefore(), a = charAfter();
      if (PAIRS[b] && PAIRS[b] === a) { e.preventDefault(); const s = getSelection(); s.modify('extend', 'forward', 'character'); s.collapseToEnd(); s.modify('extend', 'backward', 'character'); s.modify('extend', 'backward', 'character'); document.execCommand('delete'); }
    }
  }, true);

  // ---- text shortcuts: the shortcut, then space, Tab or Enter
  function expand(trigger) {
    const list = snippets(); if (!list.length) return false;
    const sel = getSelection(); if (!sel.rangeCount || !sel.isCollapsed) return false;
    const n = sel.anchorNode, o = sel.anchorOffset; if (!n || n.nodeType !== 3 || !editor.contains(n)) return false;
    const before = n.nodeValue.slice(0, o);
    const hit = list.filter(([k]) => k && before.endsWith(k) && (before.length === k.length || /\s|[(\["“]/.test(before[before.length - k.length - 1]))).sort((a, b) => b[0].length - a[0].length)[0];
    if (!hit) return false;
    const [k, text] = hit;
    const r = document.createRange(); r.setStart(n, o - k.length); r.setEnd(n, o); sel.removeAllRanges(); sel.addRange(r);
    const parts = text.split('\n'), caretPart = parts.findIndex(p => p.includes('|'));
    S.programmatic = true;
    try {
      parts.forEach((p, i) => { if (i) document.execCommand('insertParagraph'); document.execCommand('insertText', false, p.replace('|', '')); });
    } finally { S.programmatic = false; }
    // put the cursor where the | was
    if (caretPart >= 0) {
      const back = parts.slice(caretPart).join('\n').length - parts[caretPart].indexOf('|') - 1;
      let left = back; const s = getSelection();
      while (left-- > 0) s.modify('move', 'backward', 'character');
    }
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  }
  editor.addEventListener('keydown', e => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === ' ' || e.key === 'Tab' || e.key === 'Enter') && snippets().length) { if (expand(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); } }
    // Enter just before a closing bracket that ends the paragraph: you've finished inside the brackets, so the bracket
    // stays on this line instead of moving down with the cursor
    if (e.key === 'Enter' && !e.shiftKey && cfg().on && cfg().pair) {
      const sel = getSelection(), n = sel.anchorNode, o = sel.anchorOffset;
      if (sel.isCollapsed && n && n.nodeType === 3 && /^[\]}]\s*$/.test(n.nodeValue.slice(o)) && !n.nextSibling) sel.modify('move', 'forward', 'character');
    }
  }, true);
  editor.addEventListener('input', markSoon);
  U.on('doc', () => setTimeout(() => markSys(), 0));

  // ---- Settings
  async function shortcutsDialog() {
    let list = snippets().map(x => [...x]);
    const body = document.createElement('div'); body.className = 'lit-sn';
    const draw = () => {
      body.innerHTML = `<p class="hint">Type a shortcut, then space, and it becomes the text. A | marks where the cursor lands; a new line starts a new paragraph (write it as \\n). Any genre: “;ms” for a long name, “;sig” for a sign-off…</p>
        <div class="lit-rows">${list.map(([k, t], i) => `<div class="lit-row" data-i="${i}"><input data-k value="${esc(k)}" placeholder=";lvl"><input data-t value="${esc(t.replace(/\n/g, '\\n'))}" placeholder="[Level Up! You are now Level |]"><button class="icon-btn small" data-del title="Remove">×</button></div>`).join('')}</div>
        <div class="lit-acts"><button class="btn small ghost" id="lit-add">+ Add a shortcut</button><button class="btn small ghost" id="lit-starter">Add the LitRPG starter set</button></div>`;
      $$('.lit-row', body).forEach(row => { const i = +row.dataset.i; $('[data-k]', row).oninput = e => { list[i][0] = e.target.value.trim(); }; $('[data-t]', row).oninput = e => { list[i][1] = e.target.value.replace(/\\n/g, '\n'); }; $('[data-del]', row).onclick = () => { list.splice(i, 1); draw(); }; });
      $('#lit-add', body).onclick = () => { list.push([';', '']); draw(); $$('[data-k]', body).pop().focus(); };
      $('#lit-starter', body).onclick = () => { for (const s of STARTER) if (!list.some(([k]) => k === s[0])) list.push([...s]); draw(); };
    };
    draw();
    if (!(await U.modal({ title: 'Text shortcuts', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Save', value: true, kind: 'primary' }] }))) return;
    S.settings = await U.api.setSettings({ snippets: list.filter(([k, t]) => k && t) });
    U.toast('Text shortcuts saved.');
  }
  function settingsSection(host) {
    const f = host.querySelector('#s-litrpg'); if (!f) return;
    const draw = () => {
      const c = cfg();
      f.innerHTML = `<label class="check full"><input type="checkbox" data-lit="on" ${c.on ? 'checked' : ''}> LitRPG and GameLit tools</label>
        <div class="lit-sub ${c.on ? '' : 'hidden'}">
          <label class="check full"><input type="checkbox" data-lit="pair" ${c.pair ? 'checked' : ''}> Brackets close themselves: type <b>[</b> and get <b>[ ]</b> (also { })</label>
          <label class="check full"><input type="checkbox" data-lit="look" ${c.look ? 'checked' : ''}> Show [system messages] as boxes while I write (the book keeps plain brackets)</label>
          <label class="check full"><input type="checkbox" data-lit="ebook" ${c.ebook ? 'checked' : ''}> Make [system messages] boxes in e-books too (EPUB and Kindle; Word and print keep plain brackets)</label>
          <div class="field"><label>Stats, skills and items in the book</label><button class="btn" type="button" id="lit-ledger">LitRPG ledger…</button></div>
        </div>
        <div class="field"><label>Shortcuts like ;lvl → [Level Up! …]</label><button class="btn" type="button" id="lit-sn">Text shortcuts… (${snippets().length})</button></div>`;
      $$('[data-lit]', f).forEach(i => i.onchange = async () => { const patch = { [i.dataset.lit]: i.checked }; if (i.dataset.lit === 'on' && i.checked && !(S.settings && Array.isArray(S.settings.snippets))) S.settings = await U.api.setSettings({ snippets: STARTER }); await setCfg(patch); draw(); });
      $('#lit-sn', f).onclick = async () => { await shortcutsDialog(); draw(); };
      const lg = $('#lit-ledger', f); if (lg) lg.onclick = () => { const m = f.closest('.modal-back'); if (m) m.querySelector('.m-foot .btn').click(); window.UnwipLedger && window.UnwipLedger.open(); };
    };
    draw();
  }
  setTimeout(apply, 0);
  U.on('project', () => setTimeout(apply, 0));
  return { settingsSection, shortcutsDialog, markSys, STARTER, _test: { expand, SYS } };
})();
