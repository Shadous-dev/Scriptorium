/* 08-actions.js — Adding, removing, collapsing and copying scripts. */
  /* ==================================================================
     Actions
     ================================================================== */

  function showFlash(message) { flash = message; paint(); }

  function addSection() {
    syncFieldsFromDom();
    var added = newSection();
    state.sections.push(added);
    state.approved = false;
    paint();
    saveSection(added.id); saveMeta();
    var nameEl = root.querySelector('[data-field="name"][data-id="' + added.id + '"]');
    if (nameEl) { try { nameEl.focus(); nameEl.scrollIntoView({ block: 'center' }); } catch (e) {} }
  }

  function removeSection(id) {
    syncFieldsFromDom();
    var victim = findSection(id);
    state.sections = state.sections.filter(function (s) { return s.id !== id; });
    var replacement = null;
    if (!state.sections.length) { replacement = newSection(); state.sections.push(replacement); }
    state.approved = false;
    delete collapsed[id]; persistCollapsed();
    paint();
    if (dbApi) {
      scriptRef(bookId, id).delete().catch(function () {
        showFlash('“' + ((victim && victim.name) || 'That script') + '” was removed from view but could not be deleted from storage — it may reappear when you reload. Try removing it again then.');
      });
    }
    if (dbApi) captionRef(bookId, id).delete().catch(function () {});
    delete captionOpen[id]; delete captionMemo[id];
    if (replacement) saveSection(replacement.id);
    saveMeta();
  }

  function toggleCollapse(id) { if (collapsed[id]) delete collapsed[id]; else collapsed[id] = true; persistCollapsed(); paint(); }
  function collapseEdited() { state.sections.forEach(function (s) { if (s.status === 'edited') collapsed[s.id] = true; }); persistCollapsed(); paint(); }
  function expandAll() { collapsed = {}; persistCollapsed(); paint(); }

  function copyCorrected(id, btn) {
    var s = findSection(id);
    if (!s || !s.corrected) return;
    var blocks = layoutBlocks(s);
    var html = '<div>' + blocksToHtml(blocks, true) + '</div>', plain = blocksToPlain(blocks);
    var done = function () { if (btn) { btn.textContent = 'Copied'; btn.classList.add('is-done'); setTimeout(function () { btn.textContent = 'Copy for YouVersion'; btn.classList.remove('is-done'); }, 1800); } };
    var fail = function () { showFlash('Couldn’t copy automatically in this view — select the corrected script and copy it by hand.'); };
    function plainOnly() {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(plain).then(done, fail); else fail();
    }
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      try {
        var item = new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) });
        navigator.clipboard.write([item]).then(done, plainOnly);
      } catch (e) { plainOnly(); }
    } else plainOnly();
  }

  /* ---- Correcting a finished script by hand ---- */

  function hasHandWork(s) { return s.handDraft != null || (s.edits || []).some(function (e) { return e.kind === 'hand'; }); }

  function startHandEdit(id) {
    syncFieldsFromDom();
    var s = findSection(id);
    if (!s || !s.corrected || s.status === 'editing') return;
    s.handDraft = s.corrected;
    paintSection(id);
    var box = root.querySelector('[data-field="handDraft"][data-id="' + id + '"]');
    if (box) { try { box.focus(); } catch (e) {} }
  }
  function cancelHandEdit(id) { var s = findSection(id); if (s) { delete s.handDraft; paintSection(id); } }

  // Keep the change, and list it: every run of words that differs becomes a row under "Changed by hand".
  function saveHandEdit(id) {
    syncFieldsFromDom();
    var s = findSection(id);
    if (!s || s.handDraft == null) return;
    var text = String(s.handDraft).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!text) { showFlash('The corrected script can’t be left empty. Cancel to keep it as it was.'); return; }
    if (text !== s.corrected) {
      s.edits = (s.edits || []).concat(handEditRows(s.corrected, text));
      s.changeCount = s.edits.length;
      s.corrected = text;
      state.approved = false;
    }
    delete s.handDraft;
    paint();
    saveSection(id).then(saveMeta);
  }

  // Redoing the edit pass replaces the corrected script, hand corrections included — so ask first (4.5).
  function askRedo(id) {
    var s = findSection(id);
    if (!s) return;
    if (!hasHandWork(s)) { redoSection(id); return; }
    openConfirm({
      title: 'Redo “' + (s.name || 'this script') + '”?',
      body: 'This script has corrections made by hand. Redoing the edit pass replaces the corrected script with a fresh result, and those corrections are lost.',
      warn: '',
      confirmLabel: 'Redo and replace',
      onConfirm: function () { confirmState = null; delete s.handDraft; redoSection(id); }
    });
  }
