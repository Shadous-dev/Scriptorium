/* 01-state.js — App root element and the in-memory state shape. */
  var root = document.getElementById('app-root');

  /* ==================================================================
     State
     ================================================================== */

  function newSectionRaw(id) {
    return { id: id, name: '', raw: '', corrected: '', editedFromRaw: null, summary: '', changeCount: 0,
             misheard: [], nonsensical: [], edits: [], unapplied: [], verses: [], method: '',
             status: 'draft', error: null, editedAt: null };
  }
  function defaultState() {
    return { bookTitle: '', wordsToSearchFor: '', sections: [newSectionRaw('s1')],
             nextId: 2, lastEditAt: null, approved: false, docResult: null, lastDoc: null };
  }
  function loadSeed() {
    try {
      var parsed = JSON.parse(document.getElementById('seed-state').textContent);
      if (parsed && Array.isArray(parsed.sections) && parsed.sections.length) { parsed.lastDoc = parsed.lastDoc || null; return parsed; }
    } catch (e) {}
    return defaultState();
  }

  var state = loadSeed();
  var editState = null;        // { total, done } while an Edit All run is in progress
  var editControllers = [];    // in-flight AbortControllers, for Stop
  var flash = null;            // one-line in-page message (replaces browser alerts)
  var confirmState = null;     // { title, body, warn, confirmLabel, onConfirm }
  var clearing = false;

  function uid() { var id = 's' + state.nextId; state.nextId += 1; return id; }
  function newSection() { return newSectionRaw(uid()); }
  function findSection(id) { return state.sections.filter(function (x) { return x.id === id; })[0]; }

