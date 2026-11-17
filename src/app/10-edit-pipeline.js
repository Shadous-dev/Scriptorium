/* 10-edit-pipeline.js — Running the edit pass: cue stripping, capitals, joins, concurrency. */
  function sampleErrorMessage(err) {
    var code = err && err.code;
    if (code === 'not_granted') return 'permission to use Claude was declined';
    if (code === 'rate_limited') return 'too many requests right now — try again shortly';
    if (code === 'prompt_too_large') return 'this script is too long for one pass — try splitting it into two sections';
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
    [/[ \t]+([,.;:!?…])/g, '$1'],                // no space before punctuation
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
  var LORD_RE = /\blord\b(?!s)/gi, SPIRIT_RE = /\bholy spirit\b/gi, I_RE = /\bi(?=['’\s]|$)/g;

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
    function sub(re, fn) { text = text.replace(re, function () { var out = fn.apply(null, arguments); note(arguments[0], out); return out; }); }
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
  function fixCapitals(text, intoEdits) {
    var count = 0;
    function note(before, after) { count += 1; if (count <= 20) intoEdits.push({ find: before, replace: after, kind: 'capitalization', note: 'sentence start' }); }
    text = text.replace(/(^|\n[ \t]*\n[ \t]*)(["“'(]*)([a-z])(\S{0,24})/g, function (m, lead, open, ch, rest) {
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
  function applyJoins(text, joins, intoEdits) {
    if (!repairParagraphs || !Array.isArray(joins)) return text;
    joins.forEach(function (j) {
      var a = str(j && j.endsWith), b = str(j && j.startsWith);
      if (!a || !b) return;
      var ha = locate(text, a, 0, false); if (!ha) return;
      var gap = text.slice(ha.end).match(/^\s*\n\s*\n\s*/); if (!gap) return;
      var hb = locate(text, b, ha.end + gap[0].length, false);
      if (!hb || hb.start !== ha.end + gap[0].length) return;
      text = text.slice(0, ha.end) + ' ' + text.slice(hb.start);
      intoEdits.push({ find: a + ' ¶ ' + b, replace: a + ' ' + b, kind: 'paragraph', note: 'joined a mid-thought break' });
    });
    return text;
  }

  // One route: ask for the edit list, apply it here. Edits that cannot be placed are kept and
  // shown for a hand check — never silently dropped, and never traded for a full rewrite
  // (which costs a whole script's worth of output and shows no edit table).
  function runEditOnSection(s, sample, signal, isRetry) {
    if (s.raw.length > 55000) {
      s.status = 'error'; s.error = 'this script is too long for one pass — try splitting it into two sections';
      return Promise.resolve();
    }
    var local = [];
    var prepared = fixCapitals(fixNames(mechanics(s.raw, local), local), local);
    return sample.json(buildEditsPrompt(s, prepared), { modelTier: 'quick', cache: false, signal: signal }).then(function (data) {
      data = data || {};
      var result = applyEdits(prepared, Array.isArray(data.edits) ? data.edits : []);
      var applied = local.concat(result.applied);
      var text = endSentences(fixCapitals(applyJoins(result.text, data.joins, applied), applied), applied);
      var summary = str(data.summary);
      if (result.unapplied.length > 2) summary += (summary ? ' ' : '') + result.unapplied.length + ' suggested changes could not be placed and are listed below for a hand check — Redo this one if that seems like too many.';
      s.corrected = text; s.summary = summary; s.changeCount = applied.length;
      s.edits = applied; s.unapplied = result.unapplied;
      s.misheard = applied.filter(function (e) { return e.kind === 'misheard'; }).map(function (e) { return { heard: e.find, likely: e.replace, note: e.note }; });
      s.nonsensical = cleanNonsense(data.nonsensical); s.verses = cleanVerses(data.verses); s.method = 'edits';
      s.editedFromRaw = s.raw; s.status = 'edited'; s.editedAt = Date.now(); s.error = null;
    }).catch(function (err) {
      if (err && err.code === 'cancelled') { s.status = 'error'; s.error = '__stopped__'; return; }
      // A garbled or empty answer is not cached, so one more ask is a genuine second attempt.
      if (!isRetry && err && (err.code === 'invalid_json' || err.code === 'empty_completion')) return runEditOnSection(s, sample, signal, true);
      s.status = 'error'; s.error = sampleErrorMessage(err);
    });
  }

  // Runs `concurrency` scripts at once (1 or 2). Each finished script is saved on its own
  // before the worker picks up the next, so an interruption costs at most what was in flight.
  function editAll() {
    syncFieldsFromDom();
    if (dbStatus === 'loading') { showFlash('Still loading your saved scripts — give it a second and try again.'); return; }
    useCap('sample').then(function (sample) {
      if (!sample) { showFlash('This page needs permission to use Claude for editing. Open it in a Claude viewer that allows that, then try again.'); return; }
      var toProcess = state.sections.filter(needsEdit);
      if (!toProcess.length) {
        showFlash(state.sections.some(function (s) { return s.raw.trim(); }) ? 'Every script with text is already up to date.' : 'Add a transcript to at least one script first.');
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
        var ctl = new AbortController();
        editControllers.push(ctl);
        item.status = 'editing'; item.error = null;
        paintSection(item.id); paintStatus();
        return runEditOnSection(item, sample, ctl.signal).then(function () {
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
        state.lastEditAt = Date.now(); state.approved = false;
        paint();
        return saveMeta();
      });
    });
  }

  function stopEdit() { editControllers.forEach(function (c) { try { c.abort(); } catch (e) {} }); }

  function redoSection(id) {
    syncFieldsFromDom();
    var s = findSection(id);
    if (!s || !s.raw.trim()) return;
    useCap('sample').then(function (sample) {
      if (!sample) { showFlash('This page needs permission to use Claude for editing.'); return; }
      var ctl = new AbortController();
      editControllers.push(ctl);
      s.status = 'editing'; paintSection(id);
      return runEditOnSection(s, sample, ctl.signal).then(function () {
        editControllers = editControllers.filter(function (c) { return c !== ctl; });
        state.approved = false;
        paint();
        return saveSection(s.id).then(saveMeta);
      });
    });
  }

  function toggleApprove(checked) { state.approved = !!checked; paint(); saveMeta(); }
