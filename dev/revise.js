// Unwip - revision checks. Rule-based (no AI), runs entirely offline.
// Highlights use the browser's "custom highlight" feature, so nothing is ever written into
// your text: the marks are only drawn on screen and disappear when revision mode is off.
window.FolioRevise = (function () {
  'use strict';

  // ---------------------------------------------------------------- word lists
  const NOT_ADVERBS = new Set(('only family holy ugly belly supply apply reply rely fly ally bully jelly lily silly chilly friendly lovely ' +
    'lonely curly lively elderly costly deadly likely unlikely italy july butterfly assembly anomaly monopoly rally tally folly early daily ' +
    'weekly monthly yearly hourly nightly bubbly cuddly smelly wobbly prickly sickly surly burly gangly gnarly grisly grizzly hilly woolly ' +
    'oily wily bodily kindly comely courtly cowardly crumbly fiddly frilly ghastly ghostly goodly heavenly homely jolly leery manly measly ' +
    'motherly fatherly brotherly sisterly neighbourly neighborly orderly portly saintly scaly shapely slovenly sly stately steely ' +
    'timely unruly unseemly worldly wrinkly lowly holly melancholy anomaly rely comply imply multiply ply panoply homily belly ' +
    'apply reapply supply resupply dolly golly molly polly sully tully emily lily kelly shelly billy willy ally sally').split(/\s+/));
  const PASSIVE_AUX = 'am|is|are|was|were|be|been|being|get|gets|got|gotten|getting';
  const IRREGULAR = ('known seen taken given done made written broken chosen driven eaten fallen forgotten hidden held kept left lost paid ' +
    'said sent shown sold spoken stolen thrown told understood worn won built bought brought caught felt found heard led meant met put ' +
    'read set shut struck swept taught thought torn woken beaten begun bitten blown born bound bred burnt cast cut dealt drawn dug fed ' +
    'fought flung forbidden forgiven frozen grown hung hit hurt laid lit overcome ridden risen shaken shot slain sung sunk slung spun ' +
    'stung stuck sworn swung woven withdrawn wrung').split(' ');
  const NOT_PASSIVE = new Set(('tired scared excited interested bored worried surprised married supposed used related pleased concerned ' +
    'involved annoyed confused embarrassed frightened terrified amazed amused ashamed exhausted relieved satisfied disappointed ' +
    'determined prepared convinced aged beloved bred naked wicked sacred rugged ragged crooked blessed learned dogged jagged ' +
    'need speed seed feed bleed breed weed reed indeed proceed exceed succeed red bed shed wed fled sled bred led hundred ' +
    'kindred shred embed').split(/\s+/));
  const FILLER = ['just', 'really', 'very', 'quite', 'rather', 'somewhat', 'actually', 'basically', 'literally', 'totally', 'completely',
    'simply', 'pretty much', 'a bit', 'a little bit', 'kind of', 'sort of', 'started to', 'began to', 'begin to', 'starts to', 'begins to',
    'seemed to', 'seems to', 'seem to', 'suddenly', 'at all', 'very much', 'definitely', 'certainly', 'in fact', 'that being said',
    'needless to say', 'for all intents and purposes', 'all of a sudden', 'the fact that'];
  const SIMPLER = {
    'utilize': 'use', 'utilise': 'use', 'utilization': 'use', 'commence': 'start', 'commenced': 'started', 'endeavour': 'try', 'endeavor': 'try',
    'in order to': 'to', 'approximately': 'about', 'assist': 'help', 'assisted': 'helped', 'numerous': 'many', 'purchase': 'buy',
    'purchased': 'bought', 'sufficient': 'enough', 'additional': 'more / extra', 'attempt': 'try', 'attempted': 'tried',
    'demonstrate': 'show', 'demonstrated': 'showed', 'facilitate': 'help', 'obtain': 'get', 'obtained': 'got', 'prior to': 'before',
    'subsequently': 'later', 'terminate': 'end', 'terminated': 'ended', 'due to the fact that': 'because', 'at this point in time': 'now',
    'in the event that': 'if', 'a number of': 'some', 'possess': 'have', 'possessed': 'had', 'require': 'need', 'required': 'needed',
    'retain': 'keep', 'initial': 'first', 'indicate': 'show', 'indicated': 'showed', 'inquire': 'ask', 'enquire': 'ask',
    'inquired': 'asked', 'enquired': 'asked', 'perceive': 'see', 'perceived': 'saw', 'reside': 'live', 'resided': 'lived',
    'transmit': 'send', 'proceed': 'go', 'proceeded': 'went', 'in close proximity': 'near', 'in the near future': 'soon',
    'with regard to': 'about', 'with regards to': 'about', 'in spite of the fact that': 'although', 'despite the fact that': 'although',
    'is able to': 'can', 'was able to': 'could', 'were able to': 'could', 'a large number of': 'many', 'the majority of': 'most',
    'at the present time': 'now', 'on a daily basis': 'daily', 'each and every': 'each', 'first and foremost': 'first',
    'whether or not': 'whether', 'end result': 'result', 'final outcome': 'outcome', 'past history': 'history', 'free gift': 'gift'
  };
  const STOP = new Set(('the a an and or but if then than that this these those there their they them he she it its his her him i me my mine ' +
    'we us our you your yours to of in on at by for with from into onto out up down over under about as is was were be been being am are ' +
    'have has had do does did not no so too can could would should will shall may might must just only also even still very really ' +
    'what when where which who whom whose why how all any some each every both either neither one two more most much many such own ' +
    'same other another again back away off here now well yeah okay said says say asked ask told tell like know knew think thought ' +
    'look looked looking see saw seen get got going go went come came make made take took give gave want wanted need needed let ' +
    'something nothing anything everything someone anyone everyone myself himself herself itself themselves yourself before after ' +
    'while because though although through around between against without within upon onto toward towards once ever never always ' +
    'yes oh hey right left time way thing things little bit pretty enough last first next few lot lots little').split(/\s+/));
  const SAID = 'said|asked|whispered|muttered|mumbled|replied|shouted|yelled|called|cried|added|answered|murmured|snapped|hissed|growled|sighed|laughed|continued|began|started|explained|admitted|insisted|demanded|offered|suggested|warned|agreed|repeated|grumbled|groaned|breathed|stammered|stuttered|exclaimed|retorted|interrupted|chuckled|scoffed|huffed|grunted|barked|roared|teased|joked|whimpered|pleaded|begged|announced|declared|noted|observed|remarked|corrected|countered';
  const INTRO = ['However', 'Therefore', 'Meanwhile', 'Instead', 'Finally', 'Eventually', 'Unfortunately', 'Fortunately', 'Honestly',
    'Obviously', 'Apparently', 'Besides', 'Anyway', 'Anyways', 'Of course', 'In fact', 'After all', 'For example', 'For instance',
    'Thankfully', 'Luckily', 'Sadly', 'Clearly', 'Personally', 'Naturally', 'Admittedly', 'Furthermore', 'Moreover', 'Nevertheless',
    'Nonetheless', 'Otherwise', 'Yes', 'Well', 'Oh', 'Okay', 'Surprisingly', 'Hopefully', 'Ironically', 'Interestingly', 'Seriously',
    'Frankly', 'Basically', 'Still', 'Thus', 'Hence', 'Consequently', 'Additionally', 'Similarly', 'Likewise', 'Unsurprisingly'];

  // ---------------------------------------------------------------- categories
  // level: 'mark' = background, 'line' = underline (quieter)
  const CATS = [
    { id: 'veryhard', focused: true, label: 'Very hard sentences', hint: 'Long or complex. Try splitting it.', on: true },
    { id: 'hard', focused: true, label: 'Hard sentences', hint: 'A bit long or complex. Could be simpler.', on: true },
    { id: 'adverb', focused: true, label: 'Adverbs', hint: 'Often a stronger verb does the job alone.', on: true },
    { id: 'passive', focused: true, label: 'Passive voice', hint: 'Fine sometimes, but active voice is usually clearer.', on: true },
    { id: 'simpler', focused: true, label: 'Simpler wording', hint: 'A plainer word or phrase exists.', on: true },
    { id: 'filler', label: 'Weak & filler words', hint: 'Often can be cut.', on: true },
    { id: 'echo', label: 'Repeated words nearby', hint: 'Same word used again close by.', on: true },
    { id: 'starts', label: 'Repeated sentence starts', hint: 'Several sentences in a row start the same way.', on: true },
    { id: 'doubled', label: 'Doubled words', hint: 'Same word twice in a row.', on: true },
    { id: 'comma', label: 'Comma suggestions', hint: 'Possible missing comma. Worth checking before you add one.', on: true },
    { id: 'typo', label: 'Spacing & punctuation', hint: 'Extra spaces or missing spaces around punctuation.', on: true },
    { id: 'grammar', label: 'Grammar', hint: 'Likely mistakes like “could of”, “a apple” or “they was”. Characters’ dialogue is left alone for agreement.', on: true },
    { id: 'confused', label: 'Commonly confused words', hint: 'its / it’s, your / you’re, their / there, then / than, lose / loose and more.', on: true },
    { id: 'spelling', label: 'UK / US spelling mix', hint: 'The chapter uses both spellings of a word, like colour and color.', on: true },
    { id: 'more', label: 'More suggestions', hint: 'Extra usage and phrase checks from Harper, a free offline grammar engine (no AI). Usually right, but read them before changing.', on: true }
  ];

  // short before → after examples shown in the hover card
  const EXAMPLES = {
    veryhard: ['I ran to the door, which was stuck, so I kicked it until it gave way.', 'I ran to the door. It was stuck, so I kicked it until it gave way.'],
    hard: ['She grabbed the lamp and swung it at him, but he ducked.', 'She grabbed the lamp and swung. He ducked.'],
    adverb: ['She walked slowly to the door.', 'She shuffled to the door.'],
    passive: ['The door was opened by Mara.', 'Mara opened the door.'],
    filler: ['I just really wanted to leave.', 'I wanted to leave.'],
    echo: ['The floor creaked. I stepped across the floor.', 'The floor creaked. I stepped across the boards.'],
    starts: ['I walked in. I looked around. I sat down.', 'I walked in and looked around. Then I sat down.'],
    comma: ['“Weird” I mumbled.', '“Weird,” I mumbled.'],
    grammar: ['She could of gone. They was late.', 'She could have gone. They were late.'],
    confused: ['Your going to loose it.', 'You’re going to lose it.'],
    spelling: ['The grey sky… the gray coat.', 'The grey sky… the grey coat.'],
    more: ['We shall await for the witnesses.', 'We shall await the witnesses.']
  };

  // ---------------------------------------------------------------- helpers
  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }
  const WORD_RE = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
  function gradeOf(words, sentences, syl) {
    if (!words || !sentences) return 0;
    return 0.39 * (words / sentences) + 11.8 * (syl / words) - 15.59;
  }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build a text map of every block (paragraph or heading) so regex positions can be turned back into ranges
  function blocksOf(editor) {
    const out = [];
    const blockEls = editor.querySelectorAll(':scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > blockquote > p, :scope > blockquote:not(:has(p))');
    for (const el of blockEls) {
      const nodes = []; let text = '';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) { nodes.push({ node: n, start: text.length }); text += n.nodeValue; }
      out.push({ el, text, nodes, heading: /^H[1-3]$/.test(el.tagName) });
    }
    return out;
  }
  function pointAt(block, idx, preferEnd) {
    const ns = block.nodes;
    for (let i = 0; i < ns.length; i++) {
      const s = ns[i].start, e = s + ns[i].node.nodeValue.length;
      if (idx < e || (idx === e && (preferEnd || i === ns.length - 1))) return [ns[i].node, idx - s];
    }
    const last = ns[ns.length - 1];
    return [last.node, last.node.nodeValue.length];
  }
  function makeRange(block, start, end) {
    if (!block.nodes.length || end <= start) return null;
    const r = new Range();
    const [sn, so] = pointAt(block, start, false);
    const [en, eo] = pointAt(block, end, true);
    try { r.setStart(sn, so); r.setEnd(en, eo); } catch { return null; }
    return r;
  }
  function collapsedAt(block, idx) {
    if (!block.nodes.length) return null;
    const [n, o] = pointAt(block, idx, true);
    const r = new Range(); r.setStart(n, o); r.collapse(true); return r;
  }
  // best place to split a long sentence: a semicolon, dash, or ", but / and / so / yet / then", near the middle
  function splitPoint(text, s) {
    const seg = text.slice(s.start, s.end);
    const re = /([;:]\s+|\s+—\s+|—|,\s+(but|so|yet|then)\s+|,\s+and\s+)/g;
    const total = (seg.match(WORD_RE) || []).length;
    let best = null, m;
    while ((m = re.exec(seg))) {
      const before = (seg.slice(0, m.index).match(WORD_RE) || []).length;
      const after = total - before - (m[2] || /and/.test(m[0]) ? 1 : 0);
      if (before < 5 || after < 5) continue;
      const nextChar = seg[m.index + m[0].length];
      if (!nextChar || !/[\p{L}]/u.test(nextChar)) continue;
      const score = Math.abs(before - total / 2);
      if (!best || score < best.score) best = { score, at: s.start + m.index, len: m[0].length, conj: m[2] || null, nextChar };
    }
    if (!best) return null;
    const start = best.at, end = best.at + best.len + 1;   // include the next letter so it can be capitalised
    const text2 = best.conj ? `. ${best.conj[0].toUpperCase()}${best.conj.slice(1)} ${best.nextChar}` : `. ${best.nextChar.toUpperCase()}`;
    return { start, end, text: text2 };
  }

  function sentencesOf(text) {
    const res = [];
    const re = /[^.!?…]+(?:[.!?…]+["”’)\]]*|$)/g;
    let m;
    while ((m = re.exec(text))) {
      if (!m[0].trim()) { if (m.index === re.lastIndex) re.lastIndex++; continue; }
      const lead = m[0].match(/^\s*/)[0].length;
      const trail = m[0].match(/\s*$/)[0].length;
      res.push({ start: m.index + lead, end: m.index + m[0].length - trail, text: m[0].trim() });
    }
    return res;
  }

  // ---------------------------------------------------------------- analysis
  function analyse(editor, opts = {}) {
    const names = opts.names || new Set();       // lower-case character/place names to ignore in echo checks
    const issues = [];
    const ignored = opts.ignored || new Set();
    // extra: { fixes: [{label, start, end, text, capNext}], prev: [start,end,block], preview, removable }
    const add = (cat, block, start, end, msg, extra = {}) => {
      const text = block.text.slice(start, end);
      const key = `${cat}|${text.toLowerCase()}|${block.text.slice(end, end + 24).toLowerCase()}`;
      if (ignored.has(key) || ignored.has(`${cat}|${text.toLowerCase()}|*`)) return;
      const range = makeRange(block, start, end); if (!range) return;
      const fixes = (extra.fixes || []).map(f => {
        const r = f.start === f.end ? collapsedAt(block, f.start) : makeRange(block, f.start, f.end);
        return r ? { label: f.label, range: r, text: f.text, capNext: !!f.capNext } : null;
      }).filter(Boolean);
      const prev = extra.prev ? makeRange(extra.prev[2], extra.prev[0], extra.prev[1]) : null;
      issues.push({ cat, range, msg, key, word: text, fixes, prev, preview: extra.preview || null, example: EXAMPLES[cat] || null, canIgnoreAll: !!extra.canIgnoreAll });
    };
    // removing a word: also take one neighbouring space (and a following comma), and say if the next letter should become a capital
    const removal = (block, start, end, sentStart) => {
      const t = block.text;
      let s0 = start, e0 = end;
      if (t[e0] === ',' ) e0++;
      if (t[e0] === ' ') e0++; else if (t[s0 - 1] === ' ') s0--;
      const capNext = start <= sentStart + 1 && /[a-z]/.test(t[e0] || '');
      return { label: 'Remove', start: s0, end: capNext ? e0 + 1 : e0, text: capNext ? t[e0].toUpperCase() : '' };
    };
    const previewOf = (block, sent, start, end, replacement) => {
      const t = block.text;
      const a = Math.max(sent ? sent.start : 0, start - 60), b = Math.min(sent ? sent.end : t.length, end + 60);
      return { before: (a > (sent ? sent.start : 0) ? '…' : '') + t.slice(a, start), removed: t.slice(start, end), added: replacement || '', after: t.slice(end, b) + (b < (sent ? sent.end : t.length) ? '…' : '') };
    };
    const sentenceAt = (sents, idx) => sents.find(x => idx >= x.start && idx <= x.end) || null;
    const blocks = blocksOf(editor);
    const G = window.UnwipGrammar;
    const gctx = G ? { spelling: G.spellingIndex(blocks.map(b => b.text).join('\n')), prefer: opts.spellingPrefer } : null;
    let totalWords = 0, totalSent = 0, totalSyl = 0, pendingMore = false;
    const recent = [];             // [{word, index}] for echo check
    let wordIndex = 0;
    let prevStarts = [];           // run of recent sentence starts

    const fillerRe = new RegExp(`\\b(${FILLER.map(escRe).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');
    const simplerRe = new RegExp(`\\b(${Object.keys(SIMPLER).map(escRe).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gi');
    const passiveRe = new RegExp(`\\b(${PASSIVE_AUX})\\s+(?:(\\w+ly)\\s+)?(\\w+ed|${IRREGULAR.join('|')})\\b`, 'gi');
    const introRe = new RegExp(`^(["“]?)(${INTRO.map(escRe).join('|')})(?=\\s+[\\p{L}"“])`, 'u');

    for (const block of blocks) {
      const text = block.text;
      if (!text.trim()) { prevStarts = []; continue; }
      const sents = sentencesOf(text);

      // sentence-level: difficulty + repeated starts
      for (const s of sents) {
        const words = s.text.match(WORD_RE) || [];
        const wc = words.length;
        const syl = words.reduce((a, w) => a + syllables(w), 0);
        totalWords += wc; totalSent += 1; totalSyl += syl;
        if (!block.heading && wc >= 14) {
          const g = gradeOf(wc, 1, syl);
          const sp = splitPoint(text, s);
          const extra = sp ? { fixes: [{ label: 'Split here', start: sp.start, end: sp.end, text: sp.text }], preview: (() => { const pv = previewOf(block, s, sp.start, sp.end, ''); return { before: pv.before, removed: '', added: sp.text.slice(0, -1), after: sp.text.slice(-1) + pv.after }; })() } : {};
          const tail = sp ? '' : ' No obvious split point: try cutting a clause or moving a detail into its own sentence.';
          if (g >= 14 || wc >= 40) add('veryhard', block, s.start, s.end, `Very hard to read (${wc} words). Try splitting it.${tail}`, extra);
          else if (g >= 10 || wc >= 28) add('hard', block, s.start, s.end, `Hard to read (${wc} words). Could be simpler.${tail}`, extra);
        }
        // sentence starts
        const firstM = s.text.match(/^[^\p{L}\p{N}]*([\p{L}\p{N}']+)/u);
        if (firstM && !block.heading) {
          const w = firstM[1].toLowerCase();
          const offset = s.start + s.text.indexOf(firstM[1]);
          if (prevStarts.length && prevStarts[prevStarts.length - 1].w === w) prevStarts.push({ w, offset, block });
          else prevStarts = [{ w, offset, block }];
          if (prevStarts.length === 3) prevStarts.forEach(p => add('starts', p.block, p.offset, p.offset + p.w.length, `Three sentences in a row start with “${firstM[1]}”.`));
          else if (prevStarts.length > 3) add('starts', block, offset, offset + w.length, `${prevStarts.length} sentences in a row start with “${firstM[1]}”.`);
        }
        // comma: introductory word
        const im = s.text.match(introRe);
        if (im) {
          const st = s.start + im[1].length;
          add('comma', block, st, st + im[2].length, `Consider a comma after “${im[2]}”.`, { fixes: [{ label: 'Add comma', start: st + im[2].length, end: st + im[2].length, text: ',' }] });
        }
      }
      if (block.heading) continue;

      let m;
      // adverbs
      const advRe = /\b([A-Za-z]+ly)\b/g;
      while ((m = advRe.exec(text))) {
        const w = m[1].toLowerCase();
        if (w.length < 5 || NOT_ADVERBS.has(w) || names.has(w)) continue;
        { const sent = sentenceAt(sents, m.index); const rm = removal(block, m.index, m.index + m[1].length, sent ? sent.start : 0);
          add('adverb', block, m.index, m.index + m[1].length, `Adverb: “${m[1]}”. A stronger verb might do the job alone.`, { fixes: [rm], preview: previewOf(block, sent, rm.start, rm.end, rm.text), canIgnoreAll: true }); }
      }
      // passive voice
      passiveRe.lastIndex = 0;
      while ((m = passiveRe.exec(text))) {
        const part = m[3].toLowerCase();
        if (NOT_PASSIVE.has(part)) continue;
        add('passive', block, m.index, m.index + m[0].length, `Passive voice: “${m[0]}”. Consider who does the action, and make them the subject.`);
      }
      // simpler words
      simplerRe.lastIndex = 0;
      while ((m = simplerRe.exec(text))) {
        const opts2 = SIMPLER[m[0].toLowerCase()].split(' / ');
        const keepCap = s => /^[A-Z]/.test(m[0]) ? s[0].toUpperCase() + s.slice(1) : s;
        add('simpler', block, m.index, m.index + m[0].length, `“${m[0]}” has a plainer option.`,
          { fixes: opts2.map(o => ({ label: `Use “${keepCap(o)}”`, start: m.index, end: m.index + m[0].length, text: keepCap(o) })), canIgnoreAll: true });
      }
      // filler
      fillerRe.lastIndex = 0;
      while ((m = fillerRe.exec(text))) {
        const sent = sentenceAt(sents, m.index);
        const rm = removal(block, m.index, m.index + m[0].length, sent ? sent.start : 0);
        add('filler', block, m.index, m.index + m[0].length, `“${m[0]}” is often filler. Here’s the sentence without it:`, { fixes: [rm], preview: previewOf(block, sent, rm.start, rm.end, rm.text), canIgnoreAll: true });
      }
      // doubled words
      const dblRe = /\b([\p{L}']+)\s+\1\b/giu;
      while ((m = dblRe.exec(text))) {
        const w = m[1].toLowerCase();
        if (['had', 'that', 'ha', 'so', 'no', 'bye', 'very', 'knock', 'blah', 'go', 'yeah', 'yes', 'tsk'].includes(w)) continue;
        add('doubled', block, m.index, m.index + m[0].length, `“${m[1]}” appears twice in a row.`, { fixes: [{ label: `Fix: “${m[1]}”`, start: m.index, end: m.index + m[0].length, text: m[1] }] });
      }
      // echoes (repeated words close together, across paragraphs)
      WORD_RE.lastIndex = 0;
      while ((m = WORD_RE.exec(text))) {
        const raw = m[0];
        const w = raw.toLowerCase().replace(/['’]s$/, '');
        wordIndex++;
        if (w.length < 4 || STOP.has(w) || names.has(w) || /^\d+$/.test(w)) continue;
        const stem = w.replace(/(ing|ed|es|s)$/, '');
        const hit = recent.find(r => r.stem === stem && wordIndex - r.index <= 40);
        if (hit) add('echo', block, m.index, m.index + raw.length, `“${raw}” was also used ${wordIndex - hit.index} words earlier. Try a different word, a pronoun, or cutting one.`, { prev: [hit.start, hit.end, hit.block], canIgnoreAll: true });
        recent.push({ stem, index: wordIndex, start: m.index, end: m.index + raw.length, block });
        while (recent.length && wordIndex - recent[0].index > 40) recent.shift();
      }
      // commas: but/yet joining two clauses
      const butRe = /([\p{L}\p{N}])\s+(but|yet)\s+(I|he|she|they|we|you|it|there)\s+(?=[\p{L}])/gu;
      while ((m = butRe.exec(text))) {
        const st = m.index + m[1].length + 1;
        add('comma', block, st, st + m[2].length, `If this joins two complete thoughts, it usually takes a comma before “${m[2]}”.`, { fixes: [{ label: 'Add comma', start: m.index + m[1].length, end: m.index + m[1].length, text: ',' }] });
      }
      // commas: dialogue  “Hello” she said  →  “Hello,” she said
      const dlgRe = new RegExp(`([\\p{L}\\p{N}])(["”])\\s+(?:I|he|she|they|we|you|it|[\\p{Lu}][\\p{Ll}]+)\\s+(?:${SAID})\\b`, 'gu');
      while ((m = dlgRe.exec(text))) {
        const st = m.index + 1;
        add('comma', block, m.index, st + 1, 'Dialogue followed by a tag (he said) usually ends with a comma inside the quote.', { fixes: [{ label: 'Add comma', start: m.index + 1, end: m.index + 1, text: ',' }] });
      }
      // commas: she said “Hello  →  she said, “Hello
      const tagRe = new RegExp(`\\b(${SAID})\\s+(["“])`, 'gu');
      while ((m = tagRe.exec(text))) add('comma', block, m.index, m.index + m[1].length, `Consider a comma after “${m[1]}” before the dialogue.`, { fixes: [{ label: 'Add comma', start: m.index + m[1].length, end: m.index + m[1].length, text: ',' }] });
      // spacing & punctuation
      const typoChecks = [
        // [regex, message, how to fix]
        [/ {2,}/g, 'Extra spaces.', m => ({ label: 'Use one space', at: [0, m[0].length], text: ' ' })],
        [/\s+([,.;:!?])(?![.!?])/g, 'Space before punctuation.', m => ({ label: 'Remove the space', at: [0, m[0].length], text: m[1] })],
        [/([,;:])(?=[\p{L}])/gu, 'Missing space after punctuation.', m => ({ label: 'Add a space', at: [1, 1], text: ' ' })],
        [/([a-z]{2}[.!?])(?=[A-Z][a-z])/g, 'Missing space after the full stop.', m => ({ label: 'Add a space', at: [m[0].length, m[0].length], text: ' ' })],
        [/([,;:]){2,}|(?<!\.)\.\.(?!\.)/g, 'Repeated punctuation.', m => ({ label: `Use one “${m[0][0]}”`, at: [0, m[0].length], text: m[0][0] })],
        [/([.!?]["”]?\s+)([a-z])/g, 'Sentence may need a capital letter.', m => ({ label: `Capitalise “${m[2]}”`, at: [m[1].length, m[1].length + 1], text: m[2].toUpperCase() }), 2]
      ];
      // grammar, confused words and spelling consistency (grammar.js)
      const own = [];
      if (G) for (const g of G.check(text, gctx)) {
        const shown = g.fix.length > 28 ? 'Fix it' : `Change to “${g.fix.trim()}”`;
        add(g.cat, block, g.start, g.end, g.msg, { fixes: [{ label: shown, start: g.start, end: g.end, text: g.fix }], canIgnoreAll: g.cat !== 'grammar' });
        own.push([g.start, g.end]);
      }
      // more suggestions from Harper (worked out in the background; Revise refreshes when they're ready)
      const HP = window.UnwipHarper;
      if (HP && opts.harper !== false && !block.heading) {
        const hs = HP.cached(text);
        if (hs === null) pendingMore = true;
        else for (const h of hs) {
          if (own.some(([a, b]) => h.start < b && h.end > a)) continue;      // Unwip's own check already covers it
          const fixes = h.fixes.map(f => ({ label: f === '' ? 'Remove' : f.length > 28 ? 'Fix it' : `Change to “${f.trim()}”`, start: h.start, end: h.end, text: f }));
          add('more', block, h.start, h.end, h.msg, { fixes, canIgnoreAll: true, preview: fixes.length ? previewOf(block, sentenceAt(sentencesOf(text), h.start), h.start, h.end, h.fixes[0]) : null });
        }
      }
      for (const [re, msg, fixFn, group] of typoChecks) {
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
          let st = m.index, en = m.index + m[0].length;
          if (group === 2) { st = m.index + m[1].length; en = st + 1; }
          if (/^\s+$/.test(m[0]) && (st === 0 || en === text.length)) continue;
          // numbers like 3,000 or 1.5 are fine
          if (msg.startsWith('Missing space after punctuation') && /\d/.test(text[st - 1] || '')) continue;
          const f = fixFn(m);
          add('typo', block, st, en, msg, { fixes: [{ label: f.label, start: m.index + f.at[0], end: m.index + f.at[1], text: f.text }] });
        }
      }
    }

    // a sentence flagged very hard shouldn't also be flagged hard
    const grade = gradeOf(totalWords, totalSent, totalSyl);
    return {
      issues, pendingMore,
      stats: {
        words: totalWords, sentences: totalSent,
        grade: Math.max(0, Math.round(grade)),
        avgSentence: totalSent ? Math.round(totalWords / totalSent * 10) / 10 : 0,
        readingMinutes: Math.max(1, Math.round(totalWords / 238))
      }
    };
  }

  function gradeLabel(g) {
    if (g <= 6) return 'Very easy to read';
    if (g <= 9) return 'Good';
    if (g <= 12) return 'OK, a little dense';
    return 'Hard to read';
  }

  return { CATS, analyse, gradeLabel };
})();
