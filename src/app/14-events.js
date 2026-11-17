/* 14-events.js — Event delegation, keyboard shortcuts, and start-up. */
  /* ==================================================================
     Events
     ================================================================== */

  root.addEventListener('click', function (e) {
    if (e.target.closest('[data-stop-click]') && !e.target.closest('.modal-actions')) return;
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action, id = btn.dataset.id;
    if (action === 'confirm-cancel') { closeConfirm(); return; }
    if (action === 'confirm-ok') { var fn = confirmState && confirmState.onConfirm; if (fn) fn(); return; }
    if (action === 'dismiss-flash') { flash = null; paint(); return; }
    if (action === 'clear-all') { askClearAll(); return; }
    if (action === 'new-book') { createBook(); return; }
    if (action === 'open-book') { openBook(id); return; }
    if (action === 'delete-book') { askDeleteBook(id); return; }
    if (action === 'go-library') { leaveBook(); return; }
    if (action === 'add-section') addSection();
    else if (action === 'remove-section') removeSection(id);
    else if (action === 'toggle-collapse') toggleCollapse(id);
    else if (action === 'collapse-edited') collapseEdited();
    else if (action === 'expand-all') expandAll();
    else if (action === 'copy-corrected') copyCorrected(id, btn);
    else if (action === 'edit-all') editAll();
    else if (action === 'stop-edit') stopEdit();
    else if (action === 'redo-section') redoSection(id);
    else if (action === 'conclude') conclude();
    else if (action === 'download-captions') downloadCaptions(id);
    else if (action === 'download-all-captions') downloadAllCaptions();
    else if (action === 'download-copy') { syncFieldsFromDom(); saveDownload(false).then(function () { paint(); }); }
  });

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.action === 'toggle-approve') toggleApprove(t.checked);
    if (t.dataset.action === 'set-concurrency') { concurrency = Number(t.value) === 1 ? 1 : 2; prefSet('concurrency', concurrency); }
    if (t.dataset.action === 'set-repair') { repairParagraphs = !!t.checked; prefSet('repairParagraphs', repairParagraphs); }
    if (t.dataset.action === 'set-docmode') { docMode = t.value === 'one' ? 'one' : 'perScript'; prefSet('docMode', docMode); paint(); }
  });

  function fieldTouched(el) {
    if (!el || !el.dataset || !el.dataset.field || dbStatus === 'loading') return;
    syncOneField(el);
    if (el.dataset.field === 'captions' && el.dataset.id) {
      var cs = findSection(el.dataset.id);
      saveCaptionsSoon(el.dataset.id);
      if (cs) paintCaptionNote(cs);
      var all = root.querySelector('[data-action="download-all-captions"]');
      if (all) all.disabled = !state.sections.some(function (s) { return s.status === 'edited' && (s.captions || '').trim(); });
      return;
    }
    if (el.dataset.id) saveSectionSoon(el.dataset.id); else saveMetaSoon();
    if (el.dataset.field === 'raw' && el.dataset.id) { var s = findSection(el.dataset.id); if (s && s.status === 'edited') paintChipOnly(s); }
  }
  root.addEventListener('input', function (e) { fieldTouched(e.target); });
  // Remember which captions boxes are unfolded, so a repaint does not fold one the user just opened.
  root.addEventListener('toggle', function (e) {
    var id = e.target && e.target.dataset && e.target.dataset.captionFold;
    if (id) captionOpen[id] = !!e.target.open;
  }, true);
  root.addEventListener('focusout', function (e) { fieldTouched(e.target); });

  root.addEventListener('keydown', function (e) {
    // Enter in a script's title moves on to its transcript box.
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.field === 'name') {
      e.preventDefault();
      var ta = root.querySelector('[data-field="raw"][data-id="' + e.target.dataset.id + '"]');
      if (ta) { try { ta.focus(); } catch (err) {} }
    }
  });

  document.addEventListener('keydown', function (e) {
    if (!confirmState) return;
    if (e.key === 'Escape') { e.preventDefault(); closeConfirm(); return; }
    if (e.key === 'Tab') {
      var buttons = Array.prototype.slice.call(root.querySelectorAll('.modal-actions .btn'));
      if (!buttons.length) return;
      var idx = buttons.indexOf(document.activeElement);
      e.preventDefault();
      var next = e.shiftKey ? (idx <= 0 ? buttons.length - 1 : idx - 1) : (idx === -1 || idx === buttons.length - 1 ? 0 : idx + 1);
      try { buttons[next].focus(); } catch (err) {}
    }
  });

  window.addEventListener('pagehide', flushSaves);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSaves(); });

  paint();
  initStore();
