/* 17-events.js — Event delegation, keyboard shortcuts, and start-up. Listed last in the manifest: it starts the page. */
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
    if (action === 'go-library') { if (view === 'written') showLibrary(); else leaveBook(); return; }
    if (action === 'go-written') { openWritten(); return; }
    if (action === 'written-new') { startWrittenForm(); return; }
    if (action === 'written-cancel') { writtenForm = null; paint(); return; }
    if (action === 'written-fetch') { fetchWrittenFromDrive(); return; }
    if (action === 'written-file') return;                              // a file box: handled on change
    if (action === 'written-save') { saveWritten(); return; }
    if (action === 'written-read') { readWritten(id); return; }
    if (action === 'written-close') { writtenOpen = null; paint(); return; }
    if (action === 'written-rename') { renameWritten(); return; }
    if (action === 'written-delete') { askDeleteWritten(id); return; }
    if (action === 'written-bulk') { openWrittenBulk(); return; }
    if (action === 'written-bulk-close') { writtenBulk = null; paint(); return; }
    if (action === 'written-bulk-list') { listWrittenBulk(); return; }
    if (action === 'written-bulk-start') { startWrittenBulk(); return; }
    if (action === 'written-bulk-stop') { if (writtenBulk) { writtenBulk.stop = true; paint(); } return; }
    if (action === 'written-bulk-pick' || action === 'written-bulk-all') return;   // checkboxes: handled on change
    if (action === 'written-pick') { writtenPick[id] = true; paintSection(id); return; }
    if (action === 'written-pick-close') { delete writtenPick[id]; paintSection(id); return; }
    if (action === 'set-written') return;                               // a list: handled on change
    if (action === 'approve') { approveSection(id); return; }
    if (action === 'unapprove') { unapproveSection(id); return; }
    if (action === 'ref-edit') { startRefEdit(id, Number(btn.dataset.i)); return; }
    if (action === 'ref-save') { saveRefEdit(); return; }
    if (action === 'ref-cancel') { cancelRefEdit(); return; }
    if (action === 'use-ref') { useSuggestedRef(id, Number(btn.dataset.i), btn.dataset.ref || ''); return; }
    if (action === 'hand-edit') { startHandEdit(id); return; }
    if (action === 'hand-save') { saveHandEdit(id); return; }
    if (action === 'hand-cancel') { cancelHandEdit(id); return; }
    if (action === 'pull-descript') { openPull(); return; }
    if (action === 'pull-close') { closePull(); return; }
    if (action === 'pull-open') { pullOpenFolder(btn.dataset.path || '', btn.dataset.unfiled === '1'); return; }
    if (action === 'pull-more') { pullOpenFolder(pull ? pull.path : '', !!(pull && pull.unfiled)); return; }
    if (action === 'pull-start') { pullStart(); return; }
    if (action === 'pull-stop') { pullStop(); return; }
    if (action === 'pull-pick' || action === 'pull-all') return;      // checkboxes: handled on change
    if (action === 'add-section') addSection();
    else if (action === 'remove-section') removeSection(id);
    else if (action === 'toggle-collapse') toggleCollapse(id);
    else if (action === 'collapse-edited') collapseEdited();
    else if (action === 'expand-all') expandAll();
    else if (action === 'copy-corrected') copyCorrected(id, btn);
    else if (action === 'edit-all') editAll();
    else if (action === 'stop-edit') stopEdit();
    else if (action === 'redo-section') askRedo(id);
    else if (action === 'conclude') conclude();
    else if (action === 'download-captions') downloadCaptions(id);
    else if (action === 'download-all-captions') downloadAllCaptions();
    else if (action === 'download-copy') { syncFieldsFromDom(); saveDownload(false).then(function () { paint(); }); }
  });

  root.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.action === 'set-written') setWritten(t.dataset.id, t.value);
    if (t.dataset.action === 'written-file') readWrittenFile(t.files && t.files[0]);
    if (t.dataset.action === 'written-bulk-pick') bulkPick(t.dataset.id, t.checked);
    if (t.dataset.action === 'written-bulk-all') bulkPickAll(t.checked);
    if (t.dataset.action === 'pull-pick') pullPick(t.dataset.id, t.checked);
    if (t.dataset.action === 'pull-all') pullPickAll(t.checked);
    if (t.dataset.action === 'set-concurrency') { concurrency = Number(t.value) === 1 ? 1 : 2; prefSet('concurrency', concurrency); }
    if (t.dataset.action === 'set-repair') { repairParagraphs = !!t.checked; prefSet('repairParagraphs', repairParagraphs); }
    if (t.dataset.action === 'set-docmode') { docMode = docModeOf(t.value); prefSet('docMode', docMode); paint(); }
    if (t.dataset.action === 'set-captionformat') { captionFormat = captionFormatOf(t.value); prefSet('captionFormat', captionFormat); }
  });

  function fieldTouched(el) {
    if (!el || !el.dataset || !el.dataset.field || dbStatus === 'loading' || view !== 'book') return false;
    // Nothing is saved for a field that was only clicked into and left. A save writes the whole guide, so a save
    // with no change behind it could put this reader's older copy over a teammate's newer one.
    if (!syncOneField(el)) return false;
    if (el.dataset.field === 'handDraft') return false;        // a hand correction is saved only when the reader clicks Save changes
    if (el.dataset.field === 'captions' && el.dataset.id) {
      var cs = findSection(el.dataset.id);
      saveCaptionsSoon(el.dataset.id);
      if (cs) paintCaptionNote(cs);
      var all = root.querySelector('[data-action="download-all-captions"]');
      if (all) all.disabled = !state.sections.some(function (s) { return s.status === 'edited' && (s.captions || '').trim(); });
      return true;
    }
    if (el.dataset.id) saveSectionSoon(el.dataset.id); else saveMetaSoon();
    if (el.dataset.field === 'raw' && el.dataset.id) { var s = findSection(el.dataset.id); if (s && s.status === 'edited') paintChipOnly(s); }
    return true;
  }
  // The Written Scripts page keeps its own fields; they never touch the open book.
  function writtenFieldTouched(el) {
    var field = el.dataset.wfield;
    if (field === 'query') { writtenQuery = el.value; var list = document.getElementById('written-list'); if (list) list.innerHTML = renderWrittenList(); return; }
    if (field === 'rename') { if (writtenOpen) writtenOpen.title = el.value; return; }
    if (field === 'bulkLinks') { if (writtenBulk) writtenBulk.links = el.value; return; }
    if (!writtenForm) return;
    writtenForm[field] = el.value;
    if (field === 'text') {
      if (writtenForm.source !== 'paste') { writtenForm.source = 'paste'; writtenForm.sourceName = ''; writtenForm.sourceId = ''; }   // typed over: it is no longer the file as it came
      var note = root.querySelector('.written-count'); if (note) note.textContent = writtenFormNote();
    }
  }
  root.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.dataset && t.dataset.wfield) { writtenFieldTouched(t); return; }
    var changed = fieldTouched(t);
    // Typing is work on the book — but not typing in an unsaved hand correction, which changes nothing yet.
    if (changed && dbApi && t.dataset.field !== 'handDraft') { touchBook(); if (t.dataset.id) saveMetaSoon(); }
  });
  // Remember which captions boxes are unfolded, so a repaint does not fold one the user just opened.
  root.addEventListener('toggle', function (e) {
    var id = e.target && e.target.dataset && e.target.dataset.captionFold;
    if (id) captionOpen[id] = !!e.target.open;
  }, true);
  root.addEventListener('focusout', function (e) { fieldTouched(e.target); });

  root.addEventListener('keydown', function (e) {
    // Enter saves a reference being typed, and Escape leaves it as it was.
    if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-ref-input')) {
      if (e.key === 'Enter') { e.preventDefault(); saveRefEdit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancelRefEdit(); }
      return;
    }
    // Enter in a guide's name moves on to its transcript box.
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
