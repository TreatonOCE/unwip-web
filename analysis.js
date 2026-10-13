// Unwip - word analysis (frequency, repeated phrases, name spelling) and text diffs. No AI.
window.FolioAnalysis = (function () {
  'use strict';
  const WORD = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
  const COMMON = new Set(('the a an and or but if then than that this these those there their they them he she it its his her him i me my ' +
    'we us our you your to of in on at by for with from into onto out up down over under about as is was were be been being am are ' +
    'have has had do does did not no so can could would should will shall may might must what when where which who whom whose why how ' +
    'all any some each every both such own same other another again once also too very just only even still back here now then well ' +
    'one two said says say get got go went come came make made take took see saw know knew think thought like look looked ' +
    'm s t d ll re ve don didn wasn couldn wouldn isn aren hadn haven shouldn won can\'t don\'t didn\'t i\'m it\'s i\'d i\'ll that\'s ' +
    'myself himself herself itself themselves yourself before after while because through around between against without within upon ' +
    'toward towards ever never always more most much many few little less least yes oh hey okay').split(/\s+/));

  function tokens(text) { return (text.match(WORD) || []); }

  // texts: [{id, title, text}]
  function frequency(texts, { includeCommon = false, names = new Set(), top = 60 } = {}) {
    const counts = new Map();
    let total = 0;
    for (const t of texts) for (const w of tokens(t.text)) {
      total++;
      const k = w.toLowerCase().replace(/’/g, "'");
      if (k.length < 2 || /^\d+$/.test(k)) continue;
      if (!includeCommon && COMMON.has(k)) continue;
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    const list = [...counts.entries()].map(([word, count]) => ({ word, count, per10k: Math.round(count / Math.max(1, total) * 10000 * 10) / 10, name: names.has(word) }))
      .sort((a, b) => b.count - a.count).slice(0, top);
    return { total, list };
  }

  // repeated 2–4 word phrases (ignores phrases made only of common words)
  function phrases(texts, { min = 3, top = 40 } = {}) {
    const counts = new Map();
    for (const t of texts) {
      for (const para of t.text.split(/\n+/)) {
        const ws = tokens(para).map(w => w.toLowerCase().replace(/’/g, "'"));
        for (let n = 4; n >= 2; n--) {
          for (let i = 0; i + n <= ws.length; i++) {
            const g = ws.slice(i, i + n);
            if (g.every(w => COMMON.has(w))) continue;
            if (COMMON.has(g[0]) && COMMON.has(g[n - 1]) && n === 2) continue;
            const k = g.join(' ');
            counts.set(k, (counts.get(k) || 0) + 1);
          }
        }
      }
    }
    let list = [...counts.entries()].filter(([, c]) => c >= min).map(([phrase, count]) => ({ phrase, count }));
    list.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length);
    // drop shorter phrases that only appear as part of a longer one
    const kept = [];
    for (const p of list) {
      if (kept.some(k => k.phrase.includes(p.phrase) && k.count >= p.count)) continue;
      kept.push(p);
      if (kept.length >= top) break;
    }
    return kept;
  }

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    const prev = new Array(b.length + 1), cur = new Array(b.length + 1), pp = new Array(b.length + 1);
    for (let j = 0; j <= b.length; j++) prev[j] = j;
    for (let i = 1; i <= a.length; i++) {
      cur[0] = i; let best = cur[0];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1); // swapped letters
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      for (let j = 0; j <= b.length; j++) { pp[j] = prev[j]; prev[j] = cur[j]; }
    }
    return prev[b.length];
  }

  // names: [{text, kind}] from the sheets. Finds capitalised words that are one letter off a name.
  function nameCheck(texts, names, ignore = {}) {
    // words used in lowercase in the book are ordinary words ("cast", "last", "cost"), not names or misspelled names
    const lower = new Map();
    for (const t of texts) { const re = /(?<![\p{L}\p{N}])\p{Ll}[\p{L}'’]{2,}/gu; let m; while ((m = re.exec(t.text))) { const w = m[0].replace(/['’]s$/, ''); lower.set(w, (lower.get(w) || 0) + 1); } }
    const ordinary = w => (lower.get(w.toLowerCase()) || 0) >= 2;
    const nameWords = new Map();   // lower -> proper spelling
    for (const n of names) for (const w of n.text.split(/[\s\-]+/)) if (w.length >= 4 && /^\p{Lu}/u.test(w) && !ordinary(w) && !(ignore.names || []).includes(w)) nameWords.set(w.toLowerCase(), w);
    const pairs = new Set(ignore.pairs || []);
    const used = new Map(), suspects = new Map();
    for (const t of texts) {
      let m; const re = new RegExp(WORD.source, 'gu');
      while ((m = re.exec(t.text))) {
        const w = m[0].replace(/['’]s$/, '');
        const lw = w.toLowerCase();
        if (nameWords.has(lw)) { used.set(lw, (used.get(lw) || 0) + 1); continue; }
        if (!/^\p{Lu}/u.test(w) || w.length < 4 || COMMON.has(lw) || ordinary(w)) continue;
        for (const [nl, proper] of nameWords) {
          const max = nl.length >= 8 ? 2 : 1;
          if (editDistance(lw, nl, max) <= max) {
            const key = w + '|' + proper;
            if (pairs.has(key)) break;
            const s = suspects.get(key) || { found: w, suggestion: proper, count: 0, docs: new Set() };
            s.count++; s.docs.add(t.title); suspects.set(key, s);
            break;
          }
        }
      }
    }
    return {
      names: [...nameWords.entries()].map(([l, proper]) => ({ name: proper, count: used.get(l) || 0 })).sort((a, b) => b.count - a.count),
      suspects: [...suspects.values()].map(s => ({ ...s, docs: [...s.docs] })).sort((a, b) => b.count - a.count)
    };
  }

  // ---- diff for snapshots: paragraphs first, then words inside changed paragraphs
  function lcsPairs(a, b, eq) {
    const n = a.length, m = b.length;
    if (n * m > 4e6) return null;
    const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = eq(a[i], b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ops = []; let i = 0, j = 0;
    while (i < n && j < m) {
      if (eq(a[i], b[j])) { ops.push(['=', a[i], b[j]]); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', a[i]]); i++; }
      else { ops.push(['+', b[j]]); j++; }
    }
    while (i < n) ops.push(['-', a[i++]]);
    while (j < m) ops.push(['+', b[j++]]);
    return ops;
  }
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  function wordDiffHTML(a, b) {
    const ta = a.split(/(\s+)/), tb = b.split(/(\s+)/);
    const ops = lcsPairs(ta, tb, (x, y) => x === y);
    if (!ops) return `<del>${esc(a)}</del> <ins>${esc(b)}</ins>`;
    let out = '', mode = '', buf = '';
    const flush = () => { if (!buf) return; out += mode === '-' ? `<del>${esc(buf)}</del>` : mode === '+' ? `<ins>${esc(buf)}</ins>` : esc(buf); buf = ''; };
    for (const op of ops) { const t = op[0] === '=' ? op[1] : op[1]; if (op[0] !== mode) { flush(); mode = op[0]; } buf += t; }
    flush();
    return out;
  }
  // old/new: arrays of paragraph strings. Returns {html, added, removed} (word counts)
  function diff(oldParas, newParas) {
    const sim = (x, y) => { if (x === y) return true; const a = new Set(tokens(x)), b = tokens(y); if (!b.length || !a.size) return false; let s = 0; for (const w of b) if (a.has(w)) s++; return s / Math.max(a.size, b.length) > 0.5; };
    const ops = lcsPairs(oldParas, newParas, sim) || [...oldParas.map(p => ['-', p]), ...newParas.map(p => ['+', p])];
    let html = '', added = 0, removed = 0, changed = 0;
    const wc = s => tokens(s).length;
    for (const op of ops) {
      if (op[0] === '=') {
        if (op[1] === op[2]) html += `<p class="same">${esc(op[1]) || '&nbsp;'}</p>`;
        else { changed++; html += `<p class="changed">${wordDiffHTML(op[1], op[2])}</p>`; const d = wc(op[2]) - wc(op[1]); if (d > 0) added += d; else removed -= d; }
      } else if (op[0] === '-') { if (op[1].trim()) { removed += wc(op[1]); html += `<p class="removed"><del>${esc(op[1])}</del></p>`; } }
      else if (op[1].trim()) { added += wc(op[1]); html += `<p class="added"><ins>${esc(op[1])}</ins></p>`; }
    }
    return { html, added, removed, changed };
  }

  return { frequency, phrases, nameCheck, diff, tokens };
})();
