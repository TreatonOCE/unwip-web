// Unwip - Build › Magic system. A guided sheet (the questions writers forget to answer), the costs magic takes,
// its elements or schools, the spells, and rules the writer sets. Unwip checks every spell against those rules
// (plain logic, no AI) and can look through the books for where each spell, cost and element is mentioned.
(function () {
  'use strict';
  const B = window.UnwipBuild; if (!B) return;
  const U = window.__unwip;
  const { $, $$, esc, api } = U;

  const QUESTIONS = [
    ['summary', 'In one line, what is it?', 'e.g. Mages borrow strength from the dead, and the dead want it back.'],
    ['source', 'Where does the power come from?', 'A god, the land, blood, music, the stars, a contract…'],
    ['who', 'Who can use it, and how do they learn?', 'Born with it? Trained for years? Anyone who pays the price?'],
    ['feel', 'What does it look, sound or feel like when it’s used?', 'What would a bystander notice? What does the caster feel afterwards?'],
    ['society', 'How does the world treat it?', 'Laws, fear, trade, religion, war. Who controls it, who hunts it?'],
    ['weakness', 'What goes wrong when it fails?', 'A miscast, an overdraw, a spell that backfires…']
  ];
  const WEIGHT = ['', 'Light', 'Noticeable', 'Heavy', 'Severe', 'Terrible'];
  const RULES = {
    payPower: { text: 'A spell’s costs must add up to at least its power', args: [] },
    needsCost: { text: 'Every spell that uses {a:element} must pay {b:cost}', args: ['a', 'b'] },
    powerCost: { text: 'Every spell of power {n} or more must pay {b:cost}', args: ['n', 'b'] },
    never: { text: '{a:element} and {b:element} can never be used together', args: ['a', 'b'] },
    maxElements: { text: 'A spell can use at most {n} elements', args: ['n'] },
    needsElement: { text: 'Every spell must use at least one element', args: [] },
    needsAnyCost: { text: 'Nothing is free: every spell must pay at least one cost', args: [] }
  };

  function blank() {
    const id = () => U.uid();
    const c1 = id(), c2 = id(), e1 = id(), e2 = id();
    return {
      answers: {},
      limits: [{ id: id(), text: '' }],
      costs: [{ id: c1, name: 'Exhaustion', weight: 1, what: 'Tiredness that sleep cures.' }, { id: c2, name: 'Memory', weight: 4, what: 'A memory, gone for good.' }],
      elements: [{ id: e1, name: 'Fire', what: '' }, { id: e2, name: 'Mind', what: '' }],
      rules: [{ id: id(), type: 'payPower' }, { id: id(), type: 'needsCost', a: e2, b: c2 }],
      spells: [],
      notes: ''
    };
  }
  const nameOf = (list, id) => { const x = list.find(y => y.id === id); return x ? x.name || 'unnamed' : '?'; };

  // ================================================================== THE CHECKER (rules the writer set, nothing else)
  function check(d, sp) {
    const out = [], els = sp.elements || [], cs = sp.costs || [];
    const paid = cs.reduce((a, id) => a + ((d.costs.find(c => c.id === id) || {}).weight || 0), 0);
    for (const r of d.rules) {
      if (r.off) continue;
      if (r.type === 'payPower' && paid < (sp.power || 1)) out.push(`Power ${sp.power || 1}, but its costs only add up to ${paid}.`);
      if (r.type === 'needsCost' && r.a && r.b && els.includes(r.a) && !cs.includes(r.b)) out.push(`Uses ${nameOf(d.elements, r.a)}, so it must pay ${nameOf(d.costs, r.b)}.`);
      if (r.type === 'powerCost' && r.b && (sp.power || 1) >= (r.n || 3) && !cs.includes(r.b)) out.push(`Power ${sp.power || 1}, so it must pay ${nameOf(d.costs, r.b)}.`);
      if (r.type === 'never' && r.a && r.b && r.a !== r.b && els.includes(r.a) && els.includes(r.b)) out.push(`${nameOf(d.elements, r.a)} and ${nameOf(d.elements, r.b)} can’t be used together.`);
      if (r.type === 'maxElements' && els.length > (r.n || 2)) out.push(`Uses ${els.length} elements; the most is ${r.n || 2}.`);
      if (r.type === 'needsElement' && !els.length) out.push('Doesn’t use any element.');
      if (r.type === 'needsAnyCost' && !cs.length) out.push('Doesn’t pay anything.');
    }
    return out;
  }
  const answered = d => QUESTIONS.filter(([k]) => (d.answers[k] || '').trim()).length + (d.limits.some(l => l.text.trim()) ? 1 : 0) + (d.costs.length ? 1 : 0);
  const QTOTAL = QUESTIONS.length + 2;

  // ================================================================== THE SHEET
  let it = null, ctx = null, box = null;
  function open(item, el, c) {
    it = item; ctx = c; box = el;
    const d = it.data = Object.assign(blank(), it.data || {});
    if (!item.data.costs) { /* a brand-new sheet keeps the examples */ }
    box.innerHTML = '<div class="bm-page" id="bm-page"></div>';
    draw();
  }
  function save() { ctx.changed(); }
  function draw() {
    const d = it.data, page = $('#bm-page', box); if (!page) return;
    const keepY = box.scrollTop;
    const spellsOK = d.spells.filter(s => !check(d, s).length).length;
    page.innerHTML = `
      <div class="bm-intro"><div><b>${answered(d)} of ${QTOTAL}</b> questions answered${d.spells.length ? ` · <b>${spellsOK} of ${d.spells.length}</b> spells follow your rules` : ''}</div>
        <div class="bm-bar"><i style="width:${Math.round(answered(d) / QTOTAL * 100)}%"></i></div><button class="link-btn bm-howto-show" type="button" data-howto-show>How this page works</button></div>

      ${(() => { try { return localStorage.getItem('unwip-bm-howto') ? '' : 1; } catch { return 1; } })() ? `<section class="bm-card bm-howto"><h2>What this page is for</h2>
        <p>A notebook for how magic works in your world, so it stays the same from chapter 1 to the end. Answer what you know and skip the rest; you can come back any time. None of it goes into your book unless you press <b>Add to book</b> at the top.</p>
        <ol>
          <li><b>The basics:</b> a few questions about where the magic comes from and who can use it.</li>
          <li><b>Costs:</b> what using magic takes from people (tiredness, memories, years of life…).</li>
          <li><b>Kinds of magic:</b> the types a spell can use, like fire and water, or schools, or gods.</li>
          <li><b>Rules:</b> the laws your magic always follows.</li>
          <li><b>Spells:</b> each spell you write down is checked against your rules, and Unwip warns you if one breaks them.</li>
        </ol>
        <p class="bm-help">The examples already filled in (Exhaustion, Memory, Fire, Mind) are there to show how it works. Change or delete them.</p>
        <button class="btn small" type="button" data-howto-hide>Got it, hide this</button></section>` : ''}
      <section class="bm-card"><h2>1. The basics</h2><p class="bm-help">Answer in a sentence or two. Skip any you haven’t decided yet.</p>
        ${QUESTIONS.map(([k, q, ph]) => `<div class="bm-q"><label>${esc(q)}</label><textarea data-a="${k}" rows="2" placeholder="${esc(ph)}">${esc(d.answers[k] || '')}</textarea></div>`).join('')}
        <div class="bm-q"><label>What can it never do?</label><p class="bm-help">Limits make magic interesting. A power that can do anything solves every problem in your plot.</p>
          <div class="bm-list" id="bm-limits">${d.limits.map(l => `<div class="bm-li" data-id="${l.id}"><span>•</span><input data-limit value="${esc(l.text)}" placeholder="e.g. It can’t bring back the dead"><button class="icon-btn small" data-del-limit title="Remove">×</button></div>`).join('')}</div>
          <button class="btn small ghost" id="bm-add-limit">+ Add a limit</button></div>
      </section>

      <section class="bm-card"><h2>2. What it costs</h2><p class="bm-help">What using magic takes from the person using it. Give each cost a size, from light (a headache) to terrible (a year of your life), so bigger spells can be made to pay more.</p>
        <div class="bm-rows">${d.costs.map(c => `<div class="bm-row" data-id="${c.id}">
          <input class="bm-name" data-cost="name" value="${esc(c.name)}" placeholder="Name of the cost">
          <select data-cost="weight">${[1, 2, 3, 4, 5].map(w => `<option value="${w}" ${c.weight === w ? 'selected' : ''}>${w} · ${WEIGHT[w]}</option>`).join('')}</select>
          <input class="bm-what" data-cost="what" value="${esc(c.what || '')}" placeholder="What exactly is lost or paid?">
          <button class="icon-btn small" data-del-cost title="Remove">×</button></div>`).join('')}</div>
        <button class="btn small ghost" id="bm-add-cost">+ Add a cost</button>
      </section>

      <section class="bm-card"><h2>3. Kinds of magic</h2><p class="bm-help">The different types of magic in your world, like elements (fire, water), schools, colours, gods or notes of a song. Leave it empty if your magic is all one kind.</p>
        <div class="bm-rows">${d.elements.map(c => `<div class="bm-row" data-id="${c.id}">
          <input class="bm-name" data-el="name" value="${esc(c.name)}" placeholder="Name">
          <input class="bm-what" data-el="what" value="${esc(c.what || '')}" placeholder="What it does, what it’s good and bad at">
          <button class="icon-btn small" data-del-el title="Remove">×</button></div>`).join('')}</div>
        <button class="btn small ghost" id="bm-add-el">+ Add one</button>
      </section>

      <section class="bm-card"><h2>4. Rules</h2><p class="bm-help">The laws your magic always follows, like “big spells always cost a memory”. Unwip checks every spell below against them, so a spell in chapter 20 can’t quietly break what chapter 3 set up. Untick a rule to switch it off.</p>
        <div class="bm-rules">${d.rules.map(r => ruleRow(d, r)).join('') || '<p class="bm-help">No rules yet.</p>'}</div>
        <button class="btn small ghost" id="bm-add-rule">+ Add a rule</button>
      </section>

      <section class="bm-card"><h2>5. Spells</h2><p class="bm-help">Each spell: its name, how strong it is (power 1 to 5), which kinds of magic it uses and what it costs. Tap the kinds and costs to switch them on for that spell. A warning appears if it breaks one of your rules.</p>
        <div class="bm-spells">${d.spells.map(s => spellCard(d, s)).join('') || '<p class="bm-help">No spells yet.</p>'}</div>
        <button class="btn small" id="bm-add-spell">+ Add a spell</button>
      </section>

      <section class="bm-card"><h2>Where is it in my books?</h2><p class="bm-help">Looks through a book’s chapters for every spell, cost and element named here, so you can check they’re used the same way each time.</p>
        <div class="bm-find"><select id="bm-book"></select><button class="btn small" id="bm-find">Look</button></div><div id="bm-found"></div>
      </section>

      <section class="bm-card bm-picture"><h2>The picture</h2><p class="bm-help">What Copy picture, Save PNG and Add to book use. Tap the picture to see it bigger.</p>
        <div class="bm-pic-wrap"><button type="button" class="bm-pic" id="bm-pic" title="See it bigger"></button>
          <div class="bm-pic-opts">
            <label>Style</label><div class="chip-row">${Object.entries(LOOKS).map(([k, v]) => `<button type="button" class="chip ${lookOf(d).theme === k ? 'on' : ''}" data-look-theme="${k}"><i class="bm-sw" style="background:${v.bg};border-color:${v.line}"></i>${v.name}</button>`).join('')}</div>
            <label>Border</label><div class="chip-row">${[['double', 'Double line'], ['ornate', 'Ornate'], ['none', 'None']].map(([k, n]) => `<button type="button" class="chip ${lookOf(d).frame === k ? 'on' : ''}" data-look-frame="${k}">${n}</button>`).join('')}</div>
            <label>Accent</label><div id="bm-acc"></div>
            <label>Show</label><div class="bm-pic-show">${[['summary', 'The summary (question 1)'], ['costs', 'Costs'], ['kinds', 'Kinds of magic'], ['count', 'Number of spells']].map(([k, n]) => `<label class="check"><input type="checkbox" data-look-show="${k}" ${lookOf(d)[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>
          </div></div>
      </section>

      <section class="bm-card"><h2>Notes</h2><textarea data-notes rows="5" placeholder="Anything else: history, famous casters, what’s secret…">${esc(d.notes || '')}</textarea></section>`;
    box.scrollTop = keepY;
    wire(page);
    // the shared colour row: the accent of the picture (empty is the style's own), with a pipette on the picture
    window.UnwipKit.colours($('#bm-acc', page), { value: lookOf(d).accent, reset: 'Style colour', picture: () => $('#bm-pic img', box), onPick: h => { d.look = Object.assign(lookOf(d), { accent: h }); save(); drawPic(); } });
    drawPic();
  }
  function drawPic() { const b = box && $('#bm-pic', box); if (b) b.innerHTML = `<img alt="" src="${B.svgURL(cardSVG(it, 800, 500))}">`; }
  async function bigPic() {
    const body = document.createElement('div'); body.className = 'bm-big';
    body.innerHTML = `<img alt="${esc(it.title || 'Magic system')}" src="${B.svgURL(cardSVG(it, 1600, 1000))}">`;
    const v = await U.modal({ title: it.title || 'Magic system', body, wide: true, buttons: [{ label: 'Copy picture', value: 'copy', kind: 'ghost' }, { label: 'Save PNG…', value: 'png', kind: 'ghost' }, { label: 'Close', value: null, kind: 'primary' }] });
    if (v) { const c = await B.svgCanvas(cardSVG(it), 1600, 1000); if (v === 'copy') B.copyCanvas(c); else B.savePNG(c, it.title); }
  }
  function ruleRow(d, r) {
    const def = RULES[r.type]; if (!def) return '';
    const sel = (list, key, kind) => `<select data-r="${key}"><option value="">— ${kind} —</option>${list.map(x => `<option value="${x.id}" ${r[key] === x.id ? 'selected' : ''}>${esc(x.name || 'unnamed')}</option>`).join('')}</select>`;
    const html = esc(def.text).replace(/\{(\w)(?::(\w+))?\}/g, (_, k, kind) => k === 'n' ? `<input type="number" data-r="n" min="1" max="9" value="${r.n || (r.type === 'maxElements' ? 2 : 3)}">` : sel(kind === 'cost' ? d.costs : d.elements, k, kind));
    return `<div class="bm-rule ${r.off ? 'off' : ''}" data-id="${r.id}"><label class="bm-on" title="Switch this rule on or off"><input type="checkbox" data-r-on ${r.off ? '' : 'checked'}></label><div class="bm-rt">${html}</div><button class="icon-btn small" data-del-rule title="Remove">×</button></div>`;
  }
  function spellCard(d, s) {
    const probs = check(d, s);
    return `<div class="bm-spell ${probs.length ? 'bad' : 'good'}" data-id="${s.id}">
      <div class="bm-sh"><input class="bm-sname" data-sp="name" value="${esc(s.name)}" placeholder="Name of the spell">
        <label class="bm-pow">Power <select data-sp="power">${[1, 2, 3, 4, 5].map(p => `<option ${(s.power || 1) === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <button class="btn small ghost" data-sp-win title="See this spell as a game’s skill window (LitRPG)">◆ Window</button><button class="icon-btn small" data-del-spell title="Remove">×</button></div>
      <div class="bm-chips"><span>Draws on</span>${d.elements.map(e => `<button type="button" class="chip ${(s.elements || []).includes(e.id) ? 'on' : ''}" data-sp-el="${e.id}">${esc(e.name || 'unnamed')}</button>`).join('') || '<em>add elements above</em>'}</div>
      <div class="bm-chips"><span>Costs</span>${d.costs.map(c => `<button type="button" class="chip ${(s.costs || []).includes(c.id) ? 'on' : ''}" data-sp-cost="${c.id}">${esc(c.name || 'unnamed')} <small>${c.weight}</small></button>`).join('') || '<em>add costs above</em>'}</div>
      <textarea data-sp="what" rows="2" placeholder="What it does, how it’s cast">${esc(s.what || '')}</textarea>
      <div class="bm-verdict">${probs.length ? probs.map(p => `<div>⚠ ${esc(p)}</div>`).join('') : '<div>✓ Follows your rules</div>'}</div></div>`;
  }
  // light updates while typing (no redraw, so the cursor stays put); a redraw when the shape changes
  function wire(page) {
    const d = it.data;
    const rowId = el => el.closest('[data-id]').dataset.id;
    page.oninput = e => {
      const t = e.target;
      if (t.dataset.a) d.answers[t.dataset.a] = t.value;
      else if (t.hasAttribute('data-limit')) d.limits.find(l => l.id === rowId(t)).text = t.value;
      else if (t.dataset.cost) { const c = d.costs.find(x => x.id === rowId(t)); c[t.dataset.cost] = t.dataset.cost === 'weight' ? +t.value : t.value; if (t.dataset.cost === 'weight') return (save(), draw()); }
      else if (t.dataset.el) d.elements.find(x => x.id === rowId(t))[t.dataset.el] = t.value;
      else if (t.dataset.sp) { const s = d.spells.find(x => x.id === rowId(t)); s[t.dataset.sp] = t.dataset.sp === 'power' ? +t.value : t.value; if (t.dataset.sp === 'power') { save(); return refreshSpell(s); } }
      else if (t.dataset.r) { const r = d.rules.find(x => x.id === rowId(t)); r[t.dataset.r] = t.dataset.r === 'n' ? Math.max(1, +t.value || 1) : t.value; save(); return refreshSpells(); }
      else if (t.hasAttribute('data-r-on')) { d.rules.find(x => x.id === rowId(t)).off = !t.checked; t.closest('.bm-rule').classList.toggle('off', !t.checked); save(); return refreshSpells(); }
      else if (t.dataset.lookShow) { d.look = Object.assign(lookOf(d), { [t.dataset.lookShow]: t.checked }); save(); return drawPic(); }
      else if (t.hasAttribute('data-notes')) d.notes = t.value;
      else return;
      save(); refreshHead(); clearTimeout(drawPic.t); drawPic.t = setTimeout(drawPic, 400);
    };
    page.onchange = e => { const t = e.target; if (t.dataset.cost === 'name' || t.dataset.el === 'name') draw(); };   // names show up in rules and spells
    page.onclick = e => {
      if (e.target.closest('[data-howto-show]')) { try { localStorage.removeItem('unwip-bm-howto'); } catch {} draw(); return; }
      if (e.target.closest('[data-howto-hide]')) { try { localStorage.setItem('unwip-bm-howto', '1'); } catch {} draw(); return; }
      const t = e.target.closest('button'); if (!t) return;
      if (t.id === 'bm-pic') return bigPic();
      if (t.dataset.lookTheme || t.dataset.lookFrame) {
        d.look = Object.assign(lookOf(d), t.dataset.lookTheme ? { theme: t.dataset.lookTheme } : { frame: t.dataset.lookFrame });
        $$(t.dataset.lookTheme ? '[data-look-theme]' : '[data-look-frame]', page).forEach(x => x.classList.toggle('on', x === t)); save(); return drawPic();
      }
      const id = t.closest('[data-id]') && t.closest('[data-id]').dataset.id;
      const drop = (list, key) => { d[key] = list.filter(x => x.id !== id); save(); draw(); };
      if (t.id === 'bm-add-limit') { d.limits.push({ id: U.uid(), text: '' }); save(); draw(); $$('[data-limit]', page).pop().focus(); }
      else if (t.id === 'bm-add-cost') { d.costs.push({ id: U.uid(), name: '', weight: 2, what: '' }); save(); draw(); $$('[data-cost="name"]', page).pop().focus(); }
      else if (t.id === 'bm-add-el') { d.elements.push({ id: U.uid(), name: '', what: '' }); save(); draw(); $$('[data-el="name"]', page).pop().focus(); }
      else if (t.id === 'bm-add-spell') { d.spells.push({ id: U.uid(), name: '', power: 1, elements: [], costs: [], what: '' }); save(); draw(); $$('[data-sp="name"]', page).pop().focus(); }
      else if (t.id === 'bm-add-rule') { const r = t.getBoundingClientRect(); U.showMenu(r.left, r.bottom, Object.entries(RULES).map(([k, v]) => ({ label: v.text.replace(/\{(\w)(?::(\w+))?\}/g, (_, a, kind) => a === 'n' ? 'N' : `[${kind}]`), action: () => { d.rules.push({ id: U.uid(), type: k, n: k === 'maxElements' ? 2 : 3 }); save(); draw(); } }))); }
      else if (t.id === 'bm-find') find();
      else if (t.hasAttribute('data-del-limit')) drop(d.limits, 'limits');
      else if (t.hasAttribute('data-del-cost')) { d.spells.forEach(s => s.costs = (s.costs || []).filter(x => x !== id)); drop(d.costs, 'costs'); }
      else if (t.hasAttribute('data-del-el')) { d.spells.forEach(s => s.elements = (s.elements || []).filter(x => x !== id)); drop(d.elements, 'elements'); }
      else if (t.hasAttribute('data-del-rule')) drop(d.rules, 'rules');
      else if (t.hasAttribute('data-del-spell')) drop(d.spells, 'spells');
      else if (t.hasAttribute('data-sp-win')) spellWindow(d.spells.find(x => x.id === id));
      else if (t.dataset.spEl || t.dataset.spCost) {
        const s = d.spells.find(x => x.id === id), key = t.dataset.spEl ? 'elements' : 'costs', v = t.dataset.spEl || t.dataset.spCost;
        s[key] = (s[key] || []).includes(v) ? s[key].filter(x => x !== v) : [...(s[key] || []), v];
        t.classList.toggle('on'); save(); refreshSpell(s);
      }
    };
    api.listProjects().then(list => { const sel = $('#bm-book', page); if (sel) sel.innerHTML = list.map(p => `<option value="${esc(p.slug)}">${esc(p.title)}</option>`).join('') || '<option value="">No books yet</option>'; }).catch(() => {});
  }
  function refreshSpell(s) {
    const card = box.querySelector(`.bm-spell[data-id="${s.id}"]`); if (!card) return;
    const probs = check(it.data, s);
    card.classList.toggle('bad', !!probs.length); card.classList.toggle('good', !probs.length);
    $('.bm-verdict', card).innerHTML = probs.length ? probs.map(p => `<div>⚠ ${esc(p)}</div>`).join('') : '<div>✓ Follows your rules</div>';
    refreshHead();
  }
  function refreshSpells() { it.data.spells.forEach(refreshSpell); }
  function refreshHead() {
    const d = it.data, head = box.querySelector('.bm-intro'); if (!head) return;
    const ok = d.spells.filter(s => !check(d, s).length).length;
    head.firstElementChild.innerHTML = `<b>${answered(d)} of ${QTOTAL}</b> questions answered${d.spells.length ? ` · <b>${ok} of ${d.spells.length}</b> spells follow your rules` : ''}`;
    head.querySelector('.bm-bar i').style.width = Math.round(answered(d) / QTOTAL * 100) + '%';
  }

  // ================================================================== WHERE IN MY BOOKS (plain word search)
  async function find() {
    const out = $('#bm-found', box), slug = $('#bm-book', box).value; if (!slug) return;
    const d = it.data;
    const terms = [...d.spells.map(s => ['Spell', s.name]), ...d.costs.map(c => ['Cost', c.name]), ...d.elements.map(e => ['Element', e.name])].filter(([, n]) => n && n.trim().length > 1);
    if (!terms.length) { out.innerHTML = '<p class="bm-help">Name some spells, costs or elements first.</p>'; return; }
    out.innerHTML = '<p class="bm-help">Looking…</p>';
    const project = await api.openProject(slug); if (!project) return;
    const ms = project.binder.find(n => n.root && n.kind === 'manuscript');
    const docs = []; U.walkTree(ms ? ms.children || [] : [], n => { if (n.type === 'doc' && !n.map) docs.push(n); });
    const hits = new Map(terms.map(t => [t[1], []]));
    const res = terms.map(([, n]) => new RegExp(`(^|[^\\p{L}])${n.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu'));
    for (const doc of docs) {
      let text = ''; try { const div = document.createElement('div'); div.innerHTML = await api.loadDoc(slug, doc.id) || ''; text = div.textContent; } catch {}
      terms.forEach(([, n], i) => { const c = (text.match(res[i]) || []).length; if (c) hits.get(n).push({ title: doc.title, c }); });
    }
    out.innerHTML = `<div class="bm-hits">${terms.map(([kind, n]) => { const h = hits.get(n); return `<div class="bm-hit ${h.length ? '' : 'none'}"><b>${esc(n)}</b> <small>${kind}</small><span>${h.length ? h.map(x => `${esc(x.title)}${x.c > 1 ? ` (${x.c})` : ''}`).join(', ') : 'not mentioned in the Manuscript'}</span></div>`; }).join('')}</div>`;
  }

  // ================================================================== PICTURE + INTO A BOOK
  function sheetHTML(item) {
    const d = Object.assign(blank(), item.data || {});
    const p = s => esc(s || '').replace(/\n/g, '<br>');
    let h = '';
    for (const [k, q] of QUESTIONS) if ((d.answers[k] || '').trim()) h += `<h3>${esc(q)}</h3><p>${p(d.answers[k])}</p>`;
    const lim = d.limits.filter(l => l.text.trim()); if (lim.length) h += `<h3>What it can never do</h3><ul>${lim.map(l => `<li>${esc(l.text)}</li>`).join('')}</ul>`;
    if (d.costs.length) h += `<h3>Costs</h3><ul>${d.costs.map(c => `<li><b>${esc(c.name)}</b> (${WEIGHT[c.weight] || ''})${c.what ? ': ' + esc(c.what) : ''}</li>`).join('')}</ul>`;
    if (d.elements.length) h += `<h3>Elements</h3><ul>${d.elements.map(c => `<li><b>${esc(c.name)}</b>${c.what ? ': ' + esc(c.what) : ''}</li>`).join('')}</ul>`;
    const rules = d.rules.filter(r => !r.off && RULES[r.type]);
    if (rules.length) h += `<h3>Rules</h3><ul>${rules.map(r => `<li>${esc(RULES[r.type].text.replace(/\{(\w)(?::(\w+))?\}/g, (_, k, kind) => k === 'n' ? String(r.n || 3) : nameOf(kind === 'cost' ? d.costs : d.elements, r[k])))}</li>`).join('')}</ul>`;
    if (d.spells.length && lookOf(d).theme === 'system') h += `<h3>Skills</h3>${d.spells.map(sp => spellText(d, sp).map(l => `<p>${esc(l)}</p>`).join('')).join('<p></p>')}`;
    else if (d.spells.length) h += `<h3>Spells</h3>${d.spells.map(s => `<p><b>${esc(s.name || 'Unnamed spell')}</b> · power ${s.power || 1}${(s.elements || []).length ? ' · ' + s.elements.map(id => esc(nameOf(d.elements, id))).join(', ') : ''}${(s.costs || []).length ? ' · costs ' + s.costs.map(id => esc(nameOf(d.costs, id))).join(', ') : ''}${s.what ? '<br>' + p(s.what) : ''}</p>`).join('')}`;
    if ((d.notes || '').trim()) h += `<h3>Notes</h3><p>${p(d.notes)}</p>`;
    return h;
  }
  // a picture: a card with the name, the one-line summary and the costs
  const LOOKS = {
    parchment: { name: 'Parchment', bg: '#f4ecd8', ink: '#3a2a19', soft: '#5b4630', line: '#7a5c2e', accent: '#9a3b2b', disc: '#fffaf0' },
    clean: { name: 'Clean', bg: '#ffffff', ink: '#1f2430', soft: '#4a5262', line: '#9aa3b2', accent: '#34528a', disc: '#f4f6fa' },
    night: { name: 'Night', bg: '#141a26', ink: '#ece6d6', soft: '#b9b2a2', line: '#c9a85c', accent: '#e0b65a', disc: '#1f2738' },
    arcane: { name: 'Violet', bg: '#24163a', ink: '#f1e9ff', soft: '#cdbbe9', line: '#9b7be0', accent: '#7fd6c8', disc: '#33214f' },
    blood: { name: 'Blood', bg: '#2a1012', ink: '#f6e6dc', soft: '#d8b4a8', line: '#a8342e', accent: '#ff8a5c', disc: '#3a171a' },
    system: { name: 'System', bg: '#07101e', ink: '#e6f6ff', soft: '#8fb6cf', line: '#5fd0ff', accent: '#ffd36b', disc: '#0c1a2c' }
  };
  // accent: a colour picked for the marks (seal, first letter, costs); empty uses the style's own
  const lookOf = d => Object.assign({ theme: 'parchment', frame: 'double', summary: true, costs: true, kinds: true, count: true, accent: '' }, d.look || {});
  const withAccent = (P, L) => /^#[0-9a-f]{6}$/i.test(L.accent || '') ? Object.assign({}, P, { accent: L.accent }) : P;
  // ---- the System look: drawn like a game's status window (LitRPG), monospace, glowing lines, bars for costs
  const MONO = "'IBM Plex Mono', Menlo, Consolas, monospace";
  const GLOW = '<defs><filter id="bm-glow" x="-10%" y="-30%" width="120%" height="160%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>';
  const wrapW = (s, n, max) => { const words = String(s || '').split(/\s+/), lines = []; let l = ''; for (const x of words) { if ((l + ' ' + x).trim().length > n) { lines.push(l.trim()); l = x; } else l += ' ' + x; } if (l.trim()) lines.push(l.trim()); return lines.slice(0, max); };
  // the System window's frame follows the Border choice: Double line (a thin box and corner brackets), Ornate (a
  // tech frame: cut corners, a second dashed line, ticks along the edges), None (just the header bar)
  function hud(W, H, P, label, right, frame = 'double') {
    const k = 22, br = (x, y, dx, dy) => `M${x + dx * k} ${y}H${x}V${y + dy * k}`;
    let box = '';
    if (frame === 'double') box = `<rect x="14" y="14" width="${W - 28}" height="${H - 28}" fill="none" stroke="${P.line}" stroke-width="1" opacity=".4"/>
      <path d="${br(14, 14, 1, 1)}${br(W - 14, 14, -1, 1)}${br(14, H - 14, 1, -1)}${br(W - 14, H - 14, -1, -1)}" fill="none" stroke="${P.line}" stroke-width="3"/>`;
    else if (frame === 'ornate') {
      const c = 18, cut = `M${14 + c} 14H${W - 14 - c}L${W - 14} ${14 + c}V${H - 14 - c}L${W - 14 - c} ${H - 14}H${14 + c}L14 ${H - 14 - c}V${14 + c}Z`;
      let ticks = ''; for (let x = 60; x < W - 50; x += 24) ticks += `M${x} ${H - 14}v-${x % 72 === 12 ? 10 : 5}`; for (let y = 90; y < H - 50; y += 24) ticks += `M14 ${y}h${y % 72 === 18 ? 10 : 5}M${W - 14} ${y}h-${y % 72 === 18 ? 10 : 5}`;
      box = `<path d="${cut}" fill="none" stroke="${P.line}" stroke-width="2.5"/><rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="${P.line}" stroke-width="1" stroke-dasharray="6 6" opacity=".45"/>
        <path d="${ticks}" stroke="${P.line}" stroke-width="1.2" opacity=".7"/>${[[14 + c, 14], [W - 14 - c, 14], [14 + c, H - 14], [W - 14 - c, H - 14]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.5" fill="${P.accent}"/>`).join('')}`;
    }
    return `<rect width="${W}" height="${H}" fill="${P.bg}"/>${GLOW}${box}
      <rect x="30" y="30" width="${W - 60}" height="34" fill="${P.line}" opacity=".12"/>
      <text x="44" y="53" font-family="${MONO}" font-size="16" letter-spacing="3" fill="${P.line}">◆ ${esc(label)}</text>
      <text x="${W - 44}" y="53" text-anchor="end" font-family="${MONO}" font-size="14" letter-spacing="2" fill="${P.accent}">${esc(right)}</text>`;
  }
  const bar = (x, y, n, P) => [1, 2, 3, 4, 5].map(i => `<rect x="${x + (i - 1) * 16}" y="${y - 11}" width="12" height="12" fill="${i <= n ? P.line : 'none'}" stroke="${P.line}" stroke-width="1" opacity="${i <= n ? 1 : .45}"/>`).join('');
  function systemCardSVG(item, d, L, w, h) {
    const P = withAccent(LOOKS.system, L), x = s => esc(s || '');
    const sum = L.summary ? wrapW(d.answers.summary, 62, 2) : [];
    const costs = L.costs ? d.costs.slice(0, 4) : [], kinds = L.kinds ? d.elements.filter(e => (e.name || '').trim()).slice(0, 6) : [];
    let y = 128;
    let out = `<text x="44" y="${y}" font-family="${MONO}" font-size="40" font-weight="700" letter-spacing="2" fill="${P.ink}" filter="url(#bm-glow)">${x((item.title || 'Magic system').toUpperCase())}</text>`;
    y += 36; out += sum.map((l, i) => `<text x="44" y="${y + i * 26}" font-family="${MONO}" font-size="17" fill="${P.soft}">&gt; ${x(l)}</text>`).join(''); y += sum.length * 26 + 18;
    if (costs.length) { out += `<text x="44" y="${y}" font-family="${MONO}" font-size="13" letter-spacing="3" fill="${P.line}" opacity=".8">COSTS</text>`; y += 28;
      costs.forEach(c => { out += `<text x="44" y="${y}" font-family="${MONO}" font-size="17" fill="${P.ink}">${x((c.name || 'unnamed').toUpperCase().slice(0, 18))}</text>${bar(300, y, c.weight || 1, P)}<text x="392" y="${y}" font-family="${MONO}" font-size="14" fill="${P.soft}">${x(WEIGHT[c.weight] || '')}</text>`; y += 28; }); y += 6; }
    if (kinds.length) { let at = 44; out += `<text x="44" y="${y}" font-family="${MONO}" font-size="13" letter-spacing="3" fill="${P.line}" opacity=".8">SCHOOLS</text>`; y += 30;
      kinds.forEach(k => { const t = `[${(k.name || '').toUpperCase()}]`; out += `<text x="${at}" y="${y}" font-family="${MONO}" font-size="17" fill="${P.accent}">${x(t)}</text>`; at += t.length * 10.5 + 16; }); }
    const foot = L.count ? `<text x="44" y="${h > 0 ? 458 : 458}" font-family="${MONO}" font-size="14" letter-spacing="2" fill="${P.soft}">SKILLS: ${d.spells.length}  //  SCHOOLS: ${d.elements.length}  //  RULES: ${d.rules.filter(r => !r.off).length}</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="${w}" height="${h}">${hud(800, 500, P, 'MAGIC SYSTEM', '[ ACTIVE ]', L.frame)}${out}${foot}</svg>`;
  }
  // one spell as a game's skill window
  function spellSVG(d, s, w = 640) {
    const P = LOOKS.system, x = t => esc(t || ''), els = (s.elements || []).map(id => nameOf(d.elements, id)), cs = (s.costs || []).map(id => d.costs.find(c => c.id === id)).filter(Boolean);
    const what = wrapW(s.what, 48, 4), H = 250 + what.length * 24 + cs.length * 26;
    let y = 108, out = `<text x="40" y="${y}" font-family="${MONO}" font-size="30" font-weight="700" letter-spacing="1.5" fill="${P.ink}" filter="url(#bm-glow)">${x((s.name || 'Unnamed spell').toUpperCase())}</text>`;
    y += 40; out += `<text x="40" y="${y}" font-family="${MONO}" font-size="15" fill="${P.soft}">RANK</text>${[1, 2, 3, 4, 5].map(i => `<text x="${150 + (i - 1) * 22}" y="${y}" font-family="${MONO}" font-size="18" fill="${i <= (s.power || 1) ? P.accent : P.soft}" opacity="${i <= (s.power || 1) ? 1 : .35}">★</text>`).join('')}`;
    y += 30; out += `<text x="40" y="${y}" font-family="${MONO}" font-size="15" fill="${P.soft}">SCHOOL</text><text x="150" y="${y}" font-family="${MONO}" font-size="15" fill="${P.ink}">${x(els.join(' + ') || '—')}</text>`;
    y += 30; out += `<text x="40" y="${y}" font-family="${MONO}" font-size="15" fill="${P.soft}">COST</text>`;
    if (!cs.length) out += `<text x="150" y="${y}" font-family="${MONO}" font-size="15" fill="${P.ink}">—</text>`;
    cs.forEach((c, i) => { out += `<text x="150" y="${y + i * 26}" font-family="${MONO}" font-size="15" fill="${P.ink}">${x((c.name || '').toUpperCase().slice(0, 16))}</text>${bar(350, y + i * 26, c.weight || 1, P)}`; });
    y += Math.max(1, cs.length) * 26 + 10;
    out += what.map((l, i) => `<text x="40" y="${y + i * 24}" font-family="${MONO}" font-size="15" fill="${P.soft}">${x(l)}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${H}" width="${w}" height="${Math.round(w * H / 640)}">${hud(640, H, P, 'SKILL', '', lookOf(d).frame)}${out}</svg>`;
  }
  // the same as [bracketed] lines, the way LitRPG books print system messages (they show as boxes with LitRPG tools on)
  function spellText(d, s) {
    const els = (s.elements || []).map(id => nameOf(d.elements, id)), cs = (s.costs || []).map(id => nameOf(d.costs, id));
    return [`[Skill: ${s.name || 'Unnamed spell'}]`, `[Rank: ${s.power || 1}]`, els.length ? `[School: ${els.join(', ')}]` : '', cs.length ? `[Cost: ${cs.join(', ')}]` : '', s.what ? `[${String(s.what).replace(/[\[\]]/g, '').replace(/\s+/g, ' ').trim()}]` : ''].filter(Boolean);
  }
  async function spellWindow(s) {
    const d = it.data, body = document.createElement('div'); body.className = 'bm-big';
    body.innerHTML = `<img alt="${esc(s.name || 'Spell')}" src="${B.svgURL(spellSVG(d, s, 1280))}"><p class="bm-help">Copy text gives the [bracketed] lines LitRPG books use: paste them into a chapter and, with LitRPG tools on, they show as system boxes.</p>`;
    const copy = () => U.copyText(spellText(d, s).join('\n')).then(ok => U.toast(ok ? 'Copied. Paste it into a chapter.' : 'Couldn’t copy here. Select the lines in a chapter’s system message instead.', ok ? '' : 'warn'));
    const v = await U.modal({ title: s.name || 'Spell', body, wide: true, buttons: [{ label: 'Copy text', kind: 'ghost', onClick: copy }, { label: 'Copy picture', value: 'copy', kind: 'ghost' }, { label: 'Save PNG…', value: 'png', kind: 'ghost' }, { label: 'Close', value: null, kind: 'primary' }] });
    if (v) { const svg = spellSVG(d, s, 1280), m = /height="(\d+)"/.exec(svg.slice(svg.indexOf('width="1280"'))); const c = await B.svgCanvas(svg, 1280, m ? +m[1] : 600); if (v === 'copy') B.copyCanvas(c); else B.savePNG(c, s.name || 'Spell'); }
  }
  // ---- the Parchment look: a written document rather than a card. A scroll with rolled ends and deckled sides,
  // an illuminated first letter, ink-ruled lines, the costs as a ledger, kinds of magic as marks in the margin, and a
  // wax seal. Everything is drawn here (no picture files); the edges come from the name, so they stay the same.
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  const seeded = str => { let h = 2166136261; for (const c of String(str || 'unwip')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return ((h ^= h >>> 16) >>> 0) / 4294967296; }; };
  // a small mark for a kind of magic, made from its name: a ring, a few strokes from the middle, a dot
  function kindMark(name, col) {
    const r = seeded('kind' + name), n = 2 + Math.floor(r() * 3), a0 = r() * Math.PI * 2;
    let p = ''; for (let i = 0; i < n; i++) { const a = a0 + i * Math.PI * 2 / n + (r() - .5) * .5, l = 7 + r() * 6; p += `M0 0L${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}`; }
    const cut = r() < .5 ? `<path d="M-13 0H13" stroke="${col}" stroke-width="1"/>` : `<circle r="4" fill="none" stroke="${col}" stroke-width="1.2"/>`;
    return `<circle r="13" fill="none" stroke="${col}" stroke-width="1.6"/><path d="${p}" stroke="${col}" stroke-width="1.8" stroke-linecap="round"/>${cut}<circle cx="${(Math.cos(a0) * 9).toFixed(1)}" cy="${(Math.sin(a0) * 9).toFixed(1)}" r="1.8" fill="${col}"/>`;
  }
  function parchmentSVG(item, d, L, P, w, h) {
    const x = s => esc(s || ''), rnd = seeded(item.title || 'Magic system'), F = 'Bookhaven, Georgia, serif';
    // the sheet: rolled at the top and bottom, deckled (torn-looking) down the sides
    const top = 40, bot = 460, left = [], right = [];
    for (let y = top; y <= bot; y += 12) { left.push([74 + rnd() * 9 - (y % 36 === 4 ? 4 : 0), y]); right.push([726 - rnd() * 9 + (y % 48 === 4 ? 4 : 0), y]); }
    const sheet = 'M' + right.concat([...left].reverse()).map(([px, py]) => `${px.toFixed(1)} ${py}`).join('L') + 'Z';
    const roll = y => `<rect x="54" y="${y - 15}" width="692" height="30" rx="15" fill="url(#pm-roll)" stroke="${P.line}" stroke-width="1.6"/><path d="M68 ${y - 6}H732" stroke="#fff" stroke-width="2" opacity=".25"/>
      ${[42, 758].map(cx => `<ellipse cx="${cx}" cy="${y}" rx="13" ry="19" fill="${P.line}" stroke="${P.ink}" stroke-width="1.4"/><ellipse cx="${cx}" cy="${y}" rx="5" ry="8" fill="${P.ink}" opacity=".5"/>`).join('')}`;
    const defs = `<defs><linearGradient id="pm-roll" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d6ad"/><stop offset=".45" stop-color="${P.bg}"/><stop offset="1" stop-color="#b99a62"/></linearGradient>
      <radialGradient id="pm-age" cx="50%" cy="48%" r="62%"><stop offset=".62" stop-color="${P.line}" stop-opacity="0"/><stop offset="1" stop-color="${P.line}" stop-opacity=".32"/></radialGradient></defs>`;
    // the border inside the sheet
    const bx0 = 100, bx1 = 700, by0 = 66, by1 = 434;
    const curl = (cx, cy, sx, sy) => `<path transform="translate(${cx} ${cy}) scale(${sx} ${sy})" d="M0 22V6Q0 0 6 0H22M4 30C4 14 14 4 30 4M10 18a6 6 0 1 1 6 -6" fill="none" stroke="${P.line}" stroke-width="1.6" stroke-linecap="round"/>`;
    const border = L.frame === 'none' ? '' : L.frame === 'ornate'
      ? `<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" fill="none" stroke="${P.line}" stroke-width="1.4"/>${curl(bx0 + 6, by0 + 6, 1, 1)}${curl(bx1 - 6, by0 + 6, -1, 1)}${curl(bx0 + 6, by1 - 6, 1, -1)}${curl(bx1 - 6, by1 - 6, -1, -1)}
        <path d="M370 ${by0}q15 -12 30 0q15 -12 30 0" fill="none" stroke="${P.line}" stroke-width="1.4"/><circle cx="400" cy="${by0}" r="3" fill="${P.accent}"/>`
      : `<rect x="${bx0}" y="${by0}" width="${bx1 - bx0}" height="${by1 - by0}" fill="none" stroke="${P.line}" stroke-width="1.6"/><rect x="${bx0 + 5}" y="${by0 + 5}" width="${bx1 - bx0 - 10}" height="${by1 - by0 - 10}" fill="none" stroke="${P.line}" stroke-width=".7"/>`;
    // the title: an illuminated first letter in a box, then the rest of the name in ink
    const title = String(item.title || 'Magic system').trim() || 'Magic system', first = title[0].toUpperCase(), rest = title.slice(1);
    const tfs = Math.max(22, Math.min(42, 470 / Math.max(6, rest.length * 0.52)));
    const cap = `<g transform="translate(120 84)"><rect width="64" height="64" fill="${P.accent}" stroke="${P.line}" stroke-width="2"/><rect x="4" y="4" width="56" height="56" fill="none" stroke="#e8c770" stroke-width="1.2"/>
      ${[[8, 8], [56, 8], [8, 56], [56, 56]].map(([cx, cy]) => `<path d="M${cx} ${cy - 3}L${cx + 3} ${cy}L${cx} ${cy + 3}L${cx - 3} ${cy}Z" fill="#e8c770"/>`).join('')}
      <text x="32" y="48" text-anchor="middle" font-family="${F}" font-size="46" fill="${P.bg}">${x(first)}</text></g>`;
    const name = `<text x="194" y="132" font-family="${F}" font-size="${tfs.toFixed(1)}" fill="${P.ink}"${rest.length * tfs * 0.52 > 480 ? ' textLength="480" lengthAdjust="spacingAndGlyphs"' : ''}>${x(rest)}</text>`;
    // the summary, written on ruled lines
    const sum = L.summary ? wrapW(d.answers.summary, 54, 3) : [];
    let y = 176;
    const rule = yy => `<path d="M120 ${yy + 6}H680" stroke="${P.line}" stroke-width=".7" opacity=".45"/>`;
    let body = sum.map((l, i) => `${rule(y + i * 28)}<text x="124" y="${y + i * 28}" font-family="${F}" font-style="italic" font-size="20" fill="${P.soft}">${x(l)}</text>`).join('');
    y += sum.length ? sum.length * 28 + 22 : 8;
    // the costs: a ledger, name, dotted leader, then the weight in numerals and words
    const kinds = L.kinds ? d.elements.filter(e => (e.name || '').trim()).slice(0, 6) : [];
    const costs = L.costs ? d.costs.slice(0, 5) : [];
    const ledgerR = kinds.length ? 500 : 680;
    if (costs.length) {
      body += `<text x="124" y="${y}" font-family="${F}" font-size="14" letter-spacing="3" fill="${P.line}">THE PRICE OF IT</text><path d="M124 ${y + 7}H${ledgerR}" stroke="${P.line}" stroke-width="1.2"/>`;
      y += 32;
      costs.forEach(c => {
        const nm = (c.name || 'unnamed').slice(0, 22), right = `${ROMAN[c.weight || 1] || ''} · ${WEIGHT[c.weight] || ''}`;
        const l0 = 138 + nm.length * 11.6, l1 = ledgerR - right.length * 8.6 - 10;
        body += `${rule(y)}<text x="124" y="${y}" font-family="${F}" font-size="19" fill="${P.ink}">${x(nm)}</text>
          ${l1 > l0 + 8 ? `<path d="M${l0.toFixed(1)} ${y - 2}H${l1.toFixed(1)}" stroke="${P.soft}" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round" opacity=".7"/>` : ''}
          <text x="${ledgerR}" y="${y}" text-anchor="end" font-family="${F}" font-style="italic" font-size="17" fill="${P.accent}">${x(right)}</text>`;
        y += 30;
      });
    }
    // kinds of magic: marks down the right margin, each with its name
    const ky = sum.length ? 176 + sum.length * 28 + 22 : 184;
    const marks = kinds.map((k, i) => `<g transform="translate(548 ${ky + 4 + i * 40})">${kindMark(k.name, P.accent)}</g><text x="570" y="${ky + 10 + i * 40}" font-family="${F}" font-style="italic" font-size="16" fill="${P.ink}">${x(k.name.slice(0, 14))}</text>`).join('');
    // a wax seal on the bottom edge, with the first letter pressed into it
    const sr = seeded('seal' + title); let blob = '';
    for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, r0 = 33 + sr() * 5; blob += `${i ? 'L' : 'M'}${(Math.cos(a) * r0).toFixed(1)} ${(Math.sin(a) * r0).toFixed(1)}`; }
    const seal = `<g transform="translate(664 432)"><path d="M-12 22L-22 62L-10 54L-2 64L4 24Z" fill="${P.accent}" opacity=".85"/><path d="M8 22L22 60L28 50L38 56L24 18Z" fill="${P.accent}" opacity=".7"/>
      <path d="${blob}Z" fill="${P.accent}" stroke="${P.ink}" stroke-width="1" stroke-opacity=".35"/><circle r="23" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="2"/><circle r="20" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1"/>
      <text y="10" text-anchor="middle" font-family="${F}" font-size="28" fill="#000" fill-opacity=".35">${x(first)}</text></g>`;
    const count = L.count ? `<text x="124" y="420" font-family="${F}" font-style="italic" font-size="16" fill="${P.line}">Set down here: ${d.spells.length} spell${d.spells.length === 1 ? '' : 's'}, ${d.elements.length} kind${d.elements.length === 1 ? '' : 's'} of magic.</text>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="${w}" height="${h}">${defs}
      <path d="${sheet}" fill="${P.bg}" stroke="${P.line}" stroke-width="1.2" stroke-opacity=".6"/><path d="${sheet}" fill="url(#pm-age)"/>
      ${roll(top)}${roll(bot)}${border}${cap}${name}${body}${marks}${count}${seal}</svg>`;
  }
  // a picture: a card with the name, the one-line summary, the costs and the kinds of magic
  function cardSVG(item, w = 800, h = 500) {
    const d = Object.assign(blank(), item.data || {}), L = lookOf(d), P = withAccent(LOOKS[L.theme] || LOOKS.parchment, L);
    if (L.theme === 'system') return systemCardSVG(item, d, L, w, h);
    if (L.theme === 'parchment' || !LOOKS[L.theme]) return parchmentSVG(item, d, L, P, w, h);
    const wrap = (s, n) => { const words = String(s || '').split(/\s+/), lines = []; let l = ''; for (const x of words) { if ((l + ' ' + x).trim().length > n) { lines.push(l.trim()); l = x; } else l += ' ' + x; } if (l.trim()) lines.push(l.trim()); return lines.slice(0, 3); };
    const x = s => esc(s || '');
    const sum = L.summary ? wrap(d.answers.summary, 52) : [];
    const kinds = L.kinds ? d.elements.filter(e => (e.name || '').trim()).slice(0, 6) : [];
    const costs = L.costs ? d.costs.slice(0, 5) : [];
    const frame = L.frame === 'none' ? '' : L.frame === 'ornate'
      ? `<rect x="18" y="18" width="764" height="464" rx="6" fill="none" stroke="${P.line}" stroke-width="3"/><rect x="30" y="30" width="740" height="440" rx="4" fill="none" stroke="${P.line}" stroke-width="1" stroke-dasharray="2 5"/>${[[30, 30], [770, 30], [30, 470], [770, 470]].map(([cx, cy]) => `<g transform="translate(${cx} ${cy}) rotate(45)"><rect x="-9" y="-9" width="18" height="18" fill="${P.bg}" stroke="${P.line}" stroke-width="2"/><rect x="-4" y="-4" width="8" height="8" fill="${P.accent}"/></g>`).join('')}`
      : `<rect x="18" y="18" width="764" height="464" rx="16" fill="none" stroke="${P.line}" stroke-width="3"/><rect x="28" y="28" width="744" height="444" rx="12" fill="none" stroke="${P.line}" stroke-width="1"/>`;
    const costY = kinds.length ? 330 : 360, kindY = costs.length ? 418 : 370;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="${w}" height="${h}"><rect width="800" height="500" rx="24" fill="${P.bg}"/>${frame}
      <text x="400" y="${sum.length ? 110 : 150}" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="52" fill="${P.ink}">${x(item.title)}</text>
      ${sum.map((l, i) => `<text x="400" y="${170 + i * 34}" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-style="italic" font-size="26" fill="${P.soft}">${x(l)}</text>`).join('')}
      ${costs.map((c, i) => `<g transform="translate(${400 - (costs.length * 150) / 2 + i * 150 + 75} ${costY})"><circle r="44" fill="${P.disc}" stroke="${P.line}" stroke-width="2"/><text y="-4" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="17" fill="${P.ink}">${x((c.name || '').slice(0, 12))}</text><text y="20" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="14" fill="${P.accent}">${'●'.repeat(c.weight || 1)}</text></g>`).join('')}
      ${kinds.length ? (() => { const wd = kinds.map(k => Math.max(70, x(k.name).length * 10 + 30)), total = wd.reduce((a, b) => a + b, 0) + (kinds.length - 1) * 12; let at = 400 - total / 2; return kinds.map((k, i) => { const g = `<g transform="translate(${at} ${kindY - 16})"><rect width="${wd[i]}" height="32" rx="16" fill="none" stroke="${P.accent}" stroke-width="1.5"/><text x="${wd[i] / 2}" y="21" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="16" fill="${P.ink}">${x(k.name.slice(0, 16))}</text></g>`; at += wd[i] + 12; return g; }).join(''); })() : ''}
      ${L.count ? `<text x="400" y="458" text-anchor="middle" font-family="Bookhaven, Georgia, serif" font-size="16" fill="${P.line}">${d.spells.length} spell${d.spells.length === 1 ? '' : 's'} · ${d.elements.length} kind${d.elements.length === 1 ? '' : 's'} of magic</text>` : ''}</svg>`;
  }
  B.editors.magic = {
    blank, open, check,
    thumb: item => B.svgURL(cardSVG(item, 320, 200)),
    picture: item => B.svgCanvas(cardSVG(item), 1600, 1000),
    toBook: item => sheetHTML(item),
    close: () => { it = null; box = null; }
  };
})();
