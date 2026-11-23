/* 07-fields.js — Reading form field values back out of the DOM. */
  /* ==================================================================
     Field syncing
     ================================================================== */

  // Copies one field into the state. Returns true only when the value actually changed.
  function syncOneField(el) {
    var field = el.dataset.field, id = el.dataset.id, target = id ? findSection(id) : state;
    if (!target) return false;
    var before = target[field] == null ? '' : String(target[field]);
    if (before === el.value) return false;
    target[field] = el.value;
    return true;
  }
  function syncFieldsFromDom() { root.querySelectorAll('[data-field]').forEach(syncOneField); }

