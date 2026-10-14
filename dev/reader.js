// Unwip - beta readers and editors.
// Send: chapters go out as one Word file. Each chapter heading carries a hidden marker, and a snapshot of every chapter is kept as sent.
// Bring back: the reader's Word file (with Track Changes and comments) is matched to the right chapters by those markers,
// or by chapter title if the file went through Google Docs. Their changes become suggestions and their comments become comments.
// Safety: if you've edited a chapter since sending it, or it has footnotes, their version goes into a copy beside it instead.
window.UnwipReader = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, esc, api } = U;
  const Clip = window.FolioClip;
  const msDocs = () => { const out = []; const ms = U.findNode('root-manuscript'); if (ms) U.walkTree(ms.node.children || [], n => { if (n.type === 'doc' && !n.map) out.push(n); }); return out; };
  const htmlOf = async id => id === S.docId ? editor.innerHTML : await api.loadDoc(S.slug, id);
  const heading = (text, anchor) => ({ tag: 'h1', align: null, indent: null, lineHeight: null, anchor, runs: [{ text, bold: false, italic: false, underline: false, strike: false, sup: false, sub: false, font: null, size: null, color: null, bg: null }] });

  // ---------------------------------------------------------------- sending
  async function send() {
    if (!S.project) return;
    if (S.dirty) await U.flushSave();
    const docs = msDocs(); if (!docs.length) { U.toast('There are no chapters in the Manuscript yet.'); return; }
    const body = document.createElement('div');
    const cur = S.docId;
    body.innerHTML = `
      <div class="field"><label>Who is it for?</label><input type="text" id="rd-name" placeholder="e.g. Sam" value="${esc((S.project.readers || []).slice(-1).map(r => r.name)[0] || '')}"></div>
      <div class="rd-pick"><div class="rd-pick-head"><b>Chapters to send</b><span><button type="button" class="link-btn" data-all="1">All</button> · <button type="button" class="link-btn" data-all="0">None</button></span></div>
        <div class="rd-list">${docs.map(d => `<label class="check"><input type="checkbox" value="${esc(d.id)}" ${cur ? (d.id === cur ? 'checked' : '') : 'checked'}> ${esc(d.title || 'Untitled')} <small>${(d.words || 0).toLocaleString()} words</small></label>`).join('')}</div></div>
      <details class="rd-how" open><summary><b>Using Google Docs?</b> (most readers do)</summary>
        <ol><li>Upload the Word file to Google Drive, then open it with Google Docs.</li>
        <li>Share it with your reader as <b>Commenter</b>. Their edits then come in as suggestions automatically.</li>
        <li>When they’re done: <b>File › Download › Microsoft Word (.docx)</b>, then <b>Bring in a reader’s feedback</b> here.</li></ol>
        <p>Using Word instead? Ask them to turn on <b>Track Changes</b> and send the file back.</p></details>
      <p class="sy-note">Their suggestions and comments land in the right chapters, by chapter title, so ask them not to rename the chapter headings. A snapshot of each chapter is kept exactly as sent.</p>`;
    $$('[data-all]', body).forEach(b => b.onclick = () => $$('.rd-list input', body).forEach(c => c.checked = b.dataset.all === '1'));
    const ok = await U.modal({ title: 'Send to a beta reader', body, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Make the Word file', value: true, kind: 'primary' }] });
    if (!ok) return;
    const name = $('#rd-name', body).value.trim() || 'Reader';
    const ids = $$('.rd-list input:checked', body).map(c => c.value);
    if (!ids.length) { U.toast('Pick at least one chapter.'); return; }
    let blocks = [];
    for (const id of ids) {
      const node = U.findNode(id).node, html = await htmlOf(id);
      blocks.push(heading(node.title || 'Untitled', id));
      blocks = blocks.concat(Clip.extract(Clip.parseHTML(html)).blocks);      // suggestions count as accepted, comments stay private
      await api.snapSave(S.slug, id, html, `Sent to ${name}`, false).catch(() => {});
    }
    const title = (S.project.book && S.project.book.title) || S.project.title || 'Manuscript';
    const lang = (navigator.language || 'en-AU');
    const bytes = window.FolioDOCX.build(blocks, S.project.style, { title, author: (S.settings || {}).author || '', page: /US|CA/.test(lang) ? 'Letter' : 'A4', pageBreaks: true, lang });
    const fileName = `${title} - for ${name}`;
    const saved = await api.exportBinary(bytes, fileName, 'docx', 'Word document');
    if (!saved && !api.web) return;
    S.project.readers = [...(S.project.readers || []), { name, at: Date.now(), docs: ids }].slice(-30);
    U.scheduleMeta(); U.refreshSnapCount && U.refreshSnapCount();
    U.toast(`Word file ready for ${esc(name)}: ${ids.length} chapter${ids.length === 1 ? '' : 's'}. Ask them to use Track Changes and comments.`, '', 8000);
  }

  // ---------------------------------------------------------------- bringing feedback back
  const plain = html => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/[​\s]+/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim(); };
  // the text the reader started from: their additions removed, their deletions put back
  function original(html) { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('ins.tc-ins').forEach(x => x.remove()); d.querySelectorAll('del.tc-del').forEach(x => x.replaceWith(...x.childNodes)); return plain(d.innerHTML); }
  function accepted(html) { const d = document.createElement('div'); d.innerHTML = html; d.querySelectorAll('del.tc-del').forEach(x => x.remove()); return d.innerHTML; }
  const normTitle = t => String(t || '').toLowerCase().replace(/^(chapter\s+)?[\divxlc]+[.:)\s-]+/i, '').replace(/[^a-z0-9]+/g, ' ').trim();

  function splitFeedback(raw) {
    const div = document.createElement('div'); div.innerHTML = raw;
    const docs = msDocs(), byTitle = new Map(docs.map(d => [normTitle(d.title), d.id]));
    // a heading's title as sent (a reader's suggested change to the heading itself doesn't count)
    const sentTitle = el => { const c = el.cloneNode(true); c.querySelectorAll('ins.tc-ins').forEach(x => x.remove()); return normTitle(c.textContent); };
    // Google Docs renames the hidden markers, so headings are matched by title, and then by order against the chapters last sent
    const lastSent = ((S.project.readers || []).slice(-1)[0] || {}).docs || [];
    const parts = []; let cur = null, h = 0;
    for (const el of [...div.children]) {
      const a = el.getAttribute('data-anchor');
      let id = a && U.findNode(a) ? a : null;
      if (!id && /^H1$/.test(el.tagName)) { id = byTitle.get(sentTitle(el)) || (lastSent[h] && U.findNode(lastSent[h]) ? lastSent[h] : null); h++; }
      else if (id) h++;
      if (id && !parts.some(p => p.id === id)) { cur = { id, html: '' }; parts.push(cur); continue; }
      if (cur) cur.html += el.outerHTML;
    }
    return parts;
  }
  function readerName(raw, fallback) {
    const counts = {};
    for (const m of raw.matchAll(/data-(?:a|by)="([^"]+)"/g)) counts[m[1]] = (counts[m[1]] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : fallback;
  }

  async function receive() {
    if (!S.project) return;
    if (S.dirty) await U.flushSave();
    const f = await api.importDocx(); if (!f) return;
    let raw; try { raw = await window.FolioImport.docxToHTML(f.bytes); } catch (e) { U.toast(esc(e.message || 'Could not read that Word file.'), 'warn'); return; }
    const parts = splitFeedback(raw);
    if (!parts.length) { U.toast('Couldn’t match this file to your chapters. Was it made with “Send to a beta reader”? Chapter titles need to match.', 'warn', 9000); return; }
    const sent = (S.project.readers || []).slice(-1)[0];
    const name = readerName(raw, sent ? sent.name : f.name.replace(/\s*-\s*for\s+/i, ' ').trim());
    const results = [];
    for (const p of parts) {
      const node = U.findNode(p.id).node;
      const clean = Clip.dropBlankLines(Clip.cleanPaste(p.html, { dropFonts: true })).html;   // your Manuscript style, not Word's fonts
      const nIns = (clean.match(/class="tc-ins"/g) || []).length, nDel = (clean.match(/class="tc-del"/g) || []).length;
      const nCmt = new Set([...clean.matchAll(/class="cmt" data-cid="([^"]+)"/g)].map(m => m[1])).size;
      if (!nIns && !nDel && !nCmt) { results.push({ node, kind: 'none' }); continue; }
      const now = await htmlOf(p.id);
      const sameText = plain(accepted(now)) === original(clean);
      const hasFn = /class="fn"/.test(now);
      if (sameText && !hasFn) {
        await api.snapSave(S.slug, p.id, now, `Before ${name}’s feedback`, false).catch(() => {});
        await api.saveDoc(S.slug, p.id, clean);
        if (p.id === S.docId) { S.programmatic = true; editor.innerHTML = clean; S.programmatic = false; S.dirty = false; U.resyncWords(); }
        results.push({ node, kind: 'merged', nIns, nDel, nCmt, id: p.id });
      } else {
        // you've changed it since (or it has footnotes): their version goes beside yours, nothing is overwritten
        const f2 = U.findNode(p.id); const copy = { id: U.uid(), type: 'doc', title: `${name}’s notes · ${node.title || 'Untitled'}`, words: U.countWords(plain(accepted(clean))) };
        await api.saveDoc(S.slug, copy.id, clean);
        const list = f2.parent.children; list.splice(list.indexOf(node) + 1, 0, copy);
        results.push({ node, kind: 'copy', nIns, nDel, nCmt, id: copy.id, why: hasFn && sameText ? 'it has footnotes' : 'you’ve changed it since you sent it' });
      }
    }
    U.scheduleMeta(); U.renderBinder(); U.updateStatus();
    const done = results.filter(r => r.kind !== 'none').sort((a, b) => (a.kind === 'copy') - (b.kind === 'copy'));
    const tot = k => done.reduce((a, r) => a + (r[k] || 0), 0);
    const body = document.createElement('div');
    body.innerHTML = done.length ? `<p><b>${esc(name)}</b> left <b>${tot('nIns') + tot('nDel')}</b> suggested change${tot('nIns') + tot('nDel') === 1 ? '' : 's'} and <b>${tot('nCmt')}</b> comment${tot('nCmt') === 1 ? '' : 's'} across ${done.length} chapter${done.length === 1 ? '' : 's'}.</p>
      <div class="rd-res">${done.map(r => `<button class="rd-row" data-id="${esc(r.id)}"><b>${esc(r.node.title || 'Untitled')}</b><span>${r.nIns + r.nDel} change${r.nIns + r.nDel === 1 ? '' : 's'} · ${r.nCmt} comment${r.nCmt === 1 ? '' : 's'}${r.kind === 'copy' ? ` · <em>in a copy beside it, because ${esc(r.why)}</em>` : ''}</span></button>`).join('')}</div>
      <p class="sy-note">Review them in the side panel’s <b>Changes</b> and <b>Comments</b> tabs. A snapshot of each chapter was kept from before, so you can always go back.</p>`
      : `<p>${esc(name)}’s file matched ${parts.length} chapter${parts.length === 1 ? '' : 's'}, but there were no tracked changes or comments in it.</p><p class="sy-note">If they edited without Track Changes on, compare their file with your chapter using Snapshots.</p>`;
    const go = id => { document.querySelectorAll('.modal-back').forEach(m => { if (m.contains(body)) { const b = m.querySelector('.btn.primary, .btn'); if (b) b.click(); } }); U.openDoc(id).then(() => window.UnwipSide && window.UnwipSide.open('changes')); };
    $$('.rd-row', body).forEach(b => b.onclick = () => go(b.dataset.id));
    const first = done[0];
    const v = await U.modal({ title: `Feedback from ${name}`, body, buttons: first ? [{ label: 'Later', value: false, kind: 'ghost' }, { label: 'Start reviewing', value: true, kind: 'primary' }] : [{ label: 'OK', value: false, kind: 'primary' }] });
    if (v && first) go(first.id);
  }

  return { send, receive };
})();
