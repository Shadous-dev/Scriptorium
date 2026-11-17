/* 06-store.js — Persistence: one small document per script in the artifact store. */
  /* ==================================================================
     Saving — the artifact's document store, one small document per
     script plus a "meta" document. Nothing is written until the saved
     work has finished loading, so a half-loaded page can never
     overwrite or duplicate anything.
     ================================================================== */

  var dbApi = null;
  var dbStatus = 'loading'; // loading | ready | unavailable
  var saveError = null;
  var pendingSaves = {};
  var metaTimer = null;
  var savesInFlight = 0;
  var everSaved = false;

  function sectionToDoc(s) {
    return { name: s.name || '', raw: s.raw || '', corrected: s.corrected || '',
             editedFromRaw: s.editedFromRaw == null ? '' : s.editedFromRaw, hasEditedFrom: s.editedFromRaw != null,
             summary: s.summary || '', changeCount: s.changeCount || 0, misheard: s.misheard || [], nonsensical: s.nonsensical || [],
             edits: s.edits || [], unapplied: s.unapplied || [], verses: s.verses || [], method: s.method || '',
             status: s.status || 'draft', error: s.error || '', editedAt: s.editedAt || 0 };
  }
  function docToSection(id, d) {
    d = d || {};
    return { id: id, name: String(d.name || ''), raw: String(d.raw || ''), corrected: String(d.corrected || ''),
             editedFromRaw: d.hasEditedFrom ? String(d.editedFromRaw || '') : null,
             summary: String(d.summary || ''), changeCount: Number(d.changeCount) || 0,
             misheard: Array.isArray(d.misheard) ? d.misheard : [], nonsensical: Array.isArray(d.nonsensical) ? d.nonsensical : [],
             edits: Array.isArray(d.edits) ? d.edits : [], unapplied: Array.isArray(d.unapplied) ? d.unapplied : [],
             verses: Array.isArray(d.verses) ? d.verses : [], method: String(d.method || ''),
             status: String(d.status || 'draft'), error: d.error ? String(d.error) : null, editedAt: Number(d.editedAt) || null };
  }
  function metaToDoc() {
    return { bookTitle: state.bookTitle || '', wordsToSearchFor: state.wordsToSearchFor || '',
             order: state.sections.map(function (s) { return s.id; }), nextId: state.nextId || 2,
             lastEditAt: state.lastEditAt || 0, approved: !!state.approved,
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
  function saveMeta() { return dbApi ? trackSave('meta', dbApi.doc('state/meta').set(metaToDoc()), saveMeta) : Promise.resolve(); }
  function saveSection(id) {
    var s = findSection(id);
    return (dbApi && s) ? trackSave('s:' + id, dbApi.doc('scripts/' + id).set(sectionToDoc(s)), function () { saveSection(id); }) : Promise.resolve();
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
    if (metaTimer) { clearTimeout(metaTimer); metaTimer = null; saveMeta(); }
  }
  function dbErrorMessage(err) {
    var code = err && err.code;
    if (code === 'quota_exceeded') return 'The workbench is full — remove some scripts before adding more.';
    if (code === 'resource_exhausted') return 'Saving is being throttled — it will catch up in a moment.';
    if (code === 'invalid_argument') return 'One script is too large to save — try splitting it in two.';
    if (code === 'revoked') return 'Saving access was withdrawn — reload the page.';
    return 'Saving hit a snag — your work is still on screen and will retry on your next change.';
  }

  function seedStore(db) {
    var chain = db.doc('state/meta').set(metaToDoc());
    state.sections.forEach(function (s) { chain = chain.then(function () { return db.doc('scripts/' + s.id).set(sectionToDoc(s)); }); });
    return chain;
  }

  function applyStored(meta, byId) {
    state.bookTitle = String(meta.bookTitle || '');
    state.wordsToSearchFor = String(meta.wordsToSearchFor || '');
    state.nextId = Number(meta.nextId) || state.nextId;
    state.lastEditAt = Number(meta.lastEditAt) || null;
    state.approved = !!meta.approved;
    state.lastDoc = (meta.lastDoc && meta.lastDoc.url) ? { url: String(meta.lastDoc.url), at: Number(meta.lastDoc.at) || 0, kind: String(meta.lastDoc.kind || 'doc') } : null;
    var order = Array.isArray(meta.order) ? meta.order : [];
    var rebuilt = [];
    order.forEach(function (id) { if (byId[id]) rebuilt.push(docToSection(id, byId[id])); });
    // A script saved but missing from the order list is kept only if it holds a real transcript;
    // an empty stray (the old half-loaded-page bug) is dropped rather than resurrected.
    Object.keys(byId).forEach(function (id) {
      if (order.indexOf(id) === -1 && byId[id] && String(byId[id].raw || '').trim()) rebuilt.push(docToSection(id, byId[id]));
    });
    if (!rebuilt.length) rebuilt.push(newSection());
    state.sections = rebuilt;
    var maxNum = state.sections.reduce(function (m, s) { var n = Number(String(s.id).replace(/^s/, '')); return n > m ? n : m; }, 0);
    if (state.nextId <= maxNum) state.nextId = maxNum + 1;
    state.sections.forEach(function (s) { if (s.status === 'editing') { s.status = 'draft'; s.error = null; } });
  }

  function initStore() {
    useCap('db').then(function (db) {
      if (!db) { dbStatus = 'unavailable'; paint(); return; }
      return db.doc('state/meta').get().then(function (snap) {
        if (snap && snap.exists) {
          return db.collection('scripts').get().then(function (qs) {
            var byId = {};
            (qs.docs || []).forEach(function (d) { byId[d.id] = d.data(); });
            applyStored(snap.data() || {}, byId);
          });
        }
        return seedStore(db);
      }).then(function () {
        dbApi = db;            // only now may anything be written
        dbStatus = 'ready';
        paint();
      });
    }).catch(function (err) {
      console.warn('Scriptorium: store unavailable', err);
      dbStatus = 'unavailable'; paint();
    });
  }

