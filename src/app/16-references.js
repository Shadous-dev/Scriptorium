/* 16-references.js — Checking every scripture reference against the Bible's own shape, what was said aloud, and the written script (SOURCE-OF-TRUTH 4.10). */
  /* ==================================================================
     References — checked, and never silently changed (SOURCE-OF-TRUTH 4.10)

     The edit pass works out each reference from memory, and it can be
     wrong: Luke 24:1 has come back as Luke 1:1. Everything here is code,
     so it costs nothing (4.6), and it runs each time a card is drawn —
     so a guide edited before this existed is checked too.

       1. the reference exists            Luke has 24 chapters, not 31
       2. it agrees with what was said    "verse one" in a guide on Luke 24
                                          is Luke 24:1
       3. it agrees with the written      the reference the teacher wrote
          script, when there is one       beside the same quotation

     When a check disagrees the reference is marked to check and the
     likelier ones are listed. A person chooses: nothing here replaces a
     reference on its own.

     Not here yet: matching a quotation's wording against a Bible carried
     in the page. `bibleCandidates` is the one place it plugs in.
     ================================================================== */

  // Every book, in the Bible's order, with how many chapters it has.
  var CANON = [['Genesis', 50], ['Exodus', 40], ['Leviticus', 27], ['Numbers', 36], ['Deuteronomy', 34], ['Joshua', 24], ['Judges', 21], ['Ruth', 4],
    ['1 Samuel', 31], ['2 Samuel', 24], ['1 Kings', 22], ['2 Kings', 25], ['1 Chronicles', 29], ['2 Chronicles', 36], ['Ezra', 10], ['Nehemiah', 13], ['Esther', 10],
    ['Job', 42], ['Psalms', 150], ['Proverbs', 31], ['Ecclesiastes', 12], ['Song of Songs', 8], ['Isaiah', 66], ['Jeremiah', 52], ['Lamentations', 5], ['Ezekiel', 48],
    ['Daniel', 12], ['Hosea', 14], ['Joel', 3], ['Amos', 9], ['Obadiah', 1], ['Jonah', 4], ['Micah', 7], ['Nahum', 3], ['Habakkuk', 3], ['Zephaniah', 3], ['Haggai', 2],
    ['Zechariah', 14], ['Malachi', 4], ['Matthew', 28], ['Mark', 16], ['Luke', 24], ['John', 21], ['Acts', 28], ['Romans', 16], ['1 Corinthians', 16], ['2 Corinthians', 13],
    ['Galatians', 6], ['Ephesians', 6], ['Philippians', 4], ['Colossians', 4], ['1 Thessalonians', 5], ['2 Thessalonians', 3], ['1 Timothy', 6], ['2 Timothy', 4],
    ['Titus', 3], ['Philemon', 1], ['Hebrews', 13], ['James', 5], ['1 Peter', 5], ['2 Peter', 3], ['1 John', 5], ['2 John', 1], ['3 John', 1], ['Jude', 1], ['Revelation', 22]];
  var CHAPTERS = {};
  CANON.forEach(function (b) { CHAPTERS[b[0]] = b[1]; });

  // Other ways a book is written. A numbered book is listed once, without its number.
  var BOOK_ALIASES = { Psalms: 'psalm|ps|pss', 'Song of Songs': 'song of solomon|canticles', Revelation: 'revelations|rev',
    Genesis: 'gen', Exodus: 'exod', Leviticus: 'lev', Deuteronomy: 'deut', Joshua: 'josh', Judges: 'judg', Samuel: 'sam', Kings: 'kgs', Chronicles: 'chron|chr',
    Nehemiah: 'neh', Esther: 'esth', Proverbs: 'prov', Ecclesiastes: 'eccl|eccles', Isaiah: 'isa', Jeremiah: 'jer', Lamentations: 'lam', Ezekiel: 'ezek',
    Daniel: 'dan', Hosea: 'hos', Obadiah: 'obad', Micah: 'mic', Nahum: 'nah', Habakkuk: 'hab', Zephaniah: 'zeph', Haggai: 'hag', Zechariah: 'zech', Malachi: 'mal',
    Matthew: 'matt', Romans: 'rom', Corinthians: 'cor', Galatians: 'gal', Ephesians: 'eph', Philippians: 'phil', Colossians: 'col', Thessalonians: 'thess',
    Timothy: 'tim', Philemon: 'phlm', Hebrews: 'heb', Peter: 'pet' };
  var BOOK_WORDS = {};                 // every spelling, lowercase → the book's name without any number
  var BOOK_COUNT = {};                 // "Samuel" → 2: how many books share that name
  CANON.forEach(function (b) {
    var m = /^([123]) (.+)$/.exec(b[0]), bare = m ? m[2] : b[0];
    BOOK_WORDS[bare.toLowerCase()] = bare;
    if (m) BOOK_COUNT[bare] = Math.max(BOOK_COUNT[bare] || 0, Number(m[1]));
  });
  Object.keys(BOOK_ALIASES).forEach(function (bare) {
    BOOK_ALIASES[bare].split('|').forEach(function (a) { BOOK_WORDS[a] = bare; });
  });
  var ORDINALS = { first: 1, second: 2, third: 3, '1st': 1, '2nd': 2, '3rd': 3, '1': 1, '2': 2, '3': 3 };
  var BOOK_PATTERN = '(?:(first|second|third|1st|2nd|3rd|[123])\\s*)?(' +
    Object.keys(BOOK_WORDS).sort(function (a, b) { return b.length - a.length; }).map(function (w) { return w.replace(/ /g, '\\s+'); }).join('|') + ')\\b\\.?';

  // The book a name means — "1 Samuel", "first samuel", "Ps", "Song of Solomon" — or '' when it is not one.
  function resolveBook(ordinal, word) {
    var bare = BOOK_WORDS[String(word || '').toLowerCase().replace(/\s+/g, ' ')];
    if (!bare) return '';
    var n = ordinal ? ORDINALS[String(ordinal).toLowerCase()] : 0;
    if (BOOK_COUNT[bare]) {
      if (!n) return bare === 'John' ? 'John' : '';                 // "Samuel" alone: which one?
      return n <= BOOK_COUNT[bare] ? n + ' ' + bare : '';
    }
    return n ? '' : bare;                                            // "2 Isaiah" is not a book
  }
  var BOOK_ONLY_RE = new RegExp('^\\s*' + BOOK_PATTERN + '\\s*$', 'i');
  function bookName(text) { var m = BOOK_ONLY_RE.exec(String(text || '')); return m ? resolveBook(m[1], m[2]) : ''; }
  // The first book named in a short phrase, with where its name starts and ends. Many books are ordinary words too
  // (job, mark, acts, numbers), so a name counts only where it is used as one: with a chapter after it, or opening
  // the phrase with nothing but a dash, a verse or the end after it. "Mark my words" is not the Gospel.
  function findBook(text) {
    var re = new RegExp('(?:^|[^a-z0-9])' + BOOK_PATTERN, 'ig'), m;
    text = String(text || '');
    while ((m = re.exec(text))) {
      var book = resolveBook(m[1], m[2]), end = m.index + m[0].length;
      var start = m.index + m[0].search(/[a-z0-9]/i);
      var rest = text.slice(end);
      if (book && (/^\s*[,:–—-]?\s*(?:chapters?\b|\d)/i.test(rest) || (!text.slice(0, start).trim() && /^\s*(?:$|[,:(–—-]|verses?\b|intro|conclusion)/i.test(rest)))) return { book: book, start: start, end: end };
      re.lastIndex = m.index + 1;
    }
    return null;
  }
  function displayBook(book) { return book === 'Psalms' ? 'Psalm' : book; }

  // "Luke 24:1", "Luke 1:30-33", "1 John 2:3", "Luke 23:56-24:1", "Jude 5", "Luke 24" → { book, chapter, verse, endChapter, endVerse }; null when it cannot be read.
  function parseRef(text) {
    var m = /^\s*(.+?)\.?\s+(\d{1,3})(?:\s*[:.]\s*(\d{1,3}))?(?:\s*[-–—]\s*(?:(\d{1,3})\s*:\s*)?(\d{1,3}))?\s*$/.exec(String(text || ''));
    if (!m) return null;
    var book = bookName(m[1]);
    if (!book) return null;
    var ref = { book: book, chapter: Number(m[2]), verse: m[3] ? Number(m[3]) : 0, endChapter: m[4] ? Number(m[4]) : 0, endVerse: m[5] ? Number(m[5]) : 0 };
    if (!m[3]) {
      if (CHAPTERS[book] === 1) { ref.verse = ref.chapter; ref.chapter = 1; }     // "Jude 5": a book of one chapter is cited by verse alone
      else if (m[5]) { ref.endChapter = ref.endVerse; ref.endVerse = 0; }         // "Luke 1-2": chapters
    }
    if (ref.endChapter && ref.endChapter === ref.chapter) ref.endChapter = 0;
    if (ref.endVerse && !ref.endChapter && ref.endVerse <= ref.verse) ref.endVerse = 0;
    return ref;
  }
  function formatRef(ref) {
    if (!ref || !ref.book || !ref.chapter) return '';
    var name = displayBook(ref.book);
    if (!ref.verse) return name + ' ' + ref.chapter + (ref.endChapter ? '-' + ref.endChapter : '');
    var end = ref.endChapter ? '-' + ref.endChapter + ':' + ref.endVerse : (ref.endVerse ? '-' + ref.endVerse : '');
    return CHAPTERS[ref.book] === 1 ? name + ' ' + ref.verse + (ref.endVerse ? '-' + ref.endVerse : '') : name + ' ' + ref.chapter + ':' + ref.verse + end;
  }

  // How many verses each chapter has. Filled in when the page carries a Bible; until then only chapters are checked.
  var VERSE_COUNTS = null;             // { 'Luke': [80, 52, …] }
  function versesIn(book, chapter) { var list = VERSE_COUNTS && VERSE_COUNTS[book]; return (list && list[chapter - 1]) || 0; }
  // '' when the reference names a real place, else a sentence saying what is wrong with it.
  function refProblem(ref) {
    var name = displayBook(ref.book), chapters = CHAPTERS[ref.book];
    function chapterBad(c) { return c < 1 || c > chapters; }
    if (chapterBad(ref.chapter) || (ref.endChapter && chapterBad(ref.endChapter))) {
      return chapters === 1 ? name + ' has one chapter.' : name + ' has ' + chapters + ' chapters, so there is no ' + name + ' ' + (chapterBad(ref.chapter) ? ref.chapter : ref.endChapter) + '.';
    }
    var count = versesIn(ref.book, ref.chapter);
    if (count && (ref.verse > count || (!ref.endChapter && ref.endVerse > count))) return name + ' ' + ref.chapter + ' has ' + count + ' verses.';
    var endCount = ref.endChapter ? versesIn(ref.book, ref.endChapter) : 0;
    if (endCount && ref.endVerse > endCount) return name + ' ' + ref.endChapter + ' has ' + endCount + ' verses.';
    return '';
  }

  // The reference phrase as it was spoken — "Verse one", "Job 2:4", "Isaiah 3 verses two through four",
  // "chapter 24, verse 1" — read for whatever it names: { book, chapter, verse, endVerse }, each 0 or '' when unsaid.
  function parseSpoken(text) {
    var t = digitsForWords(String(text || '').toLowerCase()).replace(/[–—]/g, '-');
    var out = { book: '', chapter: 0, verse: 0, endVerse: 0 }, found = findBook(t);
    if (found) out.book = found.book;
    var range = '(?:\\s*(?:-|through|thru|to|and)\\s*(\\d{1,3}))?';
    var colon = new RegExp('(\\d{1,3})\\s*:\\s*(\\d{1,3})' + range).exec(t);
    if (colon) { out.chapter = Number(colon[1]); out.verse = Number(colon[2]); out.endVerse = Number(colon[3]) || 0; }
    else {
      var ch = /\bchapters?\s+(\d{1,3})\b/.exec(t), vs = new RegExp('\\b(?:verses?|vv?\\.?|vs\\.?)\\s*(\\d{1,3})' + range).exec(t);
      if (ch) out.chapter = Number(ch[1]);
      else if (found) { var after = /^\s*(\d{1,3})\b/.exec(t.slice(found.end)); if (after) out.chapter = Number(after[1]); }
      if (vs) { out.verse = Number(vs[1]); out.endVerse = Number(vs[2]) || 0; }
      if (out.book && CHAPTERS[out.book] === 1 && out.chapter && !out.verse) { out.verse = out.chapter; out.chapter = 1; }
    }
    if (out.endVerse && out.endVerse <= out.verse) out.endVerse = 0;
    return out;
  }

  // What a guide is about, from its name and the book's title: "Luke – Chapter 24" → { book: 'Luke', chapter: 24 }.
  function guideRef(s) {
    // A book counts only when the name is plainly about it: "Luke – Chapter 24", "Luke 24", "Luke" — not "Acts of Kindness".
    function aboutBook(text) {
      var f = findBook(text);
      return (f && !String(text).slice(0, f.start).trim() && /^\s*(?:$|[-–—:,(]|\d|chapters?\b|intro|conclusion)/i.test(String(text).slice(f.end))) ? f : null;
    }
    var name = String((s && s.name) || ''), inName = aboutBook(name), found = inName || aboutBook(state.bookTitle), out = { book: found ? found.book : '', chapter: 0 };
    var ch = /\bchapter\s+(\d{1,3})\b/i.exec(name) || /^\s*(?:psalms?|ps\.?)\s+(\d{1,3})\b/i.exec(name);
    if (!ch && inName) ch = /^\s*[-–—:,]?\s*(\d{1,3})\b/.exec(name.slice(inName.end));
    if (ch) out.chapter = Number(ch[1]);
    if (out.book && CHAPTERS[out.book] === 1) out.chapter = 1;
    return out;
  }

  // Does the verse that was said fall inside the reference?
  function coversVerse(ref, verse) {
    if (!verse || !ref.verse) return true;
    return verse >= ref.verse && (ref.endChapter ? true : verse <= (ref.endVerse || ref.verse));
  }
  function sameRef(a, b) { var x = parseRef(a), y = parseRef(b); return !!(x && y) && formatRef(x) === formatRef(y); }

  // The seam for a Bible carried in the page: the references whose wording is closest to a quotation.
  // Returns [] until there is one.
  function bibleCandidates(/* quoteText */) { return []; }

  var refMemo = {};
  // One entry per verse of a guide: { issues: [sentence], suggestions: [{ ref, why }], confirmed: '' | 'written' }.
  function refChecks(s) {
    var verses = (s && s.verses) || [];
    var key = [s.name, state.bookTitle].concat(verses.map(function (v) { return [v.canonical, v.reference, v.written, v.byHand ? 1 : 0].join('\u0001'); })).join('\u0002');
    var memo = refMemo[s.id];
    if (memo && memo.key === key) return memo.result;
    var guide = guideRef(s), context = null;
    var result = verses.map(function (v) {
      var out = { issues: [], suggestions: [], confirmed: '' };
      var c = parseRef(v.canonical), sp = v.reference ? parseSpoken(v.reference) : { book: '', chapter: 0, verse: 0, endVerse: 0 };
      var w = v.written ? parseRef(v.written) : null;
      function suggest(ref, why) {
        if (!ref || refProblem(ref)) return;
        var text = formatRef(ref);
        if (!text || (v.canonical && sameRef(text, v.canonical)) || out.suggestions.some(function (x) { return x.ref === text; })) return;
        out.suggestions.push({ ref: text, why: why });
      }
      // The reference the words spoken point to, given the chapter they were spoken in. Keeps the length of a span the edit pass counted.
      function fromSpoken(base) {
        if (!base || !sp.verse) return null;
        var book = sp.book || base.book, chapter = sp.chapter || ((sp.book && sp.book !== base.book) ? 0 : base.chapter);
        if (!book || !chapter) return null;
        var end = sp.endVerse || ((c && c.endVerse && !c.endChapter) ? sp.verse + (c.endVerse - c.verse) : 0);
        return { book: book, chapter: chapter, verse: sp.verse, endChapter: 0, endVerse: end };
      }
      var bases = [guide].concat(context ? [context] : []);

      if (!v.byHand) {                                  // a reference a person set is theirs
        if (c) {
          var bad = refProblem(c);
          if (bad) out.issues.push(bad);
          var saidAs = 'The speaker said “' + String(v.reference || '').trim() + '”';
          if (sp.verse || sp.chapter || sp.book) {
            // A bare "verse one" can only be checked against a chapter the page knows: the guide's own, or one just named aloud.
            var named = bases.filter(function (b) { return b.book; }), placed = bases.filter(function (b) { return b.book && b.chapter; }), fits;
            if (sp.book) fits = c.book === sp.book && (!sp.chapter || c.chapter === sp.chapter);
            else if (sp.chapter) fits = c.chapter === sp.chapter && (!named.length || named.some(function (b) { return b.book === c.book; }));
            else fits = !placed.length || placed.some(function (b) { return b.book === c.book && b.chapter === c.chapter; });
            if (fits && (sp.book || sp.chapter || placed.length) && !coversVerse(c, sp.verse)) fits = false;
            if (!fits) {
              var bare = !sp.book && !sp.chapter;
              out.issues.push(saidAs + ((bare && guide.book && guide.chapter) ? ', and this guide is on ' + displayBook(guide.book) + ' ' + guide.chapter + '.' : '.'));
              if (sp.verse) bases.forEach(function (b) { suggest(fromSpoken(b), 'what was said aloud'); });
              else if (sp.chapter) suggest({ book: sp.book || c.book, chapter: sp.chapter, verse: c.verse, endChapter: 0, endVerse: c.endChapter ? 0 : c.endVerse }, 'what was said aloud');
            }
          }
          if (w) {
            if (w.book === c.book && w.chapter === c.chapter && (!w.verse || !c.verse || coversVerse(c, w.verse) || coversVerse(w, c.verse))) {
              out.confirmed = 'written'; out.issues = bad ? [bad] : []; out.suggestions = [];      // the teacher's own reference agrees: that settles what was said
            } else {
              out.issues.push('The written script has ' + formatRef(w) + ' beside this quotation.');
              out.suggestions = [];
              suggest(w, 'the written script');
              if (sp.verse) bases.forEach(function (b) { suggest(fromSpoken(b), 'what was said aloud'); });
            }
          }
          if (out.issues.length) bibleCandidates().forEach(function (hit) { suggest(hit, 'closest wording in the Bible'); });
        } else if (!String(v.canonical || '').trim()) {
          suggest(w, 'the written script');
          bases.forEach(function (b) { suggest(fromSpoken(b), 'what was said aloud'); });
        }
      }
      // What was named aloud carries forward: after "Isaiah 53", a bare "verse 5" may mean Isaiah 53:5.
      if (sp.book || sp.chapter) context = { book: sp.book || (context && context.book) || guide.book, chapter: sp.chapter || 0 };
      return out;
    });
    refMemo[s.id] = { key: key, result: result };
    return result;
  }
  // How many of a guide's references still need a person to look at them.
  function flaggedRefs(s) {
    var checks = refChecks(s);
    return ((s && s.verses) || []).filter(function (v, i) { return isUncertain(v) || checks[i].issues.length; }).length;
  }

  /* ---- The reference the teacher wrote down ---- */

  // Every reference written in a stretch of text, in order: [{ at, ref }]. A bare "7:13" takes the guide's book,
  // and "verse 13" its book and chapter.
  function refsIn(chunk, guide) {
    var found = [], taken = [], m;
    function add(at, len, ref) { if (ref && !refProblem(ref) && !taken.some(function (t) { return at < t[1] && at + len > t[0]; })) { found.push({ at: at, ref: ref }); taken.push([at, at + len]); } }
    var full = new RegExp('(?:^|[^A-Za-z0-9])(' + BOOK_PATTERN + '\\s+\\d{1,3}(?:\\s*:\\s*\\d{1,3})?(?:\\s*[-–—]\\s*(?:\\d{1,3}\\s*:\\s*)?\\d{1,3})?)', 'ig');
    while ((m = full.exec(chunk))) { var lead = m[0].length - m[1].length; add(m.index + lead, m[1].length, parseRef(m[1])); }
    var bare = /(?:^|[^\d:])(\d{1,3})\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?(?![\d:])/g;
    if (guide.book) while ((m = bare.exec(chunk))) {
      add(m.index + (/^\d/.test(m[0]) ? 0 : 1), m[0].length, { book: guide.book, chapter: Number(m[1]), verse: Number(m[2]), endChapter: 0, endVerse: Number(m[3]) > Number(m[2]) ? Number(m[3]) : 0 });
    }
    var verse = /\b(?:verses?|vv?\.|vs\.?|v)\s*(\d{1,3})(?:\s*(?:[-–—]|through|thru|to|and)\s*(\d{1,3}))?\b/ig;
    if (guide.book && guide.chapter) while ((m = verse.exec(chunk))) {
      add(m.index, m[0].length, { book: guide.book, chapter: guide.chapter, verse: Number(m[1]), endChapter: 0, endVerse: Number(m[2]) > Number(m[1]) ? Number(m[2]) : 0 });
    }
    return found.filter(function (f) { return f.ref.verse; }).sort(function (a, b) { return a.at - b.at; });
  }

  // The reference the written script gives for one quotation: the one right after it — "…get up.'" (Luke 7:13-14) —
  // else the nearest one before it — "In verse 13," — else ''. The quotation is found by its opening or closing words.
  function writtenRefFor(text, v, guide) {
    text = String(text || '');
    var head = v.startsWith ? locate(text, v.startsWith, 0, true) : null;
    var tail = v.endsWith ? locate(text, v.endsWith, head ? head.start : 0, true) : null;
    if (!head && !tail) return '';
    var start = head ? head.start : Math.max(0, tail.start - 400);
    var end = (tail && tail.end > start && tail.end - start < 2500) ? tail.end : (head ? head.end : tail.end);
    var after = refsIn(text.slice(end, end + 90), guide), before = refsIn(text.slice(Math.max(0, start - 160), start), guide);
    var pick = (after.length && after[0].at <= 12) ? after[0] : before.length ? before[before.length - 1] : after[0];
    return pick ? formatRef(pick.ref) : '';
  }
  // Called once, when the edit pass has run with a written script: each verse remembers what the teacher wrote beside it.
  function noteWrittenRefs(s, text) {
    var guide = guideRef(s);
    (s.verses || []).forEach(function (v) { v.written = writtenRefFor(text, v, guide); });
  }

  /* ---- Changing a reference: only ever by a person, and always listed (4.4, 4.10) ---- */

  var refEdit = null;                  // { id, i } while one reference is being typed over

  // Sets verse `i` of a guide to `text`. Returns '' when done, else why it was not.
  function setReference(id, i, text, why) {
    var s = findSection(id), v = s && s.verses && s.verses[i];
    if (!v) return 'That quotation isn’t there any more.';
    var ref = parseRef(text);
    if (!ref) return 'That isn’t a reference the page can read. Write it like Luke 24:1 or Luke 1:30-33.';
    var bad = refProblem(ref);
    if (bad) return bad;
    var next = formatRef(ref), was = String(v.canonical || '').trim();
    if (next !== was || v.confidence === 'low') {
      s.edits = (s.edits || []).concat([{ find: was || '(no reference)', replace: next, kind: 'hand', note: 'reference — ' + why }]);
      s.changeCount = s.edits.length;
      v.canonical = next; v.confidence = 'high'; v.note = ''; v.byHand = true;
      clearApproval(s); touchBook();            // the reference is part of what is published
    }
    return '';
  }
  function useSuggestedRef(id, i, text) {
    var s = findSection(id), check = s && refChecks(s)[i];
    var hit = check && check.suggestions.filter(function (x) { return x.ref === text; })[0];
    if (!hit) return;
    var problem = setReference(id, i, text, 'chosen from ' + hit.why);
    if (problem) { showFlash(problem); return; }
    refEdit = null; paint();
    saveSection(id).then(saveMeta);
  }
  function startRefEdit(id, i) {
    refEdit = { id: id, i: i }; paintSection(id);
    var box = root.querySelector('[data-ref-input]');
    if (box) { try { box.focus(); box.select(); } catch (e) {} }
  }
  function saveRefEdit() {
    if (!refEdit) return;
    var box = root.querySelector('[data-ref-input]'), id = refEdit.id;
    var problem = setReference(id, refEdit.i, box ? box.value : '', 'typed by hand');
    if (problem) { showFlash(problem); return; }
    refEdit = null; paint();
    saveSection(id).then(saveMeta);
  }
  function cancelRefEdit() { var id = refEdit && refEdit.id; refEdit = null; if (id) paintSection(id); }
