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
