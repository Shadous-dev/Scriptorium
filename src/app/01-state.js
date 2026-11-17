/* 01-state.js — App root element and the in-memory state shape. */
  var root = document.getElementById('app-root');
  var VERSION = '1.0.0';       // shown at the foot of the page; matches the git tag it was published from

  /* ==================================================================
     State
     ================================================================== */

  function newSectionRaw(id) {
    return { id: id, name: '', raw: '', corrected: '', editedFromRaw: null, summary: '', changeCount: 0,
             misheard: [], nonsensical: [], edits: [], unapplied: [], verses: [], method: '',
             status: 'draft', error: null, editedAt: null, captions: '' };
  }
  function defaultState() {
    return { bookTitle: '', wordsToSearchFor: '', sections: [newSectionRaw('s1')],
             nextId: 2, lastEditAt: null, approved: false, docResult: null, lastDoc: null, createdAt: 0 };
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

  // Not a counter: two people adding a script to the same book at the same moment must not get the same id.
  function uid() { return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function newSection() { return newSectionRaw(uid()); }
  function findSection(id) { return state.sections.filter(function (x) { return x.id === id; })[0]; }

