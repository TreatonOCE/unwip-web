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

      <section class="bm-card"><h2>Notes</h2><textarea data-notes rows="5" placeholder="Anything else: history, famous casters, what’s secret…">${esc(d.notes || '')}</textarea></section>`;
    box.scrollTop = keepY;
    wire(page);
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
        <button class="icon-btn small" data-del-spell title="Remove">×</button></div>
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
      else if (t.hasAttribute('data-notes')) d.notes = t.value;
      else return;
      save(); refreshHead();
    };
    page.onchange = e => { const t = e.target; if (t.dataset.cost === 'name' || t.dataset.el === 'name') draw(); };   // names show up in rules and spells
    page.onclick = e => {
      if (e.target.closest('[data-howto-show]')) { try { localStorage.removeItem('unwip-bm-howto'); } catch {} draw(); return; }
      if (e.target.closest('[data-howto-hide]')) { try { localStorage.setItem('unwip-bm-howto', '1'); } catch {} draw(); return; }
      const t = e.target.closest('button'); if (!t) return;
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
    if (d.spells.length) h += `<h3>Spells</h3>${d.spells.map(s => `<p><b>${esc(s.name || 'Unnamed spell')}</b> · power ${s.power || 1}${(s.elements || []).length ? ' · ' + s.elements.map(id => esc(nameOf(d.elements, id))).join(', ') : ''}${(s.costs || []).length ? ' · costs ' + s.costs.map(id => esc(nameOf(d.costs, id))).join(', ') : ''}${s.what ? '<br>' + p(s.what) : ''}</p>`).join('')}`;
    if ((d.notes || '').trim()) h += `<h3>Notes</h3><p>${p(d.notes)}</p>`;
    return h;
  }
  // a picture: a card with the name, the one-line summary and the costs
  function cardSVG(item, w = 800, h = 500) {
    const d = Object.assign(blank(), item.data || {});
    const wrap = (s, n) => { const words = String(s || '').split(/\s+/), lines = []; let l = ''; for (const x of words) { if ((l + ' ' + x).trim().length > n) { lines.push(l.trim()); l = x; } else l += ' ' + x; } if (l.trim()) lines.push(l.trim()); return lines.slice(0, 3); };
    const x = s => esc(s || '');
    const sum = wrap(d.answers.summary, 52);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="${w}" height="${h}"><rect width="800" height="500" rx="24" fill="#f4ecd8"/><rect x="18" y="18" width="764" height="464" rx="16" fill="none" stroke="#7a5c2e" stroke-width="3"/><rect x="28" y="28" width="744" height="444" rx="12" fill="none" stroke="#7a5c2e" stroke-width="1"/>
      <text x="400" y="110" text-anchor="middle" font-family="Georgia, serif" font-size="52" fill="#3a2a19">${x(item.title)}</text>
      ${sum.map((l, i) => `<text x="400" y="${170 + i * 34}" text-anchor="middle" font-family="Georgia, serif" font-style="italic" font-size="26" fill="#5b4630">${x(l)}</text>`).join('')}
      ${d.costs.slice(0, 5).map((c, i) => `<g transform="translate(${400 - (Math.min(5, d.costs.length) * 150) / 2 + i * 150 + 75} 360)"><circle r="44" fill="#fffaf0" stroke="#7a5c2e" stroke-width="2"/><text y="-4" text-anchor="middle" font-family="Georgia, serif" font-size="17" fill="#3a2a19">${x((c.name || '').slice(0, 12))}</text><text y="20" text-anchor="middle" font-family="Georgia, serif" font-size="14" fill="#9a3b2b">${'●'.repeat(c.weight || 1)}</text></g>`).join('')}
      <text x="400" y="452" text-anchor="middle" font-family="Georgia, serif" font-size="16" fill="#7a5c2e">${d.spells.length} spell${d.spells.length === 1 ? '' : 's'} · ${d.elements.length} element${d.elements.length === 1 ? '' : 's'}</text></svg>`;
  }
  B.editors.magic = {
    blank, open, check,
    thumb: item => B.svgURL(cardSVG(item, 320, 200)),
    picture: item => B.svgCanvas(cardSVG(item), 1600, 1000),
    toBook: item => sheetHTML(item),
    close: () => { it = null; box = null; }
  };
})();
