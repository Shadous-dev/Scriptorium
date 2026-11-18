/* 06-store.js — Persistence: a shared library of books; per book, one small document per script and one per script's captions. */
  /* ==================================================================
     Saving — the artifact's document store, shared by the whole team.

       books/<book>                    title, word list, script order, counts
       books/<book>/scripts/<script>   one script
       books/<book>/captions/<script>  that script's timed captions

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
  var view = 'library';        // library | book
  var bookId = null;           // the open book
  var library = [];            // [{ id, title, scripts, edited, at }], most recently worked on first
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
  function newBookId() { return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function sectionToDoc(s) {
    return { name: s.name || '', raw: s.raw || '', corrected: s.corrected || '',
             editedFromRaw: s.editedFromRaw == null ? '' : s.editedFromRaw, hasEditedFrom: s.editedFromRaw != null,
             summary: s.summary || '', changeCount: s.changeCount || 0, misheard: s.misheard || [], nonsensical: s.nonsensical || [],
             edits: s.edits || [], unapplied: s.unapplied || [], verses: s.verses || [], method: s.method || '',
             status: s.status || 'draft', error: s.error || '', editedAt: s.editedAt || 0, descriptId: s.descriptId || '' };
  }
  function docToSection(id, d, captions) {
    d = d || {};
    return { id: id, captions: String(captions || ''), name: String(d.name || ''), raw: String(d.raw || ''), corrected: String(d.corrected || ''),
             editedFromRaw: d.hasEditedFrom ? String(d.editedFromRaw || '') : null,
             summary: String(d.summary || ''), changeCount: Number(d.changeCount) || 0,
             misheard: Array.isArray(d.misheard) ? d.misheard : [], nonsensical: Array.isArray(d.nonsensical) ? d.nonsensical : [],
             edits: Array.isArray(d.edits) ? d.edits : [], unapplied: Array.isArray(d.unapplied) ? d.unapplied : [],
             verses: Array.isArray(d.verses) ? d.verses : [], method: String(d.method || ''),
             status: String(d.status || 'draft'), error: d.error ? String(d.error) : null, editedAt: Number(d.editedAt) || null, descriptId: String(d.descriptId || '') };
  }
  // The book's own document. The two counts are there so the library can describe a book without opening it.
  function metaToDoc() {
    return { bookTitle: state.bookTitle || '', wordsToSearchFor: state.wordsToSearchFor || '',
             order: state.sections.map(function (s) { return s.id; }), nextId: state.nextId || 2,
             lastEditAt: state.lastEditAt || 0, approved: !!state.approved, createdAt: state.createdAt || 0,
             scriptCount: state.sections.filter(function (s) { return s.raw.trim() || s.name.trim(); }).length,
             editedCount: state.sections.filter(function (s) { return s.status === 'edited'; }).length,
             lastDoc: state.lastDoc ? { url: String(state.lastDoc.url || ''), at: Number(state.lastDoc.at) || 0, kind: String(state.lastDoc.kind || 'doc') } : null };
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
      if (retry && n <= 4 && !(err && (err.code === 'invalid_argument' || err.code === 'quota_exceeded' || err.code === 'revoked'))) {
        setTimeout(retry, 2500 * n);
      }
    }).then(function () { savesInFlight -= 1; paintStatus(); });
  }
  // Each save names the book it belongs to. A retry that comes due after the reader has moved to
  // another book is dropped rather than written into the wrong one.
  function saveMeta(book) {
    book = book || bookId;
    if (!dbApi || !book || book !== bookId) return Promise.resolve();
    return trackSave('meta', bookRef(book).set(metaToDoc()), function () { saveMeta(book); });
  }
  function saveSection(id, book) {
    book = book || bookId;
    var s = findSection(id);
    if (!dbApi || !s || !book || book !== bookId) return Promise.resolve();
    return trackSave('s:' + id, scriptRef(book, id).set(sectionToDoc(s)), function () { saveSection(id, book); });
  }
  // Timed captions are kept beside the script, not inside it, so a script's own document stays well under the size cap.
  function saveCaptions(id, book) {
    book = book || bookId;
    var s = findSection(id);
    if (!dbApi || !s || !book || book !== bookId || String(s.captions || '').length > CAPTION_MAX) return Promise.resolve();
    return trackSave('c:' + id, captionRef(book, id).set({ srt: String(s.captions || '') }), function () { saveCaptions(id, book); });
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
  function flushSaves() {
    Object.keys(pendingSaves).forEach(function (id) { clearTimeout(pendingSaves[id]); delete pendingSaves[id]; saveSection(id); });
    Object.keys(pendingCaptionSaves).forEach(function (id) { clearTimeout(pendingCaptionSaves[id]); delete pendingCaptionSaves[id]; saveCaptions(id); });
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; saveMeta(); }
  }
  function dbErrorMessage(err) {
    var code = err && err.code;
    if (code === 'quota_exceeded') return 'The workbench is full — remove some scripts before adding more.';
    if (code === 'resource_exhausted') return 'Saving is being throttled — it will catch up in a moment.';
    if (code === 'invalid_argument') return 'This couldn’t be saved. Either one script is too large — try splitting it in two — or your access to this artifact is view-only.';
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
    state.approved = !!meta.approved;
    state.lastDoc = (meta.lastDoc && meta.lastDoc.url) ? { url: String(meta.lastDoc.url), at: Number(meta.lastDoc.at) || 0, kind: String(meta.lastDoc.kind || 'doc') } : null;
    var order = Array.isArray(meta.order) ? meta.order : [];
    var rebuilt = [];
    order.forEach(function (id) { if (byId[id]) rebuilt.push(docToSection(id, byId[id], captionsById[id])); });
    // A script saved but missing from the order list is kept only if it holds a real transcript —
    // that is how a script a teammate added at the same moment is picked up — and an empty stray is dropped.
    Object.keys(byId).forEach(function (id) {
      if (order.indexOf(id) === -1 && byId[id] && String(byId[id].raw || '').trim()) rebuilt.push(docToSection(id, byId[id], captionsById[id]));
    });
    if (!rebuilt.length) rebuilt.push(newSection());
    state.sections = rebuilt;
    var maxNum = state.sections.reduce(function (m, s) { var n = Number(String(s.id).replace(/^s/, '')); return n > m ? n : m; }, 0);
    if (state.nextId <= maxNum) state.nextId = maxNum + 1;
    state.sections.forEach(function (s) { if (s.status === 'editing') { s.status = 'draft'; s.error = null; } });
  }

  function docsById(qs, pick) {
    var out = {};
    ((qs && qs.docs) || []).forEach(function (d) { out[d.id] = pick ? pick(d.data() || {}) : d.data(); });
    return out;
  }
  function noDocs() { return { docs: [] }; }

  /* ---- The library: every book the team has ---- */

  function loadLibrary() {
    return dbRoot.collection('books').get().then(function (qs) {
      library = ((qs && qs.docs) || []).map(function (d) {
        var b = d.data() || {};
        return { id: d.id, title: String(b.bookTitle || ''), scripts: Number(b.scriptCount) || 0, edited: Number(b.editedCount) || 0,
                 at: Math.max(Number(b.lastEditAt) || 0, Number(b.createdAt) || 0) };
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
      return Promise.all([dbRoot.collection('scripts').get(), dbRoot.collection('captions').get().catch(noDocs)]).then(function (res) {
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
  function resetBookUi() { flash = null; saveError = null; editState = null; confirmState = null; captionOpen = {}; captionMemo = {}; pull = null; }

  function openBook(id) {
    flushSaves();
    dbApi = null; bookId = id; view = 'book'; dbStatus = 'loading'; resetBookUi(); loadCollapsed(id);
    paint();
    var base = 'books/' + id;
    return Promise.all([bookRef(id).get(), dbRoot.collection(base + '/scripts').get(), dbRoot.collection(base + '/captions').get().catch(noDocs)]).then(function (res) {
      if (bookId !== id) return;                          // the reader has already gone somewhere else
      if (!res[0] || !res[0].exists) {
        return showLibrary('That book isn’t here any more — a teammate may have deleted it.');
      }
      state = defaultState();
      applyStored(res[0].data() || {}, docsById(res[1]), docsById(res[2], function (d) { return d.srt; }));
      dbApi = dbRoot;                                     // only now may anything be written
      dbStatus = 'ready'; prefSet('book', id);
      paint();
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
      body: 'This deletes the book for everyone on the team — ' + (b.scripts > 1 ? 'all ' + b.scripts + ' of its scripts' : 'its scripts') + ', their corrected text and their timed captions — and it can’t be undone. Any Google Doc already created is untouched.',
      warn: '',
      confirmLabel: 'Delete this book',
      onConfirm: function () { deleteBook(id); }
    });
  }
  // The book's own document goes last: if anything fails part-way the book is still listed, and Delete can be run again.
  function deleteBook(id) {
    confirmState = null; deletingBook = id; paint();
    var base = 'books/' + id;
    return Promise.all([dbRoot.collection(base + '/scripts').get(), dbRoot.collection(base + '/captions').get().catch(noDocs)]).then(function (res) {
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
          var last = prefGet('book', null);
          if (last && library.some(function (b) { return b.id === last; })) return openBook(last);
          dbStatus = 'ready'; view = 'library'; paint();
        });
    }).catch(function (err) {
      console.warn('Scriptorium: store unavailable', err);
      dbStatus = 'unavailable'; view = 'book'; paint();
    });
  }
