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
  var writtenIndex = [];             // [{ id, title, book, chapter, part, chars, at, source, sourceName, sketch }]
  var writtenStamp = 0;              // goes up whenever the list changes, so remembered matches are worked out again
  var writtenMore = false;           // true when the store holds more than one read returns
  var writtenTexts = {};             // id → text, kept once read
  var writtenQuery = '';
  var writtenForm = null;            // the Add form: { title, link, text, source, sourceName, busy, error }
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
             source: String(d.source || 'paste'), sourceName: String(d.sourceName || ''),
             sketch: Array.isArray(d.sketch) ? d.sketch.map(Number).filter(function (n) { return n >= 0; }).sort(function (a, b) { return a - b; }) : [] };
  }
  function loadWrittenIndex() {
    if (!dbRoot) return Promise.resolve();
    return readAll('written').then(function (qs) {
      var docs = (qs && qs.docs) || [];
      writtenIndex = docs.map(function (d) { return entryFromDoc(d.id, d.data()); }).filter(function (w) { return w.title; });
      writtenMore = docs.length >= 1000; writtenStamp += 1;
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
    view = 'written'; flash = null; writtenForm = null; writtenOpen = null; writtenQuery = ''; dbStatus = 'loading';
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
      (writtenMore ? '<p class="notice notice-warn">Only the first 1,000 written scripts are listed. Search by title to find one that is missing here.</p>' : '');
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
      '<input id="written-file" class="written-file" data-action="written-file" type="file" accept=".txt,.md,.docx,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document"' + dis + '>' +
      '<p class="hint">A Word file (.docx) or a text file (.txt). For anything else — a PDF, Pages, an older .doc — open it and paste the text below.</p>' +
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
    var loading = dbStatus === 'loading', n = writtenIndex.length;
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
      '<div class="bar-group"><button type="button" class="btn btn-add" data-action="written-new"' + (loading || writtenForm ? ' disabled' : '') + '>+ Add Written Script</button></div>' +
      '<p class="status-line">' + (loading ? 'Loading the written scripts…' : n + ' written script' + plural(n)) + '</p>' +
      '<div class="action-bar-end"><input class="written-search" data-wfield="query" type="search" placeholder="Search by title, book or chapter" aria-label="Search written scripts" value="' + escAttr(writtenQuery) + '"' + (loading ? ' disabled' : '') + '></div>' +
      '</div>' +
      (writtenForm ? renderWrittenForm() : '') +
      (writtenOpen ? renderWrittenOpen() : '') +
      (loading ? renderSkeleton() : '<div id="written-list">' + renderWrittenList() + '</div>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  /* ---- Adding one ---- */

  function startWrittenForm() {
    writtenOpen = null;
    writtenForm = { title: '', link: '', text: '', source: 'paste', sourceName: '', busy: '', error: '' };
    paint();
    var box = root.querySelector('[data-wfield="title"]');
    if (box) { try { box.focus(); } catch (e) {} }
  }
  function writtenFail(message) { if (writtenForm) { writtenForm.busy = ''; writtenForm.error = message; paint(); } }
  // A title to start from, when the reader has not typed one: the file or Doc's name without its ending.
  function titleFromName(name) { return String(name || '').replace(/\.(docx|txt|md|markdown|text)$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function takeWrittenText(text, source, name) {
    if (!writtenForm) return;
    text = String(text || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) { writtenFail('Nothing could be read from that. Open it and paste the text in instead.'); return; }
    writtenForm.text = text; writtenForm.source = source; writtenForm.sourceName = String(name || ''); writtenForm.busy = ''; writtenForm.error = '';
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
  function fetchWrittenFromDrive() {
    if (!writtenForm || writtenForm.busy) return;
    var id = driveFileId(writtenForm.link);
    if (!id) { writtenFail('That doesn’t look like a link to a Google Doc or Sheet. Open the file, copy the link from the address bar, and paste it here.'); return; }
    writtenForm.busy = 'drive'; writtenForm.error = ''; paint();
    useCap('mcp').then(function (mcp) {
      if (!mcp) throw { code: 'capability_disabled' };
      return mcp.listTools().then(function (list) {
        var server = ((list && list.servers) || []).filter(function (sv) { return sv.server === 'Google Drive'; })[0];
        if (!server) throw { code: 'server_not_connected' };
        if (server.authStatus === 'needs_reauth') throw { code: 'needs_reauth' };
        var tool = (server.tools || []).filter(function (t) { return /read.*content/i.test(t.name); })[0];
        if (!tool) throw { code: 'no_tool' };
        return mcp.callTool('Google Drive', tool.name, { fileId: id }, { cache: false });
      });
    }).then(function (res) {
      var got = driveFileText(res);
      takeWrittenText(got.text, 'drive', got.name);
    }).catch(function (err) {
      console.warn('Scriptorium: could not read from Google Drive', err);
      writtenFail(driveProblem(err));
    });
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
  function readWrittenFile(file) {
    if (!writtenForm || !file) return;
    var name = String(file.name || '');
    if (file.size > WRITTEN_FILE_MAX) { writtenFail('That file is too large to read here. Open it and paste the text in instead.'); return; }
    writtenForm.busy = 'file'; writtenForm.error = ''; paint();
    var reading;
    if (/\.docx$/i.test(name)) reading = file.arrayBuffer().then(docxText);
    else if (/\.(txt|md|markdown|text)$/i.test(name) || /^text\//.test(file.type || '')) reading = file.text();
    else reading = Promise.reject({ code: 'kind' });
    reading.then(function (text) { takeWrittenText(text, 'file', name); }, function (err) {
      console.warn('Scriptorium: could not read the file', err);
      writtenFail((err && err.code === 'kind')
        ? 'That kind of file can’t be read here. Use a Word file (.docx) or a text file (.txt), or open it and paste the text in below.'
        : 'That file couldn’t be read. If it is a Word file, open it and paste the text in below.');
    });
  }

  /* ---- Saving, reading, renaming, deleting ---- */

  function writtenSaveProblem(err) {
    var code = err && err.code;
    if (code === 'invalid_argument') return 'This couldn’t be saved. Either the script is too long to keep in one piece, or your access to this artifact is view-only — ask its owner to make you a Contributor.';
    if (code === 'quota_exceeded') return 'The Scriptorium’s storage is full. Remove something that is no longer needed, then try again.';
    return 'This couldn’t be saved just now — try again.';
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
    var doc = { title: title, chars: text.length, at: Date.now(), source: f.source === 'drive' || f.source === 'file' ? f.source : 'paste', sourceName: String(f.sourceName || '').slice(0, 200), sketch: textSketch(text) };
    // The text first, the listing last: a script that is listed always has its text.
    dbRoot.doc('writtenText/' + id).set({ text: text }).then(function () { return dbRoot.doc('written/' + id).set(doc); }).then(function () {
      writtenTexts[id] = text;
      writtenIndex.push(entryFromDoc(id, doc)); writtenStamp += 1;
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
    dbRoot.doc('written/' + w.id).set({ title: title, chars: w.chars, at: w.at, source: w.source, sourceName: w.sourceName, sketch: w.sketch }).then(function () {
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
