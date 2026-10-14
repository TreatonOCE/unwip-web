// Unwip - "What I've used": a private tally of which buttons, menus and panels get used, so the clutter pass can be
// based on real use rather than memory. It stays on this device (browser storage), is never sent anywhere, and
// changes nothing in the app. Seen in About › What I've used, or by searching "used" in the command search.
window.UnwipUsage = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { S, esc, $ } = U;
  const KEY = 'unwip-usage-v1';
  let data = null, saveT = null;
  // names of chapters, books and characters never go in: anything in quotes becomes “…”, numbers become #
  const noNames = t => String(t || '').replace(/\s+/g, ' ').replace(/[“"‘][^”"’]*[”"’]/g, '“…”').replace(/\d[\d,.]*/g, '#');
  const load = () => { if (data) return data; try { data = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { data = null; } if (!data || typeof data !== 'object') data = { since: Date.now(), used: {}, seen: {} }; return data; };
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} }, 1500); };

  // where on screen something is, in plain words
  function areaOf(el) {
    if (el.closest('#menu')) return 'Right-click menu';
    if (el.closest('.modal')) { const h = el.closest('.modal').querySelector('h2'); return 'Window: ' + (h ? noNames(h.textContent).trim().slice(0, 40) : 'dialog'); }
    if (el.closest('#cmdk, .cmdk')) return 'Command search';
    if (el.closest('#binder, .binder, #binder-tree, .side-left')) return 'Binder';
    if (el.closest('.topbar, header, .tb-left, .tb-right')) return 'Top toolbar';
    if (el.closest('.side, #side, .side-panel, [class*="side-"]')) return 'Side panel';
    if (el.closest('#statusbar, .statusbar, footer')) return 'Status bar';
    if (el.closest('#library')) return 'Main screen (books)';
    if (el.closest('.m-bar, .m-head, .m-foot, #m-bar')) return 'Phone toolbar';
    return 'Elsewhere';
  }
  function labelOf(el) {
    const raw = el.getAttribute('aria-label') || el.getAttribute('data-tip') || el.getAttribute('title') || el.textContent || el.id || '';
    // a short name: tooltips like "Snapshots: saved versions of…" become "Snapshots"; key hints in brackets go
    let t = noNames(raw).replace(/\((?:[^()]*?(Ctrl|Alt|Shift|F#)[^()]*?)\)/g, '').replace(/(Ctrl|Alt|Shift)\+\S+/g, '').trim();
    if (t.length > 34 && t.indexOf(':') > 2) t = t.slice(0, t.indexOf(':'));
    if (t.length > 48) t = t.slice(0, 46).replace(/\s+\S*$/, '') + '…';
    t = t.replace(/[\s(,–-]+$/, '');
    return t || null;
  }
  const keyOf = el => { const l = labelOf(el); return l ? `${areaOf(el)} › ${l}` : null; };
  function count(k, how) {
    if (!k) return; load();
    const u = data.used[k] || (data.used[k] = { n: 0, first: Date.now(), last: 0, via: {} });
    u.n++; u.last = Date.now(); u.via[how] = (u.via[how] || 0) + 1; save();
  }
  // clicks and taps on buttons, menu items, tabs and the like (never what's typed, never chapter names or text)
  document.addEventListener('click', e => {
    const el = e.target.closest('button, [role="button"], [role="menuitem"], [role="tab"], select, .nhf-opt');
    if (el && el.closest('.lr-item, .proj-card, .project-card, #binder-tree .tree-row .tr-title')) return;   // these carry book or chapter names
    if (!el || el.closest('#editor, .usage-box')) return;
    count(keyOf(el), e.detail === 0 ? 'keyboard' : 'click');
  }, true);
  document.addEventListener('change', e => { const el = e.target; if (el.matches && el.matches('select, input[type="checkbox"], input[type="radio"]') && !el.closest('#editor, .usage-box')) { const lab = el.closest('label, .field'); count(`${areaOf(el)} › ${noNames((lab && lab.textContent) || el.id || 'setting').trim().slice(0, 48)}`, 'setting'); } }, true);
  // keyboard shortcuts (Ctrl/Alt + a key) are counted as such, by the keys pressed
  document.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey || e.altKey) || ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const k = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey ? 'Shift' : '', e.key.length === 1 ? e.key.toUpperCase() : e.key].filter(Boolean).join('+');
    if (/^Ctrl\+(C|V|X|A|Z|Y)$/.test(k)) return;   // copy, paste and undo are everywhere; not useful here
    count('Keyboard shortcut › ' + k, 'shortcut');
  }, true);
  // the binder: opening chapters is counted as one thing, not per chapter (no titles are kept)
  document.addEventListener('click', e => { if (e.target.closest('#binder-tree .tree-row') && !e.target.closest('button')) count('Binder › Open a chapter or folder', 'click'); }, true);
  // what was on screen, so "never used" can be listed too: buttons that exist but were never clicked
  function noteSeen() {
    load(); let added = false;
    document.querySelectorAll('button[title], button[aria-label], button[data-tip], .topbar button, .side-tabs button, #plan-nav button').forEach(b => {
      if (!b.offsetParent || b.closest('#editor, .modal, #menu, .usage-box')) return;
      const k = keyOf(b); if (k && !data.seen[k]) { data.seen[k] = Date.now(); added = true; }
    });
    if (added) save();
  }
  U.on('project', () => setTimeout(noteSeen, 1500));
  U.on('view', () => setTimeout(noteSeen, 600));
  setTimeout(noteSeen, 3000);

  async function open() {
    load(); noteSeen();
    const rows = Object.entries(data.used).sort((a, b) => b[1].n - a[1].n);
    const never = Object.keys(data.seen).filter(k => !data.used[k]).sort();
    const days = Math.max(1, Math.round((Date.now() - data.since) / 86400000));
    const when = t => { const d = Math.round((Date.now() - t) / 86400000); return d < 1 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`; };
    const body = document.createElement('div'); body.className = 'usage-box';
    body.innerHTML = `<p class="hint">Counted on this device only, over the last ${days} day${days === 1 ? '' : 's'}. Nothing is sent anywhere, and no writing or chapter names are kept: just which buttons, menus and settings were used. Use it to decide what could be tucked away.</p>
      <div class="ug-cols">
        <div><h4>Used (${rows.length})</h4>${rows.length ? `<ol class="ug-list">${rows.map(([k, u]) => `<li><span>${esc(k)}</span><b>${u.n}</b><small>${when(u.last)}</small></li>`).join('')}</ol>` : '<p class="sim-small">Nothing yet.</p>'}</div>
        <div><h4>On screen but never used (${never.length})</h4>${never.length ? `<ul class="ug-list ug-never">${never.map(k => `<li><span>${esc(k)}</span></li>`).join('')}</ul>` : '<p class="sim-small">Nothing yet.</p>'}</div>
      </div>`;
    const v = await U.modal({ title: 'What I’ve used', body, wide: true, buttons: [{ label: 'Start counting again', value: 'reset', kind: 'ghost' }, { label: 'Copy as text', value: 'copy', kind: 'ghost' }, { label: 'Close', value: true, kind: 'primary' }] });
    if (v === 'reset' && await U.confirmBox('Start counting again?', 'This clears the tally on this device.', 'Clear it')) { data = { since: Date.now(), used: {}, seen: {} }; try { localStorage.setItem(KEY, JSON.stringify(data)); } catch {} U.toast('Cleared. Counting starts again now.'); }
    if (v === 'copy') {
      const text = `Unwip: what I've used (${days} days)\n\nUsed:\n` + rows.map(([k, u]) => `${u.n}\t${k}`).join('\n') + `\n\nNever used:\n` + never.join('\n');
      try { await U.api.clipboardWrite('', text); U.toast('Copied. Paste it wherever you like.'); } catch { U.toast('Couldn’t copy.', 'warn'); }
    }
  }
  return { open, count };
})();
