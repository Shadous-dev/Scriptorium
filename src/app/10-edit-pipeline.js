/* 10-edit-pipeline.js — Running the edit pass: cue stripping, capitals, joins, concurrency. */
  function sampleErrorMessage(err) {
    var code = err && err.code;
    if (code === 'not_granted') return 'permission to use Claude was declined';
    if (code === 'rate_limited') return 'too many requests right now — try again shortly';
    if (code === 'prompt_too_large') return 'this transcript is too long for one pass — try splitting it into two guides';
    if (code === 'invalid_json') return 'the response could not be read — try again';
    if (code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') return 'editing isn’t available in this view';
    if (code === 'refused' || code === 'empty_completion') return 'Claude could not produce a result for this one — try again';
    return (err && err.message) || 'something went wrong';
  }

  /* ------------------------------------------------------------------
     Local mechanics — everything with a deterministic answer is done here,
     free, BEFORE the text is sent, so Claude is never paid to find it or to
     return it. Judgment calls (run-ons, comma splices, misheard words,
     scripture) stay with the editor. Each pass records what it did so the
     change table stays complete (SSOT 4.4).
     ------------------------------------------------------------------ */

  var CUE_RE = /[ \t]*\[[^\]\n]{1,120}\][ \t]*/g, PAUSE_RE = /(^|\s)_+(?=\s|$)/g;
  var MECH = [                                   // [pattern, replacement] — spacing, marks, sentence ends
    [/[“”]/g, '"'], [/\.\s?\.\s?\.|\u2026+/g, '…'], [/--/g, '—'],
    [/[ \t]+([,;:!?…]|\.(?!\d))/g, '$1'],       // no space before punctuation — but "about .5" keeps its space
    [/([,;!?])(?=[A-Za-z])/g, '$1 '],            // a space after it
    [/(\w{2,})\.(?=[A-Z][a-z])/g, '$1. ']        // "word.Next" — but not "a.m."
  ];
  // A paragraph that just stops gets its period — AFTER joins, so a mid-thought break is closed up, not ended.
  var END_RE = /([A-Za-z0-9])("?)(?=[ \t]*(?:\n[ \t]*\n|$))/g;
  function endSentences(text, intoEdits) {
    var hits = text.match(END_RE);
    if (hits) { text = text.replace(END_RE, '$1.$2'); tally(intoEdits, 'spacing', hits.length, 'period added where a paragraph just stopped'); }
    return text;
  }
  var ABBREV = /(?:\b(?:mr|mrs|ms|dr|st|vs|etc|jr|sr|no|cf|approx|dept|inc|co|ch|vv?)|\be\.g|\bi\.e|\ba\.k\.a|\b[A-Za-z])\.$/i;
  var BOOKS = 'genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|song of songs|song of solomon|isaiah|jeremiah|lamentations|ezekiel|daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|timothy|titus|philemon|hebrews|james|peter|jude|revelation';
  var BOOK_RE = new RegExp('\\b([123] )?(' + BOOKS + ')(?= \\d)', 'gi');   // a book name followed by a chapter
  var SURE = 'jesus christ bible israel jerusalem satan moses abraham isaac jacob joseph david solomon elijah elisha isaiah jeremiah ezekiel daniel paul peter pharisees egypt babylon bethlehem nazareth galilee'.split(' ');
  var SURE_RE = new RegExp('\\b(' + SURE.join('|') + ')\\b', 'gi');
  var GOD_RE = /\b(?<!\b(?:a|an|false|other|their|your|no|any|strange|pagan|greek|roman)\s)god\b(?!s)/gi;
  var LORD_RE = /\blord\b(?!s)/gi, SPIRIT_RE = /\bholy spirit\b/gi, I_RE = /\bi(?=['’\s,;:!?]|$)/g;

  function cap(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }
  function tally(intoEdits, kind, count, label) {
    if (count) intoEdits.push({ find: label, replace: '', kind: kind, note: count + ' place' + plural(count) });
  }

  // Cues and pause marks out; spacing, quote marks, ellipses and sentence ends made regular.
  function mechanics(text, intoEdits) {
    var cues = [];
    text = String(text || '').replace(CUE_RE, function (m) { cues.push(m.trim()); return ' '; }).replace(PAUSE_RE, function (m, lead) { cues.push('_'); return lead; });
    if (cues.length) intoEdits.push({ find: cues.slice(0, 12).join(' ') + (cues.length > 12 ? ' …' : ''), replace: '', kind: 'cue', note: 'removed ' + cues.length + ' stage cue' + plural(cues.length) + ' / pause mark' + plural(cues.length) });
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    var n = 0;
    MECH.forEach(function (r) { var hits = text.match(r[0]); if (hits) { n += hits.length; text = text.replace(r[0], r[1]); } });
    tally(intoEdits, 'spacing', n, 'spacing, quote marks, ellipses, sentence ends');
    return text;
  }

  // Names that are never ordinary words, God and the Lord, "I", Bible books before a chapter
  // number, and the names the user listed. Each distinct fix is one visible row.
  function fixNames(text, intoEdits) {
    var seen = {};
    function note(from, to) { if (from !== to && !seen[from + '>' + to]) { seen[from + '>' + to] = 1; intoEdits.push({ find: from, replace: to, kind: 'capitalization', note: 'name or title' }); } }
    // A word already in capitals was written that way on purpose — emphasis, or LORD in a pasted verse — and is left alone.
    function sub(re, fn) {
      text = text.replace(re, function (m) {
        if (m.length > 1 && m === m.toUpperCase() && m !== m.toLowerCase()) return m;
        var out = fn.apply(null, arguments); note(m, out); return out;
      });
    }
    sub(SURE_RE, function (m) { return cap(m); });
    sub(BOOK_RE, function (m, num, book) { return (num || '') + book.split(' ').map(cap).join(' '); });
    sub(GOD_RE, function () { return 'God'; }); sub(LORD_RE, function () { return 'Lord'; }); sub(SPIRIT_RE, function () { return 'Holy Spirit'; }); sub(I_RE, function () { return 'I'; });
    String(state.wordsToSearchFor || '').split(/[,\n;]+/).forEach(function (w) {
      w = w.trim(); if (w.length < 2) return;
      sub(new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), function () { return w; });
    });
    return text;
  }

  // No sentence or paragraph may start lowercase. Abbreviations, initials, decimals and trailing-off dots are left alone.
  // Before the edit pass (`beforeEdit`) a paragraph that follows one with no closing punctuation is left as it is:
  // Descript breaks on pauses, so that break may fall mid-thought, and a capital put there would be stranded in the
  // middle of a sentence once the break is closed up. After the joins every paragraph start is done.
  function fixCapitals(text, intoEdits, beforeEdit) {
    var count = 0;
    function note(before, after) { count += 1; if (count <= 20) intoEdits.push({ find: before, replace: after, kind: 'capitalization', note: 'sentence start' }); }
    text = text.replace(/(^|\n[ \t]*\n[ \t]*)(["“'(]*)([a-z])(\S{0,24})/g, function (m, lead, open, ch, rest, offset, whole) {
      if (beforeEdit && lead && !/[.!?…]["”'’)\]]*[ \t]*$/.test(whole.slice(Math.max(0, offset - 12), offset))) return m;
      note(open + ch + rest, open + ch.toUpperCase() + rest);
      return lead + open + ch.toUpperCase() + rest;
    });
    text = text.replace(/([.!?])(["”')\]]*)([ \t]+)(["“'(]*)([a-z])(\S{0,24})/g, function (m, p, close, sp, open, ch, rest, offset, whole) {
      var before = whole.slice(Math.max(0, offset - 14), offset + 1);
      if (p === '.' && (ABBREV.test(before) || /\.\.$/.test(before))) return m;
      note(p + close + ' ' + open + ch + rest, p + close + ' ' + open + ch.toUpperCase() + rest);
      return p + close + sp + open + ch.toUpperCase() + rest;
    });
    if (count > 20) intoEdits.push({ find: '(' + (count - 20) + ' more)', replace: '', kind: 'capitalization', note: 'further sentence starts capitalized' });
    return text;
  }

  /* ------------------------------------------------------------------
     Numbers in Bible references — SOURCE-OF-TRUTH 6. A reference is
     written in digits, never number words or a mix ("Isaiah thirty-five:1").

     Code fixes only the case with one right answer: a number spelled out
     on either side of a reference colon. Whether "verse one" or "Peter
     three" is a reference at all depends on meaning ("Peter three times
     denied him"), so that judgment is the editor's — and the guard below
     checks that all it changed was how the number is written.
     ------------------------------------------------------------------ */

  var NUM_UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
                    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var NUM_TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  var NUM_ONES = 'one|two|three|four|five|six|seven|eight|nine';
  var NUM_ANY = 'thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|ten|eleven|twelve|' + NUM_ONES + '|' + Object.keys(NUM_TENS).join('|');
  var NUM_SMALL = '(?:(?:' + Object.keys(NUM_TENS).join('|') + ')(?:[ -](?:' + NUM_ONES + '))?|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|ten|eleven|twelve|' + NUM_ONES + ')';
  // One whole number in words, up to 999 — and not the first half of two numbers said back to back ("thirty-five one").
  var NUM_PHRASE = '(?:(?:' + NUM_ONES + ') hundred(?:(?: and)? ' + NUM_SMALL + ')?|' + NUM_SMALL + ')(?![ -](?:' + NUM_ANY + '|hundred)\\b)';
  var NUM_RE = new RegExp('(?<![A-Za-z-])' + NUM_PHRASE + '\\b', 'gi');
  var REF_LEFT_RE = new RegExp('(?<![A-Za-z-])' + NUM_PHRASE + '(?=:(?:\\d|(?:' + NUM_ANY + ')\\b))', 'gi');   // "thirty-five:1"
  var REF_RIGHT_RE = new RegExp('(?<=\\d:)' + NUM_PHRASE + '\\b', 'gi');                                        // "35:one"

  function numberFromWords(phrase) {
    var t = String(phrase).toLowerCase().split(/[ -]+/), i = 0, total = 0;
    if (NUM_UNITS[t[0]] < 10 && t[1] === 'hundred') {
      total = NUM_UNITS[t[0]] * 100; i = 2;
      if (i === t.length) return total;
      if (t[i] === 'and') i += 1;
    }
    if (NUM_TENS[t[i]]) { total += NUM_TENS[t[i]]; i += 1; if (NUM_UNITS[t[i]] < 10) { total += NUM_UNITS[t[i]]; i += 1; } }
    else if (NUM_UNITS[t[i]]) { total += NUM_UNITS[t[i]]; i += 1; }
    else return null;
    return i === t.length ? total : null;
  }
  function digitsForWords(text) { return String(text).replace(NUM_RE, function (m) { var n = numberFromWords(m); return n == null ? m : String(n); }); }

  // A number spelled out on either side of a reference colon becomes digits. Each distinct fix is one visible row.
  function fixReferences(text, intoEdits) {
    var seen = {};
    function swap(m) {
      var n = numberFromWords(m);
      if (n == null) return m;
      if (!seen[m.toLowerCase()]) { seen[m.toLowerCase()] = 1; intoEdits.push({ find: m, replace: String(n), kind: 'reference', note: 'reference number written in digits' }); }
      return String(n);
    }
    return text.replace(REF_LEFT_RE, swap).replace(REF_RIGHT_RE, swap);
  }

  /* ------------------------------------------------------------------
     The wording guard — SOURCE-OF-TRUTH 4.1 and 4.2, enforced here and
     not left to the edit pass.

     An edit the editor proposes is applied only if every word it touches
     either stays the same word (punctuation, capitals, spacing, hyphens
     and number notation may change), or is replaced by words that sound
     the same — which is what a mishearing is. A section label standing
     alone on a line may be removed. Anything else would change
     what the speaker said. It is held back and shown as a suggestion.
     ------------------------------------------------------------------ */

  // The words of a run with everything that is not wording removed: "So-called," and "so called" are the same wording.
  // Where one number stops and the next starts is part of what was said, so it is kept: "3:16" and "31:6" are
  // different, while "35 1" and "35:1" are the same, and so are "1,000" and "1000". Letters of every alphabet count.
  function wordingKey(text) {
    return digitsForWords(String(text).toLowerCase())
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
      .replace(/(\d)[^\p{L}\p{N}]+(?=\d)/gu, '$1\u0001')
      .replace(/[^\p{L}\p{N}\u0001]+/gu, '');
  }

  /* What counts as "sounds the same". Spelling is a poor guide to sound, so this is strict on
     purpose: when in doubt the answer is no, and the change is shown as a suggestion instead.

       1. the same words, or known homophones word for word        their / there, son / sun
       2. the same sound once spelling is folded                   Eli who / Elihu, so far / Zophar, us / Uz
       3. a long word whose consonants match and whose vowels
          differ only slightly                                     sabians / Sabeans, a liphaz / Eliphaz
       4. a name the reader listed under Words to Search For,
          roughly                                                  never can nezzar / Nebuchadnezzar

     Short everyday words that merely look or sound close — we / you, son / sin, good / God,
     is / his, lives / loves, then / ten, three / tree — are different words, and are not allowed.
     "th" is its own sound (θ below): it may stand in for "t" only inside a long word, as in
     Timoty / Timothy. */

  var HOMOPHONE_GROUP = {};
  ('their there theyre|to too two|your youre|whose whos|hear here|know no|knew new|right write rite|by buy bye|for four fore|one won|our hour|' +
   'see sea|son sun|be bee|eye i aye|oh owe|weak week|peace piece|wait weight|way weigh|whole hole|holy wholly|pray prey|soul sole|heal heel|' +
   'rain reign rein|alter altar|profit prophet|lead led|passed past|threw through|wear where ware|weather whether|which witch|would wood|' +
   'aloud allowed|break brake|die dye|fair fare|great grate|hi high|made maid|meat meet|not knot|or ore oar|plain plane|principal principle|' +
   'role roll|sail sale|scene seen|steal steel|tail tale|throne thrown|vain vein|waist waste|mourning morning|night knight|raise rays|' +
   'bare bear|born borne|sight site cite|some sum').split('|').forEach(function (group, i) {
    group.split(' ').forEach(function (w) { HOMOPHONE_GROUP[w] = i + 1; });
  });

  function lettersOf(text) { return String(text).toLowerCase().replace(/[^a-z]+/g, ''); }
  function letterWords(text) { return (String(text).match(/\S+/g) || []).map(lettersOf).filter(Boolean); }

  // Spelling folded toward sound: the letter groups that share a sound become one, and vowels are kept.
  function soundSpell(text) {
    return lettersOf(text)
      .replace(/who(?!l)/g, 'hu').replace(/ph/g, 'f').replace(/ch/g, 'k').replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k')
      .replace(/x/g, 'ks').replace(/z/g, 's').replace(/oo/g, 'u').replace(/ee/g, 'i').replace(/y/g, 'i')
      .replace(/t+h/g, 'θ').replace(/([gpwr])h/g, '$1').replace(/wr/g, 'r').replace(/(.)\1+/g, '$1');
  }
  // How far apart two folded spellings are. A vowel that differs counts half; a consonant counts whole.
  function soundDistance(a, b) {
    var vowel = /[aeiou]/, prev = [0], cur, i, j, da, db;
    for (j = 1; j <= b.length; j++) prev[j] = prev[j - 1] + (vowel.test(b[j - 1]) ? 0.5 : 1);
    for (i = 1; i <= a.length; i++) {
      da = vowel.test(a[i - 1]) ? 0.5 : 1;
      cur = [prev[0] + da];
      for (j = 1; j <= b.length; j++) {
        db = vowel.test(b[j - 1]) ? 0.5 : 1;
        var near = da + db === 1 || (a[i - 1] === 'θ' && b[j - 1] === 't') || (a[i - 1] === 't' && b[j - 1] === 'θ');
        cur[j] = Math.min(prev[j] + da, cur[j - 1] + db, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : (near ? 0.5 : 1)));
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function listedNames() { return String(state.wordsToSearchFor || '').split(/[,\n;]+/).map(lettersOf).filter(function (n) { return n.length >= 2; }); }

  // Could Descript have heard one as the other? `listed` is the reader's Words to Search For, as letters only.
  function soundsAlike(a, b, listed) {
    var wa = letterWords(a), wb = letterWords(b);
    if (!wa.length || !wb.length) return false;
    if (wa.length === wb.length && wa.every(function (w, i) { return w === wb[i] || (HOMOPHONE_GROUP[w] && HOMOPHONE_GROUP[w] === HOMOPHONE_GROUP[wb[i]]); })) return true;
    var x = soundSpell(a), y = soundSpell(b);
    if (!x || !y) return false;
    if (x === y) return true;
    var longest = Math.max(x.length, y.length), apart = soundDistance(x, y);
    if ((listed || []).some(function (name) { return wb.indexOf(name) !== -1 || (name.length >= 5 && wb.join('').indexOf(name) !== -1); })) return apart <= longest * 0.34;
    return longest >= 6 && x.replace(/[aeiou]/g, '').replace(/θ/g, 't') === y.replace(/[aeiou]/g, '').replace(/θ/g, 't') && apart <= 1;
  }

  // A section label: a short line in capitals standing alone in the transcript ("BEARINGS"). Words spoken
  // in capitals inside a sentence, numbers, and anything ending a sentence are not labels.
  function isLabelLine(find, text) {
    var label = String(find).trim();
    if (!/^[A-Z][A-Z &'’-]*:?$/.test(label) || label.split(/\s+/).length > 4) return false;
    return String(text || '').split('\n').some(function (line) { return line.trim() === label; });
  }

  // Why an edit may not be applied, or '' when it may. `text` is the transcript the edit was written against.
  // Sets e.kind to 'misheard' when it swaps sound-alike words unlabelled, so the swap is shown where a reader looks for it.
  function wordingProblem(e, text, listed) {
    var find = String((e && e.find) || ''), repl = String((e && e.replace) || '');
    if (wordingKey(find) === wordingKey(repl)) return '';
    if (!repl.trim() && isLabelLine(find, text)) return '';
    var a = find.match(/\S+/g) || [], b = repl.match(/\S+/g) || [];
    var pairs = matchWords(a.map(wordingKey), b.map(wordingKey), 2000);
    if (!pairs) return 'changes the wording';
    var swapsSound = false, problem = '', pa = -1, pb = -1;
    function check(toA, toB) {
      if (problem || (toA - pa <= 1 && toB - pb <= 1)) return;
      var was = a.slice(pa + 1, toA).join(' '), now = b.slice(pb + 1, toB).join(' ');
      if (wordingKey(was) === wordingKey(now)) return;
      if (soundsAlike(was, now, listed)) { swapsSound = true; return; }
      problem = !wordingKey(was) ? 'adds words the speaker did not say' : !wordingKey(now) ? 'removes words the speaker said' : 'the new words do not sound like the old ones';
    }
    pairs.forEach(function (p) { check(p[0], p[1]); pa = p[0]; pb = p[1]; });
    check(a.length, b.length);
    if (!problem && swapsSound && e.kind !== 'misheard' && e.kind !== 'verse-fix') { e.kind = 'misheard'; e.note = e.note || 'sounds the same'; }
    return problem;
  }
  function guardEdits(edits, text) {
    var ok = [], held = [], listed = listedNames();
    (edits || []).forEach(function (e) {
      if (!e || typeof e !== 'object') return;
      var why = wordingProblem(e, text, listed);
      // 4.9: where the written script and the transcript differ in wording, the transcript stays as spoken and the difference names its source.
      if (why) held.push({ find: String(e.find || ''), replace: String(e.replace || ''), kind: String(e.kind || 'grammar'),
                           note: (e.source === 'script' ? 'the written script reads this way; ' : '') + why + (e.note ? ' — ' + String(e.note) : '') });
      else ok.push(e);
    });
    return { ok: ok, held: held };
  }

  function cleanMisquotes(list) {
    return Array.isArray(list) ? list.map(function (q) {
      q = q || {};
      return { said: str(q.said), verse: str(q.verse), reference: str(q.reference) };
    }).filter(function (q) { return q.said; }) : [];
  }

  function str(v) { return String(v == null ? '' : v).trim(); }
  function cleanVerses(list) {
    return Array.isArray(list) ? list.map(function (v) {
      v = v || {};
      return { reference: str(v.reference), startsWith: str(v.startsWith).replace(/^["\u201C]+/, ''), endsWith: str(v.endsWith).replace(/["\u201D]+$/, ''),
               canonical: str(v.canonical), confidence: str(v.confidence).toLowerCase() === 'low' ? 'low' : 'high', note: str(v.note) };
    }).filter(function (v) { return v.startsWith; }) : [];
  }
  function cleanNonsense(list) {
    return Array.isArray(list) ? list.map(function (n) { n = n || {}; return { original: str(n.original), issue: str(n.issue) }; }) : [];
  }

  // Close the paragraph breaks the editor says fall mid-thought. Each join becomes a visible "paragraph" edit.
  // `sent` is the text as it went to the editor. Where the editor both closed a break and capitalised the word after
  // it, the capital is taken back: that word is now in the middle of a sentence, and it was lowercase as spoken.
  function applyJoins(text, joins, intoEdits, sent) {
    if (!repairParagraphs || !Array.isArray(joins)) return text;
    joins.forEach(function (j) {
      var a = str(j && j.endsWith), b = str(j && j.startsWith);
      if (!a || !b) return;
      var ha = locate(text, a, 0, false); if (!ha) return;
      var gap = text.slice(ha.end).match(/^\s*\n\s*\n\s*/); if (!gap) return;
      var hb = locate(text, b, ha.end + gap[0].length, false);
      if (!hb || hb.start !== ha.end + gap[0].length) return;
      var head = text.slice(hb.start, hb.start + 16), lowered = head.charAt(0).toLowerCase() + head.slice(1);
      if (sent && head !== lowered && !/[.!?…]["”'’)\]]*$/.test(text.slice(0, ha.end)) && sent.indexOf('\n\n' + lowered) !== -1 && sent.indexOf('\n\n' + head) === -1) {
        text = text.slice(0, hb.start) + lowered.charAt(0) + text.slice(hb.start + 1);
        b = b.charAt(0).toLowerCase() + b.slice(1);
      }
      text = text.slice(0, ha.end) + ' ' + text.slice(hb.start);
      intoEdits.push({ find: a + ' ¶ ' + b, replace: a + ' ' + b, kind: 'paragraph', note: 'joined a mid-thought break' });
    });
    return text;
  }

  // One route: ask for the edit list, apply it here. Edits that cannot be placed are kept and
  // shown for a hand check — never silently dropped, and never traded for a full rewrite
  // (which costs a whole script's worth of output and shows no edit table).
  // `written` is the guide's written script, when it has one: { id, title, text }. It travels in this same one call (4.6).
  function runEditOnSection(s, sample, signal, isRetry, written) {
    if (s.raw.length > 55000) {
      s.status = 'error'; s.error = 'this transcript is too long for one pass — try splitting it into two guides';
      return Promise.resolve();
    }
    // The transcript as it stood when this pass began. Typing in it while the pass runs must leave the guide marked as changed since.
    var rawAtStart = s.raw, local = [], writtenNote = '';
    if (written && written.error) { writtenNote = written.error; written = null; }
    if (written && !String(written.text || '').trim()) written = null;
    var prepared = fixCapitals(fixNames(fixReferences(mechanics(rawAtStart, local), local), local), local, true);
    return sample.json(buildEditsPrompt(s, prepared, written ? written.text : ''), { modelTier: 'quick', cache: false, signal: signal }).then(function (data) {
      data = data || {};
      var proposed = (Array.isArray(data.edits) ? data.edits : []).filter(function (e) { return e && typeof e === 'object'; });
      proposed.forEach(function (e) { if (!written || e.source !== 'script') delete e.source; });
      var guard = guardEdits(proposed, prepared);                                          // 4.1: only what keeps the speaker's words
      var result = applyEdits(prepared, guard.ok);
      result.applied.forEach(function (e) { if (e.source === 'script') e.note = (e.note ? e.note + ' — ' : '') + 'supported by the written script'; });
      var applied = local.concat(result.applied);
      var text = endSentences(fixCapitals(applyJoins(result.text, data.joins, applied, prepared), applied), applied);
      var summary = str(data.summary);
      if (result.unapplied.length > 2) summary += (summary ? ' ' : '') + result.unapplied.length + ' suggested changes could not be placed and are listed below for a hand check — Redo this one if that seems like too many.';
      if (guard.held.length) summary += (summary ? ' ' : '') + guard.held.length + ' suggested change' + plural(guard.held.length) + ' would have altered the speaker’s words and ' + (guard.held.length === 1 ? 'was' : 'were') + ' not applied — listed below.';
      if (writtenNote) summary += (summary ? ' ' : '') + writtenNote;
      s.corrected = text; s.summary = summary; s.changeCount = applied.length;
      s.edits = applied; s.unapplied = result.unapplied;
      s.misheard = applied.filter(function (e) { return e.kind === 'misheard'; }).map(function (e) { return { heard: e.find, likely: e.replace, note: e.note }; });
      s.nonsensical = cleanNonsense(data.nonsensical); s.verses = cleanVerses(data.verses); s.method = 'edits';
      s.suggested = guard.held; s.misquotes = cleanMisquotes(data.misquotes); delete s.handDraft;
      s.writtenUsed = written ? { id: String(written.id || ''), title: String(written.title || '') } : null;
      if (written) noteWrittenRefs(s, written.text);                                       // 4.10: the reference the teacher wrote down
      clearApproval(s);                                                                    // new text is an Edited Transcript until a person approves it
      s.editedFromRaw = rawAtStart; s.status = 'edited'; s.editedAt = Date.now(); s.error = null; touchBook();
    }).catch(function (err) {
      if (err && err.code === 'cancelled') { s.status = 'error'; s.error = '__stopped__'; return; }
      // A garbled or empty answer is not cached, so one more ask is a genuine second attempt.
      if (!isRetry && err && (err.code === 'invalid_json' || err.code === 'empty_completion')) return runEditOnSection(s, sample, signal, true, written || (writtenNote ? { error: writtenNote } : null));
      s.status = 'error'; s.error = sampleErrorMessage(err);
    });
  }

  // Runs `concurrency` guides at once (1 or 2). Each finished guide is saved on its own
  // before the worker picks up the next, so an interruption costs at most what was in flight.
  function editAll(force) {
    syncFieldsFromDom();
    if (dbStatus === 'loading') { showFlash('Still loading your saved guides — give it a second and try again.'); return; }
    useCap('sample').then(function (sample) {
      if (!sample) { showFlash('This page needs permission to use Claude for editing. Open it in a Claude viewer that allows that, then try again.'); return; }
      var toProcess = state.sections.filter(needsEdit);
      var byHand = toProcess.filter(hasHandWork).length;
      if (force !== true && byHand) {                          // 4.5: hand corrections are never silently replaced
        openConfirm({
          title: 'Edit ' + byHand + ' guide' + plural(byHand) + ' again?',
          body: byHand + ' of the guides about to be edited ' + (byHand === 1 ? 'has' : 'have') + ' corrections made by hand. Their transcript has changed, so the edit pass will replace the Edited Transcript, and those corrections are lost.',
          warn: '', confirmLabel: 'Edit and replace',
          onConfirm: function () { confirmState = null; editAll(true); }
        });
        return;
      }
      if (!toProcess.length) {
        showFlash(state.sections.some(function (s) { return s.raw.trim(); }) ? 'Every guide with a transcript is already up to date.' : 'Add a transcript to at least one guide first.');
        return;
      }
      var queue = toProcess.slice(), stoppedFlag = false;
      editControllers = [];
      editState = { total: toProcess.length, done: 0 };
      paint();

      function worker() {
        if (stoppedFlag) return Promise.resolve();
        var item = queue.shift();
        if (!item) return Promise.resolve();
        // Already being edited — "Redo this one" was clicked while it waited its turn. One guide is one call (4.6).
        if (item.status === 'editing') { editState.done += 1; paintStatus(); return worker(); }
        var ctl = new AbortController();
        editControllers.push(ctl);
        item.status = 'editing'; item.error = null;
        paintSection(item.id); paintStatus();
        return writtenFor(item).then(function (written) { return runEditOnSection(item, sample, ctl.signal, false, written); }).then(function () {
          editControllers = editControllers.filter(function (c) { return c !== ctl; });
          if (item.status === 'error' && item.error === '__stopped__') stoppedFlag = true;
          editState.done += 1;
          paintSection(item.id); paintStatus();
          return saveSection(item.id).then(worker);
        });
      }

      var workers = [];
      for (var i = 0; i < concurrency; i++) workers.push(worker());
      return Promise.all(workers).then(function () {
        editState = null; editControllers = [];
        state.lastEditAt = Date.now();
        paint();
        return saveMeta();
      });
    });
  }

  function stopEdit() { editControllers.forEach(function (c) { try { c.abort(); } catch (e) {} }); }

  function redoSection(id) {
    syncFieldsFromDom();
    var s = findSection(id);
    if (!s || !s.raw.trim() || s.status === 'editing') return;
    useCap('sample').then(function (sample) {
      if (!sample) { showFlash('This page needs permission to use Claude for editing.'); return; }
      if (s.status === 'editing') return;
      var ctl = new AbortController();
      editControllers.push(ctl);
      s.status = 'editing'; paintSection(id);
      return writtenFor(s).then(function (written) { return runEditOnSection(s, sample, ctl.signal, false, written); }).then(function () {
        editControllers = editControllers.filter(function (c) { return c !== ctl; });
        paint();
        return saveSection(s.id).then(saveMeta);
      });
    });
  }

