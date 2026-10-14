// Unwip - grammar checks. Rule-based, offline, no AI.
// Three groups, shown in Revise:
//   grammar  - a/an, "could of", "they was", "between you and I", "lets go", lowercase "i", dialogue punctuation, missing question marks
//   confused - its/it's, your/you're, their/there/they're, then/than, lose/loose, affect/effect, whose/who's, to/too, breath/breathe…
//   spelling - mixing UK and US spellings in the same chapter (colour and color)
// Every rule is written to be precise rather than clever: it only flags patterns that are almost always wrong.
// Tested against ~240k words of published novels (2 debatable highlights) and a working draft; harper.js adds a wider net on top.
// Agreement rules ("he don't", "they was") skip dialogue, where characters may talk that way on purpose.
window.UnwipGrammar = (function () {
  'use strict';
  const AP = "['’]";
  const SAID = 'said|asked|whispered|muttered|mumbled|replied|shouted|yelled|called|cried|added|answered|murmured|snapped|hissed|growled|sighed|laughed|continued|began|explained|admitted|insisted|demanded|offered|suggested|warned|agreed|repeated|grumbled|groaned|breathed|stammered|exclaimed|retorted|interrupted|whimpered|pleaded|begged|announced|declared|said';
  // verbs of speaking only: after "She laughed." or "I began to…" a full stop is right (that's an action, not a tag)
  const SPEECH = 'said|asked|whispered|muttered|mumbled|replied|shouted|yelled|called|cried|added|answered|murmured|snapped|hissed|growled|explained|admitted|insisted|demanded|offered|suggested|warned|agreed|repeated|grumbled|stammered|exclaimed|retorted|interrupted|pleaded|begged|announced|declared|whined|lied|promised|joked|teased|corrected|noted|remarked|stated|told|called out';
  const AUX = new Set('did does do would could should will can may might must to let make made help helped watch watched saw see hear heard had shall wo ca'.split(' '));

  // keep the writer's capitals when suggesting a replacement
  function keepCase(orig, repl) {
    if (orig === orig.toUpperCase() && /[A-Z]/.test(orig) && orig.length > 1) return repl.toUpperCase();
    if (/^[A-Z]/.test(orig)) return repl[0].toUpperCase() + repl.slice(1);
    return repl;
  }
  // character ranges that are inside quotation marks (dialogue)
  function dialogueRanges(text) {
    const out = []; let open = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '“') open = i;
      else if (c === '”' && open >= 0) { out.push([open, i]); open = -1; }
      else if (c === '"') { if (open >= 0) { out.push([open, i]); open = -1; } else open = i; }
    }
    if (open >= 0) out.push([open, text.length]);   // dialogue that runs on to the next paragraph
    return out;
  }
  const inside = (ranges, i) => ranges.some(([a, b]) => i > a && i < b);
  const wordBefore = (text, i) => { const m = /([\p{L}’']+)\s*$/u.exec(text.slice(Math.max(0, i - 30), i)); return m ? m[1].toLowerCase() : ''; };

  // ---------------------------------------------------------------- a / an
  const CONS_SOUND = /^(uni(?!nt|mp|nh|nd)|use|usu|usa|ura|uri|ure|uro|uti|eu|ewe|one\b|once|ubiq|ufo|ukr|uk\b|u\.s)/i;
  const VOWEL_SOUND = /^(hour|honest|honou?r|heir|herb\b)/i;
  function needsAn(word) {
    if (/^\d/.test(word)) return /^(8|11|18|8\d)(\D|$)/.test(word) || /^8\d\d/.test(word);
    if (/^[A-Z]{2,}/.test(word)) return null;                                   // capitals: an acronym (an FBI agent) or shouting (A LOT) - can't tell, so leave it
    if (VOWEL_SOUND.test(word)) return true;
    if (CONS_SOUND.test(word)) return false;
    return /^[aeiou]/i.test(word);
  }

  // ---------------------------------------------------------------- the rule list
  // [cat, regex, message, replacement(match) -> text for the highlighted part, options]
  // options.group: which capture group is highlighted and replaced (default: whole match)
  // options.guard(text, m, ctx): return false to skip ; options.notInDialogue
  // a word right before he/it that means the pronoun is an object or half of a pair (“finding it were slim”, “Curly and he were”)
  const OBJ_BEFORE = /^(and|or|nor|of|in|on|at|to|for|with|from|by|over|under|about|into|upon|around|through|behind|beside|near|within|without|after|before|like|than|\p{L}+ing)$/u;
  const ADJ = new Set('cold hot good bad nice late early important hard easy difficult simple clear dark big small kind sweet funny strange weird quiet loud true likely possible beautiful pretty smart sad rare cute obvious wrong right dangerous safe fine sure different expensive cheap boring scary creepy annoying interesting weird ugly old new long short far close'.split(' '));
  const R = [];
  // “its very speed”, “their very hearts”, “your so-called…”: an intensifier only means “it’s / you’re” when an adjective follows
  // “its cold, dark waters” / “your very interesting statement”: the adjective is describing a noun that follows, so the possessive is right
  const attributive = rest => /^(\s*,\s*(?:and\s+)?[\p{L}’'-]+)?\s+(?!(?:to|and|for|but|of|as|that|enough|today|now|tonight|right|though|too|outside|in|out|here|there|again|anyway|then|when|if|because|with|at|isn|wasn|is|was|it|or|so)\b)[\p{L}’'-]+/iu.test(rest);
  function intensifierOK(t, m) {
    const k = m[m.length - 1].toLowerCase();
    if (/^(very|so|too|really|always|never|almost|probably|definitely|already)$/.test(k)) { const nx = (/^\s+([\p{L}’']+)/u.exec(t.slice(m.index + m[0].length)) || [])[1]; if (!nx || !(ADJ.has(nx.toLowerCase()) || /^(not|going|gonna|being|getting|sorry|glad|happy|tired|late|good|bad|much|many)$/i.test(nx))) return false; return !attributive(t.slice(m.index + m[0].length).replace(/^\s+[\p{L}’']+/u, '')); }
    if (ADJ.has(k) || /^(okay|ok|fine|alright|over)$/.test(k)) return !attributive(t.slice(m.index + m[0].length));
    if (/ing$/.test(k) && /\b(for|of|to|await|awaiting|before|after|upon|on|at|about|by|waiting|expecting|in|from|against|with|without|their|your)\s*$/i.test(t.slice(Math.max(0, m.index - 14), m.index))) return false;
    return true;
  }
  const rule = (cat, re, msg, repl, opt = {}) => R.push({ cat, re, msg, repl, ...opt });
  // JavaScript's \b only knows plain a-z, so in “Téa a grin” it sees a word break inside “Téa”. Matches from w() rules are
  // checked afterwards: if a letter sits right before or after the match, it was part of a bigger word, so it is skipped.
  const w = s => { const re = new RegExp(s, 'giu'); re.wordy = true; return re; };
  const LETTER = /[\p{L}\p{N}]/u;

  // grammar
  rule('grammar', w(`\\b(could|should|would|must|might|may)\\s+of\\b(?!\\s+course)`), 'After “could”, “should” and “would” it’s “have”, not “of”.', m => keepCase(m[0], `${m[1]} have`), { guard: (t, m) => !/\b(the|his|her|their|its|our|your|my|all|with|great|full|whose)\s*$/i.test(t.slice(Math.max(0, m.index - 8), m.index)) });
  rule('grammar', w(`\\b(between\\s+(?:you|him|her|them|us))\\s+and\\s+I\\b`), '“Between you and me”: after “between” it’s “me”.', m => `${m[1]} and me`);
  rule('grammar', w(`\\b(he|she|it)\\s+(don${AP}t|have|were|are)\\b`), 'Agreement: “he/she/it” takes “doesn’t / has / was / is”.',
    m => `${m[1]} ${{ have: 'has', were: 'was', are: 'is' }[m[2].toLowerCase()] || 'doesn’t'}`,
    { notInDialogue: true, guard: (t, m) => { const b = wordBefore(t, m.index); if (AUX.has(b) || OBJ_BEFORE.test(b)) return false; if (/were/i.test(m[2]) && /\b(if|wish|wished|though|as)\b[^.!?]{0,20}$/i.test(t.slice(Math.max(0, m.index - 25), m.index))) return false; return true; } });
  rule('grammar', w(`\\b(they|we|you)\\s+(was|is|has|doesn${AP}t)\\b`), 'Agreement: “they/we/you” takes “were / are / have / don’t”.',
    m => `${m[1]} ${{ was: 'were', is: 'are', has: 'have' }[m[2].toLowerCase()] || 'don’t'}`, { notInDialogue: true, guard: (t, m) => !AUX.has(wordBefore(t, m.index)) });
  rule('grammar', /\bI\s+(is|are|has)\b/gu, 'Agreement: “I am”, “I have”.', m => `I ${{ is: 'am', are: 'am', has: 'have' }[m[1].toLowerCase()]}`, { notInDialogue: true, guard: (t, m) => !AUX.has(wordBefore(t, m.index)) });
  rule('grammar', w(`\\blets\\s+(?=(go|get|do|see|be|try|just|make|talk|have|hope|say|move|start|find|eat|not|keep|leave|check|take|stop|face|pretend|assume|agree|rest|sit|camp|head|wait|split|hurry|hide|fight|run|celebrate|begin|continue|grab|call|finish|play|eat|sleep|ride|walk|look|get)\\b)`), '“Let’s” (let us) needs an apostrophe.', m => keepCase(m[0], 'let’s '),
    { guard: (t, m) => { const b = wordBefore(t, m.index); return !b || /^(so|now|okay|ok|well|then|and|but|on|please|alright|right|oh|yes|no|come|just|hey|guys)$/.test(b) || /[“"(]\s*$/.test(t.slice(Math.max(0, m.index - 2), m.index)); } });
  rule('grammar', /(^|[\s“"(])i(?=(['’](m|ll|d|ve|s))?(?=[\s,.!?;:”"]|$))/gu, 'The word “I” is always a capital.', m => `${m[1]}I`, { guard: (t, m) => !/^\.[a-z]\./i.test(t.slice(m.index + m[0].length, m.index + m[0].length + 3)) });
  rule('grammar', w(`\\b(alot|infact|aswell|eachother|atleast|incase|irregardless|alright already)\\b`), 'This is usually written as two words (or differently).',
    m => keepCase(m[0], { alot: 'a lot', infact: 'in fact', aswell: 'as well', eachother: 'each other', atleast: 'at least', incase: 'in case', irregardless: 'regardless' }[m[0].toLowerCase()] || m[0]));
  rule('grammar', w(`\\bcould care less\\b`), 'The idiom is “couldn’t care less”.', m => keepCase(m[0], 'couldn’t care less'));
  rule('grammar', w(`\\bfor all intensive purposes\\b`), 'The phrase is “for all intents and purposes”.', m => keepCase(m[0], 'for all intents and purposes'));
  rule('grammar', w(`\\b(was|were|is|are|am|be|been|not)\\s+suppose\\s+to\\b`), '“Supposed to”, with a d.', m => `${m[1]} supposed to`);
  rule('grammar', w(`\\b(I|he|she|we|they|you|it)\\s+use\\s+to\\b`), '“Used to”, with a d (except after “didn’t”).', m => `${m[1]} used to`, { guard: (t, m) => !/n['’]t$|did$/i.test(wordBefore(t, m.index)) });
  // dialogue: “Hello.” she said  ->  “Hello,” she said
  rule('grammar', new RegExp(`([\\p{L}\\p{N}])\\.(["”])(\\s+(?:he|she|they|I|we|you|it)\\s+(?:${SPEECH})\\b)(?!\\s+(?:to|that|him|her|them|me|us)\\b)`, 'gu'), 'Dialogue followed by “she said” ends in a comma, not a full stop.', m => `${m[1]},${m[2]}${m[3]}`);
  // dialogue: “Hello,” She said  ->  “Hello,” she said
  rule('grammar', new RegExp(`(,["”]\\s+)(He|She|They|We|It)(\\s+(?:${SAID})\\b)`, 'gu'), 'After a comma and closing quote, the dialogue tag starts with a small letter.', m => `${m[1]}${m[2].toLowerCase()}${m[3]}`);
  // “Are you coming.”  ->  “Are you coming?”
  rule('grammar', /([“"])((?:Do|Does|Did|Can|Could|Would|Will|Are|Is|Have|Has|Should|Shall|Was|Were)\s+(?:you|I|we|they|he|she|it|there)\b[^“”"?!.,]{0,60})\.(["”])/gu, 'This looks like a question. Should it end with a question mark?', m => `${m[1]}${m[2]}?${m[3]}`, { guard: (t, m) => !/\bplease\b/i.test(m[2]) });

  // confused words
  rule('confused', w(`\\bit${AP}s\\s+own\\b`), '“Its own” (belonging to it) has no apostrophe.', m => keepCase(m[0], 'its own'));
  rule('confused', w(`\\bits\\s+(a|an|the|not|been|going|gonna|raining|okay|ok|too|so|very|always|never|almost|already|probably|definitely|really|fine|alright|cold|hot|over|me|you|him|her|us|them)\\b`), '“It’s” (it is / it has) needs an apostrophe here.', m => keepCase(m[0].split(/\s+/)[0], 'it’s') + ' ' + m[1], { guard: intensifierOK });
  rule('confused', /\bits['’](?=\s)/gu, '“Its” (belonging to it) has no apostrophe, and “it’s” means it is.', () => 'its');
  rule('confused', w(`\\byour\\s+(welcome|going|being|not|so|too|very|always|never|kidding|joking|lying|crazy|mad|insane|sure|done|late|early|gonna|already|still|probably|definitely|really|making|doing|getting|coming|looking|trying|telling|asking|talking|the|a|an)\\b`), '“You’re” (you are) needs an apostrophe here.', m => keepCase(m[0].split(/\s+/)[0], 'you’re') + ' ' + m[1],
    { guard: (t, m) => intensifierOK(t, m) && (!/ing$/i.test(m[1]) || !/^\s+(?:away\s+)?(party|rate|price|concern|trip|plan|plans|habit|habits|career|style|days|years|skills?|partner|shoes|clothes)\b/i.test(t.slice(m.index + m[0].length, m.index + m[0].length + 30))) });
  rule('confused', w(`\\btheir\\s+(is|are|was|were|isn${AP}t|aren${AP}t|wasn${AP}t|weren${AP}t)\\b`), '“There is / there was”: the place word is “there”.', m => keepCase(m[0].split(/\s+/)[0], 'there') + ' ' + m[1]);
  rule('confused', w(`\\b(there|they${AP}re)\\s+own\\b`), '“Their own” (belonging to them).', m => keepCase(m[1], 'their') + ' own');
  rule('confused', w(`\\btheir\\s+(going|coming|not|always|never|so|too|very|probably|definitely|really|gonna|here|gone)\\b`), '“They’re” (they are) needs an apostrophe here.', m => keepCase(m[0].split(/\s+/)[0], 'they’re') + ' ' + m[1], { guard: intensifierOK });
  rule('confused', w(`\\bthere\\s+(car|house|home|eyes|hands|faces|heads|feet|friends|parents|mother|father|kids|children|names|lives|room|bags|clothes|hair|money|things|weapons|swords|horses|bodies|voices|minds|hearts)\\b`), '“Their” (belonging to them).', m => keepCase(m[0].split(/\s+/)[0], 'their') + ' ' + m[1], { guard: (t, m) => !/\b(over|in|out|up|down|from|back|get|got|been|is|was|are|were)\s*$/i.test(t.slice(Math.max(0, m.index - 12), m.index)) });
  rule('confused', w(`\\b(more|less|better|worse|rather|other|bigger|smaller|faster|slower|older|younger|greater|fewer|larger|longer|shorter|higher|lower|easier|harder|stronger|weaker|quicker|louder|darker|brighter|happier|colder|warmer|taller|closer|heavier|richer|smarter)\\s+then\\b`), 'Comparisons use “than” (better than), not “then”.', m => `${m[1]} than`, { guard: (t, m) => !/^(more|other)$/i.test(m[1]) || !/\b(once|no|any|some|every|each|the)\s*$/i.test(t.slice(Math.max(0, m.index - 6), m.index)) });
  rule('confused', w(`\\b(and|just|since|back|until|right)\\s+than\\b`), 'For time (and then, back then) it’s “then”.', m => `${m[1]} then`);
  rule('confused', w(`\\bloose\\s+(the|my|your|his|her|their|our|it|them|him|me|weight|track|control|sleep|interest|hope|focus|consciousness|money|everything|anything|sight|touch|faith|heart)\\b`), '“Lose” (to misplace or not win). “Loose” means not tight.', m => keepCase(m[0].split(/\s+/)[0], 'lose') + ' ' + m[1], { guard: (t, m) => !/\b(break|broke|broken|cut|set|let|lets|turn|turned|tear|tore|shake|shook|work|worked|pull|pulled|wrench|wrenched|slip|slipped|come|came|hang|hung|cast|knock|knocked|shaken|torn)\s*$/i.test(t.slice(Math.max(0, m.index - 10), m.index)) });
  rule('confused', w(`\\b(will|could|would|might|may|didn${AP}t|don${AP}t|not|never|can${AP}t|cannot|wo?n${AP}t)\\s+loose\\b`), '“Lose” (to misplace or not win). “Loose” means not tight.', m => `${m[1]} lose`);
  rule('confused', w(`\\b(an|the|no|any|side|special|the same|a big|a huge|a strange|an odd)\\s+affect\\b`), 'The noun is usually “effect” (the effect, side effects).', m => `${m[1]} effect`);
  rule('confused', w(`\\b(will|to|could|would|might|may|didn${AP}t|doesn${AP}t|not|never|can)\\s+effect\\s+(the|my|your|his|her|their|our|me|him|them|us|everyone|anyone)\\b`), 'The verb is usually “affect” (it affects me).', m => `${m[1]} affect ${m[2]}`);
  rule('confused', w(`\\bwhose\\s+(going|been|coming|there|that|this|not|gonna|the|a|an)\\b`), '“Who’s” (who is / who has).', m => keepCase(m[0].split(/\s+/)[0], 'who’s') + ' ' + m[1]);
  rule('confused', w(`\\b(is|was|are|were|be|been|far|way|much|it${AP}s|that${AP}s|I${AP}m|you${AP}re|getting|got)\\s+to\\s+(much|many|late|early|soon|far|bad|big|small|long|hard|easy|good|little|close|tired|busy|young|old|cold|hot|loud|quiet|fast|slow|heavy|dark|bright|tight|weak|scared|afraid|proud|deep)\\b(?!\\s+(?:to|for)\\b)`), 'Here it should be “too” (meaning excessively).', m => `${m[1]} too ${m[2]}`, { guard: (t, m) => !/^way$/i.test(m[1]) || !/\b(gave|give|giving|gives|make|made|making|lead|led|pave|paved|find|found|lost|the|a|no|one|only|best|better|easier|easy|his|her|their|my|our|your)\s*$/i.test(t.slice(Math.max(0, m.index - 10), m.index)) });
  rule('confused', w(`(^|[“",]\\s*)(me|you)\\s+to([.!?])`), 'Meaning “also”, it’s “too”.', m => `${m[1]}${m[2]} too${m[3]}`);
  rule('confused', w(`\\b(to|could|couldn${AP}t|can${AP}t|cannot|can|didn${AP}t|don${AP}t|not|never|must|will|would|barely|hardly)\\s+breath\\b`), 'The verb is “breathe” (with an e). “Breath” is the noun.', m => `${m[1]} breathe`);
  rule('confused', w(`\\b(a|deep|the|my|his|her|their|your|our|of|shaky|ragged|sharp)\\s+breathe\\b`), 'The noun is “breath”. “Breathe” is the verb.', m => `${m[1]} breath`);
  rule('confused', w(`\\bsneak\\s+peak\\b`), 'A quick look is a “peek”.', m => keepCase(m[0].split(/\s+/)[0], 'sneak') + ' peek');
  rule('confused', w(`\\b(took|take|taking|takes|have|had|get|got)\\s+a\\s+peak\\b`), 'A quick look is a “peek”.', m => `${m[1]} a peek`);
  rule('confused', w(`\\bpeaked\\s+(my|his|her|their|your|our)\\s+(interest|curiosity)\\b`), 'Interest is “piqued”.', m => keepCase(m[0].split(/\s+/)[0], 'piqued') + ` ${m[1]} ${m[2]}`);
  rule('confused', w(`\\b(walked|ran|drove|went|rushed|hurried|moved|swept|slipped|strode|marched|raced|sped|flew|walk|run|drive|go|snuck|sneaked|crept|stormed|darted|edged|limped|stumbled|pushed|brushed|squeezed|wandered|floated|drifted|charged|zoomed|strolled|rode|sailed|glided|shuffled|ambled|sprinted|dashed|bolted|trudged|sneak|creep|slip)\\s+passed\\b`), 'Moving by something is “past”. “Passed” is the verb.', m => `${m[1]} past`);
  rule('confused', w(`\\b(had|has|have)\\s+lead\\b(?!\\s+(?:in|poisoning|pipe|weight))`), 'The past of “lead” is “led”.', m => `${m[1]} led`);
  rule('confused', w(`\\b(to|will|would|could|I|we|they)\\s+advice\\b`), 'The verb is “advise”. “Advice” is the noun.', m => `${m[1]} advise`);
  rule('confused', w(`\\b(some|good|bad|my|your|his|her|their|any|the|of|for|piece of)\\s+advise\\b`), 'The noun is “advice”. “Advise” is the verb.', m => `${m[1]} advice`);
  rule('confused', w(`\\bexcept\\s+((?:the|my|his|her|their|your|an?)\\s+)?(offer|invitation|apology|gift|award|job|position|challenge|terms|proposal)\\b`), 'To take something offered is “accept”.', m => keepCase(m[0].split(/\s+/)[0], 'accept') + ` ${m[1] || ''}${m[2]}`);
  rule('confused', w(`\\bweather\\s+or\\s+not\\b`), '“Whether or not” (if). “Weather” is rain and sun.', m => keepCase(m[0].split(/\s+/)[0], 'whether') + ' or not');
  rule('confused', w(`\\b(be|was|is|so|too|stay|stayed|keep|kept|fell|went|grew|remained|very|been)\\s+quite(?=[.,!?;”"])`), 'Silent is “quiet”. “Quite” means very or completely.', m => `${m[1]} quiet`);
  rule('confused', w(`\\b(should|would|could|must|might|will|to)\\s+of\\s+(?=\\w+ed\\b)`), '“Have”, not “of”.', m => `${m[1]} have `);


  // ---------------------------------------------------------------- more rules (0.22): common slips that Harper misses too
  const before = (t, i, n = 40) => t.slice(Math.max(0, i - n), i);
  const after = (t, m, n = 40) => t.slice(m.index + m[0].length, m.index + m[0].length + n);
  const NOT = /n['’]t$/i;
  // they're / their / there
  rule('confused', w(`\\bthere\\s+(going|gonna|not going)\\s+to\\b`), '“They’re going to” (they are) needs “they’re”.', m => keepCase(m[0].split(/\s+/)[0], 'they’re') + m[0].slice(5),
    { guard: (t, m) => !/\b(is|was|isn['’]t|wasn['’]t|be|been|’s|'s|if|will|so|and|over|in|out|up|down|back|right|from|still)\s*$/i.test(before(t, m.index, 12)) && !/(^|[.!?“"]\s*)(Is|Was|Isn['’]t|Wasn['’]t|Will|Are)\b[^.!?]*$/.test(before(t, m.index, 80)) && !/^\s+be\s+(a|an|any|some|no|more|enough|another|plenty|lots|trouble|time|room|problems?)\b/i.test(after(t, m)) });
  rule('confused', w(`\\bthey${AP}re\\s+(car|house|own|eyes|hands|faces|heads|parents|mother|father|kids|children|names|lives|room|money|things|weapons|swords|horses|turn|fault|job|leader|king|queen|camp|village|city|homes|bags|clothes)\\b`), '“Their” (belonging to them), not “they’re” (they are).', m => keepCase(m[0].split(/\s+/)[0], 'their') + ' ' + m[1]);
  rule('confused', w(`\\b(over|in|out|up|down|from|go|went|been|be|stay|stayed|see you|meet you|sit|stand|stood|sat|lived|right|get|got)\\s+their(?=\\s*[.,!?;”"])`), 'The place word is “there”.', m => `${m[1]} there`);
  // you're / your
  rule('confused', w(`\\byour\\s+(right|wrong)(?=\\s*[.,!?;”"—]|\\s+(about|again|there|though|that)\\b)`), '“You’re right” (you are) needs “you’re”.', m => keepCase(m[0].split(/\s+/)[0], 'you’re') + ' ' + m[1]);
  rule('confused', w(`\\byou${AP}re\\s+(mother|father|mom|mum|dad|brother|sister|wife|husband|friend|son|daughter|idea|fault|turn|car|house|room|name|job|life|own|eyes|hands|face|head|sword|boss|majesty|highness)\\b`), '“Your” (belonging to you), not “you’re” (you are).', m => keepCase(m[0].split(/\s+/)[0], 'your') + ' ' + m[1],
    { guard: (t, m) => !/^\s+(of|to|enough)\b/i.test(after(t, m)) });
  // whose / who's
  rule('confused', w(`\\bwho${AP}s\\s+(book|car|house|turn|idea|fault|bag|phone|coat|job|side|room|seat|money|sword|horse|plan|child|kid|son|daughter|mother|father|blood|team|army|voice|name|ship|dog|cat)\\b`), '“Whose” (belonging to whom), not “who’s” (who is).', m => keepCase(m[0].split(/\s+/)[0], 'whose') + ' ' + m[1],
    { guard: (t, m) => !/^\s+(is|was)\b/i.test(after(t, m)) || /^(turn|fault|side|idea)$/i.test(m[1]) });
  // than / then
  rule('confused', w(`\\b(rather\\s+[\\p{L}’']+(?:\\s+[\\p{L}’']+)?)\\s+then\\b`), 'Comparisons use “than” (I’d rather walk than drive).', m => `${m[1]} than`, { guard: (t, m) => !/\b(and|or|but)\b/i.test(m[1]) });
  // who / which for people
  rule('grammar', w(`\\b(man|woman|boy|girl|person|people|guy|lady|men|women|kid|child|children|friend|friends|soldier|soldiers|guard|guards|knight|stranger|king|queen|prince|princess)\\s+which\\b`), 'For people, use “who” (or “that”), not “which”.', m => `${m[1]} who`);
  // pronouns
  rule('grammar', /(^|[.!?]\s+)(Me and (?:him|her|them)|Him and (?:me|I)|Her and (?:me|I)|Them and (?:me|us))(?=\s+(?:went|are|were|was|have|had|will|did|used|got|made|left|came|ran|walked|both|never|always|can|could)\b)/gu, 'As the subject, use “he and I”, “she and I” or “they and I”.', m => m[1] + ({ 'Me and him': 'He and I', 'Me and her': 'She and I', 'Me and them': 'They and I', 'Him and me': 'He and I', 'Him and I': 'He and I', 'Her and me': 'She and I', 'Her and I': 'She and I', 'Them and me': 'They and I', 'Them and us': 'They and we' }[m[2]] || m[2]), { notInDialogue: true });
  rule('grammar', /(^|[.!?]\s+)Myself\s+and\s+(\p{Lu}[\p{L}]+)(?=\s+(?:will|are|were|went|have|had|did|can|would|should|both)\b)/gu, 'As the subject, use “Name and I”, not “myself”.', m => `${m[1]}${m[2]} and I`, { notInDialogue: true });
  rule('grammar', w(`\\b(contact|ask|tell|call|email|message|see|join|thank)\\s+(\\p{Lu}[\\p{L}]+|him|her|them)\\s+(or|and)\\s+myself\\b`), 'Use “me” here, not “myself”.', m => `${m[1]} ${m[2]} ${m[3]} me`);
  // agreement
  rule('grammar', w(`\\b(there)(\\s+)(is|was|${AP}s)(\\s+(?:two|three|four|five|six|seven|eight|nine|ten|twenty|hundreds of|dozens of|many|several|both)\\b)`), 'Agreement: with more than one thing it’s “there are / there were”.', m => `${m[1]}${m[2]}${/was/i.test(m[3]) ? 'were' : m[3].length < 3 ? ' are' : 'are'}${m[4]}`.replace(/(there)\s+\s/i, '$1 '),
    { notInDialogue: true, guard: (t, m) => !/^\s+(of|or|more)\b/i.test(after(t, m, 10)) });
  rule('grammar', w(`\\b(each(?:\\s+one)?\\s+of\\s+(?:the|them|us|these|those|my|his|her|their|our)(?:\\s+[\\p{L}]+)?)\\s+(have|are|were)\\b`), 'Agreement: “each of them has / is / was”.', m => `${m[1]} ${{ have: 'has', are: 'is', were: 'was' }[m[2].toLowerCase()]}`);
  rule('grammar', w(`\\b(he|she)\\s+(go|want|need|like|know|think|say|come|make|take|look|seem|feel|get|don${AP}t)\\b(?!\\s*[,.!?;]?\\s*$)`), 'Agreement: “he/she” takes the -s form (he goes, she wants).',
    m => `${m[1]} ${{ go: 'goes', do: 'does', "don't": 'doesn’t', 'don’t': 'doesn’t', say: 'says' }[m[2].toLowerCase()] || m[2] + 's'}`,
    { notInDialogue: true, guard: (t, m) => { const b = wordBefore(t, m.index); return !AUX.has(b) && !NOT.test(b) && !/^(if|whether|lest|should|that|but|would|wo|why|how|and|let|lets|have|made|make|watch|watched|see|saw|felt|feel|hear|heard|help|helped)$/.test(b) && !/[,]\s*$/.test(before(t, m.index, 3)); } });
  rule('grammar', w(`\\b(I|we|they)\\s+(goes|wants|needs|likes|knows|thinks|says|comes|makes|takes|looks|seems|feels|gets|does|doesn${AP}t)\\b`), 'Agreement: “I/we/they” take the plain form (they go, we want).',
    m => `${m[1]} ${{ goes: 'go', does: 'do', "doesn't": 'don’t', 'doesn’t': 'don’t', says: 'say' }[m[2].toLowerCase()] || m[2].replace(/s$/, '')}`,
    { notInDialogue: true, guard: (t, m) => !AUX.has(wordBefore(t, m.index)) });
  rule('grammar', w(`\\b(can|could|will|would|should|must|might|may|shall|did|didn${AP}t|does|doesn${AP}t|do|don${AP}t|to)\\s+(goes|sings|wants|needs|likes|knows|thinks|says|comes|makes|takes|looks|seems|feels|gets|runs|walks|went|knew|came|saw|took|gave|ate|wrote|did)\\b`), 'After “can / will / did / to”, use the plain verb (can sing, did go).',
    m => `${m[1]} ${{ goes: 'go', says: 'say', went: 'go', knew: 'know', came: 'come', saw: 'see', took: 'take', gave: 'give', ate: 'eat', wrote: 'write', did: 'do' }[m[2].toLowerCase()] || m[2].replace(/s$/, '')}`,
    { guard: (t, m) => !/\b(the|a|his|her|my|your|their|our|this|that|last|tin|beer|soda|trash|watering)\s*$/i.test(before(t, m.index, 10)) && !(/^to$/i.test(m[1]) && /^(saw|did|came|went|knew|took|gave|ate|wrote|walks|runs|looks|feels)$/i.test(m[2])) && m[1] !== 'May' && m[1] !== 'Will' });
  rule('grammar', w(`\\b(I\\s+am|I${AP}m|is|are)\\s+agree\\b`), '“Agree” is a verb: just “I agree”.', m => /is/i.test(m[1]) ? 'agrees' : /are/i.test(m[1]) ? 'agree' : 'I agree');
  // past participles: had went, have saw, has ran
  const PP = { saw: 'seen', went: 'gone', did: 'done', ate: 'eaten', wrote: 'written', took: 'taken', gave: 'given', spoke: 'spoken', broke: 'broken', chose: 'chosen', drove: 'driven', rode: 'ridden', stole: 'stolen', swam: 'swum', sang: 'sung', began: 'begun', drank: 'drunk', forgot: 'forgotten', flew: 'flown', grew: 'grown', knew: 'known', threw: 'thrown', wore: 'worn', ran: 'run', came: 'come', became: 'become', shook: 'shaken', hid: 'hidden', bit: 'bitten', froze: 'frozen', fell: 'fallen', rang: 'rung', sank: 'sunk', woke: 'woken', brung: 'brought' };
  rule('grammar', w(`\\b(have|has|had|${AP}ve|${AP}d|having)\\s+((?:never|ever|not|already|just|always|finally|only|since|recently)\\s+)?(${Object.keys(PP).join('|')})\\b`), 'After “have / had”, use the past participle (had gone, have seen).',
    m => `${m[1]} ${m[2] || ''}${keepCase(m[3], PP[m[3].toLowerCase()])}`,
    { guard: (t, m) => { if (/^['’]d$/.test(m[1].replace(/^\w+/, ''))) {} const pre = before(t, m.index, 50); if (/['’]d$/i.test(m[1]) && !m[2]) return false; return !/\b(everything|all|what|whatever|nothing|anything|something|that|which|thing|things|money|life|one|ones|left|strength|energy|power|food)\s+(?:[\p{L}’']+\s+){0,2}$/iu.test(pre) || !/^had$/i.test(m[1]); } });
  rule('grammar', w(`\\bbrung\\b`), 'The past of “bring” is “brought”.', m => keepCase(m[0], 'brought'), { notInDialogue: true });
  rule('grammar', w(`\\b(I|you|we|they|he|she)\\s+(seen|done)\\s+(it|him|her|them|that|this|the|a|an|my|his|their|what|everything|nothing|something|some|enough)\\b`), '“Seen” and “done” need “have” (I’ve seen it), or use “saw” / “did”.',
    m => `${m[1]} ${m[2].toLowerCase() === 'seen' ? 'saw' : 'did'} ${m[3]}`, { notInDialogue: true, guard: (t, m) => !/\b(is|was|are|were|am|be|been|being|get|got|had|has|have|’ve|'ve|how|that)\s*$/i.test(before(t, m.index, 10)) });
  // lie / lay
  rule('confused', w(`\\b(to|will|gonna|${AP}ll|should|could|would|must|can|go|went|I|we|they|you)\\s+lay\\s+(down|back|on\\s+the\\s+(?:bed|couch|floor|ground|grass|sofa)|in\\s+bed)(?=\\s*[.,!?;”"]|\\s+(?:for|and|on|in|to|until|with|beside|next)\\b)`), 'To recline is to “lie” (lie down). “Lay” needs an object (lay the book down).', m => `${m[1]} lie ${m[2]}`,
    { guard: (t, m) => !/^(I|we|they|you)$/i.test(m[1]) || /\b(I|we|they|you)\s+lay\s+down\b/.test(m[0]) && /\b(will|to|should|need|want|can|must)\b\s*$/i.test(before(t, m.index, 12)) });
  rule('confused', w(`\\b(was|were|is|are|am|been|be|${AP}m|${AP}s|${AP}re|just|still|sat|kept|found\\s+(?:him|her|them|myself))\\s+laying\\s+(in|on|there|awake|down|still|face|flat|beside|next|across|around|motionless|curled|back)\\b`), 'Reclining is “lying” (she was lying in bed). “Laying” needs an object (laying bricks).', m => `${m[1]} lying ${m[2]}`,
    { guard: (t, m) => !/^\s*(the|a|an|some|his|her|their|my|your|our)\s+(law|groundwork|foundation|bricks?|eggs?|traps?|siege|claim|blame|plans?|cards|odds)/i.test(after(t, m)) });
  // fewer / number of
  const COUNT = 'people|men|women|children|kids|friends|times|coins|things|questions|guards|soldiers|monsters|orcs|elves|enemies|customers|items|bottles|steps|days|years|hours|minutes|words|options|choices|mistakes|problems|cars|books|members|students|players|visitors|guests|adventurers|villagers|workers|employees';
  rule('grammar', w(`\\b(the|an?|large|small|huge|great|same|that|this|any|what|insane|ridiculous|crazy)\\s+amount\\s+of\\s+(${COUNT})\\b`), 'For things you can count, it’s “number of” (the number of people).', m => `${m[1]} number of ${m[2]}`.replace(/^an number/i, 'a number'), { notInDialogue: true });
  rule('grammar', w(`\\bless\\s+(${COUNT})\\b`), 'For things you can count, it’s “fewer” (fewer people).', m => keepCase(m[0].split(/\s+/)[0], 'fewer') + ' ' + m[1],
    { notInDialogue: true, guard: (t, m) => !/\b(no|or|much|than|year|years|minus)\s*$/i.test(before(t, m.index, 8)) && !/^\s+(than|ago|old|later|earlier)\b/i.test(after(t, m, 8)) && !/^(times|years|days|hours|minutes)$/i.test(m[1]) });
  // possessives
  rule('grammar', w(`\\b(children|women|men)s\\b(?!['’])`), 'Possessive plural: “children’s”, “women’s”, “men’s”.', m => keepCase(m[0], m[1].toLowerCase() + '’s'));
  // accept / except, quiet / quite
  rule('confused', w(`\\bexcept(ed|s|ing)\\s+(?:(the|my|his|her|their|your|an?|this|that)\\s+)?(offer|invitation|apology|gift|award|job|position|challenge|terms|proposal|deal|quest|request|contract|payment|bribe|help|truth)\\b`), 'To take something offered is “accept”.', m => keepCase(m[0], 'accept' + m[1]) .slice(0, 6 + m[1].length) + m[0].slice(6 + m[1].length));
  rule('confused', w(`\\b(as\\s+)quite(\\s+as)\\b`), 'Silent is “quiet”.', m => `${m[1]}quiet${m[2]}`);
  rule('confused', w(`\\bquite\\s+as\\s+(a|an)\\s+(mouse|grave|tomb|church|ghost)\\b`), 'Silent is “quiet”.', m => keepCase(m[0].split(/\s+/)[0], 'quiet') + ` as ${m[1]} ${m[2]}`);
  // idioms people mishear
  const IDIOM = [['shoe[- ]in', 'shoo-in'], ['nip (it|this|that) in the butt', 'nip $1 in the bud'], ['one in the same', 'one and the same'], ['case and point', 'case in point'], ['free reign', 'free rein'], ['mute point', 'moot point'], ['tow the line', 'toe the line'],
    ['deep[- ]seeded', 'deep-seated'], ['wreck havoc', 'wreak havoc'], ['wrecked havoc', 'wreaked havoc'], ['baited breath', 'bated breath'], ['hone in on', 'home in on'], ['sneak peak', 'sneak peek'], ['peaked (my|his|her|their|your|our) (interest|curiosity)', 'piqued $1 $2'],
    ['on accident', 'by accident'], ['statue of limitations', 'statute of limitations'], ['escape goat', 'scapegoat'], ['beckon call', 'beck and call'], ['make due', 'make do'], ['tongue and cheek', 'tongue in cheek'], ['damp squid', 'damp squib'],
    ['without further adieu', 'without further ado'], ['in lieu of the fact', 'in light of the fact'], ['for all intensive purposes', 'for all intents and purposes'], ['by in large', 'by and large'], ['chalk[- ]full', 'chock-full'], ['slight of hand', 'sleight of hand'], ['phase (me|him|her|them|us)', 'faze $1'],
    ['towed the line', 'toed the line'], ['all of the sudden', 'all of a sudden'], ['first come, first serve', 'first come, first served'], ['hunger pains', 'hunger pangs'], ['rein (supreme|terror)', 'reign $1'], ['reined supreme', 'reigned supreme'], ['bare with me', 'bear with me'], ['grizzly (murder|scene|details|death)', 'grisly $1'],
    ['should of known', 'should have known'], ['peak (my|his|her|their|your) (interest|curiosity)', 'pique $1 $2'], ['in tact', 'intact'], ['eek out', 'eke out'], ['worse case scenario', 'worst-case scenario'], ['butt naked', 'buck naked'], ['extract revenge', 'exact revenge'], ['vocal chords', 'vocal cords'], ['straight[- ]laced', 'strait-laced'], ['just desserts', 'just deserts']];
  for (const [bad, good] of IDIOM) rule('confused', w(`\\b${bad}\\b`), `The usual phrase is “${good.replace(/\$\d/g, '…')}”.`, m => keepCase(m[0], m[0].replace(new RegExp(bad, 'i'), good)));
  // double negatives (narration only: characters may talk that way)
  rule('grammar', w(`\\b(didn${AP}t|don${AP}t|doesn${AP}t|won${AP}t|can${AP}t|couldn${AP}t|wasn${AP}t|isn${AP}t|weren${AP}t|ain${AP}t)\\s+((?:[\\p{L}]+\\s+)?)(nothing|nobody|nowhere|no\\s+one)\\b`), 'Double negative: “didn’t … anything / anyone / anywhere”.',
    m => `${m[1]} ${m[2]}${{ nothing: 'anything', nobody: 'anybody', nowhere: 'anywhere' }[m[3].toLowerCase()] || 'anyone'}`, { notInDialogue: true, guard: (t, m) => !/^(but|than|if|that|and|or)\s+$/i.test(m[2]) && !(/^(wasn|isn|weren|ain)/i.test(m[1]) && !m[2] && /nothing/i.test(m[3])) });   // “it wasn’t nothing” is an idiom
  rule('grammar', w(`\\b(can${AP}t|couldn${AP}t|don${AP}t|didn${AP}t|won${AP}t)\\s+(hardly|barely|scarcely)\\b`), 'Double negative: “can hardly” already means almost not.', m => `${m[1].replace(/n['’]t$/i, '').replace(/^ca$/i, 'can').replace(/^wo$/i, 'will')} ${m[2]}`, { notInDialogue: true });
  // verb patterns
  rule('grammar', w(`\\b(could|should|would|must|might)\\s+(you|I|we|they|he|she|it)\\s+of\\b`), '“Have”, not “of” (could you have).', m => `${m[1]} ${m[2]} have`);
  rule('grammar', w(`\\bexplain(s|ed|ing)?\\s+(me|us)\\b(?=\\s+(?:the|how|what|why|that|a|an|it|everything|this|where|who)\\b)`), 'You explain something *to* someone (explained to me).', m => `explain${m[1] || ''} to ${m[2]}`.replace(/^e/, m[0][0]));
  rule('grammar', w(`\\bsaid\\s+(me|him|her|us|them)\\s+(that|to)\\b`), 'Use “told me” (said is said *to* someone).', m => keepCase(m[0], `told ${m[1]} ${m[2]}`));
  const ING = { hear: 'hearing', see: 'seeing', meet: 'meeting', work: 'working', speak: 'speaking', talk: 'talking', get: 'getting', go: 'going', have: 'having', read: 'reading', receive: 'receiving' };
  rule('grammar', w(`\\b(look(?:s|ed|ing)?\\s+forward\\s+to)\\s+(${Object.keys(ING).join('|')})\\b`), '“Look forward to” takes the -ing form (look forward to hearing).', m => `${m[1]} ${ING[m[2].toLowerCase()]}`);
  const ING2 = { work: 'working', do: 'doing', get: 'getting', go: 'going', have: 'having', live: 'living', sleep: 'sleeping', eat: 'eating', see: 'seeing', wake: 'waking', walk: 'walking', fight: 'fighting', talk: 'talking', deal: 'dealing', hear: 'hearing', run: 'running', wait: 'waiting', drive: 'driving', cook: 'cooking' };
  rule('grammar', w(`\\b((?:I${AP}m|I\\s+am|you${AP}re|he${AP}s|she${AP}s|we${AP}re|they${AP}re|(?:I|he|she|we|they|you)\\s+(?:was|were|got|get|am|is|are))\\s+used\\s+to)\\s+(${Object.keys(ING2).join('|')})\\b`), 'Meaning “accustomed to”, it’s “used to working”.', m => `${m[1]} ${ING2[m[2].toLowerCase()]}`);
  rule('grammar', w(`\\b(made|make|makes|making|let|lets|letting)\\s+(me|him|her|us|them|you)\\s+to\\s+(?=[\\p{L}])`), 'No “to” after “made me / let me” (made me laugh).', m => `${m[1]} ${m[2]} `, { guard: (t, m) => !/^(the|a|an|my|his|her|their|our|your|this|that|bed|school|work|town)\b/i.test(after(t, m, 8)) });
  rule('grammar', w(`\\bsuggest(s|ed)?\\s+(you|him|her|them|us|me)\\s+to\\b`), 'Say “suggest (that) you go”, not “suggest you to go”.', m => `suggest${m[1] || ''} ${m[2]}`.replace(/^s/, m[0][0]), { guard: (t, m) => !/^\s+(the|a|an|my|his|her|their|our|your|this|that)\b/i.test(after(t, m, 8)) });
  rule('grammar', w(`\\b(here|there|where)${AP}s\\s+((?:the|my|your|his|her|our|their|some|those|these|two|three)\\s+)([\\p{L}]+[^su'’\\s]s)\\b`), 'With more than one thing, it’s “here are / there are”.', m => `${keepCase(m[1], m[1].toLowerCase())} are ${m[2]}${m[3]}`,
    { notInDialogue: true, guard: (t, m) => !/^(news|series|species|means|physics|mathematics|lens|chaos|bus|gas|always|whereabouts|headquarters|barracks|crossroads|odds|thanks|ruins|woods|outskirts|stairs|clothes|pants|trousers|scissors|glasses)$/i.test(m[3]) && !/^(those|these|two|three)\s/i.test(m[2]) || /^(those|these|two|three)\s/i.test(m[2]) });
  rule('grammar', w(`\\bthe\\s+news\\s+(are|were)\\b`), '“News” takes a singular verb (the news is).', m => keepCase(m[0].slice(0, 8), m[0].slice(0, 8)) + ({ are: 'is', were: 'was' }[m[1].toLowerCase()]));
  rule('grammar', w(`\\b(the\\s+police)\\s+(is|was|has)\\b(?!\\s+(station|officer|car|chief|force)\\b)`), '“Police” takes a plural verb (the police are).', m => `${m[1]} ${{ is: 'are', was: 'were', has: 'have' }[m[2].toLowerCase()]}`);
  // plural subject with “was / has / is”: the orcs was, his eyes was
  const SING_S = /^(news|series|species|means|mathematics|physics|politics|economics|ethics|athletics|gymnastics|measles|mumps|diabetes|rabies|headquarters|barracks|crossroads|whereabouts|gallows|innings|thanks|lens|always|perhaps|chess|kudos|alms|summons|blues|billiards|darts|checkers|dominoes|electronics|logistics|graphics|statistics|tactics)$/i;
  rule('grammar', /(?<![\p{L}’'])((?:[Tt]he|[Tt]hese|[Tt]hose|[Hh]is|[Hh]er|[Tt]heir|[Mm]y|[Oo]ur|[Yy]our|[Ii]ts|[Bb]oth|[Aa]ll\s+the)\s+(?:[\p{L}’'-]+\s+)?)([a-z][\p{L}]*[^suiao'’\s]s)\s+(was|has|is|isn['’]t|wasn['’]t|hasn['’]t|doesn['’]t)(?![\p{L}])/gu, 'Agreement: more than one thing takes “were / have / are”.',
    m => `${m[1]}${m[2]} ${{ was: 'were', has: 'have', is: 'are', "isn't": 'aren’t', 'isn’t': 'aren’t', "wasn't": 'weren’t', 'wasn’t': 'weren’t', "hasn't": 'haven’t', 'hasn’t': 'haven’t', "doesn't": 'don’t', 'doesn’t': 'don’t' }[m[3].toLowerCase()]}`,
    { notInDialogue: true, guard: (t, m) => /(^|[.!?;:—]\s*|[“"(]\s*|,\s*|\b(?:and|but|so|then|when|because|while|as|if|until|once|after|before|since|though|although|where)\s+)$/i.test(before(t, m.index, 12)) && !SING_S.test(m[2]) && !/^(one|each|every|neither|either|none|any)\b/i.test((m[1].split(/\s+/)[1] || '')) && !/\b(of|one|each|every)\s*$/i.test(before(t, m.index, 10)) && !/^\s+(of)\b/i.test(after(t, m, 4)) && !/['’]s$/.test(m[2]) } );
  // he's / she's + possession
  const OWN = 'sword|swords|hand|hands|head|face|eyes|eye|horse|mother|father|brother|sister|wife|husband|son|daughter|friend|bag|pack|staff|bow|shield|blade|armour|armor|cloak|hood|hair|arm|arms|leg|legs|voice|room|house|car|phone|own|fault|turn|idea|name|life|heart|mind|body|feet|lips|mouth|chest|shoulder|shoulders|jaw|fist|fists|gaze|book|ship|crew|men|people|army|throne|crown|master|lord|king|queen';
  rule('confused', w(`\\b(he|she)${AP}s\\s+(${OWN})\\b`), '“His / her” (belonging to him or her), not “he’s / she’s”.', m => `${/^h/i.test(m[1]) ? keepCase(m[1], 'his') : keepCase(m[1], 'her')} ${m[2]}`,
    { guard: (t, m) => !/^\s+(of|to|enough|for)\b/i.test(after(t, m, 8)) && !/^(fine|own)$/i.test(m[2]) || /^own$/i.test(m[2]) });
  // object pronoun after a preposition: to Tom and I  ->  to Tom and me
  rule('grammar', w(`\\b(to|for|with|at|from|about|by|like|gave|give|told|tell|showed|show|help|helped|asked|ask|invited|invite|join|joined|toward|towards|behind|against|beside)\\s+(\\p{Lu}[\\p{L}]+|him|her|them|you)\\s+and\\s+I\\b(?![${"'"}’])(?=\\s*[.,!?;”"—]|\\s*$|\\s+(?:a|an|the|to|some|for|at|in|on|again|together|alone|both)\\b)`), 'After a word like “to” or “with”, it’s “me” (to Tom and me).', m => `${m[1]} ${m[2]} and me`);
  rule('confused', w(`\\blayed\\b`), 'The past of “lay” is “laid” (and of “lie”, “lay”).', m => keepCase(m[0], 'laid'));
  // more braver / most strongest
  const CMP = 'brave big good bad fast strong smart tall old young easy hard happy large small loud dark bright cold warm close high low long short quick weak rich kind safe wise nice pretty angry busy heavy scary crazy deep wide great clever cheap sharp thick thin tough calm fierce proud quiet strange'.split(' ');
  const er = b => b === 'good' ? 'better' : b === 'bad' ? 'worse' : /e$/.test(b) ? b + 'r' : /y$/.test(b) ? b.slice(0, -1) + 'ier' : /^(big|hot|thin|sad|fat|wet)$/.test(b) ? b + b.slice(-1) + 'er' : b + 'er';
  const est = b => b === 'good' ? 'best' : b === 'bad' ? 'worst' : er(b).replace(/er$/, 'est').replace(/^bett?est$/, 'best');
  const ERS = CMP.map(er).concat(['worse']), ESTS = CMP.map(est).concat(['worst']);
  rule('grammar', w(`\\b(more|less)\\s+(${ERS.join('|')})\\b(?!\\s+(?:of|and)\\b)`), 'Double comparative: just “braver”, not “more braver”.', m => m[2], { guard: (t, m) => !/\b(and|or|no|any|even|much|far|little|bit)\s*$/i.test(before(t, m.index, 8)) || /\b(even|much|far)\s*$/i.test(before(t, m.index, 8)) && false });
  rule('grammar', w(`\\b(most|least)\\s+(${ESTS.join('|')})\\b`), 'Double superlative: just “strongest”, not “most strongest”.', m => m[2]);
  rule('grammar', w(`\\beveryone\\s+of\\s+(the|them|us|you|these|those|my|his|her|their|our)\\b`), '“Every one of” (each single one) is two words.', m => keepCase(m[0].split(/\s+/)[0], 'every one') + ` of ${m[1]}`);
  rule('grammar', w(`\\bwhom\\s+(attacked|killed|was|were|is|are|had|has|came|went|ran|fled|saw|said|lives|lived|wants|wanted|knows|knew|made|took|stole|tried|seems|seemed)\\b`), '“Who” is the one doing the action (the rebels who attacked).', m => keepCase(m[0].split(/\s+/)[0], 'who') + ' ' + m[1],
    { guard: (t, m) => !/\b(of|to|for|with|by|from|about|on|in|at|upon|whom)\s*$/i.test(before(t, m.index, 8)) });
  // (doubled words, extra spaces and space before punctuation are Revise’s own “Doubled words” and “Spacing” checks)
  rule('typo', /([a-z…][.!?…]["”])(?=\p{L})/gu, 'Missing space after the closing quote.', m => `${m[1]} `);

  // ---------------------------------------------------------------- UK / US spelling, only when one chapter mixes both
  const PAIRS = [];
  const our = ['colour', 'favour', 'honour', 'humour', 'labour', 'neighbour', 'rumour', 'behaviour', 'harbour', 'armour', 'flavour', 'odour', 'vapour', 'splendour', 'valour', 'clamour', 'glamour', 'savour', 'parlour', 'endeavour', 'vigour', 'rigour', 'saviour', 'candour'];
  for (const u of our) { const us = u.replace(/our$/, 'or'); for (const s of ['', 's', 'ed', 'ing', 'ful', 'less', 'able', 'ite', 'ites', 'ably', 'er', 'ers']) PAIRS.push([u + s, us + s]); }
  for (const [u, us] of [['centre', 'center'], ['theatre', 'theater'], ['litre', 'liter'], ['fibre', 'fiber'], ['sombre', 'somber'], ['spectre', 'specter'], ['sabre', 'saber'], ['lustre', 'luster'], ['calibre', 'caliber'], ['meagre', 'meager']])
    for (const s of ['', 's', 'd']) PAIRS.push([u + s, us + s]);
  const ise = ['realis', 'recognis', 'organis', 'apologis', 'emphasis', 'criticis', 'sympathis', 'memoris', 'agonis', 'paralys', 'analys', 'civilis', 'characteris', 'authoris', 'prioritis', 'minimis', 'maximis', 'summaris', 'visualis', 'utilis', 'mesmeris', 'terroris', 'tantalis', 'scrutinis', 'familiaris'];
  for (const b of ise) { const us = b.replace(/s$/, 'z'); for (const s of ['e', 'es', 'ed', 'ing', 'ation', 'ations']) { if (b === 'emphasis' && s === 'e') continue; PAIRS.push([b + s, us + s]); } }
  for (const pr of [['grey', 'gray'], ['greys', 'grays'], ['greyish', 'grayish'], ['travelled', 'traveled'], ['travelling', 'traveling'], ['traveller', 'traveler'], ['travellers', 'travelers'], ['cancelled', 'canceled'], ['cancelling', 'canceling'],
    ['labelled', 'labeled'], ['modelling', 'modeling'], ['jewellery', 'jewelry'], ['defence', 'defense'], ['offence', 'offense'], ['pyjamas', 'pajamas'], ['plough', 'plow'], ['mould', 'mold'], ['mouldy', 'moldy'],
    ['sceptical', 'skeptical'], ['sceptic', 'skeptic'], ['catalogue', 'catalog'], ['aeroplane', 'airplane'], ['enrol', 'enroll'], ['fulfil', 'fulfill'], ['skilful', 'skillful'], ['wilful', 'willful'], ['aluminium', 'aluminum'],
    ['mum', 'mom'], ['mummy', 'mommy'], ['sulphur', 'sulfur'], ['moustache', 'mustache'], ['manoeuvre', 'maneuver'], ['manoeuvred', 'maneuvered'], ['towards', 'toward'], ['whilst', 'while'], ['amongst', 'among'],
    ['marvellous', 'marvelous'], ['fuelled', 'fueled'], ['dialled', 'dialed'], ['quarrelled', 'quarreled'], ['signalled', 'signaled'], ['woollen', 'woolen'], ['ageing', 'aging'], ['judgement', 'judgment'], ['programme', 'program'], ['practise', 'practice'], ['licence', 'license'], ['tyre', 'tire'], ['kerb', 'curb'], ['cheque', 'check'], ['storey', 'story'], ['draught', 'draft'], ['pram', 'stroller']])
    PAIRS.push(pr);
  // only pairs that are spelling differences, not words with their own meaning in the other dialect
  const AMBIG = new Set(['judgement', 'practise', 'licence', 'tyre', 'kerb', 'cheque', 'storey', 'draught', 'pram', 'programme', 'towards', 'whilst', 'amongst', 'mum', 'mummy']);
  const UK = new Map(), US = new Map();
  for (const [u, us] of PAIRS) { if (AMBIG.has(u)) continue; UK.set(u, us); US.set(us, u); }
  // count both styles in a chapter's text
  function spellingIndex(fullText) {
    let uk = 0, us = 0; const seen = { uk: new Map(), us: new Map() };
    for (const m of fullText.toLowerCase().matchAll(/[a-z]+/g)) {
      const t = m[0];
      if (UK.has(t)) { uk++; seen.uk.set(t, (seen.uk.get(t) || 0) + 1); }
      else if (US.has(t)) { us++; seen.us.set(t, (seen.us.get(t) || 0) + 1); }
    }
    return { uk, us, seen };
  }

  // ---------------------------------------------------------------- run the checks on one paragraph
  // ctx: { spelling: spellingIndex(), prefer: 'uk' | 'us' }
  // results are remembered per paragraph, so after an edit only the changed paragraph is checked again
  const memo = new Map();
  function check(text, ctx = {}) {
    const sp0 = ctx.spelling;
    const key = `${ctx.prefer || ''}|${sp0 ? (sp0.uk ? 1 : 0) + (sp0.us ? 2 : 0) + (sp0.uk >= sp0.us ? 4 : 0) : 0}|${text}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const res = checkNow(text, ctx);
    if (memo.size > 4000) memo.clear();
    memo.set(key, res);
    return res;
  }
  function checkNow(text, ctx) {
    const out = [];
    const dlg = dialogueRanges(text);
    // a / an
    for (const m of text.matchAll(/\b(a|an|A|An|AN)\s+([\p{L}\p{N}][\p{L}\p{N}'’.-]*)/gu)) {
      const art = m[1], word = m[2];
      if (/^[A-Z]$/.test(word) || word.length < 2 && !/\d/.test(word)) continue;
      if (/^(and|or|nor|to|through)$/i.test(word) || art === 'A' && /^(and|or)$/i.test(word)) continue;           // “A and B”, “from A to Z”         // “plan A”, single letters
      if (m.index > 0 && /[\p{L}'’]/u.test(text[m.index - 1])) continue;
      if (art === 'A' && m.index > 0 && !/[\s“"(]/.test(text[m.index - 1])) continue;
      const an = needsAn(word);
      if (an === null) continue;
      if (an && art.toLowerCase() === 'a') out.push({ cat: 'grammar', start: m.index, end: m.index + art.length, msg: `Use “an” before a vowel sound (“an ${word}”).`, fix: keepCase(art, 'an') });
      if (!an && art.toLowerCase() === 'an') out.push({ cat: 'grammar', start: m.index, end: m.index + art.length, msg: `Use “a” before a consonant sound (“a ${word}”).`, fix: keepCase(art, 'a') });
    }
    for (const r of R) {
      r.re.lastIndex = 0;
      let m;
      while ((m = r.re.exec(text))) {
        if (m[0] === '') { r.re.lastIndex++; continue; }
        if (r.re.wordy && (LETTER.test(text[m.index - 1] || '') && LETTER.test(m[0][0]) || LETTER.test(text[m.index + m[0].length] || '') && LETTER.test(m[0][m[0].length - 1]))) continue;
        if (r.notInDialogue && inside(dlg, m.index)) continue;
        if (r.guard && !r.guard(text, m, ctx)) continue;
        const fix = r.repl(m);
        if (fix === m[0]) continue;
        out.push({ cat: r.cat, start: m.index, end: m.index + m[0].length, msg: r.msg, fix });
      }
    }
    // UK / US mixing
    const sp = ctx.spelling;
    if (sp && sp.uk && sp.us) {
      const prefer = ctx.prefer || (sp.uk >= sp.us ? 'uk' : 'us');
      const other = prefer === 'uk' ? US : UK;
      for (const m of text.matchAll(/[A-Za-z]+/g)) {
        const t = m[0].toLowerCase();
        if (!other.has(t)) continue;
        const rep = other.get(t);
        out.push({ cat: 'spelling', start: m.index, end: m.index + m[0].length, msg: `This chapter mixes ${prefer === 'uk' ? 'UK and US' : 'US and UK'} spellings. You mostly write “${rep}”${prefer === 'uk' ? ' (UK / Australian spelling)' : ' (US spelling)'}.`, fix: keepCase(m[0], rep) });
      }
    }
    // overlapping hits: keep the first / longest
    out.sort((a, b) => a.start - b.start || b.end - a.end);
    const kept = []; let lastEnd = -1;
    for (const o of out) { if (o.start >= lastEnd) { kept.push(o); lastEnd = o.end; } }
    return kept;
  }

  return { check, spellingIndex, needsAn, dialogueRanges, _rules: R };
})();
