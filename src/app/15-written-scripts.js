/* 15-written-scripts.js — The teachers' written scripts: a library of their own, matched to each guide and used as a reference (SOURCE-OF-TRUTH 4.9). */
  /* ==================================================================
     Written scripts — a witness, not the master (SOURCE-OF-TRUTH 4.9)

     What a teacher wrote before recording is kept here as a permanent
     reference for the guide it belongs to. The teacher did not read it
     out word for word, so nothing here ever makes a transcript match it,
     and nothing here edits a written script.

       written/<id>       title, where it belongs (book, chapter), length,
                          and a fingerprint of its wording
       writtenText/<id>   the text itself

     The two are kept apart so the whole list can be read, and every guide
     matched, without fetching a single script's text. The text is read
     only when it is needed: to show it, or to send it with its guide's
     one edit call (4.6).

     Matching is by title and by wording. The fingerprint is the 96
     smallest hashes of every run of four words; two texts that share
     runs of words share hashes. It is arithmetic, not a call to Claude.

     Written scripts are not part of any book: clearing or deleting a book
     never touches them.
     ================================================================== */

  var WRITTEN_MAX = 200000;          // characters one written script may hold (the store's document cap is 256 KiB)
  var WRITTEN_FILE_MAX = 8000000;    // bytes of a file read from the computer
  var SKETCH_SIZE = 96, SKETCH_RUN = 4;
  var SKETCH_BY_WORDING = 6;         // shared hashes that make a match with no help from the title. Every guide opens and
                                     // closes with the same few words ("Welcome back, my friends"), so one or two shared prove nothing.
  var BULK_FILE_MAX = 300;           // files one look into Google Drive will list
  var BULK_PREAMBLE_MIN = 200;       // characters before a Doc's first chapter heading that make a written script of their own
  var writtenIndex = [];             // [{ id, title, book, chapter, part, chars, at, source, sourceName, sourceId, sketch }]
  var writtenStamp = 0;              // goes up whenever the list changes, so remembered matches are worked out again
  var writtenMore = false;           // true when the store holds more than one read returns
  var writtenTexts = {};             // id → text, kept once read
  var writtenQuery = '';
  var writtenForm = null;            // the Add form: { title, link, text, source, sourceName, sourceId, busy, error }
  var writtenBulk = null;            // bringing in many from Google Drive: { step, links, files, other, more, error, progress, stop, report }
  var writtenOpen = null;            // the one being read: { id, text, loading, error }
  var writtenPick = {};              // guide id → true while its chooser is open
  var writtenDeleting = '';

  /* ---- Fingerprints ---- */

  function sketchWords(text) { return (String(text || '').toLowerCase().replace(/[’']/g, '').match(/[a-z0-9À-ɏ]+/g) || []); }
  function fnv(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  // The smallest hashes of every run of four words. Sorted, so two can be compared in one pass.
  function textSketch(text) {
    var w = sketchWords(text), seen = {}, hashes = [];
    for (var i = 0; i + SKETCH_RUN <= w.length; i++) {
      var h = fnv(w.slice(i, i + SKETCH_RUN).join(' '));
      if (!seen[h]) { seen[h] = 1; hashes.push(h); }
    }
    return hashes.sort(function (a, b) { return a - b; }).slice(0, SKETCH_SIZE);
  }
  // How many of the smallest hashes of the two texts taken together are in both. 0 for unrelated texts;
  // a script and the recording made from it share dozens.
  function sketchShared(a, b) {
    if (!a || !b || !a.length || !b.length) return 0;
    var i = 0, j = 0, taken = 0, shared = 0, limit = Math.min(SKETCH_SIZE, Math.max(a.length, b.length));
    while (taken < limit && i < a.length && j < b.length) {
      if (a[i] === b[j]) { shared += 1; i += 1; j += 1; }
      else if (a[i] < b[j]) i += 1; else j += 1;
      taken += 1;
    }
    return shared;
  }
  var sketchMemo = {};
  function guideSketch(s) {
    var memo = sketchMemo[s.id];
    if (memo && memo.raw === s.raw) return memo.sketch;
    var sketch = textSketch(s.raw);
    sketchMemo[s.id] = { raw: s.raw, sketch: sketch };
    return sketch;
  }

  /* ---- Where a title says a script belongs ---- */

  // "Luke 24 — Jones" → { book: 'Luke', chapter: 24, part: '' }; "Isaiah – Introduction" → { book: 'Isaiah', chapter: 0, part: 'intro' }.
  function placeOf(title) {
    var t = String(title || ''), found = findBook(t), out = { book: found ? found.book : '', chapter: 0, part: '' };
    if (/\bintro(duction)?\b/i.test(t)) out.part = 'intro'; else if (/\b(conclusion|outro|wrap[- ]?up)\b/i.test(t)) out.part = 'conclusion';
    var ch = /\bchapter\s+(\d{1,3})\b/i.exec(t) || (found ? /^\s*[-–—:,]?\s*(\d{1,3})\b/.exec(t.slice(found.end)) : null);
    if (ch && !out.part) out.chapter = Number(ch[1]);
    if (out.book && CHAPTERS[out.book] === 1 && !out.part) out.chapter = 1;
    return out;
  }
  function placeLabel(p) {
    if (!p || !p.book) return '';
    return displayBook(p.book) + (p.part === 'intro' ? ' – Introduction' : p.part === 'conclusion' ? ' – Conclusion' : p.chapter ? ' ' + p.chapter : '');
  }
  function samePlace(a, b) { return !!(a.book && a.book === b.book && ((a.part && a.part === b.part) || (!a.part && !b.part && a.chapter && a.chapter === b.chapter))); }

  /* ---- Matching a guide to its written script ---- */

  var matchMemo = {};
  // { entry, how, byHand } or null. `how` is a few words the card shows, so the reader sees why this one.
  function matchWritten(s) {
    if (!s || s.writtenId === 'none' || !writtenIndex.length) return null;
    var key = [writtenStamp, s.writtenId, s.name, state.bookTitle, s.raw.length].join('|'), memo = matchMemo[s.id];
    if (memo && memo.key === key && memo.raw === s.raw) return memo.result;
    var result = null;
    if (s.writtenId) {
      var chosen = writtenIndex.filter(function (w) { return w.id === s.writtenId; })[0];
      if (chosen) result = { entry: chosen, how: 'chosen by hand', byHand: true };
    }
    if (!result) {
      var place = placeOf(s.name), sketch = s.raw.trim() ? guideSketch(s) : [], best = null;
      if (!place.book) { var g = guideRef(s); place.book = g.book; if (!place.part && !place.chapter) place.chapter = g.chapter; }
      writtenIndex.forEach(function (w) {
        var titled = samePlace(place, w), shared = sketchShared(sketch, w.sketch);
        if (!titled && shared < SKETCH_BY_WORDING) return;
        var score = (titled ? 1000 : 0) + shared;
        if (!best || score > best.score || (score === best.score && w.at > best.entry.at)) best = { entry: w, score: score, titled: titled, shared: shared };
      });
      if (best) result = { entry: best.entry, byHand: false, how: best.titled ? (best.shared >= 2 ? 'matched by title and wording' : 'matched by title') : 'matched by wording' };
    }
    matchMemo[s.id] = { key: key, raw: s.raw, result: result };
    return result;
  }

  // The written script to send with a guide's edit call: resolves { id, title, text }, { error } when it could
  // not be read, or null when the guide has none.
  function writtenFor(s) {
    var m = matchWritten(s);
    if (!m) return Promise.resolve(null);
    return readWrittenText(m.entry.id).then(function (text) {
      return { id: m.entry.id, title: m.entry.title, text: text };
    }, function () {
      return { error: 'The written script “' + m.entry.title + '” could not be read, so this pass ran without it. Redo this one to try again.' };
    });
  }

  /* ---- The store ---- */

  function newWrittenId() { return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function entryFromDoc(id, d) {
    d = d || {};
    var place = placeOf(d.title);
    return { id: id, title: String(d.title || ''), book: place.book, chapter: place.chapter, part: place.part, chars: Number(d.chars) || 0, at: Number(d.at) || 0,
             source: String(d.source || 'paste'), sourceName: String(d.sourceName || ''), sourceId: String(d.sourceId || ''),
             sketch: Array.isArray(d.sketch) ? d.sketch.map(Number).filter(function (n) { return n >= 0; }).sort(function (a, b) { return a - b; }) : [],
             // The names found in it, for the glossary (4.12). null on a script kept before the glossary existed: not yet looked at.
             terms: Array.isArray(d.terms) ? d.terms.filter(function (x) { return typeof x === 'string' && x && x.length <= 40; }).slice(0, WRITTEN_TERMS_MAX) : null };
  }
  // One read returns at most 1,000 documents, and a whole Bible is more written scripts than that. Past the first
  // thousand the listing is read a page at a time, oldest first by the time each was added. If the store will not
  // page (or the paging fails), the first thousand are shown and the page says some are missing.
  var WRITTEN_PAGE = 1000, WRITTEN_PAGES_MAX = 6;
  function readWrittenListing() { return readListing('written', WRITTEN_PAGES_MAX); }
  // The same read for any shared list whose documents carry the time they were written as `at`.
  function readListing(path, pagesMax) {
    var col = dbRoot.collection(path);
    return col.limit(WRITTEN_PAGE).get().then(function (first) {
      var firstDocs = (first && first.docs) || [];
      if (firstDocs.length < WRITTEN_PAGE) return { docs: firstDocs, more: false };
      if (typeof col.orderBy !== 'function' || typeof col.where !== 'function') return { docs: firstDocs, more: true };
      var all = [], seen = Object.create(null);
      function page(after, turn) {
        var q = after ? col.where('at', '>=', after).orderBy('at') : col.orderBy('at');
        return q.limit(WRITTEN_PAGE).get().then(function (qs) {
          var docs = (qs && qs.docs) || [], fresh = 0, last = 0;
          docs.forEach(function (d) {
            last = Number((d.data() || {}).at) || last;
            if (!seen[d.id]) { seen[d.id] = true; all.push(d); fresh += 1; }
          });
          if (docs.length < WRITTEN_PAGE) return { docs: all, more: false };
          if (!fresh || !last || turn >= pagesMax) return { docs: all, more: true };
          return page(last, turn + 1);
        });
      }
      return page(0, 1).then(function (out) {
        // A script saved with no time on it sorts outside the pages; the first read has those, so none is dropped.
        firstDocs.forEach(function (d) { if (!seen[d.id]) { seen[d.id] = true; out.docs.push(d); } });
        return out;
      }, function (err) {
        console.warn('Scriptorium: could not read past the first 1,000 in ' + path, err);
        return { docs: firstDocs, more: true };
      });
    });
  }
  function loadWrittenIndex() {
    if (!dbRoot) return Promise.resolve();
    return readWrittenListing().then(function (got) {
      writtenIndex = got.docs.filter(function (d) { return d && typeof d.id === 'string' && !(d.id in Object.prototype); })
        .map(function (d) { return entryFromDoc(d.id, d.data()); }).filter(function (w) { return w.title; });
      writtenMore = got.more; writtenStamp += 1; writtenReady = true;
    }).catch(function (err) { console.warn('Scriptorium: could not read the written scripts', err); });
  }
  function readWrittenText(id) {
    if (writtenTexts[id] != null) return Promise.resolve(writtenTexts[id]);
    if (!dbRoot) return Promise.reject({ code: 'unavailable' });
    return dbRoot.doc('writtenText/' + id).get().then(function (snap) {
      if (!snap || !snap.exists) throw { code: 'not_found' };
      writtenTexts[id] = String((snap.data() || {}).text || '');
      return writtenTexts[id];
    });
  }

  /* ---- The Written Scripts page ---- */

  function openWritten() {
    view = 'written'; flash = null; writtenForm = null; writtenOpen = null; writtenFiles = null; writtenQuery = ''; dbStatus = 'loading';
    paint();
    function done() { dbStatus = 'ready'; paint(); }
    return loadWrittenIndex().then(done, done);
  }
  function writtenShown() {
    var q = writtenQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return writtenIndex.filter(function (w) {
      var hay = (w.title + ' ' + placeLabel(w) + ' ' + w.sourceName).toLowerCase();
      return q.every(function (word) { return hay.indexOf(word) !== -1; });
    }).sort(function (a, b) { return naturalCompare(a.title, b.title); });
  }
  function sourceLabel(w) { return w.source === 'drive' ? 'from Google Drive' : w.source === 'file' ? 'from a file' : 'pasted in'; }
  function renderWrittenRow(w) {
    var busy = writtenDeleting === w.id, place = placeLabel(w);
    var bits = [place || 'no book and chapter found in the title', w.chars.toLocaleString('en-US') + ' characters', sourceLabel(w) + (w.sourceName ? ' (' + w.sourceName + ')' : '')];
    if (w.at) bits.push('added ' + relTime(w.at));
    return '<article class="book-row' + (busy ? ' is-busy' : '') + '">' +
      '<button type="button" class="book-open" data-action="written-read" data-id="' + escAttr(w.id) + '"' + (busy ? ' disabled' : '') + '>' +
      '<span class="book-name">' + esc(w.title) + '</span>' +
      '<span class="book-meta">' + esc(busy ? 'Deleting…' : bits.join(' · ')) + '</span></button>' +
      '<button type="button" class="link-btn book-delete" data-action="written-delete" data-id="' + escAttr(w.id) + '"' + (busy ? ' disabled' : '') + '>Delete</button>' +
      '</article>';
  }
  function renderWrittenList() {
    var shown = writtenShown();
    if (!writtenIndex.length) return '<p class="library-empty">No written scripts yet. Add one with <strong>+ Add Written Script</strong> — everyone on the team will see it here, and it will be matched to its audio guide.</p>';
    if (!shown.length) return '<p class="library-empty">No written script has “' + esc(writtenQuery.trim()) + '” in its title.</p>';
    return '<div class="book-list">' + shown.map(renderWrittenRow).join('') + '</div>' +
      (writtenMore ? '<p class="notice notice-warn">There are more written scripts than this page could list: ' + writtenIndex.length.toLocaleString('en-US') + ' are shown. The rest are still saved, and are still matched to their guides only if they are listed here. Tell whoever looks after the Scriptorium.</p>' : '');
  }
  function writtenFormNote() {
    var f = writtenForm, n = String(f.text || '').length;
    if (!n) return '';
    return n.toLocaleString('en-US') + ' characters' + (f.source === 'drive' ? ' · from Google Drive' : '') + (f.sourceName ? (f.source === 'drive' ? ' (' : ' · from ') + f.sourceName + (f.source === 'drive' ? ')' : '') : '') +
      (n > WRITTEN_MAX ? ' — too long to keep in one piece. Save it as two written scripts.' : '');
  }
  function renderWrittenForm() {
    var f = writtenForm, dis = f.busy ? ' disabled' : '';
    return '<section class="pull-panel written-form">' +
      '<div class="pull-head"><h3>Add a written script</h3></div>' +
      '<p class="hint">This is what the teacher wrote before recording. It is kept as you give it, as a reference: the edit pass never changes a transcript to match it.</p>' +
      '<label class="written-label" for="written-title">Title</label>' +
      '<input id="written-title" class="written-input" data-wfield="title" type="text" placeholder="e.g. Luke 24 — Jones" value="' + escAttr(f.title) + '"' + dis + '>' +
      '<p class="hint">Start with the book and chapter (“Luke 24”, “Isaiah – Introduction”). That is how it finds its audio guide.</p>' +
      '<label class="written-label" for="written-link">From a Google Doc or Sheet</label>' +
      '<div class="written-row"><input id="written-link" class="written-input" data-wfield="link" type="text" placeholder="Paste the link to the Doc or Sheet" value="' + escAttr(f.link) + '"' + dis + '>' +
      '<button type="button" class="btn" data-action="written-fetch"' + dis + '>' + (f.busy === 'drive' ? 'Reading…' : 'Bring it in') + '</button></div>' +
      '<label class="written-label" for="written-file">From a file on this computer</label>' +
      '<input id="written-file" class="written-file" data-action="written-file" type="file" accept="' + FILE_ACCEPT + '"' + dis + '>' +
      '<p class="hint">Word (.docx), PDF, OpenDocument (.odt), rich text (.rtf) or plain text. For a Pages file or an older .doc, export it as Word or PDF first, or paste the text below. To add several files at once, close this and use <strong>Add files from this computer</strong>.</p>' +
      '<label class="written-label" for="written-text">The written script</label>' +
      '<textarea id="written-text" class="written-text-box" data-wfield="text" rows="12" placeholder="Or paste the written script here"' + dis + '>' + esc(f.text) + '</textarea>' +
      '<p class="hint written-count">' + esc(writtenFormNote()) + '</p>' +
      (f.error ? '<p class="notice notice-warn">' + esc(f.error) + '</p>' : '') +
      '<div class="pull-foot"><button type="button" class="btn btn-edit" data-action="written-save"' + dis + '>' + (f.busy === 'save' ? 'Saving…' : 'Save written script') + '</button>' +
      '<button type="button" class="btn btn-ghost" data-action="written-cancel"' + dis + '>Cancel</button></div>' +
      '</section>';
  }
  function renderWrittenOpen() {
    var o = writtenOpen, w = writtenIndex.filter(function (x) { return x.id === o.id; })[0];
    if (!w) return '';
    return '<section class="pull-panel written-form">' +
      '<div class="pull-head"><h3>' + esc(w.title) + '</h3><button type="button" class="link-btn" data-action="written-close">Close</button></div>' +
      '<p class="hint">' + esc((placeLabel(w) ? 'Matches guides on ' + placeLabel(w) + '. ' : 'No book and chapter found in the title, so it is matched by its wording alone. ') + 'Kept as written: to change the text, delete this one and add it again.') + '</p>' +
      '<label class="written-label" for="written-rename">Title</label>' +
      '<div class="written-row"><input id="written-rename" class="written-input" data-wfield="rename" type="text" value="' + escAttr(o.title != null ? o.title : w.title) + '">' +
      '<button type="button" class="btn" data-action="written-rename"' + (o.busy ? ' disabled' : '') + '>' + (o.busy ? 'Saving…' : 'Save title') + '</button></div>' +
      (o.error ? '<p class="notice notice-warn">' + esc(o.error) + '</p>' : '') +
      (o.loading ? '<p class="hint">Loading…</p>' : '<div class="written-text">' + esc(o.text || '') + '</div>') +
      '</section>';
  }
  function renderWritten() {
    var loading = dbStatus === 'loading', n = writtenIndex.length, panelOpen = !!(writtenForm || writtenBulk || writtenFiles);
    return (
      '<div class="wrap">' +
      '<p class="back-line"><button type="button" class="link-btn" data-action="go-library">← All books</button></p>' +
      '<header class="hero">' +
      '<p class="eyebrow">Through the Word · The Scriptorium</p>' +
      '<h1 class="library-title">Written Scripts</h1>' +
      '<p class="dek">What each teacher wrote before recording, kept as a permanent reference for checking that a correction is accurate and is what the teacher meant. A written script is evidence for the edit pass. It is never copied into a transcript, and it is never edited here.</p>' +
      '</header>' +
      noticeHtml() +
      '<div class="action-bar">' +
      '<div class="bar-group"><button type="button" class="btn btn-add" data-action="written-new"' + (loading || panelOpen ? ' disabled' : '') + '>+ Add Written Script</button>' +
      '<label class="btn file-btn' + (loading || panelOpen ? ' is-disabled' : '') + '" title="Any number of Word, PDF, OpenDocument, rich-text or plain-text files, each kept under its own title">' +
      '<input type="file" multiple data-action="written-files" accept="' + FILE_ACCEPT + '"' + (loading || panelOpen ? ' disabled' : '') + '>Add files from this computer</label>' +
      '<button type="button" class="btn" data-action="written-bulk"' + (loading || panelOpen ? ' disabled' : '') + ' title="Every file in a Google Drive folder, or a Doc that holds several written scripts">Bring in many from Google Drive</button></div>' +
      '<p class="status-line">' + (loading ? 'Loading the written scripts…' : n + ' written script' + plural(n)) + '</p>' +
      '<div class="action-bar-end"><input class="written-search" data-wfield="query" type="search" placeholder="Search by title, book or chapter" aria-label="Search written scripts" value="' + escAttr(writtenQuery) + '"' + (loading ? ' disabled' : '') + '></div>' +
      '</div>' +
      (writtenForm ? renderWrittenForm() : '') +
      (writtenBulk ? renderWrittenBulk() : '') +
      (writtenFiles ? renderWrittenFiles() : '') +
      (writtenOpen ? renderWrittenOpen() : '') +
      (loading ? renderSkeleton() : '<div id="written-list">' + renderWrittenList() + '</div>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  /* ---- Adding one ---- */

  function startWrittenForm() {
    writtenOpen = null;
    writtenForm = { title: '', link: '', text: '', source: 'paste', sourceName: '', sourceId: '', busy: '', error: '' };
    paint();
    var box = root.querySelector('[data-wfield="title"]');
    if (box) { try { box.focus(); } catch (e) {} }
  }
  function writtenFail(message) { if (writtenForm) { writtenForm.busy = ''; writtenForm.error = message; paint(); } }
  // A title to start from, when the reader has not typed one: the file or Doc's name without its ending.
  function titleFromName(name) { return String(name || '').replace(/\.(docx|pdf|odt|rtf|doc|pages|txt|md|markdown|text)$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  // A written script as it is kept: one kind of line ending, no trailing spaces, no run of blank lines.
  function cleanWritten(text) { return trimLineEnds(tameSpaces(text || '').replace(/\r\n?/g, '\n')).replace(/\n{3,}/g, '\n\n').trim(); }
  function takeWrittenText(text, source, name, sourceId) {
    if (!writtenForm) return;
    text = cleanWritten(text);
    if (!text) { writtenFail('Nothing could be read from that. Open it and paste the text in instead.'); return; }
    writtenForm.text = text; writtenForm.source = source; writtenForm.sourceName = String(name || ''); writtenForm.sourceId = String(sourceId || ''); writtenForm.busy = ''; writtenForm.error = '';
    if (!writtenForm.title.trim() && name) writtenForm.title = titleFromName(name);
    paint();
  }

  // One plain sentence per kind of failure reaching Google Drive, each with the thing that fixes it.
  function driveProblem(err) {
    var code = err && err.code;
    if (code === 'needs_reauth') return 'Google Drive needs reconnecting. In Claude, open Settings → Connectors, reconnect Google Drive, then try again.';
    if (code === 'server_not_connected' || code === 'server_not_found' || code === 'selection_required') return 'Google Drive isn’t connected for you yet. In Claude, open Settings → Connectors, add Google Drive, then try again. Or paste the text in below.';
    if (code === 'not_in_manifest' || code === 'approval_required' || code === 'consent_required') return 'This page wasn’t allowed to read from Google Drive. Reload the page and choose Allow when it asks, or paste the text in below.';
    if (code === 'blocked_by_policy') return 'Your organization doesn’t allow this page to read from Google Drive. Paste the text in below instead.';
    if (code === 'server_unavailable' || code === 'rate_limited') return 'Google Drive didn’t answer just now. Wait a minute and try again.';
    if (code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed' || code === 'no_tool') return 'Google Drive can’t be read from this view. Paste the text in below instead.';
    if (code === 'tool_error') return 'Google Drive couldn’t open that file. Check that the link is right and that you can open it yourself, or paste the text in below.';
    return 'Couldn’t read from Google Drive: ' + ((err && err.message) || 'unknown error') + '. Paste the text in below instead.';
  }
  // The file id inside a Docs, Sheets or Drive link — or the id on its own.
  function driveFileId(link) {
    link = String(link || '').trim();
    var m = /\/d\/([A-Za-z0-9_-]{15,})/.exec(link) || /[?&]id=([A-Za-z0-9_-]{15,})/.exec(link) || /^([A-Za-z0-9_-]{20,})$/.exec(link);
    return m ? m[1] : '';
  }
  // What Drive sent back for a file, as { text, name }. The connector answers in words, sometimes wrapped in JSON.
  function driveFileText(res) {
    var text = toolText(res), name = '', data = null;
    if (/^\s*\{/.test(text)) { try { data = JSON.parse(text); } catch (e) { data = null; } }
    if (!data && res && res.payload && typeof res.payload === 'object') data = res.payload;
    if (data && typeof data === 'object') {
      var body = ['content', 'text', 'fileContent', 'body', 'markdown'].map(function (k) { return data[k]; }).filter(function (v) { return typeof v === 'string' && v.trim(); })[0];
      if (body) text = body;
      name = String(data.title || data.name || '');
    }
    return { text: String(text || ''), name: name };
  }
  // The Google Drive tools this page reads with. Both only read (4.11).
  function driveReader() {
    return useCap('mcp').then(function (mcp) {
      if (!mcp) throw { code: 'capability_disabled' };
      return mcp.listTools().then(function (list) {
        var server = ((list && list.servers) || []).filter(function (sv) { return sv.server === 'Google Drive'; })[0];
        if (!server) throw { code: 'server_not_connected' };
        if (server.authStatus === 'needs_reauth') throw { code: 'needs_reauth' };
        function tool(pattern) { var t = (server.tools || []).filter(function (x) { return pattern.test(x.name); })[0]; return t ? t.name : ''; }
        return { mcp: mcp, read: tool(/read.*content/i), search: tool(/search.*files/i) };
      });
    });
  }
  function driveRead(conn, fileId) {
    if (!conn.read) return Promise.reject({ code: 'no_tool' });
    return conn.mcp.callTool('Google Drive', conn.read, { fileId: fileId }, { cache: false }).then(driveFileText);
  }
  function fetchWrittenFromDrive() {
    if (!writtenForm || writtenForm.busy) return;
    var id = driveFileId(writtenForm.link);
    if (!id) { writtenFail('That doesn’t look like a link to a Google Doc or Sheet. Open the file, copy the link from the address bar, and paste it here.'); return; }
    writtenForm.busy = 'drive'; writtenForm.error = ''; paint();
    driveReader().then(function (conn) { return driveRead(conn, id); }).then(function (got) {
      takeWrittenText(got.text, 'drive', got.name, id);
    }).catch(function (err) {
      console.warn('Scriptorium: could not read from Google Drive', err);
      writtenFail(driveProblem(err));
    });
  }

  /* ---- Bringing in many from Google Drive ----
     Every file in a folder, or one Doc that holds several written scripts, in one go. Each file is read once
     and kept; the same file brought in again replaces the kept copy. Drive is only read (4.11), and none of
     this calls Claude (4.6). ---- */

  var DRIVE_READABLE = /^(application\/vnd\.google-apps\.(document|spreadsheet)$|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$|application\/msword$|application\/pdf$|text\/)/;

  // What one pasted line points at: a folder, or a file.
  function driveTarget(line) {
    line = String(line || '').trim();
    var folder = /\/folders\/([A-Za-z0-9_-]{15,})/.exec(line);
    if (folder) return { kind: 'folder', id: folder[1] };
    var id = driveFileId(line);
    return id ? { kind: 'file', id: id } : null;
  }
  // The files directly inside one folder that can be read as text. Sub-folders are counted, not opened.
  function driveFolderFiles(conn, folderId, room) {
    if (!conn.search) return Promise.reject({ code: 'no_tool' });
    var files = [], seen = {}, other = 0;
    function page(token, turn) {
      var input = { query: "parentId = '" + folderId + "' and trashed = false", excludeContentSnippets: true, pageSize: 100 };
      if (token) input.pageToken = token;
      return conn.mcp.callTool('Google Drive', conn.search, input, { cache: false }).then(function (res) {
        var data = payloadOf(res), list = Array.isArray(data.files) ? data.files : [];
        list.forEach(function (f) {
          var id = String((f && f.id) || '');
          if (!id || seen[id]) return;                       // a page can repeat the last file of the one before
          seen[id] = true;
          if (DRIVE_READABLE.test(String(f.mimeType || ''))) files.push({ id: id, name: String(f.title || f.name || 'Untitled') });
          else other += 1;
        });
        var next = String(data.nextPageToken || '');
        if (next && list.length && files.length < room && turn < 20) return page(next, turn + 1);
        return { files: files.slice(0, room), other: other, more: files.length > room || (!!next && list.length > 0) };
      });
    }
    return page('', 0);
  }

  // One Drive file may hold a whole book's written scripts. It is cut only at a heading that names a place in
  // the Bible ("Luke 24", "Chapter 3", "Introduction"), and only when two or more headings name different
  // places. A file whose own name already says which chapter it is stays whole, and so does one with no such
  // headings. Each piece is { key, title, text }: \`key\` says which piece of the file it is.
  function splitWritten(text, name) {
    text = cleanWritten(text);
    var fileTitle = titleFromName(name), filePlace = placeOf(fileTitle);
    var whole = [{ key: '', title: fileTitle || firstWords(text), text: text }];
    if (filePlace.book && (filePlace.chapter || filePlace.part)) return whole;
    var lines = text.split('\n'), cuts = [], seen = {};
    lines.forEach(function (line, n) {
      if (line.charCodeAt(0) !== 35 || line.length > 300) return;        // a heading starts with # and is a line, not a page
      var m = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (!m) return;
      var heading = m[1].replace(/\\([^A-Za-z0-9\s])/g, '$1').replace(/[*_`]+/g, '').replace(/\s+/g, ' ').trim();
      var title = heading, place = placeOf(heading);
      // "Chapter 3" under a file called "Luke" is Luke 3. Nothing else is read that way: "1. Opening" and
      // "Introduction" are headings inside a script far more often than they are the start of one.
      if (!place.book && filePlace.book && /^chapter\s+\d{1,3}\b/i.test(heading)) { title = displayBook(filePlace.book) + ' – ' + heading; place = placeOf(displayBook(filePlace.book) + ' ' + heading); }
      if (!place.book || !(place.chapter || place.part)) return;
      if (/\d\s*[:.]\s*\d/.test(heading)) return;                         // "John 3:16" is a verse being quoted, not the start of a script
      if (filePlace.book && place.book !== filePlace.book) return;      // a heading that quotes another book is not a new script
      var key = (place.book + '-' + (place.part || place.chapter)).toLowerCase().replace(/[^a-z0-9]+/g, '-');
      if (seen[key]) return;                                            // a second heading for the same place belongs to that script
      seen[key] = true;
      cuts.push({ line: n, key: key, title: title.slice(0, 120) });
    });
    if (cuts.length < 2) return whole;
    var parts = [], opening = lines.slice(0, cuts[0].line).join('\n').trim();
    // What stands before the first chapter is usually the book's introduction, and is kept as a script of its own.
    if (opening.length >= BULK_PREAMBLE_MIN) {
      var intro = filePlace.book && /\bintro(duction)?\b/i.test(opening.slice(0, 200));
      parts.push({ key: 'opening', title: intro ? displayBook(filePlace.book) + ' – Introduction' : (fileTitle || 'Written scripts') + ' – before the first heading', text: opening });
    }
    // A shorter opening (a title, a line of notes) is not a script, and is not thrown away either: it stays
    // at the head of the first one, so every word of the file is kept (4.9).
    var lead = opening && opening.length < BULK_PREAMBLE_MIN ? opening + '\n\n' : '';
    cuts.forEach(function (c, i) {
      var body = lines.slice(c.line, i + 1 < cuts.length ? cuts[i + 1].line : lines.length).join('\n').trim();
      if (body) { parts.push({ key: c.key, title: c.title, text: lead + body }); lead = ''; }
    });
    return parts;
  }
  function firstWords(text) { return String(text || '').replace(/^[#\s*_]+/, '').split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 80) || 'Written script'; }
  function bulkSourceId(fileId, key) { return fileId + (key ? '#' + key : ''); }
  function bulkHas(fileId) { return writtenIndex.some(function (w) { return w.sourceId === fileId || w.sourceId.indexOf(fileId + '#') === 0; }); }

  function openWrittenBulk() {
    writtenOpen = null; writtenForm = null;
    writtenBulk = { step: 'ask', links: '', files: [], other: 0, more: false, error: '', progress: '', stop: false, report: null };
    paint();
    var box = root.querySelector('[data-wfield="bulkLinks"]');
    if (box) { try { box.focus(); } catch (e) {} }
  }
  function bulkFail(message) { if (writtenBulk) { writtenBulk.step = writtenBulk.files.length ? 'pick' : 'ask'; writtenBulk.error = message; paint(); } }
  // Step one: see what the links hold. Folders are listed; a link to a file is taken as it is.
  function listWrittenBulk() {
    var b = writtenBulk;
    if (!b || b.step === 'listing' || b.step === 'reading') return;
    var targets = [], seen = {};
    String(b.links || '').split(/[\n,\s]+/).forEach(function (line) {
      var t = driveTarget(line);
      if (t && !seen[t.id]) { seen[t.id] = true; targets.push(t); }
    });
    if (!targets.length) { b.error = 'Paste a link to a Google Drive folder, or links to Docs, first. Open the folder or file in Google Drive and copy the link from the address bar.'; paint(); return; }
    b.step = 'listing'; b.error = ''; b.files = []; b.other = 0; b.more = false; b.report = null; paint();
    // The library is read again first: a teammate may have brought some of these in since this page was opened.
    loadWrittenIndex().then(driveReader).then(function (conn) {
      var files = [], have = {}, linked = 0, i = 0;
      function add(f) { if (!have[f.id] && files.length < BULK_FILE_MAX) { have[f.id] = true; files.push(f); } else if (!have[f.id]) b.more = true; }
      function next() {
        if (i >= targets.length || writtenBulk !== b) return Promise.resolve();
        var t = targets[i]; i += 1;
        if (t.kind === 'file') { linked += 1; add({ id: t.id, name: '', label: 'Linked file ' + linked }); return next(); }
        return driveFolderFiles(conn, t.id, BULK_FILE_MAX - files.length).then(function (got) {
          got.files.forEach(add); b.other += got.other; if (got.more) b.more = true;
        }).then(next);
      }
      return next().then(function () {
        if (writtenBulk !== b) return;
        files.sort(function (x, y) { return naturalCompare(x.name || x.label, y.name || y.label); });
        files.forEach(function (f) { f.have = bulkHas(f.id); f.pick = !f.have; });
        b.files = files; b.step = files.length ? 'pick' : 'ask';
        if (!files.length) b.error = 'Nothing that can be read was found there' + (b.other ? ' (' + b.other + ' sub-folder' + plural(b.other) + ' or other file' + plural(b.other) + ' left alone)' : '') + '. Check the link, and that the folder holds Docs, Sheets, Word files, PDFs or text files.';
        paint();
      });
    }).catch(function (err) {
      console.warn('Scriptorium: could not list Google Drive', err);
      if (writtenBulk === b) bulkFail(bulkProblem(err));
    });
  }
  // The same sentences as the single form, without the pointer to a paste box this panel does not have.
  function bulkProblem(err) { return driveProblem(err).replace(/ Or paste the text in below\.| Paste the text in below instead\.|, or paste the text in below/g, ''); }
  function bulkPicked() { return writtenBulk ? writtenBulk.files.filter(function (f) { return f.pick; }) : []; }
  function bulkPick(id, on) {
    if (!writtenBulk) return;
    writtenBulk.files.forEach(function (f) { if (f.id === id) f.pick = !!on; });
    paint();
  }
  function bulkPickAll(on) { if (writtenBulk) { writtenBulk.files.forEach(function (f) { f.pick = !!on; }); paint(); } }
  function bulkWait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  // Drive sometimes asks for a moment. One file is tried up to three times before it is counted as not read.
  function bulkRead(conn, fileId, tries) {
    return driveRead(conn, fileId).catch(function (err) {
      var code = err && err.code;
      if ((code === 'rate_limited' || code === 'server_unavailable') && tries < 2) return bulkWait(4000 * (tries + 1)).then(function () { return bulkRead(conn, fileId, tries + 1); });
      throw err;
    });
  }
  // Keeps the pieces of one file. A piece already in the library keeps its place and its title: only its text is renewed.
  function bulkKeep(file, name, pieces, report) {
    var i = 0;
    function next() {
      if (i >= pieces.length) return Promise.resolve();
      var p = pieces[i]; i += 1;
      if (!p.text) return next();
      if (p.text.length > WRITTEN_MAX || jsonBytes({ text: p.text }) > DOC_MAX_BYTES) { report.failed.push({ name: p.title, why: 'too long to keep in one piece' }); return next(); }
      var sourceId = bulkSourceId(file.id, p.key), old = writtenIndex.filter(function (w) { return w.sourceId === sourceId; })[0];
      var title = old ? old.title : String(p.title || name || 'Written script').replace(/\s+/g, ' ').trim();
      return putWritten(old ? old.id : newWrittenId(), writtenDoc(title, p.text, 'drive', name, sourceId), p.text).then(function () {
        if (old) report.replaced += 1; else report.saved += 1;
      }, function (err) {
        console.warn('Scriptorium: could not save a written script', err);
        report.failed.push({ name: title, why: writtenSaveProblem(err) });
        if (err && (err.code === 'invalid_argument' || err.code === 'quota_exceeded')) report.halt = true;   // the next one would fail the same way
      }).then(next);
    }
    return next();
  }
  // Step two: read each picked file, one at a time, and keep it.
  function startWrittenBulk() {
    var b = writtenBulk, picked = bulkPicked();
    if (!b || (b.step !== 'pick' && b.step !== 'done') || !picked.length) return;
    if (!dbRoot) { b.error = 'Saved work can’t be reached in this view.'; paint(); return; }
    var report = { files: 0, saved: 0, replaced: 0, split: [], failed: [], stopped: false, halt: false };
    b.step = 'reading'; b.error = ''; b.stop = false; b.report = report; b.progress = 'Reading 1 of ' + picked.length + '…'; paint();
    function show(text) { b.progress = text; var p = root.querySelector('.bulk-progress'); if (p) p.textContent = text; }
    loadWrittenIndex().then(driveReader).then(function (conn) {
      var i = 0;
      function next() {
        if (i >= picked.length || writtenBulk !== b || b.stop || report.halt) { report.stopped = i < picked.length; return Promise.resolve(); }
        var file = picked[i]; i += 1;
        show('Reading ' + i + ' of ' + picked.length + ' — ' + (file.name || file.label) + '…');
        return bulkRead(conn, file.id, 0).then(function (got) {
          var name = file.name || got.name || '', pieces = splitWritten(got.text, name);
          if (!pieces.length || !pieces[0].text) { report.failed.push({ name: name || file.label, why: 'nothing could be read from it' }); return; }
          report.files += 1;
          if (pieces.length > 1) report.split.push({ name: name || file.label, count: pieces.length });
          return bulkKeep(file, name, pieces, report);
        }, function (err) {
          console.warn('Scriptorium: could not read a Drive file', err);
          var code = err && err.code;
          report.failed.push({ name: file.name || file.label, why: code === 'tool_error' ? 'Google Drive couldn’t open it' : code === 'rate_limited' || code === 'server_unavailable' ? 'Google Drive didn’t answer' : 'it couldn’t be read' });
          if (code && /^(needs_reauth|server_not_connected|server_not_found|not_in_manifest|approval_required|consent_required|blocked_by_policy|not_granted|capability_disabled|capability_removed|no_tool)$/.test(code)) { report.halt = true; b.error = bulkProblem(err); }
        }).then(next);
      }
      return next();
    }).catch(function (err) {
      console.warn('Scriptorium: could not reach Google Drive', err);
      b.error = bulkProblem(err);
    }).then(function () {
      if (writtenBulk !== b) return;
      b.files.forEach(function (f) { f.have = bulkHas(f.id); if (f.have) f.pick = false; });
      b.step = 'done'; paint();
    });
  }
  function bulkReportText(r) {
    var made = r.saved + r.replaced, out = [];
    out.push(made ? 'Kept ' + made + ' written script' + plural(made) + ' from ' + r.files + ' file' + plural(r.files) + (r.replaced ? ' (' + r.replaced + ' already here and renewed)' : '') + '.' : 'Nothing was kept.');
    r.split.forEach(function (s) { out.push('“' + s.name + '” held ' + s.count + ' written scripts and was cut at its headings.'); });
    if (r.failed.length) out.push(r.failed.length + ' not kept: ' + r.failed.map(function (f) { return '“' + f.name + '” (' + f.why + ')'; }).join('; ') + '.');
    if (r.stopped) out.push('Stopped before the end. What was read is kept; the rest are still ticked below.');
    return out;
  }
  function renderWrittenBulk() {
    var b = writtenBulk, busy = b.step === 'listing' || b.step === 'reading', n = bulkPicked().length;
    var list = '';
    if (b.files.length && b.step !== 'listing') {
      list = '<ul class="pull-list">' + b.files.map(function (f) {
        return '<li><label class="pull-item"><input type="checkbox" data-action="written-bulk-pick" data-id="' + escAttr(f.id) + '"' + (f.pick ? ' checked' : '') + (busy ? ' disabled' : '') + '>' +
          '<span class="pull-name">' + esc(f.name || f.label) + '</span>' +
          (f.have ? '<span class="pull-tag">already in the library — bringing it in again renews its text</span>' : '') + '</label></li>';
      }).join('') + '</ul>' +
        (b.more ? '<p class="notice notice-warn">Only the first ' + b.files.length + ' files are listed. Bring these in, then look again for the rest, or point at a smaller folder.</p>' : '') +
        (b.other ? '<p class="hint">' + b.other + ' sub-folder' + plural(b.other) + ' or other file' + plural(b.other) + ' in there ' + (b.other === 1 ? 'was' : 'were') + ' left alone. Paste a sub-folder’s own link to bring in what it holds.</p>' : '');
    }
    return '<section class="pull-panel written-form">' +
      '<div class="pull-head"><h3>Bring in many from Google Drive</h3>' + (b.step === 'reading' ? '' : '<button type="button" class="link-btn" data-action="written-bulk-close">Close</button>') + '</div>' +
      '<p class="hint">Paste the link to a Google Drive folder to bring in every file in it, or links to single Docs, one on each line. A Doc that holds several written scripts under headings such as “Luke 24” is cut into one written script for each. Every file is read once and kept here. Nothing in Google Drive is changed.</p>' +
      '<label class="written-label" for="written-bulk-links">Links to folders or files</label>' +
      '<textarea id="written-bulk-links" class="written-text-box is-links" data-wfield="bulkLinks" rows="3" placeholder="https://drive.google.com/drive/folders/…"' + (busy ? ' disabled' : '') + '>' + esc(b.links) + '</textarea>' +
      '<div class="pull-foot"><button type="button" class="btn" data-action="written-bulk-list"' + (busy ? ' disabled' : '') + '>' + (b.step === 'listing' ? 'Looking…' : b.files.length ? 'Look again' : 'Look in Google Drive') + '</button></div>' +
      (b.report && b.step === 'done' ? '<div class="notice bulk-report">' + bulkReportText(b.report).map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</div>' : '') +
      (b.error ? '<p class="notice notice-warn">' + esc(b.error) + '</p>' : '') +
      list +
      (b.step === 'reading' ? '<div class="pull-foot"><p class="hint bulk-progress">' + esc(b.progress) + '</p><button type="button" class="btn btn-ghost" data-action="written-bulk-stop"' + (b.stop ? ' disabled' : '') + '>Stop</button></div>' : '') +
      (b.files.length && (b.step === 'pick' || b.step === 'done') ? '<div class="pull-foot">' +
        '<label class="speed-pick"><input type="checkbox" data-action="written-bulk-all"' + (n === b.files.length ? ' checked' : '') + '> Select all ' + b.files.length + '</label>' +
        '<button type="button" class="btn btn-edit" data-action="written-bulk-start"' + (n ? '' : ' disabled') + '>' + (n ? 'Bring in ' + n + ' file' + plural(n) : 'Bring in selected') + '</button></div>' : '') +
      '</section>';
  }

  /* ---- Reading a file from the computer ---- */

  // One entry out of a .zip (a .docx is one), as bytes — or null when it is not there.
  function zipEntry(bytes, wanted) {
    var view8 = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = -1;
    for (var i = bytes.length - 22; i >= 0 && i >= bytes.length - 66000; i--) { if (view8.getUint32(i, true) === 0x06054b50) { end = i; break; } }
    if (end < 0) return Promise.resolve(null);
    var count = view8.getUint16(end + 10, true), at = view8.getUint32(end + 16, true), dec = new TextDecoder();
    for (var n = 0; n < count && at + 46 <= bytes.length; n++) {
      if (view8.getUint32(at, true) !== 0x02014b50) break;
      var method = view8.getUint16(at + 10, true), size = view8.getUint32(at + 20, true), full = view8.getUint32(at + 24, true), nameLen = view8.getUint16(at + 28, true);
      var extraLen = view8.getUint16(at + 30, true), commentLen = view8.getUint16(at + 32, true), local = view8.getUint32(at + 42, true);
      var name = dec.decode(bytes.subarray(at + 46, at + 46 + nameLen));
      if (name === wanted) {
        if (local + 30 > bytes.length || full > 40000000) return Promise.resolve(null);     // not a file, or far too large to be a script
        var start = local + 30 + view8.getUint16(local + 26, true) + view8.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
        if (method === 0) return Promise.resolve(data);
        if (method !== 8 || typeof DecompressionStream !== 'function') return Promise.resolve(null);
        return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer().then(function (buf) { return new Uint8Array(buf); });
      }
      at += 46 + nameLen + extraLen + commentLen;
    }
    return Promise.resolve(null);
  }
  function xmlText(str) {
    return String(str).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-f]+);/gi, function (m, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCodePoint(Number(d)); }).replace(/&amp;/g, '&');
  }
  // The words of a Word document's main part: one line per paragraph, text that was deleted with tracked changes left out.
  function docxXmlToText(xml) {
    var body = String(xml).replace(/^[\s\S]*?<w:body[^>]*>/, '');
    return body.split(/<\/w:p>/).map(function (para) {
      var out = '', re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g, m;
      while ((m = re.exec(para))) out += m[1] != null ? xmlText(m[1]) : (/^<w:tab/.test(m[0]) ? '\t' : '\n');
      return out;
    }).join('\n');
  }
  function docxText(buffer) {
    return zipEntry(new Uint8Array(buffer), 'word/document.xml').then(function (part) {
      if (!part) throw { code: 'not_docx' };
      return docxXmlToText(new TextDecoder().decode(part));
    });
  }
  /* ---- Other kinds of file: OpenDocument, rich text, PDF ---- */

  // Takes every <tag …>…</tag> block out of a run of XML, in one pass. A longer tag that starts the same way
  // (annotation-end beside annotation) is left alone.
  function cutBlocks(text, tag) {
    var open = '<' + tag, close = '</' + tag + '>', out = '', from = 0, look = 0, a, b, c;
    while ((a = text.indexOf(open, look)) !== -1) {
      c = text.charAt(a + open.length);
      if (c !== '>' && c !== ' ' && c !== '\n' && c !== '\t') { look = a + open.length; continue; }
      b = text.indexOf(close, a);
      if (b === -1) break;
      out += text.slice(from, a); from = look = b + close.length;
    }
    return out + text.slice(from);
  }
  // The words of an OpenDocument text file (.odt): one line per paragraph or heading. Text deleted with tracked
  // changes, and comments, are left out.
  function odtXmlToText(xml) {
    var body = String(xml).replace(/^[\s\S]*?<office:text[^>]*>/, '');
    body = cutBlocks(cutBlocks(body, 'text:tracked-changes'), 'office:annotation');
    return xmlText(body.replace(/<text:s\b[^>]*\/>/g, ' ').replace(/<text:tab\b[^>]*\/>/g, '\t').replace(/<text:line-break\b[^>]*\/>/g, '\n')
      .replace(/<\/text:(?:p|h)>/g, '\n').replace(/<[^>]+>/g, ''));
  }
  function odtText(buffer) {
    return zipEntry(new Uint8Array(buffer), 'content.xml').then(function (part) {
      if (!part) throw { code: 'empty' };
      return odtXmlToText(new TextDecoder().decode(part));
    });
  }

  // Rich text (.rtf). The file is plain characters with commands in it: \par ends a paragraph, \'92 is one
  // character by its number, 舗 is one by its Unicode number with a stand-in after it for old readers.
  // Whole groups that are not the text (fonts, colours, styles, pictures, headers) are skipped.
  var RTF_SKIP = /^(fonttbl|colortbl|stylesheet|info|pict|header|headerl|headerr|headerf|footer|footerl|footerr|footerf|footnote|generator|listtable|listoverridetable|rsidtbl|themedata|colorschememapping|latentstyles|datastore|object|objdata|fldinst|xmlnstbl|pgdsctbl|filetbl|revtbl|annotation|atnid|atnauthor|shppict|nonshppict|pntext|listtext)$/;
  var RTF_CHARS = { emdash: '—', endash: '–', lquote: '‘', rquote: '’', ldblquote: '“', rdblquote: '”', bullet: '•', emspace: ' ', enspace: ' ' };
  var CP1252 = [0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
                0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178];
  function cp1252(byte) { return isNaN(byte) ? '' : String.fromCharCode(byte >= 0x80 && byte < 0xA0 ? CP1252[byte - 0x80] : byte); }
  function rtfText(bytes) {
    var src = '', i, n;
    for (i = 0; i < bytes.length; i += 8192) src += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    if (src.slice(0, 5) !== '{\\rtf') throw { code: 'empty' };
    var out = '', stack = [], skip = false, uc = 1, pending = 0, c, d, m, word, arg, top;
    n = src.length; i = 0;
    function ch(text) { if (pending > 0) { pending -= 1; return; } if (!skip) out += text; }   // one character of the text
    function emit(text) { if (!skip) out += text; }                                            // a break: never a stand-in
    while (i < n) {
      c = src.charAt(i);
      if (c === '{') { stack.push({ skip: skip, uc: uc }); i += 1; continue; }
      if (c === '}') { top = stack.pop(); if (top) { skip = top.skip; uc = top.uc; } pending = 0; i += 1; continue; }
      if (c !== '\\') { if (c !== '\n' && c !== '\r') ch(c); i += 1; continue; }
      d = src.charAt(i + 1);
      if (d === '\\' || d === '{' || d === '}') { ch(d); i += 2; continue; }
      if (d === "'") { ch(cp1252(parseInt(src.substr(i + 2, 2), 16))); i += 4; continue; }
      if (d === '~') { ch(' '); i += 2; continue; }
      if (d === '_') { ch('-'); i += 2; continue; }
      if (d === '*') { skip = true; i += 2; continue; }                      // a group an older reader may ignore: not the text
      if (d === '\n' || d === '\r') { emit('\n'); i += 2; continue; }
      m = /^([a-zA-Z]+)(-?\d+)? ?/.exec(src.substr(i + 1, 40));
      if (!m) { i += 2; continue; }                                         // some other one-character command
      word = m[1]; arg = m[2] == null ? null : Number(m[2]); i += 1 + m[0].length;
      if (RTF_SKIP.test(word)) { skip = true; continue; }
      if (word === 'par' || word === 'line' || word === 'sect' || word === 'page' || word === 'row') emit('\n');
      else if (word === 'tab' || word === 'cell') emit('\t');
      else if (word === 'uc') uc = arg == null ? 1 : Math.max(0, arg);
      else if (word === 'u' && arg != null) { pending = 0; emit(String.fromCharCode(arg < 0 ? arg + 65536 : arg)); pending = uc; }
      else if (RTF_CHARS[word]) ch(RTF_CHARS[word]);
    }
    return out;
  }

  // PDF. Reading one takes a library, pdf.js, which is fetched only when a PDF is first chosen. Its second half
  // is meant to run as a worker; the viewer does not let a page start a worker from another site, so that half
  // is loaded into the page itself, which pdf.js then uses in place of a worker.
  var PDF_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/', PDF_PAGES_MAX = 400, pdfLib = null;
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var el = document.createElement('script'), timer = setTimeout(function () { reject({ code: 'pdf_lib' }); }, 30000);
      el.src = url; el.async = true;
      el.onload = function () { clearTimeout(timer); resolve(); };
      el.onerror = function () { clearTimeout(timer); reject({ code: 'pdf_lib' }); };
      document.head.appendChild(el);
    });
  }
  function loadPdfLib() {
    if (!pdfLib) {
      pdfLib = loadScript(PDF_LIB + 'pdf.min.js').then(function () { return loadScript(PDF_LIB + 'pdf.worker.min.js'); }).then(function () {
        if (!window.pdfjsLib || !window.pdfjsWorker) throw { code: 'pdf_lib' };
        return window.pdfjsLib;
      }).catch(function (err) { pdfLib = null; console.warn('Scriptorium: the PDF reader could not be loaded', err); throw { code: 'pdf_lib' }; });
    }
    return pdfLib;
  }
  // One page's words. A PDF holds lines, not paragraphs: lines that follow closely are run together, and a
  // wider gap starts a new paragraph. A word broken across two lines with a hyphen keeps its hyphen.
  function pdfPageText(items) {
    var paras = [], cur = '', lastY = null, lastH = 0;
    (items || []).forEach(function (it) {
      var str = String(it && it.str != null ? it.str : ''), y = it && it.transform ? Number(it.transform[5]) : NaN, h = Number(it && it.height) || lastH || 10;
      if (!str.trim()) { if (str && cur && !/\s$/.test(cur.slice(-1))) cur += ' '; return; }
      if (lastY != null && !isNaN(y) && Math.abs(y - lastY) > Math.min(h, lastH || h) * 0.5) {
        if (Math.abs(y - lastY) > Math.max(h, lastH) * 1.75) { paras.push(cur); cur = ''; }
        else if (cur && !(cur.slice(-1) === '-' && /^\p{Ll}/u.test(str))) cur = cur.trimEnd() + ' ';
      }
      cur += str;
      if (!isNaN(y)) { lastY = y; lastH = h; }
    });
    paras.push(cur);
    return paras.map(function (p) { return p.trim(); }).filter(Boolean).join('\n\n');
  }
  function pdfText(buffer) {
    return loadPdfLib().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false }).promise;
    }).then(function (doc) {
      var out = [], n = Math.min(Number(doc.numPages) || 0, PDF_PAGES_MAX), i = 0;
      function next() {
        if (i >= n) return Promise.resolve();
        i += 1;
        return doc.getPage(i).then(function (page) { return page.getTextContent(); }).then(function (tc) { out.push(pdfPageText(tc && tc.items)); }).then(next);
      }
      return next().then(function () {
        try { doc.destroy(); } catch (e) {}
        var text = out.filter(Boolean).join('\n\n');
        if (text.replace(/[^\p{L}]/gu, '').length < 20) throw { code: 'scanned' };   // pictures of pages: no words to read
        return text;
      });
    });
  }

  /* ---- Reading any file the page can read ---- */

  var FILE_ACCEPT = '.docx,.pdf,.odt,.rtf,.txt,.md,text/plain,text/markdown,application/pdf,application/rtf,application/vnd.oasis.opendocument.text,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var WRITTEN_PDF_MAX = 30000000;    // bytes of a PDF read from the computer (most of a PDF is not its words)
  var WRITTEN_FILES_MAX = 100;       // files read in one go
  function fileKind(file) {
    var name = String((file && file.name) || '').toLowerCase(), type = String((file && file.type) || ''), m = /\.([a-z0-9]+)$/.exec(name), ext = m ? m[1] : '';
    if (ext === 'docx' || ext === 'odt' || ext === 'rtf' || ext === 'pdf' || ext === 'doc' || ext === 'pages') return ext;
    if (ext === 'txt' || ext === 'md' || ext === 'markdown' || ext === 'text' || /^text\//.test(type)) return 'text';
    return type === 'application/pdf' ? 'pdf' : '';
  }
  // The words of one file, read in the page. Nothing here calls Claude (4.6).
  function readFileText(file) {
    var kind = fileKind(file);
    if (!kind) return Promise.reject({ code: 'kind' });
    if (kind === 'doc' || kind === 'pages') return Promise.reject({ code: kind });
    if (file.size > (kind === 'pdf' ? WRITTEN_PDF_MAX : WRITTEN_FILE_MAX)) return Promise.reject({ code: 'big' });
    if (kind === 'text') return file.text();
    return file.arrayBuffer().then(function (buf) {
      return kind === 'docx' ? docxText(buf) : kind === 'odt' ? odtText(buf) : kind === 'rtf' ? rtfText(new Uint8Array(buf)) : pdfText(buf);
    });
  }
  // Why a file was not read, as the end of a sentence that starts with its name.
  function fileProblem(err) {
    var code = err && err.code;
    if (code === 'kind') return 'is a kind of file that can’t be read here. Use Word (.docx), PDF, OpenDocument (.odt), rich text (.rtf) or plain text';
    if (code === 'doc') return 'is an older Word file (.doc). Open it and save it as .docx or PDF';
    if (code === 'pages') return 'is a Pages file. Export it from Pages as Word or PDF';
    if (code === 'big') return 'is too large to read here';
    if (code === 'scanned') return 'is a scanned PDF: pictures of pages, with no text in it to read';
    if (code === 'pdf_lib') return 'is a PDF, and the PDF reader couldn’t be loaded in this view';
    if (code === 'long') return 'is too long to keep in one piece. Save it as two files';
    if (code === 'empty') return 'had nothing in it that could be read';
    return 'couldn’t be read';
  }
  function readWrittenFile(file) {
    if (!writtenForm || !file) return;
    var name = String(file.name || '');
    writtenForm.busy = 'file'; writtenForm.error = ''; paint();
    Promise.resolve().then(function () { return readFileText(file); }).then(function (text) { takeWrittenText(text, 'file', name); }, function (err) {
      console.warn('Scriptorium: could not read the file', err);
      writtenFail('“' + name + '” ' + fileProblem(err) + '. Or open it and paste the text in below.');
    });
  }

  /* ---- Many files from the computer at once ----
     Any number of files, read here one at a time, each kept as a written script of its own under its own
     title. The title starts as the file's name and can be changed before anything is saved. A file already in
     the library is marked and left unticked; ticking it renews the kept text. None of this calls Claude (4.6). ---- */

  var writtenFiles = null;           // { step: reading | review | saving | done, items, progress, error, report }
  function fileSourceId(name) { return name ? 'file:' + String(name).toLowerCase().slice(0, 180) : ''; }
  function fileHas(name) {
    var id = fileSourceId(name);
    return writtenIndex.filter(function (w) { return w.source === 'file' && (w.sourceId === id || (!w.sourceId && w.sourceName === name)); })[0] || null;
  }
  function filesProgress(text) { if (writtenFiles) { writtenFiles.progress = text; var p = root.querySelector('.files-progress'); if (p) p.textContent = text; } }
  function filesReady(it) { return it.state === 'ready' || it.state === 'have'; }
  function readWrittenFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []), f = writtenFiles;
    if (!files.length || writtenForm || writtenBulk || (f && (f.step === 'reading' || f.step === 'saving'))) return Promise.resolve();
    var over = Math.max(0, files.length - WRITTEN_FILES_MAX);
    files = files.slice(0, WRITTEN_FILES_MAX);
    f = writtenFiles = { step: 'reading', items: [], progress: 'Reading 1 of ' + files.length + '…', report: null,
                         error: over ? 'Only the first ' + WRITTEN_FILES_MAX + ' files were taken. Add the other ' + over + ' after these are saved.' : '' };
    writtenOpen = null; paint();
    var i = 0;
    function next() {
      if (i >= files.length || writtenFiles !== f) return Promise.resolve();
      var file = files[i], name = String((file && file.name) || 'Untitled'); i += 1;
      filesProgress('Reading ' + i + ' of ' + files.length + ' — ' + name + '…');
      return Promise.resolve().then(function () { return readFileText(file); }).then(function (text) {
        text = cleanWritten(text);
        if (!text) throw { code: 'empty' };
        if (text.length > WRITTEN_MAX || jsonBytes({ text: text }) > DOC_MAX_BYTES) throw { code: 'long' };
        f.items.push({ n: f.items.length, name: name, title: titleFromName(name), text: text, chars: text.length, state: 'ready', why: '', pick: true, old: '' });
      }).catch(function (err) {
        console.warn('Scriptorium: could not read a file', err);
        f.items.push({ n: f.items.length, name: name, title: titleFromName(name), text: '', chars: 0, state: 'failed', why: fileProblem(err), pick: false, old: '' });
      }).then(next);
    }
    // The library is read again first, so a file a teammate has already brought in is marked as here.
    return loadWrittenIndex().then(next).then(function () {
      if (writtenFiles !== f) return;
      f.items.forEach(function (it) {
        var old = it.state === 'ready' ? fileHas(it.name) : null;
        if (old) { it.state = 'have'; it.old = old.id; it.title = old.title; it.pick = false; }
      });
      f.step = 'review'; paint();
    });
  }
  function filesPicked() { return writtenFiles ? writtenFiles.items.filter(function (it) { return it.pick && filesReady(it); }) : []; }
  function filesPick(n, on) {
    var it = writtenFiles && writtenFiles.items[Number(n)];
    if (!it || !filesReady(it) || writtenFiles.step !== 'review') return;
    it.pick = !!on; paint();
  }
  function fileNote(it) {
    if (it.state === 'failed') return 'Not read: “' + it.name + '” ' + it.why + '.';
    if (it.state === 'saved') return 'Saved.';
    var place = placeLabel(placeOf(it.title));
    return it.name + ' · ' + it.chars.toLocaleString('en-US') + ' characters · ' + (place ? 'matches guides on ' + place : 'no book and chapter in the title, so matched by its wording alone') +
      (it.state === 'have' ? ' · already in the library: ticking it renews its text' : '');
  }
  function filesTitleTouched(el) {
    var it = writtenFiles && writtenFiles.items[Number(el.dataset.n)];
    if (!it) return;
    it.title = el.value;
    var note = root.querySelector('.files-note[data-n="' + it.n + '"]'); if (note) note.textContent = fileNote(it);
  }
  function saveWrittenFiles() {
    var f = writtenFiles, picked = filesPicked();
    if (!f || f.step !== 'review' || !picked.length) return Promise.resolve();
    var blank = picked.filter(function (it) { return !String(it.title || '').trim(); })[0];
    if (blank) { f.error = '“' + blank.name + '” needs a title: the book and chapter, such as “Luke 24”.'; paint(); return Promise.resolve(); }
    if (!dbRoot) { f.error = 'Saved work can’t be reached in this view.'; paint(); return Promise.resolve(); }
    var report = f.report || (f.report = { files: 0, saved: 0, replaced: 0, split: [], failed: [], stopped: false, halt: false });
    report.failed = []; report.halt = false; report.stopped = false;
    f.step = 'saving'; f.error = ''; f.progress = 'Saving 1 of ' + picked.length + '…'; paint();
    var i = 0;
    function next() {
      if (i >= picked.length || writtenFiles !== f || report.halt) { report.stopped = i < picked.length; return Promise.resolve(); }
      var it = picked[i], title = String(it.title).replace(/\s+/g, ' ').trim(); i += 1;
      filesProgress('Saving ' + i + ' of ' + picked.length + ' — ' + title + '…');
      return putWritten(it.old || newWrittenId(), writtenDoc(title, it.text, 'file', it.name, fileSourceId(it.name)), it.text).then(function () {
        report.files += 1; if (it.old) report.replaced += 1; else report.saved += 1;
        it.state = 'saved'; it.pick = false; it.text = '';
      }, function (err) {
        console.warn('Scriptorium: could not save a written script', err);
        report.failed.push({ name: title, why: writtenSaveProblem(err) });
        if (err && (err.code === 'invalid_argument' || err.code === 'quota_exceeded')) report.halt = true;   // the next one would fail the same way
      }).then(next);
    }
    return next().then(function () {
      if (writtenFiles !== f) return;
      f.step = f.items.some(filesReady) ? 'review' : 'done'; paint();
    });
  }
  function filesReportText(f) {
    var out = f.report ? bulkReportText(f.report) : [], unread = f.items.filter(function (it) { return it.state === 'failed'; }).length;
    if (f.report && f.report.stopped) out[out.length - 1] = 'Stopped before the end. What was saved is kept; the rest are still listed below.';
    if (unread && f.step !== 'reading') out.push(unread + ' file' + plural(unread) + ' could not be read, and ' + (unread === 1 ? 'is' : 'are') + ' named below with the reason.');
    return out;
  }
  function renderWrittenFiles() {
    var f = writtenFiles, busy = f.step === 'reading' || f.step === 'saving', n = filesPicked().length, report = filesReportText(f);
    var list = f.items.length ? '<ul class="pull-list files-list">' + f.items.map(function (it) {
      var can = filesReady(it) && !busy;
      return '<li class="files-item' + (it.state === 'failed' ? ' is-failed' : '') + '">' +
        '<input type="checkbox" data-action="written-files-pick" data-n="' + it.n + '" aria-label="Bring in ' + escAttr(it.name) + '"' + (it.pick ? ' checked' : '') + (can ? '' : ' disabled') + '>' +
        '<span class="files-main">' +
        (it.state === 'failed' ? '' : '<input class="written-input" data-ffield="title" data-n="' + it.n + '" type="text" aria-label="Title for ' + escAttr(it.name) + '" value="' + escAttr(it.title) + '"' + (can ? '' : ' disabled') + '>') +
        '<span class="pull-tag files-note" data-n="' + it.n + '">' + esc(fileNote(it)) + '</span></span></li>';
    }).join('') + '</ul>' : '';
    return '<section class="pull-panel written-form">' +
      '<div class="pull-head"><h3>Add files from this computer</h3>' + (busy ? '' : '<button type="button" class="link-btn" data-action="written-files-close">Close</button>') + '</div>' +
      '<p class="hint">Each file becomes a written script of its own. Its title starts as the file’s name: change any of them before saving. Start a title with the book and chapter (“Luke 24”) so it finds its audio guide.</p>' +
      (report.length && !busy ? '<div class="notice bulk-report">' + report.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') + '</div>' : '') +
      (f.error ? '<p class="notice notice-warn">' + esc(f.error) + '</p>' : '') +
      list +
      (busy ? '<div class="pull-foot"><p class="hint files-progress">' + esc(f.progress) + '</p></div>' : '') +
      (f.step === 'review' ? '<div class="pull-foot"><button type="button" class="btn btn-edit" data-action="written-files-save"' + (n ? '' : ' disabled') + '>' + (n ? 'Save ' + n + ' written script' + plural(n) : 'Save ticked') + '</button></div>' : '') +
      '</section>';
  }

  /* ---- The names in a written script ----
     Evidence for the glossary (4.12): words written with a capital in the middle of a sentence and never
     without one, that the page does not already know as a name or a book of the Bible. Found by the page,
     proposed on the Glossary page, and of no effect until a person approves them. ---- */

  var WRITTEN_TERMS_MAX = 60, termNotMemo = null;
  var TERM_NOT = 'i he him his she her you your yours we our us me my they them their thee thou thy thine ' +
    'god lord jesus christ bible scripture scriptures holy spirit father son savior saviour messiah christian christians christianity jew jews jewish gentile gentiles hebrew hebrews greek greeks roman ' +
    'israelite israelites word kingdom heaven hell church law gospel gospels temple king queen prophet priest apostle apostles disciple disciples psalm psalmist proverb ' +
    'sabbath passover pentecost christmas easter amen hallelujah old new testament monday tuesday wednesday thursday friday saturday sunday ' +
    'january february march april may june july august september october november december mr mrs ms dr st chapter verse verses part introduction conclusion english american ok okay yes no';
  function termNot() {
    if (termNotMemo) return termNotMemo;
    var set = Object.create(null);
    (TERM_NOT + ' ' + SURE.join(' ') + ' ' + BOOKS.replace(/\|/g, ' ')).toLowerCase().split(/\s+/).forEach(function (w) { w = w.replace(/[^a-z]/g, ''); if (w) set[w] = true; });
    return (termNotMemo = set);
  }
  function writtenTerms(text) {
    var counts = Object.create(null), lower = Object.create(null), forms = Object.create(null), not = termNot();
    var wordRe = /\p{L}[\p{L}\p{M}'’-]*/gu, nameRe = /^\p{Lu}[\p{Ll}\p{M}]+(?:[-'’]\p{L}[\p{Ll}\p{M}]*)*$/u;
    tameSpaces(text || '').split('\n').forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#' || line.length > 4000) return;
      // A short line that does not end like a sentence is a heading, where every word may wear a capital.
      var heading = line.length < 70 && !/[.!?,;:"”’)]$/.test(line), m, word, key, before;
      wordRe.lastIndex = 0;
      while ((m = wordRe.exec(line))) {
        word = m[0].replace(/['’]s$/i, '').replace(/['’-]+$/, '');
        key = word.toLowerCase();
        if (word.length < 2 || word.length > 30) continue;
        if (word === key) { lower[key] = true; continue; }
        if (heading || !nameRe.test(word)) continue;
        before = line.slice(Math.max(0, m.index - 12), m.index).replace(/[\s"“‘'(\[*_]+$/, '');
        if (!before || /[.!?:…]$/.test(before)) continue;               // the first word of a sentence wears a capital anyway
        counts[key] = (counts[key] || 0) + 1; forms[key] = word;
      }
    });
    return Object.keys(counts).filter(function (key) { return !lower[key] && !not[key.replace(/[^a-z]/g, '')]; })
      .sort(function (a, b) { return (counts[b] - counts[a]) || (a < b ? -1 : 1); }).slice(0, WRITTEN_TERMS_MAX).map(function (key) { return forms[key]; });
  }

  /* ---- Saving, reading, renaming, deleting ---- */

  function writtenSaveProblem(err) {
    var code = err && err.code;
    if (code === 'too_large') return 'This is too long to keep in one piece: ' + kb(err.bytes) + ', and one written script can hold about ' + kb(DOC_MAX_BYTES) + '. Save it as two written scripts.';
    if (code === 'invalid_argument') return 'This couldn’t be saved. Either the script is too long to keep in one piece, or your access to this artifact is view-only — ask its owner to make you a Contributor.';
    if (code === 'quota_exceeded') return 'The Scriptorium’s storage is full. Remove something that is no longer needed, then try again.';
    return 'This couldn’t be saved just now — try again.';
  }
  // What the listing keeps for one written script. `sourceId` is the Drive file it came from, so the same file
  // brought in again replaces the kept copy rather than adding a second one.
  function writtenDoc(title, text, source, sourceName, sourceId) {
    return { title: title, chars: text.length, at: Date.now(), source: source === 'drive' || source === 'file' ? source : 'paste',
             sourceName: String(sourceName || '').slice(0, 200), sourceId: String(sourceId || '').slice(0, 200), sketch: textSketch(text), terms: writtenTerms(text) };
  }
  // The text first, the listing last: a script that is listed always has its text.
  function putWritten(id, doc, text) {
    var body = { text: text }, bytes = jsonBytes(body), isNew = !writtenIndex.some(function (w) { return w.id === id; });
    if (bytes > DOC_MAX_BYTES) return Promise.reject({ code: 'too_large', bytes: bytes });
    return dbRoot.doc('writtenText/' + id).set(body).then(function () {
      return dbRoot.doc('written/' + id).set(doc).catch(function (err) {
        // The text was kept but its listing was not. A text nothing lists would sit in storage for good, so it is taken back out.
        if (isNew) return dbRoot.doc('writtenText/' + id).delete().catch(function () {}).then(function () { throw err; });
        throw err;
      });
    }).then(function () {
      writtenTexts[id] = text;
      writtenIndex = writtenIndex.filter(function (w) { return w.id !== id; });
      writtenIndex.push(entryFromDoc(id, doc)); writtenStamp += 1;
    });
  }
  function saveWritten() {
    var f = writtenForm;
    if (!f || f.busy) return;
    var title = String(f.title || '').replace(/\s+/g, ' ').trim(), text = String(f.text || '').replace(/\r\n?/g, '\n').trim();
    if (!title) { writtenFail('Give it a title first — the book and chapter, such as “Luke 24”.'); return; }
    if (!text) { writtenFail('There is no script yet. Bring one in from Google Drive or a file, or paste it in.'); return; }
    if (text.length > WRITTEN_MAX) { writtenFail('This is too long to keep in one piece. Save it as two written scripts.'); return; }
    if (!dbRoot) { writtenFail('Saved work can’t be reached in this view.'); return; }
    f.busy = 'save'; f.error = ''; paint();
    var id = newWrittenId();
    var doc = writtenDoc(title, text, f.source, f.sourceName, f.source === 'drive' ? f.sourceId : f.source === 'file' ? fileSourceId(f.sourceName) : '');
    putWritten(id, doc, text).then(function () {
      writtenForm = null;
      var place = placeLabel(placeOf(title));
      flash = 'Saved “' + title + '”. ' + (place ? 'It will be matched to guides on ' + place + '.' : 'No book and chapter were found in its title, so it will be matched by its wording alone.');
      paint();
    }).catch(function (err) {
      console.warn('Scriptorium: could not save the written script', err);
      writtenFail(writtenSaveProblem(err));
    });
  }
  function readWritten(id) {
    writtenForm = null; writtenOpen = { id: id, text: '', loading: true, error: '', title: null, busy: false };
    paint();
    readWrittenText(id).then(function (text) {
      if (writtenOpen && writtenOpen.id === id) { writtenOpen.text = text; writtenOpen.loading = false; paint(); }
    }, function () {
      if (writtenOpen && writtenOpen.id === id) { writtenOpen.loading = false; writtenOpen.error = 'Its text couldn’t be read just now — close this and try again.'; paint(); }
    });
  }
  function renameWritten() {
    var o = writtenOpen, w = o && writtenIndex.filter(function (x) { return x.id === o.id; })[0];
    if (!w || o.busy) return;
    var box = root.querySelector('[data-wfield="rename"]'), title = String(box ? box.value : '').replace(/\s+/g, ' ').trim();
    if (!title) { o.error = 'A written script needs a title.'; paint(); return; }
    if (title === w.title) return;
    o.busy = true; o.error = ''; o.title = title; paint();
    var renamed = { title: title, chars: w.chars, at: w.at, source: w.source, sourceName: w.sourceName, sourceId: w.sourceId, sketch: w.sketch };
    if (w.terms) renamed.terms = w.terms;                       // a new title changes nothing about the names found in the text
    dbRoot.doc('written/' + w.id).set(renamed).then(function () {
      var place = placeOf(title);
      w.title = title; w.book = place.book; w.chapter = place.chapter; w.part = place.part; writtenStamp += 1;
      o.busy = false; o.title = null; paint();
    }).catch(function (err) {
      console.warn('Scriptorium: could not rename the written script', err);
      o.busy = false; o.error = writtenSaveProblem(err); paint();
    });
  }
  function askDeleteWritten(id) {
    var w = writtenIndex.filter(function (x) { return x.id === id; })[0];
    if (!w) return;
    openConfirm({
      title: 'Delete “' + w.title + '”?',
      body: 'This removes the written script for everyone on the team, and it can’t be undone. Guides already edited with it keep their Edited and Final Transcripts; they will simply have no written script matched from now on.',
      warn: '', confirmLabel: 'Delete this written script',
      onConfirm: function () { deleteWritten(id); }
    });
  }
  // The listing goes first, so a script that could only be half removed is at least no longer matched or shown.
  function deleteWritten(id) {
    confirmState = null; writtenDeleting = id; if (writtenOpen && writtenOpen.id === id) writtenOpen = null;
    paint();
    dbRoot.doc('written/' + id).delete().then(function () {
      writtenIndex = writtenIndex.filter(function (w) { return w.id !== id; }); writtenStamp += 1; delete writtenTexts[id];
      return dbRoot.doc('writtenText/' + id).delete().catch(function () {});
    }).then(function () { writtenDeleting = ''; flash = 'Written script deleted.'; paint(); }, function (err) {
      console.warn('Scriptorium: could not delete the written script', err);
      writtenDeleting = ''; flash = 'That written script couldn’t be deleted — try again.'; paint();
    });
  }

  /* ---- At a glance: was this transcript compared with a written script? (4.9) ----
     Each guide's card carries a badge beside its stage, open or folded, and the book carries a count.

       used      the edit pass compared this transcript with that written script
       pending   one is matched, but the Edited Transcript was made without it (or with another): Redo uses it
       ready     one is matched, and the edit pass has not run yet
       none      no written script is matched to this guide
       off       a person chose to use none for this guide

     Nothing here changes what a written script may do. It only says what happened. ---- */

  var writtenReady = false;          // true once the library has been read: until then nothing is claimed either way
  function hasTranscript(s) { return !!(String((s && s.raw) || '').trim() || (s && s.corrected)); }
  function scriptState(s) {
    var m = matchWritten(s), edited = s.status === 'edited', used = edited && s.writtenUsed && s.writtenUsed.id ? s.writtenUsed : null;
    if (edited && m && used && used.id === m.entry.id) return { kind: 'used', title: m.entry.title, how: m.how };
    if (edited && m) return { kind: 'pending', title: m.entry.title, how: m.how, was: used ? String(used.title || '') : '' };
    // The edit pass used one that is no longer matched (deleted, or taken off since): the transcript was still compared with it.
    if (edited && used) return { kind: 'used', title: String(used.title || 'a written script'), how: '', gone: true };
    if (m) return { kind: 'ready', title: m.entry.title, how: m.how };
    return { kind: s.writtenId === 'none' ? 'off' : 'none', title: '', how: '' };
  }
  // The few words on the badge, and the sentence behind it (shown when the pointer rests on it, and read out).
  function scriptWords(st) {
    var how = st.how ? ' (' + st.how + ')' : '';
    if (st.kind === 'used') return { label: 'Script used: ' + st.title, cls: 'script-used',
      tip: 'The edit pass compared this transcript with the written script “' + st.title + '”' + how + '.' + (st.gone ? ' That written script is no longer matched to this guide.' : '') };
    if (st.kind === 'pending') return { label: 'Script not used yet', cls: 'script-pending',
      tip: '“' + st.title + '” is matched to this guide' + how + ', but the edit pass ' + (st.was ? 'used “' + st.was + '” instead' : 'ran without it') + '. Click Redo this one to compare against it.' };
    if (st.kind === 'ready') return { label: 'Script ready: ' + st.title, cls: 'script-ready',
      tip: 'The edit pass will compare this transcript with the written script “' + st.title + '”' + how + '.' };
    if (st.kind === 'off') return { label: 'No script, by choice', cls: 'script-none', tip: 'Someone chose to use no written script for this guide, so the edit pass has nothing to compare the transcript with.' };
    return { label: 'No script', cls: 'script-none', tip: 'No written script is matched to this guide, so the edit pass has nothing to compare the transcript with. Add one under Written Scripts, or choose one on this card.' };
  }
  function scriptBadge(s) {
    if (!writtenReady || !hasTranscript(s)) return '';
    var w = scriptWords(scriptState(s));
    return '<span class="script-badge ' + w.cls + '" title="' + escAttr(w.tip) + '">' + esc(w.label) + '</span>';
  }
  // The book's count: how many of its guides stand in each state.
  function scriptCounts() {
    var c = { total: 0, used: 0, pending: 0, ready: 0, none: 0 };
    state.sections.forEach(function (s) {
      if (!hasTranscript(s)) return;
      var kind = scriptState(s).kind;
      c.total += 1; c[kind === 'off' ? 'none' : kind] += 1;
    });
    return c;
  }
  function scriptSummaryHtml() {
    if (!writtenReady) return '';
    var c = scriptCounts(), bits = [];
    if (!c.total) return '';
    if (!writtenIndex.length && !c.used) return '<span class="script-dot script-none"></span>No guide in this book is compared with a written script: there are none in the library yet. Add them under <strong>Written Scripts</strong> on the front page.';
    if (c.used) bits.push('<span class="script-dot script-used"></span><strong>' + c.used + ' of ' + c.total + '</strong> guide' + plural(c.total) + ' edited against a written script');
    else bits.push('<span class="script-dot script-none"></span><strong>None of ' + c.total + '</strong> guide' + plural(c.total) + ' edited against a written script yet');
    if (c.pending) bits.push('<span class="script-dot script-pending"></span><strong>' + c.pending + '</strong> matched but not used yet (Redo to use it)');
    if (c.ready) bits.push('<span class="script-dot script-ready"></span><strong>' + c.ready + '</strong> matched, waiting for the edit pass');
    if (c.none) bits.push('<span class="script-dot script-none"></span><strong>' + c.none + '</strong> with no written script');
    return bits.join(' <span class="script-sep">·</span> ');
  }
  function renderScriptSummary() { var html = scriptSummaryHtml(); return html ? '<p class="script-summary" aria-label="Written scripts in this book">' + html + '</p>' : ''; }
  // After one card changes, the count and that card's badge are brought up to date without drawing the whole page again.
  function paintScriptSummary() { var el = root.querySelector('.script-summary'); if (el) el.innerHTML = scriptSummaryHtml(); }
  function paintScriptBadge(s) {
    var card = root.querySelector('[data-section="' + s.id + '"]'), badge = card && card.querySelector('.script-badge');
    if (!badge || !writtenReady || !hasTranscript(s)) return;
    var w = scriptWords(scriptState(s));
    badge.className = 'script-badge ' + w.cls; badge.textContent = w.label; badge.setAttribute('title', w.tip);
  }

  /* ---- On a guide's card ---- */

  // One line saying which written script stands behind this guide, and how it was matched — with a way to change it.
  function renderWrittenLine(s) {
    if (!writtenIndex.length) return '';
    var m = matchWritten(s), id = escAttr(s.id), html;
    if (writtenPick[s.id]) {
      var options = writtenIndex.slice().sort(function (a, b) { return naturalCompare(a.title, b.title); }).map(function (w) {
        return '<option value="' + escAttr(w.id) + '"' + (s.writtenId === w.id ? ' selected' : '') + '>' + esc(w.title) + '</option>';
      }).join('');
      html = '<label class="speed-pick">Written script <select data-action="set-written" data-id="' + id + '">' +
        '<option value=""' + (!s.writtenId ? ' selected' : '') + '>Let the page match one</option>' +
        '<option value="none"' + (s.writtenId === 'none' ? ' selected' : '') + '>Use none for this guide</option>' + options + '</select></label> ' +
        '<button type="button" class="link-btn" data-action="written-pick-close" data-id="' + id + '">Cancel</button>';
    } else if (m) {
      html = 'Written script: <strong>' + esc(m.entry.title) + '</strong> <span class="written-how">— ' + esc(m.how) + '</span> ' +
        '<button type="button" class="link-btn" data-action="written-pick" data-id="' + id + '">Change</button>';
    } else {
      html = (s.writtenId === 'none' ? 'No written script is used for this guide.' : 'No written script matches this guide.') +
        ' <button type="button" class="link-btn" data-action="written-pick" data-id="' + id + '">Choose one</button>';
    }
    var note = '';
    if (s.status === 'edited') {
      var used = s.writtenUsed && s.writtenUsed.id;
      if (m && used !== m.entry.id) note = used ? 'The edit pass used “' + s.writtenUsed.title + '”, not this one. Redo this one to use it.' : 'The edit pass ran before this was matched. Redo this one to use it.';
      else if (!m && used) note = 'The edit pass used “' + s.writtenUsed.title + '”.';
    }
    return '<p class="written-line">' + html + (note ? ' <span class="written-note">' + esc(note) + '</span>' : '') + '</p>';
  }
  function setWritten(id, value) {
    var s = findSection(id);
    if (!s) return;
    value = String(value || '');
    delete writtenPick[id];
    if (s.writtenId !== value) { s.writtenId = value; touchBook(); saveSection(id); saveMetaSoon(); }
    paintSection(id);
  }
