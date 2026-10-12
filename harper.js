// Unwip - "More suggestions" in Revise, from Harper (https://github.com/Automattic/harper).
// Harper is a free, open-source grammar checker. It runs entirely on this computer (no internet, no AI).
// Unwip's own checks (grammar.js) come first; Harper adds a wider net of usage and phrase checks.
// Rules that were tested and found to misfire on fiction (stutters, dialect in dialogue, style opinions,
// old-fashioned but correct phrasing) are switched off below.
window.UnwipHarper = (function () {
  'use strict';
  // tested on ~130k words of a working draft and ~240k words of published novels; these gave wrong or unwanted advice
  const OFF = ['SpellCheck', 'AvoidCurses', 'OkToOkay', 'OxfordComma', 'LongSentences', 'YeaToYeah', 'YehToYeah', 'SplitWords', 'UnclosedQuotes', 'LetsConfusion',
    'PronounVerbAgreement', 'CompoundNouns', 'MassNouns', 'DisjointPrefixes', 'PossessiveYour', 'QuantifierNumeralConflict', 'CondenseAllThe', 'QuiteQuiet', 'NumericRangeEnDash',
    'MissingPreposition', 'ToTwoToo', 'MergeWords', 'MissingDeterminer', 'FindOut', 'MissingTo', 'Regionalisms', 'AWhile', 'DiscourseMarkers', 'OrthographicConsistency', 'PronounKnew',
    'YourPredicateAdjective', 'DoubleModal', 'PhrasalVerbAsCompoundNoun', 'MultipleSequentialPronouns', 'WereWhere', 'WhomSubjectOfVerb', 'Excellent', 'ThereIsAgreement',
    'PronounContraction', 'ExpandMemoryShorthands', 'AvoidAndAlso', 'VeryLess', 'NeedToNoun', 'Damages', 'RedundantThat', 'IntroCueCommaBeforeThanks', 'WrongNegative',
    'AdjectiveDoubleDegree', 'NotIn', 'AllThough', 'AndIn', 'OneOfTheSingular', 'HopHope', 'InAWhile', 'ExpandThrough', 'TheProperNounPossessive', 'OutOfTheWindow', 'ExpandLegitimate',
    'CallThem', 'TheirToTheyre', 'HowTo', 'PronounInflectionBe', 'PreferSneaked', 'InvestIn', 'UseEllipsisCharacter', 'SubjunctiveWasToWere', 'CapitalizePersonalPronouns', 'SubjectPronoun',
    'AnA', 'RepeatedWords', 'ThatWhich', 'HadOf', 'MoreBetter', 'InAnyWay', 'RegularIrregulars', 'Dashes', 'SentenceCapitalization', 'TheyToThem', 'UpdatePlaceNames', 'Nonetheless',
    'Insofar', 'ThereToTheir', 'Everyone', 'NounVerbConfusion', 'VerbToAdjective', 'Thereupon', 'Freezing', 'ModalBeAdjective', 'WouldNeverHave', 'Confident', 'Overall', 'NominalWants',
    'ForAWhile', 'LitotesDirectPositive', 'Months', 'BuiltIn', 'LeftRightHand', 'PreferPleaded', 'AskNoPreposition', 'DayOneNames', 'TheirToThere', 'WayTooAdjective', 'Itself',
    'InterestedIn', 'ExceptOf', 'Worthwhile', 'PluralDecades', 'SingleBe', 'Myself', 'SomewhatSomething', 'GoodAt', 'TheHowWhy', 'HaveTakeALook', 'PassionateAbout', 'ItTimeAuxiliary',
    'SimplePastToPastParticiple', 'NoMatchFor', 'ItsContraction', 'Spaces', 'RedundantProgressiveComparative', 'CommaFixes', 'QuoteSpacing'];
  const DIALECT = { us: 0, uk: 1, au: 2, ca: 3, in: 4 };
  const cache = new Map();      // paragraph text -> [{start, end, msg, fixes:[text]}]
  let linter = null, loading = null, failed = false, dialect = 'uk';
  let queue = [], busy = false, onDone = null;

  async function applyConfig(l) {
    const cfg = await l.getLintConfig();
    for (const k of OFF) if (k in cfg) cfg[k] = false;
    await l.setLintConfig(cfg);
  }

  function load() {
    if (linter || failed) return Promise.resolve(linter);
    if (loading) return loading;
    loading = (async () => {
      try {
        const H = await import('./vendor/harper/index.js');
        const url = new URL('vendor/harper/harper_wasm_slim_bg.wasm', location.href).href;
        const l = new H.LocalLinter({ binary: H.createBinaryModuleFromUrl(url, 'slim'), dialect: DIALECT[dialect] ?? 1 });
        await l.setup();
        await applyConfig(l);
        linter = l;
      } catch (e) { failed = true; console.warn('Harper could not start:', e); }
      return linter;
    })();
    return loading;
  }

  // what's inside quotation marks (characters may talk however they like)
  function dialogueRanges(text) { return window.UnwipGrammar ? window.UnwipGrammar.dialogueRanges(text) : []; }
  const plain = s => s.replace(/`([^`]+)`/g, '“$1”').replace(/\s+/g, ' ').trim();

  async function lintText(text) {
    const org = await linter.organizedLints(text, { language: 'plaintext' });
    const dlg = dialogueRanges(text), out = [];
    for (const [rule, lints] of Object.entries(org)) {
      for (const l of lints) try {
        const sp = l.span(), start = sp.start, end = sp.end;      // Harper's positions already match JavaScript's
        const fixes = l.suggestions().map(s => { const k = s.kind(); const r = s.get_replacement_text(); return k === 2 ? text.slice(start, end) + r : r; }).filter(f => f !== text.slice(start, end)).slice(0, 3);
        const word = text.slice(start, end);
        if (!word.trim() && !fixes.length) continue;
        if (/^[\p{L}]-[\p{L}]/u.test(text.slice(Math.max(0, start - 2), start + 2))) continue;      // stutters: “W-Where”
        if (dlg.some(([a, b]) => start > a && start < b) && /Agreement|Grammar/.test(l.lint_kind())) continue;
        out.push({ start, end, msg: plain(l.message()), fixes, rule });
      } finally { try { l.free(); } catch {} }
    }
    return out;
  }

  async function pump() {
    if (busy) return; busy = true;
    await load();
    if (!linter) { busy = false; queue = []; return; }
    let did = 0, slice = performance.now();
    while (queue.length) {
      const t = queue.shift();
      if (cache.has(t)) continue;
      try { cache.set(t, await lintText(t)); } catch (e) { cache.set(t, []); }
      did++;
      if (performance.now() - slice > 25) { await new Promise(r => setTimeout(r, 0)); slice = performance.now(); }     // small slices, so typing and scrolling stay smooth
    }
    busy = false;
    if (did && onDone) onDone();
  }

  // synchronous lookup used by Revise; unknown paragraphs are queued and Revise is told when they're ready
  function cached(text) {
    if (failed) return [];
    if (cache.has(text)) return cache.get(text);
    if (!queue.includes(text)) queue.push(text);
    clearTimeout(cached.t); cached.t = setTimeout(pump, 30);
    return null;
  }

  return {
    cached,
    ready: () => !!linter,
    failed: () => failed,
    pending: () => queue.length > 0 || busy,
    onReady(fn) { onDone = fn; },
    setDialect(d) { if (d && d !== dialect) { dialect = d; if (linter) { linter.setDialect(DIALECT[d] ?? 1).then(() => applyConfig(linter)).then(() => { cache.clear(); onDone && onDone(); }).catch(() => {}); } } },   // changing dialect resets Harper's settings, so the noisy rules are switched off again
    load,
    _lint: async t => { await load(); return lintText(t); },
    OFF
  };
})();
