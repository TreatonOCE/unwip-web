// Unwip - name autocomplete from the Characters, Places and Items sheets.
window.FolioNames = (function () {
  'use strict';
  const KINDS = { characters: 'Character', places: 'Place', items: 'Item' };
  let entries = [];               // [{text, kind, primary, sheetId}]
  const recent = new Map();       // text -> last used time

  // Read names from a sheet: its title, plus "Full name:", "Name:" and "Aliases:" lines
  function namesFromSheet(title, html) {
    const out = { primary: (title || '').trim(), aliases: [] };
    if (!html) return out;
    const div = document.createElement('div');
    div.innerHTML = html;
    for (const p of div.querySelectorAll('p')) {
      const t = p.textContent.trim();
      const m = t.match(/^(full name|name|aliases?|nicknames?|also known as|titles?)\s*:\s*(.+)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const vals = m[2].split(/[,;\/]|\s+or\s+/).map(s => s.trim()).filter(Boolean);
      if ((key === 'full name' || key === 'name') && vals[0]) {
        if (!/^New [a-z][a-z ]*$/.test(vals[0])) {
          if (out.primary && out.primary !== vals[0] && !/^New [a-z][a-z ]*$/.test(out.primary)) out.aliases.push(out.primary);
          out.primary = vals[0];
        }
      } else out.aliases.push(...vals);
    }
    return out;
  }

  async function rebuild(project, loadDoc) {
    const list = [];
    for (const root of project.binder) {
      const kindLabel = KINDS[root.kind] || (root.custom ? (root.singular || root.title) : null);
      if (!kindLabel) continue;
      const docs = [];
      const walk = ns => ns.forEach(n => { if (n.type === 'doc' && !n.map) docs.push(n); if (n.children) walk(n.children); });
      walk(root.children || []);
      for (const d of docs) {
        if (/^New [a-z][a-z ]*$/.test(d.title || '')) {
          // still read the sheet: the name may only be filled in on the page
        }
        let html = '';
        try { html = await loadDoc(d.id); } catch {}
        const { primary, aliases } = namesFromSheet(d.title, html);
        if (primary && !/^New [a-z][a-z ]*$/.test(primary)) list.push({ text: primary, kind: kindLabel, primary: null, sheetId: d.id });
        for (const a of aliases) if (a && a !== primary) list.push({ text: a, kind: kindLabel, primary, sheetId: d.id });
      }
    }
    // drop duplicates
    const seen = new Set();
    entries = list.filter(e => { const k = e.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return entries;
  }

  function suggest(prefix, max = 6) {
    const p = prefix.toLowerCase();
    if (!p) return [];
    const scored = [];
    for (const e of entries) {
      const t = e.text.toLowerCase();
      if (t === p) continue;
      let score = -1;
      if (t.startsWith(p)) score = 3;
      else if (t.split(/[\s\-]+/).some(w => w.startsWith(p))) score = 2;
      if (score < 0) continue;
      score += (recent.get(e.text) || 0) / 1e13;
      scored.push({ e, score });
    }
    scored.sort((a, b) => b.score - a.score || a.e.text.length - b.e.text.length);
    return scored.slice(0, max).map(s => s.e);
  }

  function used(text) { recent.set(text, Date.now()); }

  // words to teach the spellchecker, and to ignore in "repeated words" checks
  function allWords() {
    const words = new Set();
    for (const e of entries) for (const w of e.text.split(/[\s\-]+/)) if (w.length > 1) words.add(w.replace(/['’]s$/, ''));
    return [...words];
  }

  return { rebuild, suggest, used, allWords, get entries() { return entries; } };
})();
