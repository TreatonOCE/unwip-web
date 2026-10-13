// Unwip - chapter titles typed into the text. Many manuscripts start each chapter with a typed line
// ("Chapter 1: My House, My Rules") as well as having the chapter's name in the binder ("1 - My House, My Rules").
// Unwip shows the chapter's name as its heading, so the title shows twice. This finds those lines and either makes
// the typed line the chapter's name or keeps the binder name, removing the line from the text either way.
window.UnwipTitles = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, api, esc, $ } = U;
  const words = t => (t || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !/^\d+$/.test(w) && !/^(chapter|ch|part|book)$/.test(w));
  const binderRest = t => (t || '').replace(/^\s*(\[[^\]]*\]\s*)?(chapter\s+)?\d+\s*[-–—:.)]\s*/i, '').trim();
  const LEAD = /^(chapter|prologue|epilogue|interlude|part|book|ch\.)\b|^\d+\s*[-–—:.)]\s*\S/i;

  // the typed title line at the top of a chapter, if there is one
  function find(title, html) {
    const d = document.createElement('div'); d.innerHTML = html || '';
    const blocks = [...d.children];
    const i = blocks.findIndex(b => (b.textContent || '').replace(/ /g, ' ').trim());
    if (i < 0) return null;
    const b = blocks[i], text = b.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length > 110 || b.querySelector('img') || /^H[4-6]$/.test(b.tagName)) return null;
    const tw = words(text), bw = words(title);
    const overlap = tw.length && bw.length ? tw.filter(w => bw.includes(w)).length / Math.max(tw.length, bw.length) : 0;
    const looksLikeTitle = /^H[1-3]$/.test(b.tagName) || LEAD.test(text) || overlap >= 0.6;
    if (!looksLikeTitle || (!LEAD.test(text) && overlap < 0.6 && !/^H[1-3]$/.test(b.tagName))) return null;
    if (/[.!?…"”]$/.test(text) && !LEAD.test(text) && overlap < 0.8) return null;   // a sentence, not a title
    // "Chapter 4:" on its own borrows the words from the binder name
    let typed = text.replace(/[\s:–—-]+$/, '');
    if (!words(typed).length && binderRest(title)) typed = `${typed}: ${binderRest(title)}`;
    blocks.slice(0, i + 1).forEach(x => x.remove());
    // the empty lines, or the scene break they became, that sat under the typed title go too
    for (let el = d.firstElementChild; el; el = d.firstElementChild) {
      const t = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
      if ((!t && !el.querySelector('img')) || el.classList.contains('scene') || /^([*#~•·]\s*){1,5}$/.test(t)) el.remove(); else break;
    }
    return { line: text, typed, html: d.innerHTML || '<p><br></p>' };
  }

  // for a whole list of chapters: [{ node, html }] -> [{ node, html, found }]
  const scan = list => list.map(x => ({ ...x, found: find(x.node.title, x.html) })).filter(x => x.found);

  // the choice, worded the same wherever it's offered
  function choiceHTML(hits, total, name = 'tt') {
    const ex = hits[0];
    return `<div class="tt-box">
      <p><b>${hits.length} of ${total} chapter${total === 1 ? '' : 's'}</b> start with their title typed into the text, like “${esc(ex.found.line)}”. Unwip shows each chapter’s name as its heading, so the title would show twice.</p>
      <label class="check"><input type="radio" name="${name}" value="typed" checked><span>Use the typed title as the chapter’s name, and take it out of the text<small>“${esc(ex.node.title)}” becomes “${esc(ex.found.typed)}”.</small></span></label>
      <label class="check"><input type="radio" name="${name}" value="binder"><span>Keep the names from the binder, and take the typed titles out of the text<small>The chapter stays “${esc(ex.node.title)}”.</small></span></label>
      <label class="check"><input type="radio" name="${name}" value="leave"><span>Leave them as they are</span></label>
    </div>`;
  }
  function apply(hits, how) {
    if (how === 'leave') return 0;
    // remember what it was, so taking the book back to Scrivener can put it back (scrivexport.js)
    for (const h of hits) { h.newHTML = h.found.html; h.node.tt = { line: h.found.line, was: h.node.title }; if (how === 'typed') h.node.title = h.found.typed; }
    return hits.length;
  }

  // in a book that's already open: the Manuscript, or one folder of it
  async function fixExisting(rootId) {
    if (!S.project) return;
    await U.flushSave();
    const start = rootId ? U.findNode(rootId) : U.findNode('root-manuscript');
    const list = [];
    U.walkTree((start && start.node.children) || [], n => { if (n.type === 'doc' && !n.map) list.push(n); });
    const items = [];
    for (const n of list) items.push({ node: n, html: n.id === S.docId ? U.editor.innerHTML : await api.loadDoc(S.slug, n.id).catch(() => '') });
    const hits = scan(items);
    if (!hits.length) return U.toast('No chapters here start with their title typed into the text.');
    const body = document.createElement('div'); body.innerHTML = choiceHTML(hits, list.length) + `<p class="sim-small">A snapshot of each changed chapter is saved first, and Undo puts everything back.</p>`;
    const ok = await U.modal({ title: 'Chapter titles typed into the text', body, wide: true, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Tidy them', value: true, kind: 'primary' }] });
    if (!ok) return;
    const how = body.querySelector('[name="tt"]:checked').value; if (how === 'leave') return;
    const before = hits.map(h => ({ node: h.node, title: h.node.title, html: h.html }));
    apply(hits, how);
    for (const h of hits) {
      await api.snapSave(S.slug, h.node.id, h.html, 'Before tidying the typed title', true).catch(() => {});
      await api.saveDoc(S.slug, h.node.id, h.newHTML);
      if (h.node.id === S.docId) { U.editor.innerHTML = h.newHTML; $('#doc-title').value = h.node.title; }
    }
    U.scheduleMeta(); U.renderBinder(); U.refreshPlanView && U.refreshPlanView();
    U.toastAction(`Tidied ${hits.length} chapter title${hits.length === 1 ? '' : 's'}.`, 'Undo', async () => {
      for (const b of before) { b.node.title = b.title; delete b.node.tt; await api.saveDoc(S.slug, b.node.id, b.html); if (b.node.id === S.docId) { U.editor.innerHTML = b.html; $('#doc-title').value = b.title; } }
      U.scheduleMeta(); U.renderBinder(); U.toast('Chapter titles put back.');
    }, 15000);
  }

  // a book imported before this check existed: offer it once, when the book opens
  U.on('project', () => setTimeout(async () => {
    try {
      const P = S.project; if (!P || P.ttOffered) return;
      const ms = P.binder.find(r => r.kind === 'manuscript'); const list = []; U.walkTree((ms && ms.children) || [], n => { if (n.type === 'doc' && !n.map) list.push(n); });
      if (list.length < 3) return;
      const items = []; for (const n of list.slice(0, 80)) items.push({ node: n, html: await api.loadDoc(S.slug, n.id).catch(() => '') });
      if (S.project !== P) return;
      const hits = scan(items); P.ttOffered = true; U.scheduleMeta();
      if (hits.length >= 3 && hits.length >= items.length * 0.25)
        U.toastAction(`${hits.length} chapters have their title typed into the text too, so it shows twice.`, 'Tidy them…', () => fixExisting(), 20000);
    } catch {}
  }, 2500));

  return { find, scan, choiceHTML, apply, fixExisting };
})();
