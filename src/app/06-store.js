/* 06-store.js — Persistence: a shared library of books; per book, one small document per guide and one per guide's captions. */
  /* ==================================================================
     Saving — the artifact's document store, shared by the whole team.

       books/<book>                    title, word list, guide order, counts
       books/<book>/scripts/<guide>    one audio guide: its transcripts, changes and sign-off
       books/<book>/captions/<guide>   that guide's timed captions
       written/<id>                    one written script's title and fingerprint   (15-written-scripts.js)
       writtenText/<id>                that written script's text

     The path says "scripts" because that is what a guide was called when the
     store was laid out. It is kept: renaming it would strand every saved book.

     Every book is its own workbench. Opening, clearing or deleting one
     never touches another.

     The prototypes kept a single workbench at state/meta, scripts/<id>
     and captions/<id>. The first time this version loads, that work is
     copied into a first book and the originals are left where they
     were (SOURCE-OF-TRUTH 4.5: previous work is never thrown away).

     Nothing is written until the open book has finished loading, so a
     half-loaded page can never overwrite or duplicate anything.
     ================================================================== */

  var dbRoot = null;           // the store itself, once it can be reached
  var dbApi = null;            // the store, but only while a book is open and loaded — the gate for every write to it
  var dbStatus = 'loading';    // loading | ready | unavailable
  var view = 'library';        // library | book | written | glossary
  var bookId = null;           // the open book
  var library = [];            // [{ id, title, scripts, edited, finals, at }], most recently worked on first
  var deletingBook = null;
  var saveError = null;
  var pendingSaves = {};
  var pendingCaptionSaves = {};
  var metaTimer = null;
  var savesInFlight = 0;
  var everSaved = false;
  var FIRST_BOOK = 'first';    // where the prototypes' single workbench is copied to — a fixed name, so copying twice is harmless

  function bookRef(book) { return dbRoot.doc('books/' + book); }
  function scriptRef(book, id) { return dbRoot.doc('books/' + book + '/scripts/' + id); }
  function captionRef(book, id) { return dbRoot.doc('books/' + book + '/captions/' + id); }
  // Read a whole collection. The size is asked for outright (1,000 is the most one read may return) rather than
  // left to a default, so a long book cannot come back partly loaded.
  function readAll(path) { return dbRoot.collection(path).limit(1000).get(); }
  function newBookId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function sectionToDoc(s) {
    return { name: s.name || '', raw: s.raw || '', corrected: s.corrected || '',
             editedFromRaw: s.editedFromRaw == null ? '' : s.editedFromRaw, hasEditedFrom: s.editedFromRaw != null,
             summary: s.summary || '', changeCount: s.changeCount || 0, misheard: s.misheard || [], nonsensical: s.nonsensical || [],
             edits: s.edits || [], unapplied: s.unapplied || [], verses: s.verses || [], method: s.method || '',
             status: s.status || 'draft', error: s.error || '', editedAt: s.editedAt || 0, descriptId: s.descriptId || '', descriptName: s.descriptName || '',
             suggested: s.suggested || [], misquotes: s.misquotes || [],
             approvedAt: Number(s.approvedAt) || 0, writtenId: s.writtenId || '',
             writtenUsed: s.writtenUsed ? { id: String(s.writtenUsed.id || ''), title: String(s.writtenUsed.title || '') } : null };
  }
  // What comes back from the store was written by this page, an older version of it, or anyone with access using
  // another tool. So it is read as data of a known shape: a status the page knows, and lists of flat rows.
  var STATUSES = { draft: 1, editing: 1, edited: 1, error: 1 };
  function flatRows(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (row) { return row && typeof row === 'object' && !Array.isArray(row); }).map(function (row) {
      var out = {};
      Object.keys(row).forEach(function (k) { var v = row[k]; if (v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = v; });
      return out;
    });
  }
  function docToSection(id, d, captions) {
    d = (d && typeof d === 'object') ? d : {};
    // `editedSame` says the edit was made from the 1st Draft exactly as it still stands, without keeping a second
    // copy of it. Nothing writes it yet; this version reads it so that a later one safely can.
    return { id: id, captions: String(captions || ''), name: String(d.name || ''), raw: String(d.raw || ''), corrected: String(d.corrected || ''),
             editedFromRaw: d.editedSame === true ? String(d.raw || '') : d.hasEditedFrom ? String(d.editedFromRaw || '') : null,
             summary: String(d.summary || ''), changeCount: Number(d.changeCount) || 0,
             misheard: flatRows(d.misheard), nonsensical: flatRows(d.nonsensical),
             edits: flatRows(d.edits), unapplied: flatRows(d.unapplied),
             verses: flatRows(d.verses), method: String(d.method || ''),
             status: STATUSES.hasOwnProperty(d.status) ? d.status : 'draft', error: d.error ? String(d.error) : null, editedAt: Number(d.editedAt) || null, descriptId: String(d.descriptId || ''), descriptName: String(d.descriptName || ''),
             suggested: flatRows(d.suggested), misquotes: flatRows(d.misquotes),
             approvedAt: Number(d.approvedAt) || 0, writtenId: String(d.writtenId || ''),
             writtenUsed: (d.writtenUsed && d.writtenUsed.id) ? { id: String(d.writtenUsed.id), title: String(d.writtenUsed.title || '') } : null };
  }
  // The book's own document. The counts are there so the library can describe a book without opening it.
  // `approved` is the whole-book tick that earlier versions kept. It is carried, never set: see applyStored.
  function metaToDoc() {
    return { bookTitle: state.bookTitle || '', wordsToSearchFor: state.wordsToSearchFor || '',
             order: state.sections.map(function (s) { return s.id; }), nextId: state.nextId || 2,
             lastEditAt: state.lastEditAt || 0, approved: !!state.approved, createdAt: state.createdAt || 0, touchedAt: state.touchedAt || 0,
             finalCount: state.sections.filter(isFinal).length,
             scriptCount: state.sections.filter(function (s) { return s.raw.trim() || s.name.trim(); }).length,
             editedCount: state.sections.filter(function (s) { return s.status === 'edited'; }).length,
             lastDoc: state.lastDoc ? { url: String(state.lastDoc.url || ''), at: Number(state.lastDoc.at) || 0, kind: String(state.lastDoc.kind || 'doc') } : null };
  }

  /* ---- One write at a time per document ----
     The store asks for it, and it matters: two saves of the same guide sent close together can arrive in either
     order, and the older one arriving last would quietly put back what the reader had just changed. So a save
     asked for while another to the same document is still on its way waits for it, and if several are waiting only
     the newest is sent. What is sent is the document as it stood when the save was asked for, so leaving the book
     in the meantime loses nothing. When the page itself is closing there is no later: the save goes at once. ---- */
  var writeSlots = {};
  var sendNow = false;         // true only while the page is being hidden or closed
  function runWrite(slot, key, write) {
    slot.running = true;
    var p;
    try { p = Promise.resolve(write()); } catch (e) { p = Promise.reject(e); }
    function next() {
      var w = slot.waiting;
      slot.waiting = null; slot.running = false;
      if (w) runWrite(slot, key, w.write).then(w.resolve, w.reject); else delete writeSlots[key];
    }
    return p.then(function (v) { next(); return v; }, function (e) { next(); throw e; });
  }
  function inOrder(key, write) {
    var slot = writeSlots[key];
    if (sendNow) {
      if (slot && slot.waiting) slot.waiting.write = write;      // whatever was waiting must not later put back something older
      try { return Promise.resolve(write()); } catch (e) { return Promise.reject(e); }
    }
    if (!slot) slot = writeSlots[key] = { running: false, waiting: null };
    if (!slot.running) return runWrite(slot, key, write);
    if (!slot.waiting) {
      slot.waiting = { write: write };
      slot.waiting.promise = new Promise(function (resolve, reject) { slot.waiting.resolve = resolve; slot.waiting.reject = reject; });
    } else slot.waiting.write = write;
    return slot.waiting.promise;
  }
  // A document over the store's size limit is refused here, by name, before it is sent.
  function tooLarge(doc, what) {
    var bytes = jsonBytes(doc);
    return bytes > DOC_MAX_BYTES ? { code: 'too_large', what: what, bytes: bytes } : null;
  }

  var retryCounts = {};
  function trackSave(key, promise, retry) {
    savesInFlight += 1; paintStatus();
    return promise.then(function () {
      everSaved = true; delete retryCounts[key];
      if (saveError) { saveError = null; paint(); }
    }).catch(function (err) {
      saveError = dbErrorMessage(err); paint();
      // Try again on our own a few times, with a growing pause, so a blip never loses an edit.
      var n = (retryCounts[key] || 0) + 1; retryCounts[key] = n;
      if (retry && n <= 4 && !(err && (err.code === 'invalid_argument' || err.code === 'quota_exceeded' || err.code === 'revoked' || err.code === 'too_large'))) {
        setTimeout(retry, 2500 * n);
      }
    }).then(function () { savesInFlight -= 1; paintStatus(); });
  }
  // Each save names the book it belongs to. A retry that comes due after the reader has moved to
  // another book is dropped rather than written into the wrong one.
  function saveMeta(book) {
    book = book || bookId;
    if (!dbApi || !book || book !== bookId) return Promise.resolve();
    var doc = metaToDoc();
    return trackSave('meta', inOrder('meta:' + book, function () { return bookRef(book).set(doc); }), function () { saveMeta(book); });
  }
  function saveSection(id, book) {
    book = book || bookId;
    var s = findSection(id);
    if (!dbApi || !s || !book || book !== bookId) return Promise.resolve();
    var doc = sectionToDoc(s), big = tooLarge(doc, '“' + (s.name || 'A guide') + '”');
    if (big) return trackSave('s:' + id, Promise.reject(big));
    return trackSave('s:' + id, inOrder('s:' + book + ':' + id, function () { return scriptRef(book, id).set(doc); }), function () { saveSection(id, book); });
  }
  // Timed captions are kept beside the script, not inside it, so a script's own document stays well under the size cap.
  function saveCaptions(id, book) {
    book = book || bookId;
    var s = findSection(id);
    if (!dbApi || !s || !book || book !== bookId || String(s.captions || '').length > CAPTION_MAX) return Promise.resolve();
    var doc = { srt: String(s.captions || '') }, big = tooLarge(doc, 'The timed captions for “' + (s.name || 'a guide') + '”');
    if (big) return trackSave('c:' + id, Promise.reject(big));
    return trackSave('c:' + id, inOrder('c:' + book + ':' + id, function () { return captionRef(book, id).set(doc); }), function () { saveCaptions(id, book); });
  }
  function saveCaptionsSoon(id) {
    if (!dbApi) return;
    if (pendingCaptionSaves[id]) clearTimeout(pendingCaptionSaves[id]);
    pendingCaptionSaves[id] = setTimeout(function () { delete pendingCaptionSaves[id]; saveCaptions(id); }, 1200);
    paintStatus();
  }
  function saveSectionSoon(id) {
    if (!dbApi) return;
    if (pendingSaves[id]) clearTimeout(pendingSaves[id]);
    pendingSaves[id] = setTimeout(function () { delete pendingSaves[id]; saveSection(id); }, 1200);
    paintStatus();
  }
  function saveMetaSoon() {
    if (!dbApi) return;
    if (metaTimer) clearTimeout(metaTimer);
    metaTimer = setTimeout(function () { metaTimer = null; saveMeta(); }, 1200);
    paintStatus();
  }
  // `closing` is passed when the page is being hidden or closed: nothing may wait its turn then.
  function flushSaves(closing) {
    sendNow = closing === true;
    try {
      Object.keys(pendingSaves).forEach(function (id) { clearTimeout(pendingSaves[id]); delete pendingSaves[id]; saveSection(id); });
      Object.keys(pendingCaptionSaves).forEach(function (id) { clearTimeout(pendingCaptionSaves[id]); delete pendingCaptionSaves[id]; saveCaptions(id); });
      if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; saveMeta(); }
    } finally { sendNow = false; }
  }
  function dbErrorMessage(err) {
    var code = err && err.code;
    if (code === 'too_large') return err.what + ' is too large to save: ' + kb(err.bytes) + ', and one saved item can hold about ' + kb(DOC_MAX_BYTES) + '. It is still on screen. Split it into two guides, then it will save.';
    if (code === 'quota_exceeded') return 'The Scriptorium’s storage is full, so this was not saved. It is still on screen. Delete a book or written scripts that are no longer needed, then change something here to save again.';
    if (code === 'resource_exhausted') return 'Saving is being throttled — it will catch up in a moment.';
    if (code === 'invalid_argument') return 'This couldn’t be saved. Either one guide is too large — try splitting it in two — or your access to this artifact is view-only.';
    if (code === 'revoked') return 'Saving access was withdrawn — reload the page.';
    return 'Saving hit a snag — your work is still on screen and will retry on your next change.';
  }

  function applyStored(meta, byId, captionsById) {
    captionsById = captionsById || {};
    state.bookTitle = String(meta.bookTitle || '');
    state.wordsToSearchFor = String(meta.wordsToSearchFor || '');
    state.nextId = Number(meta.nextId) || state.nextId;
    state.lastEditAt = Number(meta.lastEditAt) || null;
    state.createdAt = Number(meta.createdAt) || 0;
    state.touchedAt = Number(meta.touchedAt) || 0;
    state.approved = !!meta.approved;
    var link = meta.lastDoc ? safeLink(meta.lastDoc.url) : '';
    state.lastDoc = link ? { url: link, at: Number(meta.lastDoc.at) || 0, kind: String(meta.lastDoc.kind || 'doc') } : null;
    var order = Array.isArray(meta.order) ? meta.order : [];
    var rebuilt = [];
    order.forEach(function (id) { if (byId[id]) rebuilt.push(docToSection(id, byId[id], captionsById[id])); });
    // A guide saved but missing from the order list is kept if it holds anything: a name, a transcript, an edit.
    // That is how a guide a teammate added at the same moment is picked up. Only a wholly empty stray is dropped.
    Object.keys(byId).forEach(function (id) {
      var stray = byId[id] || {};
      if (order.indexOf(id) === -1 && byId[id] && (String(stray.raw || '').trim() || String(stray.name || '').trim() || String(stray.corrected || '').trim())) rebuilt.push(docToSection(id, byId[id], captionsById[id]));
    });
    if (!rebuilt.length) rebuilt.push(newSection());
    state.sections = rebuilt;
    // Before each guide had its own sign-off there was one tick for the whole book, cleared whenever anything changed.
    // A book saved with that tick on was reviewed as it stood, so each of its edited guides that has never been saved
    // by this version is Final. Once a guide is saved it carries its own answer and this no longer applies to it.
    if (meta.approved) state.sections.forEach(function (s) {
      if ((byId[s.id] || {}).approvedAt === undefined && s.status === 'edited' && s.corrected) s.approvedAt = Number(meta.lastEditAt) || Date.now();
    });
    var maxNum = state.sections.reduce(function (m, s) { var n = Number(String(s.id).replace(/^s/, '')); return n > m ? n : m; }, 0);
    if (state.nextId <= maxNum) state.nextId = maxNum + 1;
    state.sections.forEach(function (s) { if (s.status === 'editing') { s.status = 'draft'; s.error = null; } });
  }

  // Keyed by document id, on an object with nothing inherited: a document somebody named "constructor" or
  // "__proto__" must not be mistaken for, or turned into, part of the page's own machinery.
  function docsById(qs, pick) {
    var out = Object.create(null);
    ((qs && qs.docs) || []).forEach(function (d) {
      if (!d || typeof d.id !== 'string' || d.id in Object.prototype) return;
      out[d.id] = pick ? pick(d.data() || {}) : d.data();
    });
    return out;
  }
  function noDocs() { return { docs: [] }; }

  /* ---- The library: every book the team has ---- */

  function loadLibrary() {
    return readAll('books').then(function (qs) {
      library = ((qs && qs.docs) || []).map(function (d) {
        var b = d.data() || {};
        return { id: d.id, title: String(b.bookTitle || ''), scripts: Number(b.scriptCount) || 0, edited: Number(b.editedCount) || 0, finals: Number(b.finalCount) || 0,
                 at: Math.max(Number(b.touchedAt) || 0, Number(b.lastEditAt) || 0, Number(b.createdAt) || 0) };
      }).sort(function (a, b) { return b.at - a.at; });
    });
  }

  // Copies the prototypes' single workbench into a first book — once. The book's own document is
  // written last, so a copy that was interrupted is simply done again on the next load.
  function carryOverOldWorkbench() {
    return dbRoot.doc('state/meta').get().then(function (snap) {
      if (!snap || !snap.exists) return;
      var meta = JSON.parse(JSON.stringify(snap.data() || {}));
      if (meta.movedToBook) return;
      return Promise.all([readAll('scripts'), readAll('captions').catch(noDocs)]).then(function (res) {
        var scripts = docsById(res[0]), caps = docsById(res[1]);
        var ids = Object.keys(scripts);
        var worthKeeping = String(meta.bookTitle || '').trim() || ids.some(function (id) { return String((scripts[id] || {}).raw || '').trim(); });
        var chain = Promise.resolve();
        if (worthKeeping) {
          ids.forEach(function (id) { chain = chain.then(function () { return scriptRef(FIRST_BOOK, id).set(JSON.parse(JSON.stringify(scripts[id] || {}))); }); });
          Object.keys(caps).forEach(function (id) { chain = chain.then(function () { return captionRef(FIRST_BOOK, id).set(JSON.parse(JSON.stringify(caps[id] || {}))); }); });
          chain = chain.then(function () {
            var listed = (Array.isArray(meta.order) ? meta.order : ids).filter(function (id) { return scripts[id]; });
            return bookRef(FIRST_BOOK).set({
              bookTitle: String(meta.bookTitle || ''), wordsToSearchFor: String(meta.wordsToSearchFor || ''),
              order: Array.isArray(meta.order) ? meta.order : ids, nextId: Number(meta.nextId) || 2,
              lastEditAt: Number(meta.lastEditAt) || 0, approved: !!meta.approved, createdAt: Number(meta.lastEditAt) || Date.now(),
              scriptCount: listed.filter(function (id) { return String(scripts[id].raw || '').trim() || String(scripts[id].name || '').trim(); }).length,
              editedCount: listed.filter(function (id) { return scripts[id].status === 'edited'; }).length,
              lastDoc: meta.lastDoc || null
            });
          });
        }
        return chain.then(function () { meta.movedToBook = worthKeeping ? FIRST_BOOK : 'none'; return dbRoot.doc('state/meta').set(meta); });
      });
    });
  }

  function loadCollapsed(book) {
    collapsed = {};
    (prefGet('collapsed.' + book, []) || []).forEach(function (id) { collapsed[id] = true; });
  }
  function resetBookUi() { flash = null; saveError = null; editState = null; confirmState = null; captionOpen = {}; captionMemo = {}; pull = null; writtenPick = {}; refEdit = null; }

  function openBook(id) {
    flushSaves();
    dbApi = null; bookId = id; view = 'book'; dbStatus = 'loading'; resetBookUi(); loadCollapsed(id);
    paint();
    var base = 'books/' + id;
    return Promise.all([bookRef(id).get(), readAll(base + '/scripts'), readAll(base + '/captions').catch(noDocs)]).then(function (res) {
      if (bookId !== id) return;                          // the reader has already gone somewhere else
      if (!res[0] || !res[0].exists) {
        return showLibrary('That book isn’t here any more — a teammate may have deleted it.');
      }
      state = defaultState();
      applyStored(res[0].data() || {}, docsById(res[1]), docsById(res[2], function (d) { return d.srt; }));
      dbApi = dbRoot;                                     // only now may anything be written
      dbStatus = 'ready'; prefSet('book', id);
      paint();
      loadWrittenIndex().then(paint);                     // the written scripts, re-read so a teammate's new one can be matched
      loadGlossary().then(paint);                         // and the glossary, so a term approved since counts in the next edit pass (4.12)
    }).catch(function (err) {
      console.warn('Scriptorium: could not open book', err);
      return showLibrary('Couldn’t open that book just now — try again.');
    });
  }

  // Back to the list of books, re-read so a teammate's new or renamed book shows up.
  function showLibrary(message) {
    dbApi = null; bookId = null; view = 'library'; dbStatus = 'loading'; resetBookUi(); prefSet('book', null);
    paint();
    function done() { dbStatus = 'ready'; if (message) flash = message; paint(); }
    return loadLibrary().then(done, done);
  }
  function leaveBook() {
    if (pull && pull.step === 'pulling') { showFlash('Still pulling from Descript. Let it finish, or stop it, before leaving this book.'); return; }
    if (clearing) { showFlash('Still clearing this book. Give it a moment to finish before leaving.'); return; }
    syncFieldsFromDom();
    var unsaved = state.sections.filter(function (s) { return s.handDraft != null && s.handDraft !== s.corrected; })[0];
    if (unsaved) { showFlash('“' + (unsaved.name || 'A guide') + '” has hand corrections that aren’t saved yet. Save or cancel them before leaving this book.'); return; }
    if (editState || state.sections.some(function (s) { return s.status === 'editing'; })) { showFlash('The edit pass is still running. Let it finish, or stop it, before leaving this book.'); return; }
    syncFieldsFromDom(); flushSaves();
    // One last save of the book's own document, so its title and counts are right in the list.
    return Promise.resolve(saveMeta()).then(function () { return showLibrary(); });
  }

  function createBook() {
    var id = newBookId();
    state = defaultState();
    state.sections = [newSection()];
    state.createdAt = Date.now();
    dbApi = null; bookId = id; view = 'book'; dbStatus = 'loading'; resetBookUi(); collapsed = {};
    paint();
    var first = state.sections[0];
    return scriptRef(id, first.id).set(sectionToDoc(first)).then(function () { return bookRef(id).set(metaToDoc()); }).then(function () {
      if (bookId !== id) return;
      dbApi = dbRoot; dbStatus = 'ready'; prefSet('book', id);
      paint();
      var title = root.querySelector('[data-field="bookTitle"]');
      if (title) { try { title.focus(); } catch (e) {} }
    }).catch(function (err) {
      console.warn('Scriptorium: could not create book', err);
      return showLibrary((err && err.code === 'invalid_argument')
        ? 'A new book couldn’t be started. If you can only view this artifact, ask its owner to make you a Contributor.'
        : 'A new book couldn’t be started just now — try again.');
    });
  }

  function askDeleteBook(id) {
    var b = library.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    openConfirm({
      title: 'Delete “' + (b.title || 'Untitled book') + '”?',
      body: 'This deletes the book for everyone on the team — ' + (b.scripts > 1 ? 'all ' + b.scripts + ' of its audio guides' : 'its audio guides') + ', their transcripts and their timed captions — and it can’t be undone. Written scripts are kept, and any Google Doc already created is untouched.',
      warn: '',
      confirmLabel: 'Delete this book',
      onConfirm: function () { deleteBook(id); }
    });
  }
  // The book's own document goes last: if anything fails part-way the book is still listed, and Delete can be run again.
  function deleteBook(id) {
    confirmState = null; deletingBook = id; paint();
    var base = 'books/' + id;
    return Promise.all([readAll(base + '/scripts'), readAll(base + '/captions').catch(noDocs)]).then(function (res) {
      var chain = Promise.resolve();
      Object.keys(docsById(res[0])).forEach(function (sid) { chain = chain.then(function () { return scriptRef(id, sid).delete(); }); });
      Object.keys(docsById(res[1])).forEach(function (sid) { chain = chain.then(function () { return captionRef(id, sid).delete(); }); });
      return chain.then(function () { return bookRef(id).delete(); });
    }).then(function () {
      deletingBook = null;
      try { localStorage.removeItem('scriptorium.collapsed.' + id); } catch (e) {}
      return showLibrary('Book deleted.');
    }, function (err) {
      console.warn('Scriptorium: could not delete book', err);
      deletingBook = null;
      return showLibrary('That book couldn’t be fully deleted — try Delete again.');
    });
  }

  function initStore() {
    useCap('db').then(function (db) {
      // No store in this view: fall back to one unsaved workbench, as the page always has.
      if (!db) { dbStatus = 'unavailable'; view = 'book'; paint(); return; }
      dbRoot = db;
      return carryOverOldWorkbench().catch(function (err) { console.warn('Scriptorium: could not carry over the old workbench', err); })
        .then(loadLibrary)
        .then(function () {
          loadWrittenIndex().then(function () { if (view !== 'book' || dbStatus === 'ready') paint(); });
          loadGlossary().then(function () { if (view === 'library') paint(); });
          var last = prefGet('book', null);
          if (last && library.some(function (b) { return b.id === last; })) return openBook(last);
          dbStatus = 'ready'; view = 'library'; paint();
        });
    }).catch(function (err) {
      console.warn('Scriptorium: store unavailable', err);
      dbStatus = 'unavailable'; view = 'book'; paint();
    });
  }
