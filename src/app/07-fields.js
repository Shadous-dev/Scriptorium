/* 07-fields.js — Reading form field values back out of the DOM. */
  /* ==================================================================
     Field syncing
     ================================================================== */

  function syncOneField(el) {
    var field = el.dataset.field, id = el.dataset.id;
    if (id) { var sec = findSection(id); if (sec) sec[field] = el.value; }
    else state[field] = el.value;
  }
  function syncFieldsFromDom() { root.querySelectorAll('[data-field]').forEach(syncOneField); }

