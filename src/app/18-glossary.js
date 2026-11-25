/* 18-glossary.js — The glossary: Bible names and terms, how Descript mishears them, and what the page writes down. SOURCE-OF-TRUTH 4.12. */
  /* ==================================================================
     What the page notices is written down, so the same problem is not fixed twice. A person decides what is kept.

     Three kinds of document, all shared with the whole team and none of them inside a book:

       learned/<book>_<guide>   what one approved guide showed: the misheard words put right in it. Evidence.
       written/<id>.terms       the names found in one written script. Evidence.
       glossary/<key>           a person's ruling on one term: approved or turned down. The glossary itself.

     Evidence has no effect. Only a term a person approved is told to the edit pass and counted as a listed
     name by the wording check, and the page never replaces a word because the glossary lists it. Nothing
     here calls Claude (4.6).
     ================================================================== */

  var GLOSS_TEXT_MAX = 60, GLOSS_WORDS_MAX = 4;        // one term, or one mishearing of it
  var GLOSS_HEARD_MAX = 40, GLOSS_BOOKS_MAX = 20;      // kept on one term
  var GLOSS_PAIRS_MAX = 60, GLOSS_USED_MAX = 80;       // kept for one guide
  var GLOSS_NAMES_MAX = 40, GLOSS_NAMES_CHARS = 500;   // sent with one guide (4.6): names from its book of the Bible
  var GLOSS_HINTS_MAX = 30;                            // sent with one guide: known mishearings that occur in it
  var GLOSS_SHOWN_MAX = 300;                           // rows drawn in one list
  var GLOSS_FRESH_MS = 60000;                          // how long a read of the glossary is trusted before an edit pass
  var GLOSS_PAGES_MAX = 8;

  var glossary = Object.create(null);  // key → { key, term, status, heard, notHeard, books, seen, at }
  var glossaryAt = 0;                  // when it was last read
  var glossaryStamp = 0;               // goes up whenever it changes
  var glossaryMore = false;            // true when the store holds more than could be read
  var learnedLogs = [];                // the evidence, read only for the Glossary page
  var learnedMore = false;
  var glossView = null;                // the Glossary page: { query, picked, busy, error, term, heard, copyText, scan }

  // The time a document is written, never the same twice from one page. A long list is read a page at a time in
  // the order of these times, and many terms approved in one go would otherwise share one.
  var lastStamp = 0;
  function stampNow() { var t = Date.now(); lastStamp = t > lastStamp ? t : lastStamp + 1; return lastStamp; }

  /* ---- Words ---- */

  // A term or a mishearing as it is kept: nothing around it but letters and digits, single spaces, no
  // possessive, and short. '' when it is not something to keep. Inside it only letters, digits, spaces,
  // hyphens and apostrophes are let through: these words are shown on the page and sent to the edit pass,
  // and come from a store anyone with access can write to, so nothing that could pass for markup or for an
  // instruction's punctuation is kept.
  function glossText(text) {
    var raw = String(text == null ? '' : text), plain = '', i, c;
    for (i = 0; i < raw.length && i < 400; i++) { c = raw.charCodeAt(i); plain += c < 32 || c === 127 ? ' ' : raw.charAt(i); }   // no control characters
    var t = plain.replace(/[^\p{L}\p{N}\p{M}'’ -]+/gu, ' ').replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '').replace(/['’]s$/i, '');
    if (!t || t.length > GLOSS_TEXT_MAX || t.split(' ').length > GLOSS_WORDS_MAX) return '';
    return t;
  }
  // The name a term is stored under: its letters and digits. "Beth-el", "Bethel" and "bethel" are one term.
  function termKey(term) {
    var k = glossText(term).toLowerCase().replace(/[^a-z0-9]+/g, '');
    return k && k.length <= 80 ? 'g_' + k : '';
  }
  function heardKey(text) { return wordingKey(glossText(text)); }
  function glossStrings(list, max) {
    var out = [], seen = Object.create(null);
    (Array.isArray(list) ? list : []).forEach(function (v) {
      if (typeof v !== 'string') return;
      var t = glossText(v), k = t.toLowerCase();
      if (!t || seen[k] || out.length >= max) return;
      seen[k] = true; out.push(t);
    });
    return out;
  }
  function isApproved(key) { var d = glossary[key]; return !!d && d.status === 'approved'; }
  function approvedTerms() { return Object.keys(glossary).map(function (k) { return glossary[k]; }).filter(function (d) { return d.status === 'approved'; }); }

  // Where two runs of text differ in wording, word for word: [{ heard, term }]. Punctuation and capitals are not wording.
  function wordSwaps(find, repl) {
    var a = String(find || '').match(/\S+/g) || [], b = String(repl || '').match(/\S+/g) || [];
    if (!a.length || !b.length || a.length > 80 || b.length > 80) return [];
    var pairs = matchWords(a.map(wordingKey), b.map(wordingKey), 400), out = [], pa = -1, pb = -1;
    if (!pairs) return [];
    function gap(toA, toB) {
      if (toA - pa <= 1 && toB - pb <= 1) return;
      var was = a.slice(pa + 1, toA).join(' '), now = b.slice(pb + 1, toB).join(' ');
      if (!wordingKey(was) || !wordingKey(now) || wordingKey(was) === wordingKey(now)) return;
      out.push({ heard: was, term: now });
    }
    pairs.forEach(function (p) { gap(p[0], p[1]); pa = p[0]; pb = p[1]; });
    gap(a.length, b.length);
    return out;
  }
  // Two everyday words that are spelled differently and sound the same (their / there). The wording check
  // already knows these, and they are not Bible terms.
  function everydayHomophones(heard, term) {
    var a = letterWords(heard), b = letterWords(term);
    return a.length === 1 && b.length === 1 && !!HOMOPHONE_GROUP[a[0]] && HOMOPHONE_GROUP[a[0]] === HOMOPHONE_GROUP[b[0]] && !/[A-Z]/.test(term);
  }
  function flatWords(text) { return ' ' + String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' '; }

  /* ---- What one approved guide showed (the evidence) ---- */

  // The misheard words put right in a guide, from its own list of changes: by the edit pass, by hand, and by
  // hand after the page had refused them. A fix a person reversed is kept apart, against the pair.
  function guideEvidence(s) {
    var pass = [], hand = [], refused = [];
    (s.edits || []).forEach(function (e) {
      if (!e) return;
      if (e.kind === 'misheard' || e.kind === 'verse-fix') pass = pass.concat(wordSwaps(e.find, e.replace));
      else if (e.kind === 'hand' && e.note === 'changed by hand' && String(e.find).indexOf('…') === -1 && String(e.replace).indexOf('…') === -1) hand = hand.concat(wordSwaps(e.find, e.replace));
    });
    (s.suggested || []).forEach(function (e) { if (e) refused = refused.concat(wordSwaps(e.find, e.replace)); });
    var final = flatWords(s.corrected), seen = Object.create(null), pairs = [], undone = [];
    function same(x, y) { return wordingKey(x) === wordingKey(y); }
    function inFinal(term) { return final.indexOf(flatWords(term)) !== -1; }
    function add(list, heard, term, from) {
      heard = glossText(heard).toLowerCase(); term = glossText(term);
      var key = termKey(term), id = key + '|' + wordingKey(heard);
      if (!heard || !key || seen[id] || everydayHomophones(heard, term)) return;
      seen[id] = true; list.push({ heard: heard, term: term, from: from });
    }
    function reverses(h, p) { return same(h.heard, p.term) && same(h.term, p.heard); }
    pass.forEach(function (p) {
      if (hand.some(function (h) { return reverses(h, p); })) { if (undone.length < 30) add(undone, p.heard, p.term, 'undone'); }
      else if (inFinal(p.term) && pairs.length < GLOSS_PAIRS_MAX) add(pairs, p.heard, p.term, 'pass');
    });
    hand.forEach(function (h) {
      if (pass.some(function (p) { return reverses(h, p); }) || !inFinal(h.term) || pairs.length >= GLOSS_PAIRS_MAX) return;
      // A hand change counts only when it could be a mishearing: the new word is a name, or sounds like the old one.
      if (!/\p{Lu}/u.test(h.term) && !soundsAlike(h.heard, h.term, [lettersOf(h.term)])) return;
      add(pairs, h.heard, h.term, refused.some(function (r) { return same(r.heard, h.heard) && same(r.term, h.term); }) ? 'refused' : 'hand');
    });
    var used = approvedTerms().filter(function (d) { return final.indexOf(flatWords(d.term)) !== -1; }).slice(0, GLOSS_USED_MAX).map(function (d) { return d.term; });
    return { at: stampNow(), book: guideRef(s).book || '', bookTitle: String(state.bookTitle || '').slice(0, 120), guide: String(s.name || '').slice(0, 160), pairs: pairs, undone: undone, used: used };
  }
  function learnedId(book, id) { var out = (String(book || '') + '_' + String(id || '')).replace(/[^A-Za-z0-9_-]/g, ''); return out.length > 2 && out.length <= 120 ? out : ''; }

  // Called when a person approves a guide as its Final Transcript. One small write; a failure here never
  // stands in the way of the approval, because the evidence is a convenience and the approval is the work.
  function learnFromGuide(s) {
    if (!dbApi || !dbRoot || !bookId || !s || !s.corrected) return Promise.resolve();
    var doc, id = learnedId(bookId, s.id);
    try { doc = guideEvidence(s); } catch (err) { console.warn('Scriptorium: could not read what this guide showed', err); return Promise.resolve(); }
    if (!id || tooLarge(doc, 'What this guide showed')) return Promise.resolve();
    return inOrder('learned:' + id, function () { return dbRoot.doc('learned/' + id).set(doc); }).then(function () {
      return noteBooks(doc);
    }).catch(function (err) { console.warn('Scriptorium: could not write down what this guide showed', err); });
  }
  // An approved term used in a book of the Bible it was not yet listed for is listed for it, so the next guide
  // on that book is told the name. A handful at most for one guide.
  function noteBooks(doc) {
    if (!doc.book) return Promise.resolve();
    var keys = doc.used.concat(doc.pairs.map(function (p) { return p.term; })).map(termKey).filter(function (k, i, all) {
      var d = glossary[k];
      return all.indexOf(k) === i && d && d.status === 'approved' && d.books.indexOf(doc.book) === -1 && d.books.length < GLOSS_BOOKS_MAX;
    }).slice(0, 8);
    return keys.reduce(function (before, key) {
      return before.then(function () {
        var d = glossary[key], books = d.books.concat([doc.book]);
        return inOrder('g:' + key, function () { return dbRoot.doc('glossary/' + key).update({ books: books }); }).then(function () { d.books = books; glossaryStamp += 1; }, function () {});
      });
    }, Promise.resolve());
  }
  function logFromDoc(id, d) {
    d = d || {};
    function rows(list, max) {
      return flatRows(list).map(function (r) { return { heard: glossText(r.heard).toLowerCase(), term: glossText(r.term), from: r.from === 'hand' || r.from === 'refused' ? r.from : 'pass' }; })
        .filter(function (r) { return r.heard && termKey(r.term); }).slice(0, max);
    }
    return { id: id, at: Number(d.at) || 0, book: typeof d.book === 'string' ? d.book.slice(0, 40) : '', guide: typeof d.guide === 'string' ? d.guide.slice(0, 160) : '',
             pairs: rows(d.pairs, GLOSS_PAIRS_MAX), undone: rows(d.undone, 30) };
  }

  /* ---- The glossary: what a person ruled ---- */

  function decisionFromDoc(key, d) {
    d = d || {};
    var status = d.status === 'approved' ? 'approved' : d.status === 'rejected' ? 'rejected' : '', term = glossText(d.term);
    if (!status || !term || termKey(term) !== key) return null;             // a document under the wrong name is not a ruling
    return { key: key, term: term, status: status, heard: glossStrings(d.heard, GLOSS_HEARD_MAX).map(function (h) { return h.toLowerCase(); }),
             notHeard: glossStrings(d.notHeard, GLOSS_HEARD_MAX).map(function (h) { return h.toLowerCase(); }),
             books: (Array.isArray(d.books) ? d.books : []).filter(function (b) { return typeof b === 'string' && b && b.length <= 40; }).slice(0, GLOSS_BOOKS_MAX),
             seen: Number(d.seen) || 0, at: Number(d.at) || 0 };
  }
  function decisionDoc(d) { return { term: d.term, status: d.status, heard: d.heard, notHeard: d.notHeard, books: d.books, seen: d.seen, at: d.at }; }
  function loadGlossary() {
    if (!dbRoot) return Promise.resolve();
    return readListing('glossary', GLOSS_PAGES_MAX).then(function (got) {
      var next = Object.create(null);
      got.docs.forEach(function (doc) {
        if (!doc || typeof doc.id !== 'string') return;
        var d = decisionFromDoc(doc.id, doc.data());
        if (d) next[d.key] = d;
      });
      glossary = next; glossaryMore = got.more; glossaryAt = Date.now(); glossaryStamp += 1;
    }).catch(function (err) { console.warn('Scriptorium: could not read the glossary', err); });
  }
  // Before an edit pass: the glossary as it stands now, so a teammate's approval made a minute ago counts.
  function freshGlossary() { return Date.now() - glossaryAt < GLOSS_FRESH_MS ? Promise.resolve() : loadGlossary(); }
  function loadLearned() {
    if (!dbRoot) return Promise.resolve();
    return readListing('learned', GLOSS_PAGES_MAX).then(function (got) {
      learnedLogs = got.docs.filter(function (doc) { return doc && typeof doc.id === 'string'; }).map(function (doc) { return logFromDoc(doc.id, doc.data()); });
      learnedMore = got.more;
    }).catch(function (err) { console.warn('Scriptorium: could not read what the guides have shown', err); });
  }
  function putDecision(d) {
    var doc = decisionDoc(d);
    if (tooLarge(doc, 'This term')) return Promise.reject({ code: 'too_large' });
    return inOrder('g:' + d.key, function () { return dbRoot.doc('glossary/' + d.key).set(doc); }).then(function () { glossary[d.key] = d; glossaryStamp += 1; });
  }

  /* ---- What the edit pass and the wording check are given ---- */

  var glossNamesMemo = { stamp: -1, list: [] };
  // Every approved term, as letters only: the wording check counts each as a listed name (4.12). A listed name
  // loosens how alike two words must sound, and with a whole team's glossary behind it that is too loose for a
  // very short name: with "On" listed, "in" could become "on". So a name under four letters is not listed here.
  // It still gets through where the sounds truly match, or where a person approved that exact mishearing.
  function glossaryNames() {
    if (glossNamesMemo.stamp !== glossaryStamp) glossNamesMemo = { stamp: glossaryStamp, list: approvedTerms().map(function (d) { return lettersOf(d.term); }).filter(function (n) { return n.length >= 4; }) };
    return glossNamesMemo.list;
  }
  // Did a person approve "this was heard, and that is what it stood for"?
  function glossaryAllows(was, now) {
    var d = glossary[termKey(now)], k = heardKey(was);
    return !!d && d.status === 'approved' && !!k && d.heard.some(function (h) { return wordingKey(h) === k; });
  }
  // What one guide's edit call is told (4.6): approved terms from the guide's own book of the Bible that the
  // book's Words to Search For does not already list, and the approved mishearings that occur in this text.
  function glossaryFor(s, text) {
    var out = { names: [], hints: [] }, approved = approvedTerms();
    if (!approved.length) return out;
    var flat = flatWords(text), book = guideRef(s).book, listed = listedWords(), chars = 0;
    approved.forEach(function (d) {
      d.heard.forEach(function (h) { if (out.hints.length < GLOSS_HINTS_MAX && flat.indexOf(flatWords(h)) !== -1) out.hints.push({ heard: h, term: d.term }); });
    });
    if (book) {
      approved.filter(function (d) { return d.books.indexOf(book) !== -1 && listed.indexOf(lettersOf(d.term)) === -1; })
        .sort(function (a, b) { return (b.seen - a.seen) || naturalCompare(a.term, b.term); })
        .forEach(function (d) {
          if (out.names.length >= GLOSS_NAMES_MAX || chars + d.term.length + 2 > GLOSS_NAMES_CHARS) return;
          out.names.push(d.term); chars += d.term.length + 2;
        });
    }
    return out;
  }

  /* ---- What is waiting for a person ---- */

  // The evidence added up: one row for each term, with how it was heard, in how many guides and written
  // scripts, and in which books. Counts are worked out here every time, never stored, so two people
  // approving guides at the same moment cannot lose one.
  function glossaryEvidence() {
    var map = Object.create(null);
    function entry(term) {
      var key = termKey(term); if (!key) return null;
      var p = map[key] || (map[key] = { key: key, forms: Object.create(null), heard: Object.create(null), guides: 0, scripts: 0, books: Object.create(null), from: Object.create(null) });
      p.forms[term] = (p.forms[term] || 0) + 1;
      return p;
    }
    function heardOf(p, text) { var k = wordingKey(text); return k ? (p.heard[k] || (p.heard[k] = { key: k, text: text, guides: 0, undone: 0, refused: false })) : null; }
    learnedLogs.forEach(function (log) {
      var counted = Object.create(null);
      log.pairs.forEach(function (pr) {
        var p = entry(pr.term), h = p && heardOf(p, pr.heard); if (!h) return;
        h.guides += 1; if (pr.from === 'refused') h.refused = true;
        p.from[pr.from === 'pass' ? 'pass' : 'hand'] = true;
        if (!counted[p.key]) { counted[p.key] = true; p.guides += 1; }
        if (log.book) p.books[log.book] = true;
      });
      log.undone.forEach(function (pr) { var p = entry(pr.term), h = p && heardOf(p, pr.heard); if (h) h.undone += 1; });
    });
    writtenIndex.forEach(function (w) {
      (w.terms || []).forEach(function (t) { var p = entry(t); if (!p) return; p.scripts += 1; p.from.script = true; if (w.book) p.books[w.book] = true; });
    });
    return map;
  }
  // How a term is written when its sources disagree: the way most of them wrote it, capitals winning a tie.
  function bestForm(p) {
    return Object.keys(p.forms).sort(function (a, b) { return (p.forms[b] - p.forms[a]) || (/\p{Lu}/u.test(b) ? 1 : 0) - (/\p{Lu}/u.test(a) ? 1 : 0) || naturalCompare(a, b); })[0];
  }
  // The rows waiting for a ruling: a term nobody has ruled on, or an approved term heard in a new way.
  function glossaryWaiting(map) {
    map = map || glossaryEvidence();
    return Object.keys(map).map(function (key) {
      var p = map[key], d = glossary[key];
      if (d && d.status !== 'approved') return null;
      var heard = Object.keys(p.heard).map(function (k) { return p.heard[k]; }).filter(function (h) {
        return h.guides > 0 && !(d && (d.heard.concat(d.notHeard)).some(function (x) { return wordingKey(x) === h.key; }));
      }).sort(function (a, b) { return b.guides - a.guides; }).slice(0, GLOSS_HEARD_MAX);
      if (d && !heard.length) return null;
      if (!d && !heard.length && !p.scripts) return null;                  // only ever seen being undone: nothing to approve
      return { key: key, term: d ? d.term : bestForm(p), isNew: !d, heard: heard, guides: p.guides, scripts: p.scripts, books: Object.keys(p.books).sort(naturalCompare), from: p.from };
    }).filter(Boolean).sort(function (a, b) { return (b.guides - a.guides) || (b.scripts - a.scripts) || naturalCompare(a.term, b.term); });
  }

  /* ---- A person's rulings ---- */

  function glossFail(message) { if (glossView) { glossView.busy = ''; glossView.error = message; paint(); } }
  function glossProblem(err) {
    var code = err && err.code;
    if (code === 'invalid_argument') return 'That couldn’t be saved. Your access to this artifact may be view-only — ask its owner to make you a Contributor.';
    if (code === 'quota_exceeded') return 'The Scriptorium’s storage is full. Remove something that is no longer needed, then try again.';
    return 'That couldn’t be saved just now — try again.';
  }
  // Applies one change to each picked row, one write at a time. Stops at the first that fails and says so;
  // what was saved before it stays saved.
  function ruleOn(keys, change, busy) {
    var v = glossView;
    if (!v || v.busy || !keys.length) return Promise.resolve();
    if (!dbRoot) { glossFail('Saved work can’t be reached in this view.'); return Promise.resolve(); }
    v.busy = busy; v.error = ''; paint();
    // The glossary is read again first: a teammate may have ruled on some of these since this page was opened.
    return loadGlossary().then(function () {
      var map = glossaryEvidence(), rows = glossaryWaiting(map), i = 0;
      function next() {
        if (i >= keys.length) return Promise.resolve();
        var key = keys[i]; i += 1;
        var d = change(key, rows.filter(function (r) { return r.key === key; })[0], map[key]);
        return (d ? putDecision(d) : Promise.resolve()).then(function () { delete v.picked[key]; }).then(next);
      }
      return next();
    }).then(function () { if (glossView === v) { v.busy = ''; paint(); } }, function (err) {
      console.warn('Scriptorium: could not save to the glossary', err);
      if (glossView === v) glossFail(glossProblem(err));
    });
  }
  function union(a, b, max) { return glossStrings((a || []).concat(b || []), max).map(function (x) { return x.toLowerCase(); }); }
  function pickedKeys() { return glossView ? Object.keys(glossView.picked).filter(function (k) { return glossView.picked[k]; }) : []; }
  function approveTerms() {
    return ruleOn(pickedKeys(), function (key, row, ev) {
      if (!row) return null;                                          // ruled on by someone else in the meantime
      var d = glossary[key], heard = row.heard.map(function (h) { return h.text; }), books = Object.keys((ev && ev.books) || {});
      return { key: key, term: d ? d.term : row.term, status: 'approved', heard: union(d && d.heard, heard, GLOSS_HEARD_MAX), notHeard: d ? d.notHeard : [],
               books: (d ? d.books : []).concat(books).filter(function (b, n, all) { return all.indexOf(b) === n; }).slice(0, GLOSS_BOOKS_MAX),
               seen: row.guides + row.scripts, at: stampNow() };
    }, 'approve');
  }
  // "Not a term" for one nobody had ruled on; for an approved term heard in a new way, "not a mishearing of it".
  function rejectTerms() {
    return ruleOn(pickedKeys(), function (key, row) {
      if (!row) return null;
      var d = glossary[key], heard = row.heard.map(function (h) { return h.text; });
      if (d) return { key: key, term: d.term, status: 'approved', heard: d.heard, notHeard: union(d.notHeard, heard, GLOSS_HEARD_MAX), books: d.books, seen: d.seen, at: stampNow() };
      return { key: key, term: row.term, status: 'rejected', heard: [], notHeard: [], books: [], seen: 0, at: stampNow() };
    }, 'reject');
  }
  function oneRuling(key, change, busy) {
    if (!glossView || glossView.busy || !glossary[key]) return Promise.resolve();
    var v = glossView; v.busy = busy; v.error = ''; paint();
    return Promise.resolve().then(function () { return change(glossary[key]); }).then(function () { if (glossView === v) { v.busy = ''; paint(); } }, function (err) {
      console.warn('Scriptorium: could not save to the glossary', err);
      if (glossView === v) glossFail(glossProblem(err));
    });
  }
  // Takes an approved term out. It is kept as turned down, so the evidence does not bring it straight back.
  function removeTerm(key) {
    return oneRuling(key, function (d) { return putDecision({ key: key, term: d.term, status: 'rejected', heard: [], notHeard: [], books: [], seen: 0, at: stampNow() }); }, 'remove');
  }
  // One way of hearing an approved term, taken out and remembered as not one.
  function removeHeard(key, n) {
    return oneRuling(key, function (d) {
      var h = d.heard[n]; if (h == null) return null;
      return putDecision({ key: key, term: d.term, status: d.status, heard: d.heard.filter(function (x, i) { return i !== n; }), notHeard: union(d.notHeard, [h], GLOSS_HEARD_MAX), books: d.books, seen: d.seen, at: stampNow() });
    }, 'remove');
  }
  // A turned-down term forgotten: if the evidence still shows it, it waits for approval again.
  function restoreTerm(key) {
    return oneRuling(key, function () {
      return inOrder('g:' + key, function () { return dbRoot.doc('glossary/' + key).delete(); }).then(function () { delete glossary[key]; glossaryStamp += 1; });
    }, 'remove');
  }
  // A term typed in by a person: approved as it is entered, since typing it is the ruling.
  function addTerm() {
    var v = glossView;
    if (!v || v.busy) return Promise.resolve();
    var term = glossText(v.term), key = termKey(term), heard = String(v.heard || '').split(/[,;\n]+/).map(glossText).filter(Boolean);
    if (!key) { glossFail('Type the term as it should be spelled: one to four words, such as “Zophar” or “Beth Shemesh”.'); return Promise.resolve(); }
    if (!dbRoot) { glossFail('Saved work can’t be reached in this view.'); return Promise.resolve(); }
    v.busy = 'add'; v.error = ''; paint();
    return loadGlossary().then(function () {
      var d = glossary[key];
      return putDecision({ key: key, term: d && d.status === 'approved' ? d.term : term, status: 'approved', heard: union(d && d.status === 'approved' ? d.heard : [], heard, GLOSS_HEARD_MAX),
                           notHeard: d ? d.notHeard.filter(function (x) { return !heard.some(function (h) { return wordingKey(h) === wordingKey(x); }); }) : [],
                           books: d ? d.books : [], seen: d ? d.seen : 0, at: stampNow() });
    }).then(function () { if (glossView === v) { v.busy = ''; v.term = ''; v.heard = ''; paint(); } }, function (err) {
      console.warn('Scriptorium: could not add to the glossary', err);
      if (glossView === v) glossFail(glossProblem(err));
    });
  }

  /* ---- Written scripts saved before the glossary existed ---- */

  function unscanned() { return writtenIndex.filter(function (w) { return !w.terms; }); }
  // Reads each one's text once and keeps the names found in it on its listing. Nothing else about it changes.
  function scanWritten() {
    var v = glossView, todo = unscanned();
    if (!v || v.busy || v.scan || !todo.length || !dbRoot) return Promise.resolve();
    var scan = v.scan = { done: 0, total: todo.length, failed: 0, stop: false };
    paint();
    function show() { var p = root.querySelector('.gloss-scan-progress'); if (p) p.textContent = scanText(scan); }
    function next() {
      var w = todo.shift();
      if (!w || scan.stop || glossView !== v || scan.failed > 5) return Promise.resolve();
      var kept = writtenTexts[w.id] != null;
      return readWrittenText(w.id).then(function (text) {
        var terms = writtenTerms(text);
        if (!kept) delete writtenTexts[w.id];                         // a whole library's text is not held in memory
        return dbRoot.doc('written/' + w.id).update({ terms: terms }).then(function () { w.terms = terms; });
      }).then(function () { scan.done += 1; }, function (err) { console.warn('Scriptorium: could not scan a written script', err); scan.failed += 1; }).then(function () { show(); return next(); });
    }
    return next().then(function () { if (glossView === v) { v.scan = null; if (scan.failed) v.error = scan.failed + ' written script' + plural(scan.failed) + ' could not be scanned. Try again in a moment.'; paint(); } });
  }
  function scanText(scan) { return 'Scanning written scripts: ' + scan.done + ' of ' + scan.total + '…'; }

  /* ---- The Glossary page ---- */

  function openGlossary() {
    view = 'glossary'; flash = null; dbStatus = 'loading';
    glossView = { query: '', picked: {}, busy: '', error: '', term: '', heard: '', copyText: '', scan: null };
    paint();
    function done() { dbStatus = 'ready'; paint(); }
    return Promise.all([loadGlossary(), loadLearned(), loadWrittenIndex()]).then(done, done);
  }
  function glossMatches(text) {
    var q = glossView.query.trim().toLowerCase().split(/\s+/).filter(Boolean), hay = String(text).toLowerCase();
    return q.every(function (word) { return hay.indexOf(word) !== -1; });
  }
  function whereFrom(row) {
    var bits = [];
    if (row.guides) bits.push('put right in ' + row.guides + ' approved guide' + plural(row.guides));
    if (row.scripts) bits.push('in ' + row.scripts + ' written script' + plural(row.scripts));
    if (row.books.length) bits.push(row.books.slice(0, 4).map(displayBook).join(', ') + (row.books.length > 4 ? ' and ' + (row.books.length - 4) + ' more' : ''));
    return bits.join(' · ');
  }
  function renderWaitingRow(row) {
    var v = glossView, heard = row.heard.map(function (h) {
      return '<span class="gloss-heard">“' + esc(h.text) + '”' + (h.guides > 1 ? ' ×' + h.guides : '') + (h.refused ? ' <em>the page had refused this</em>' : '') + (h.undone ? ' <em>undone ' + h.undone + ' time' + plural(h.undone) + '</em>' : '') + '</span>';
    }).join('');
    return '<label class="gloss-row"><input type="checkbox" data-action="gloss-pick" data-id="' + escAttr(row.key) + '"' + (v.picked[row.key] ? ' checked' : '') + (v.busy ? ' disabled' : '') + '>' +
      '<span class="gloss-main"><span class="gloss-term">' + esc(row.term) + '</span>' + (row.isNew ? '' : ' <span class="gloss-tag">already approved · heard a new way</span>') +
      (heard ? '<span class="gloss-heard-line">heard as ' + heard + '</span>' : '') +
      '<span class="gloss-meta">' + esc(whereFrom(row)) + '</span></span></label>';
  }
  function renderApprovedRow(d) {
    var v = glossView, dis = v.busy ? ' disabled' : '';
    var heard = d.heard.map(function (h, n) {
      return '<span class="gloss-heard">“' + esc(h) + '” <button type="button" class="gloss-x" data-action="gloss-unheard" data-id="' + escAttr(d.key) + '" data-n="' + n + '" aria-label="Remove this mishearing" title="Not a mishearing of ' + escAttr(d.term) + '"' + dis + '>×</button></span>';
    }).join('');
    return '<div class="gloss-row"><span class="gloss-main"><span class="gloss-term">' + esc(d.term) + '</span>' +
      (heard ? '<span class="gloss-heard-line">heard as ' + heard + '</span>' : '') +
      (d.books.length ? '<span class="gloss-meta">' + esc(d.books.slice(0, 6).map(displayBook).join(', ') + (d.books.length > 6 ? ' and ' + (d.books.length - 6) + ' more' : '')) + '</span>' : '') + '</span>' +
      '<button type="button" class="link-btn" data-action="gloss-remove" data-id="' + escAttr(d.key) + '"' + dis + '>Remove</button></div>';
  }
  function capped(rows, draw) {
    return rows.slice(0, GLOSS_SHOWN_MAX).map(draw).join('') +
      (rows.length > GLOSS_SHOWN_MAX ? '<p class="hint">Showing the first ' + GLOSS_SHOWN_MAX + ' of ' + rows.length.toLocaleString('en-US') + '. Search to narrow the list.</p>' : '');
  }
  function renderGlossaryLists() {
    var v = glossView, dis = v.busy ? ' disabled' : '';
    var waiting = glossaryWaiting().filter(function (r) { return glossMatches(r.term + ' ' + r.heard.map(function (h) { return h.text; }).join(' ') + ' ' + r.books.join(' ')); });
    var all = Object.keys(glossary).map(function (k) { return glossary[k]; }).filter(function (d) { return glossMatches(d.term + ' ' + d.heard.join(' ') + ' ' + d.books.join(' ')); });
    var approved = all.filter(function (d) { return d.status === 'approved'; }).sort(function (a, b) { return naturalCompare(a.term, b.term); });
    var turned = all.filter(function (d) { return d.status === 'rejected'; }).sort(function (a, b) { return naturalCompare(a.term, b.term); });
    var picked = pickedKeys().length, shown = waiting.slice(0, GLOSS_SHOWN_MAX), allPicked = shown.length > 0 && shown.every(function (r) { return v.picked[r.key]; });
    return '<section class="gloss-section"><h2 class="gloss-head">Waiting for approval <span class="gloss-count">' + waiting.length.toLocaleString('en-US') + '</span></h2>' +
      (waiting.length ?
        '<p class="hint">Each of these was noticed in a guide a person approved, or in a written script. Nothing here has any effect until you approve it. A term you turn down is not offered again.</p>' +
        '<div class="gloss-bar"><label class="gloss-all"><input type="checkbox" data-action="gloss-all"' + (allPicked ? ' checked' : '') + dis + '> Select all shown</label>' +
        '<button type="button" class="btn btn-edit" data-action="gloss-approve"' + (picked && !v.busy ? '' : ' disabled') + '>' + (v.busy === 'approve' ? 'Approving…' : picked ? 'Approve ' + picked : 'Approve ticked') + '</button>' +
        '<button type="button" class="btn" data-action="gloss-reject"' + (picked && !v.busy ? '' : ' disabled') + '>' + (v.busy === 'reject' ? 'Saving…' : 'Not a term') + '</button></div>' +
        '<div class="gloss-list">' + capped(waiting, renderWaitingRow) + '</div>'
        : '<p class="library-empty">' + (v.query.trim() ? 'Nothing waiting matches that search.' : 'Nothing is waiting. Terms appear here when a guide with a misheard word is approved as a Final Transcript, and when a written script is added.') + '</p>') +
      '</section>' +
      '<section class="gloss-section"><h2 class="gloss-head">Approved <span class="gloss-count">' + approved.length.toLocaleString('en-US') + '</span></h2>' +
      (approved.length ?
        '<p class="hint">The edit pass is told these names for guides on the same book of the Bible, and is told a known mishearing when its words appear in a transcript. The page never swaps a word in by itself.</p>' +
        '<div class="gloss-list">' + capped(approved, renderApprovedRow) + '</div>'
        : '<p class="library-empty">' + (v.query.trim() ? 'No approved term matches that search.' : 'No terms approved yet.') + '</p>') +
      '</section>' +
      (turned.length ? '<details class="gloss-section gloss-turned"><summary>Turned down <span class="gloss-count">' + turned.length.toLocaleString('en-US') + '</span></summary>' +
        '<p class="hint">These are not offered again. “Offer again” forgets the ruling, and the term comes back to the top list if a guide or a written script still shows it.</p>' +
        '<div class="gloss-list">' + capped(turned, function (d) {
          return '<div class="gloss-row"><span class="gloss-main"><span class="gloss-term">' + esc(d.term) + '</span></span><button type="button" class="link-btn" data-action="gloss-restore" data-id="' + escAttr(d.key) + '"' + dis + '>Offer again</button></div>';
        }) + '</div></details>' : '');
  }
  function renderGlossary() {
    var v = glossView, loading = dbStatus === 'loading', dis = loading || v.busy ? ' disabled' : '', todo = loading ? 0 : unscanned().length, n = loading ? 0 : approvedTerms().length;
    return (
      '<div class="wrap">' +
      '<p class="back-line"><button type="button" class="link-btn" data-action="go-library">← All books</button></p>' +
      '<header class="hero">' +
      '<p class="eyebrow">Through the Word · The Scriptorium</p>' +
      '<h1 class="library-title">Glossary</h1>' +
      '<p class="dek">The Bible names and terms the team’s guides use, and the ways Descript has misheard each one. The Scriptorium writes down what it notices; a person decides what is kept. An approved term helps every later guide, so the same word is not put right twice.</p>' +
      '</header>' +
      noticeHtml() +
      '<div class="action-bar">' +
      '<div class="bar-group"><button type="button" class="btn" data-action="gloss-copy"' + (n && !loading ? '' : ' disabled') + ' title="A plain list, for Descript’s own vocabulary list or anywhere else">Copy approved terms</button>' +
      (todo ? '<button type="button" class="btn" data-action="gloss-scan"' + (v.scan ? ' disabled' : dis) + ' title="Finds the names in written scripts added before the glossary existed">Scan ' + todo.toLocaleString('en-US') + ' written script' + plural(todo) + ' for terms</button>' : '') + '</div>' +
      '<p class="status-line">' + (loading ? 'Loading the glossary…' : n.toLocaleString('en-US') + ' approved term' + plural(n)) + '</p>' +
      '<div class="action-bar-end"><input class="written-search" data-gfield="query" type="search" placeholder="Search terms, mishearings or books" aria-label="Search the glossary" value="' + escAttr(v.query) + '"' + (loading ? ' disabled' : '') + '></div>' +
      '</div>' +
      (v.scan ? '<p class="notice notice-info"><span class="gloss-scan-progress">' + esc(scanText(v.scan)) + '</span> <button type="button" class="link-btn" data-action="gloss-scan-stop">Stop</button></p>' : '') +
      (v.error ? '<p class="notice notice-warn">' + esc(v.error) + '</p>' : '') +
      (glossaryMore || learnedMore ? '<p class="notice notice-warn">There is more here than this page could read, so some terms or some of what the guides showed is missing from the lists below. Nothing is lost. Tell whoever looks after the Scriptorium.</p>' : '') +
      (v.copyText ? '<section class="pull-panel"><div class="pull-head"><h3>Approved terms</h3><button type="button" class="link-btn" data-action="gloss-copy-close">Close</button></div><p class="hint">Copying didn’t work in this view. Select the list and copy it by hand.</p><textarea class="written-text-box" rows="6" readonly>' + esc(v.copyText) + '</textarea></section>' : '') +
      '<section class="pull-panel gloss-add">' +
      '<div class="pull-head"><h3>Add a term yourself</h3></div>' +
      '<div class="written-row"><input class="written-input" data-gfield="term" type="text" placeholder="The term, spelled right — Zophar" aria-label="The term" value="' + escAttr(v.term) + '"' + dis + '>' +
      '<input class="written-input" data-gfield="heard" type="text" placeholder="Heard as (optional) — so far, sofa" aria-label="How Descript has heard it" value="' + escAttr(v.heard) + '"' + dis + '>' +
      '<button type="button" class="btn" data-action="gloss-add"' + dis + '>' + (v.busy === 'add' ? 'Adding…' : 'Add') + '</button></div>' +
      '</section>' +
      (loading ? renderSkeleton() : '<div id="gloss-lists">' + renderGlossaryLists() + '</div>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }
  function paintGlossaryLists() { var el = document.getElementById('gloss-lists'); if (el && glossView) el.innerHTML = renderGlossaryLists(); }
  // Ticking one row changes only the buttons above the list. The rows are not drawn again, so the box that was
  // ticked keeps the keyboard's place, and a long list does not flicker.
  function paintGlossBar() {
    var v = glossView, picked = pickedKeys().length;
    var approve = root.querySelector('[data-action="gloss-approve"]'), reject = root.querySelector('[data-action="gloss-reject"]'), all = root.querySelector('[data-action="gloss-all"]');
    if (approve) { approve.textContent = picked ? 'Approve ' + picked : 'Approve ticked'; approve.disabled = !picked || !!v.busy; }
    if (reject) reject.disabled = !picked || !!v.busy;
    if (all) { var boxes = root.querySelectorAll('[data-action="gloss-pick"]'); all.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (x) { return x.checked; }); }
  }
  function pickTerm(key, on) { if (glossView && !glossView.busy) { if (on) glossView.picked[key] = true; else delete glossView.picked[key]; paintGlossBar(); } }
  function pickAllTerms(on) {
    if (!glossView || glossView.busy) return;
    var shown = glossaryWaiting().filter(function (r) { return glossMatches(r.term + ' ' + r.heard.map(function (h) { return h.text; }).join(' ') + ' ' + r.books.join(' ')); }).slice(0, GLOSS_SHOWN_MAX);
    shown.forEach(function (r) { if (on) glossView.picked[r.key] = true; else delete glossView.picked[r.key]; });
    paintGlossaryLists();
  }
  function copyTerms(btn) {
    var text = approvedTerms().map(function (d) { return d.term; }).sort(naturalCompare).join('\n');
    if (!text || !glossView) return;
    var done = function () { if (btn) { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy approved terms'; }, 1800); } };
    var fail = function () { if (glossView) { glossView.copyText = text; paint(); } };
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail); else fail(); } catch (e) { fail(); }
  }
  // The line under a book's Words to Search For: what the glossary adds for this book, in words.
  function glossaryLine() {
    var n = approvedTerms().length;
    if (!n) return '';
    return '<p class="hint gloss-line">The glossary holds ' + n.toLocaleString('en-US') + ' approved term' + plural(n) + '. The ones that bear on a guide are passed to the edit pass with it, so they need not be listed here.</p>';
  }
