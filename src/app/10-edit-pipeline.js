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

  // Stage cues and pause marks are notes to the narrator, not spoken words: take them out before editing.
  function stripCues(text) {
    var removed = [];
    var out = String(text || '').replace(/[ \t]*\[[^\]\n]{1,120}\][ \t]*/g, function (m) { removed.push(m.trim()); return ' '; });
    out = out.replace(/(^|\s)_+(?=\s|$)/g, function (m, lead) { removed.push('_'); return lead; });
    out = out.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    return { text: out, removed: removed };
  }
  function textForEdit(s) { return stripCues(s.raw).text; }

  // Safety net: whatever the editor returns, no sentence or paragraph may start lowercase.
  // Abbreviations, initials, decimals and trailing-off dots are left alone.
  var ABBREV = /(?:\b(?:mr|mrs|ms|dr|st|vs|etc|jr|sr|no|cf|approx|dept|inc|co|ch|vv?)|\be\.g|\bi\.e|\ba\.k\.a|\b[A-Za-z])\.$/i;
  function fixCapitals(text, intoEdits) {
    var count = 0;
    function note(before, after) {
      count += 1;
      if (count <= 20) intoEdits.push({ find: before, replace: after, kind: 'capitalization', note: 'sentence start' });
    }
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
  function cueEdits(s) {
    var r = stripCues(s.raw);
    if (!r.removed.length) return [];
    var shown = r.removed.slice(0, 12).join(' ') + (r.removed.length > 12 ? ' …' : '');
    return [{ find: shown, replace: '', kind: 'cue', note: 'removed ' + r.removed.length + ' stage cue' + plural(r.removed.length) + ' / pause mark' + plural(r.removed.length) }];
  }

  function cleanVerses(list) {
    return Array.isArray(list) ? list.map(function (v) {
      var conf = String((v && v.confidence) || '').toLowerCase() === 'low' ? 'low' : 'high';
      return { reference: String((v && v.reference) || '').trim(), quote: String((v && v.quote) || '').trim().replace(/^["\u201C]+|["\u201D]+$/g, ''),
               canonical: String((v && v.canonical) || '').trim(), confidence: conf, note: String((v && v.note) || '').trim() };
    }).filter(function (v) { return v.quote; }) : [];
  }

  // Close the paragraph breaks the editor says fall mid-thought. Each join becomes a visible "paragraph" edit.
  function applyJoins(text, joins, intoEdits) {
    if (!repairParagraphs || !Array.isArray(joins)) return text;
    joins.forEach(function (j) {
      var a = String((j && j.endsWith) || '').trim(), b = String((j && j.startsWith) || '').trim();
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
  function cleanNonsense(list) {
    return Array.isArray(list) ? list.map(function (n) { return { original: String((n && n.original) || ''), issue: String((n && n.issue) || '') }; }) : [];
  }

  function finishSection(s, fields) {
    s.corrected = fields.corrected; s.summary = fields.summary; s.changeCount = fields.changeCount;
    s.misheard = fields.misheard; s.nonsensical = fields.nonsensical; s.edits = fields.edits; s.unapplied = fields.unapplied;
    s.verses = fields.verses; s.method = fields.method;
    s.editedFromRaw = s.raw; s.status = 'edited'; s.editedAt = Date.now(); s.error = null;
  }

  function runEditOnSection(s, sample, signal) {
    if (s.raw.length > 55000) {
      s.status = 'error'; s.error = 'this script is too long for one pass — try splitting it into two sections';
      return Promise.resolve();
    }
    var opts = { modelTier: 'quick', cache: false, signal: signal };
    return sample.json(buildEditsPrompt(s), opts).then(function (data) {
      data = data || {};
      var result = applyEdits(textForEdit(s), Array.isArray(data.edits) ? data.edits : []);
      result.applied = cueEdits(s).concat(result.applied);
      var total = result.applied.length + result.unapplied.length;
      // A few unplaceable edits are reported for a hand check; a lot means the list is unreliable — fall back.
      if (result.unapplied.length > Math.max(2, Math.floor(total * 0.15))) return runFullEdit(s, sample, opts);
      var joined = fixCapitals(applyJoins(result.text, data.joins, result.applied), result.applied);
      finishSection(s, {
        corrected: joined, summary: String(data.summary || ''), changeCount: result.applied.length,
        misheard: result.applied.filter(function (e) { return e.kind === 'misheard'; }).map(function (e) { return { heard: e.find, likely: e.replace, note: e.note }; }),
        nonsensical: cleanNonsense(data.nonsensical), edits: result.applied, unapplied: result.unapplied,
        verses: cleanVerses(data.verses), method: 'edits'
      });
    }).catch(function (err) {
      if (err && err.code === 'cancelled') { s.status = 'error'; s.error = '__stopped__'; return; }
      // Anything else about the edit list (bad JSON, cut short) — try the full-text route once.
      if (err && (err.code === 'invalid_json' || err.code === 'empty_completion')) return runFullEdit(s, sample, opts);
      s.status = 'error'; s.error = sampleErrorMessage(err);
    });
  }

  function runFullEdit(s, sample, opts) {
    return sample.json(buildFullPrompt(s), opts).then(function (data) {
      data = data || {};
      var joinEdits = cueEdits(s);
      var text = fixCapitals(applyJoins(String(data.correctedText || ''), data.joins, joinEdits), joinEdits);
      finishSection(s, {
        corrected: text, summary: String(data.summary || ''), changeCount: Number(data.changeCount) || 0,
        misheard: Array.isArray(data.misheard) ? data.misheard.map(function (m) { return { heard: String((m && m.heard) || ''), likely: String((m && m.likely) || ''), note: String((m && m.note) || '') }; }) : [],
        nonsensical: cleanNonsense(data.nonsensical), edits: joinEdits, unapplied: [], verses: cleanVerses(data.verses), method: 'full'
      });
    }).catch(function (err) {
      s.status = 'error';
      s.error = (err && err.code === 'cancelled') ? '__stopped__' : sampleErrorMessage(err);
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

