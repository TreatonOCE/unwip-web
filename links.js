// Unwip - connections between sheets (rival of, born in, member of…) and "Appears in" (the chapters
// that mention a sheet's names). Shown in a strip at the top of every character, place, item or
// template sheet, plus a web of everything that's connected. Plain records, no AI.
window.UnwipLinks = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, $, esc } = U;

  // [this way, the other way]. Same both ways when there's one label.
  const PRESETS = [
    ['People', [['friend of'], ['rival of'], ['enemy of'], ['ally of'], ['sibling of'], ['married to'], ['partner of'], ['in love with', 'loved by'],
      ['parent of', 'child of'], ['related to'], ['mentor of', 'student of'], ['serves', 'served by'], ['works for', 'employs'], ['knows']]],
    ['Groups', [['member of', 'has member'], ['leader of', 'led by'], ['founded', 'founded by'], ['at war with'], ['trades with']]],
    ['Places', [['lives in', 'home of'], ['born in', 'birthplace of'], ['rules', 'ruled by'], ['part of', 'includes'], ['near'], ['guards', 'guarded by']]],
    ['Things', [['owns', 'owned by'], ['made', 'made by'], ['wants', 'wanted by'], ['hidden in', 'hides'], ['worships', 'worshipped by']]]
  ];
  const SHEET_KINDS = new Set(['characters', 'places', 'items']);
  const isSheetRoot = r => r && (SHEET_KINDS.has(r.kind) || r.custom);
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;
  const links = () => (S.project.links = S.project.links || []);

  // every sheet in the book that isn't in the Trash
  function sheets() {
    const out = [];
    for (const root of S.project.binder) {
      if (!isSheetRoot(root)) continue;
      const walk = ns => ns.forEach(n => { if (n.type === 'doc' && !n.map) out.push({ id: n.id, title: n.title || 'Untitled', root }); if (n.children) walk(n.children); });
      walk(root.children || []);
    }
    return out;
  }
  const alive = id => { const r = U.rootOf(id); return !!(r && isSheetRoot(r) && U.findNode(id)); };
  const titleOf = id => { const f = U.findNode(id); return f ? (f.node.title || 'Untitled') : '?'; };
  // connections for one sheet, each read from that sheet's side
  function of(id) {
    return links().filter(l => (l.a === id || l.b === id) && alive(l.a) && alive(l.b))
      .map(l => l.a === id ? { l, other: l.b, label: l.f } : { l, other: l.a, label: l.r || l.f });
  }

  // ------------------------------------------------------------------ the strip on a sheet
  let strip = null, seq = 0;
  function ensureStrip() {
    if (strip && strip.isConnected) return strip;
    strip = document.createElement('div'); strip.id = 'sheet-links'; strip.className = 'sl hidden';
    const ed = $('#editor'); ed.parentNode.insertBefore(strip, ed);
    return strip;
  }
  function render() {
    const el = ensureStrip();
    const id = S.docId, root = id && U.rootOf(id);
    if (!S.project || !id || !isSheetRoot(root)) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');
    const mine = of(id);
    el.innerHTML = `
      <div class="sl-row"><span class="sl-k">Connections</span><div class="sl-chips">
        ${mine.map((c, i) => `<span class="sl-chip"><span>${esc(cap(c.label))}</span> <button class="sl-go" data-go="${esc(c.other)}" title="Open ${esc(titleOf(c.other))}">${esc(titleOf(c.other))}</button><button class="sl-x" data-x="${i}" title="Remove this connection" aria-label="Remove this connection">×</button></span>`).join('')}
        <button class="sl-add" type="button">+ Connect…</button>
        ${links().length ? '<button class="sl-web link-btn" type="button">See the web</button>' : ''}
      </div></div>
      <div class="sl-row"><span class="sl-k">Appears in</span><div class="sl-chips sl-app"><span class="sl-dim">Looking…</span></div></div>`;
    el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => U.openDoc(b.dataset.go));
    el.querySelectorAll('[data-x]').forEach(b => b.onclick = () => {
      const c = mine[+b.dataset.x], all = links(), at = all.indexOf(c.l); if (at < 0) return;
      all.splice(at, 1); U.scheduleMeta(); render();
      U.toastAction ? U.toastAction('Connection removed.', 'Undo', () => { links().splice(at, 0, c.l); U.scheduleMeta(); render(); }) : U.toast('Connection removed.');
    });
    el.querySelector('.sl-add').onclick = () => connect(id);
    const w = el.querySelector('.sl-web'); if (w) w.onclick = () => web(id);
    appears(id);
  }

  // which chapters mention this sheet's name or aliases
  function namesFor(id) {
    const list = window.FolioNames && window.FolioNames.namesFor ? window.FolioNames.namesFor(id) : [];
    if (!list.length) { const t = titleOf(id); if (t && !/^New [a-z]/i.test(t) && t !== 'Untitled') list.push(t); }
    return list.filter(x => x.length > 1);
  }
  const texts = new Map();   // chapter id -> [html it came from, plain text]
  async function chapterText(n) {
    const html = n.id === S.docId ? U.editor.innerHTML : await U.api.loadDoc(S.slug, n.id).catch(() => '');
    const hit = texts.get(n.id); if (hit && hit[0] === html) return hit[1];
    const d = document.createElement('div'); d.innerHTML = html || '';
    d.querySelectorAll('del, .tc-del, .fn-body').forEach(x => x.remove());
    const t = d.textContent; texts.set(n.id, [html, t]); return t;
  }
  async function mentions(id) {
    const names = namesFor(id); if (!names.length) return null;
    const re = window.FolioNames.matcher(names);
    const ms = S.project.binder.find(r => r.kind === 'manuscript'); const chs = [];
    U.walkTree((ms && ms.children) || [], n => { if (n.type === 'doc' && !n.map) chs.push(n); });
    const out = [];
    for (let i = 0; i < chs.length; i++) { const t = await chapterText(chs[i]); const k = (t.match(re) || []).length; if (k) out.push({ n: chs[i], k, i }); }
    return { names, out, total: chs.length };
  }
  async function appears(id) {
    const my = ++seq, r = await mentions(id);
    const box = strip && strip.querySelector('.sl-app'); if (!box || my !== seq || S.docId !== id) return;
    if (!r) { box.innerHTML = '<span class="sl-dim">Fill in the name (and any aliases) above to see which chapters mention it.</span>'; return; }
    if (!r.out.length) { box.innerHTML = `<span class="sl-dim">Not mentioned in the manuscript yet.</span>`; return; }
    const MAX = 12, shown = r.out.slice(0, MAX);
    box.innerHTML = shown.map(x => `<button class="sl-ch" data-ch="${esc(x.n.id)}" title="${esc(x.n.title || 'Untitled')}: ${x.k} mention${x.k === 1 ? '' : 's'}. Click to open it with the name found">${esc(x.n.title || 'Untitled')} <b>${x.k}</b></button>`).join('')
      + (r.out.length > MAX ? `<button class="sl-ch sl-more" type="button">+${r.out.length - MAX} more</button>` : '')
      + `<span class="sl-dim">${r.out.length} of ${r.total} chapter${r.total === 1 ? '' : 's'}</span>`;
    box.querySelectorAll('[data-ch]').forEach(b => b.onclick = () => openAt(b.dataset.ch, r.names[0]));
    const more = box.querySelector('.sl-more'); if (more) more.onclick = () => { box.querySelectorAll('.sl-more').forEach(x => x.remove()); r.out.slice(MAX).forEach(x => { const b = document.createElement('button'); b.className = 'sl-ch'; b.innerHTML = `${esc(x.n.title || 'Untitled')} <b>${x.k}</b>`; b.onclick = () => openAt(x.n.id, r.names[0]); box.insertBefore(b, box.querySelector('.sl-dim')); }); };
  }
  function openAt(id, name) {
    U.openDoc(id).then(() => { U.openFind(); const fi = document.getElementById('find-input'); if (fi) { fi.value = name; fi.dispatchEvent(new Event('input', { bubbles: true })); } });
  }

  // ------------------------------------------------------------------ adding a connection
  async function connect(id) {
    const all = sheets().filter(s => s.id !== id);
    if (!all.length) return U.toast('Make another character, place or item first, then connect them.');
    const body = document.createElement('div'); body.className = 'slc';
    body.innerHTML = `
      <p class="hint"><b>${esc(titleOf(id))}</b> is…</p>
      <div class="field"><label>Connection</label><select id="slc-rel">${PRESETS.map(([g, list]) => `<optgroup label="${g}">${list.map(p => `<option value="${esc(p.join('|'))}">${esc(p[0])}</option>`).join('')}</optgroup>`).join('')}<option value="*">Something else…</option></select></div>
      <div class="slc-own hidden"><div class="field"><label>Your own words</label><input id="slc-f" placeholder="e.g. sworn protector of"></div>
        <div class="field"><label>From the other side (optional)</label><input id="slc-r" placeholder="e.g. protected by"></div></div>
      <div class="field"><label>Connected to</label><input id="slc-q" placeholder="Type to find a sheet"></div>
      <div class="slc-list" id="slc-list"></div>
      <p class="hint" id="slc-back"></p>`;
    let pick = null;
    const rel = () => { const v = $('#slc-rel', body).value; if (v === '*') return [$('#slc-f', body).value.trim(), $('#slc-r', body).value.trim()]; const [f, r] = v.split('|'); return [f, r || f]; };
    const showBack = () => { const [f, r] = rel(); $('#slc-back', body).innerHTML = pick && f ? `On <b>${esc(titleOf(pick))}</b>’s sheet this shows as: ${esc(cap(r || f))} <b>${esc(titleOf(id))}</b>` : ''; };
    const list = () => {
      const q = $('#slc-q', body).value.trim().toLowerCase();
      const hits = all.filter(s => !q || s.title.toLowerCase().includes(q));
      const groups = new Map(); hits.forEach(s => { const k = s.root.title; groups.set(k, [...(groups.get(k) || []), s]); });
      $('#slc-list', body).innerHTML = hits.length ? [...groups].map(([g, xs]) => `<div class="slc-g">${esc(g)}</div>${xs.map(s => `<button type="button" class="slc-i ${s.id === pick ? 'on' : ''}" data-id="${esc(s.id)}">${esc(s.title)}</button>`).join('')}`).join('') : '<p class="sl-dim">No sheet by that name.</p>';
      body.querySelectorAll('.slc-i').forEach(b => b.onclick = () => { pick = b.dataset.id; list(); showBack(); });
    };
    let back;
    const v = await U.modal({ title: 'Connect', body, onOpen: b => {
      back = b; list();
      $('#slc-rel', body).onchange = () => { $('.slc-own', body).classList.toggle('hidden', $('#slc-rel', body).value !== '*'); showBack(); };
      ['#slc-f', '#slc-r'].forEach(s => $(s, body).oninput = showBack);
      $('#slc-q', body).oninput = () => { const q = $('#slc-q', body).value.trim().toLowerCase(); const one = all.filter(s => s.title.toLowerCase().includes(q)); if (one.length === 1) pick = one[0].id; list(); showBack(); };
      setTimeout(() => $('#slc-rel', body).focus(), 30);
    }, buttons: [{ label: 'Cancel', value: false, kind: 'ghost' }, { label: 'Connect', value: true, kind: 'primary' }] });
    if (!v) return;
    const [f, r] = rel();
    if (!pick) return U.toast('Pick who or what to connect to.', 'warn');
    if (!f) return U.toast('Write the connection in your own words.', 'warn');
    if (links().some(l => (l.a === id && l.b === pick && l.f === f) || (l.b === id && l.a === pick && (l.r || l.f) === f))) return U.toast('Those two are already connected that way.');
    links().push({ id: U.uid(), a: id, b: pick, f, r: r && r !== f ? r : undefined });
    U.scheduleMeta(); render();
  }

  // ------------------------------------------------------------------ the web of everything connected
  const COLORS = ['#2563eb', '#059669', '#d97706', '#db2777', '#7c3aed', '#0891b2', '#dc2626', '#65a30d'];
  function layout(nodes, edges, W, H) {
    const n = nodes.length, P = nodes.map((x, i) => ({ x: W / 2 + Math.cos(i * 2.399) * (40 + 9 * i), y: H / 2 + Math.sin(i * 2.399) * (30 + 7 * i), vx: 0, vy: 0 }));
    const idx = new Map(nodes.map((x, i) => [x.id, i])), k = Math.sqrt(W * H / Math.max(n, 1)) * 0.75;
    for (let it = 0; it < 400; it++) {
      const t = 1 - it / 400;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d = Math.hypot(dx, dy) || 0.01; const f = k * k / d / d;
        P[i].vx += dx * f; P[i].vy += dy * f; P[j].vx -= dx * f; P[j].vy -= dy * f;
      }
      for (const e of edges) { const a = P[idx.get(e.a)], b = P[idx.get(e.b)]; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, f = (d - k) / d * 0.08; a.vx += dx * f; a.vy += dy * f; b.vx -= dx * f; b.vy -= dy * f; }
      for (const p of P) { p.vx += (W / 2 - p.x) * 0.004; p.vy += (H / 2 - p.y) * 0.004; const m = Math.hypot(p.vx, p.vy), cap2 = 18 * t + 1; if (m > cap2) { p.vx *= cap2 / m; p.vy *= cap2 / m; } p.x += p.vx; p.y += p.vy; p.vx *= 0.5; p.vy *= 0.5; }
    }
    // fit into the box
    const xs = P.map(p => p.x), ys = P.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const s = Math.min((W - 180) / Math.max(x1 - x0, 1), (H - 90) / Math.max(y1 - y0, 1), 4);
    P.forEach(p => { p.x = W / 2 + (p.x - (x0 + x1) / 2) * s; p.y = H / 2 + (p.y - (y0 + y1) / 2) * s; });
    return P;
  }
  async function web(focus) {
    const ls = links().filter(l => alive(l.a) && alive(l.b));
    if (!ls.length) return U.toast('No connections yet. Open a character, place or item and use + Connect.');
    const ids = [...new Set(ls.flatMap(l => [l.a, l.b]))], roots = [...new Set(ids.map(id => U.rootOf(id)))];
    const nodes = ids.map(id => ({ id, title: titleOf(id), c: COLORS[roots.indexOf(U.rootOf(id)) % COLORS.length] }));
    const W = 720, H = Math.min(520, 300 + nodes.length * 12);
    const P = layout(nodes, ls, W, H), at = new Map(nodes.map((x, i) => [x.id, i]));
    const body = document.createElement('div'); body.className = 'slw';
    const draw = (hi) => {
      const ring = hi || focus;
      const near = hi ? new Set(ls.filter(l => l.a === hi || l.b === hi).flatMap(l => [l.a, l.b])) : null;
      const pairs = new Map();
      body.querySelector('svg').innerHTML = ls.map(l => {
        const a = P[at.get(l.a)], b = P[at.get(l.b)], key = [l.a, l.b].sort().join(), nth = pairs.get(key) || 0; pairs.set(key, nth + 1);
        const dim = near && !(l.a === hi || l.b === hi), off = nth * 14, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 + off;
        return `<g class="slw-e ${dim ? 'dim' : ''}"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><text x="${mx}" y="${my - 4}">${esc(l.f)}${l.r && l.r !== l.f ? ' →' : ''}</text></g>`;
      }).join('') + nodes.map((x, i) => { const p = P[i], dim = near && !near.has(x.id); return `<g class="slw-n ${dim ? 'dim' : ''} ${x.id === ring ? 'hi' : ''}" data-id="${esc(x.id)}" transform="translate(${p.x},${p.y})"><circle r="7" fill="${x.c}"/><text y="-12">${esc(x.title)}</text></g>`; }).join('');
      body.querySelectorAll('.slw-n').forEach(g => {
        g.onmouseenter = () => draw(g.dataset.id); g.onmouseleave = () => draw(null);
        g.onclick = () => { const b = body.closest('.modal-back'); const c = b && b.querySelector('.m-foot button'); if (c) c.click(); U.setView('write'); U.openDoc(g.dataset.id); };
      });
    };
    body.innerHTML = `<div class="slw-key">${roots.map((r, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(r.title)}</span>`).join('')}</div>
      <div class="slw-wrap"><svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="How your characters, places and items connect"></svg></div>
      <p class="sb-hint">Hover a name to see just its connections. Click one to open its sheet. Arrows mean the words read from that end, like “parent of →”.</p>`;
    draw(null);
    await U.modal({ title: 'Connections', body, wide: true, buttons: [{ label: 'Done', value: true, kind: 'primary' }] });
  }

  U.on('doc', () => setTimeout(render, 0));
  U.on('leave', () => { if (strip) strip.classList.add('hidden'); texts.clear(); });
  // a sheet's name changed: refresh what it's called in the chips and in "Appears in"
  document.addEventListener('input', e => { if (e.target && e.target.id === 'doc-title' && strip && !strip.classList.contains('hidden')) { clearTimeout(render._t); render._t = setTimeout(render, 900); } });

  return { render, web, connect, of, mentions, PRESETS };
})();
