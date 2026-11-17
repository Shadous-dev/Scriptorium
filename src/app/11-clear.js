/* 11-clear.js — Clearing the workbench for the next book. */
  /* ---- Clearing the workbench for the next book ---- */

  function openConfirm(opts) {
    confirmState = opts; paint();
    var cancel = root.querySelector('[data-action="confirm-cancel"].btn');
    if (cancel) { try { cancel.focus(); } catch (e) {} }
  }
  function closeConfirm() { confirmState = null; paint(); }

  function askClearAll() {
    syncFieldsFromDom();
    var count = state.sections.length;
    var unedited = state.sections.filter(function (s) { return s.raw.trim() && s.status !== 'edited'; }).length;
    openConfirm({
      title: 'Remove all ' + count + ' script' + plural(count) + '?',
      body: 'This deletes every script here, including the corrected text, the words flagged in each one, and any timed captions, and it can’t be undone. Your book title and Words to Search For list stay put for the next book, and any Google Doc you already created is untouched.',
      warn: unedited ? unedited + ' of them ' + (unedited === 1 ? 'has' : 'have') + ' not been edited yet.' : '',
      confirmLabel: 'Remove all ' + count + ' script' + plural(count),
      onConfirm: clearAllScripts
    });
  }

  function clearAllScripts() {
    var ids = state.sections.map(function (s) { return s.id; });
    var fresh = newSection();
    state.sections = [fresh];
    state.lastEditAt = null; state.approved = false; state.docResult = null;
    collapsed = {}; persistCollapsed(); captionOpen = {}; captionMemo = {};
    confirmState = null; clearing = true;
    paint();
    var failed = 0, chain = Promise.resolve();
    if (dbApi) {
      ids.forEach(function (id) { chain = chain.then(function () { return dbApi.doc('scripts/' + id).delete().catch(function () { failed += 1; }); }).then(function () { return dbApi.doc('captions/' + id).delete().catch(function () {}); }); });
      chain = chain.then(function () { return saveSection(fresh.id); }).then(function () { return saveMeta(); });
    }
    return chain.then(function () {
      clearing = false;
      flash = failed
        ? 'Cleared the workbench, but ' + failed + ' script' + plural(failed) + ' could not be removed from storage and may come back when you reload. Try Clear All once more.'
        : 'Cleared ' + ids.length + ' script' + plural(ids.length) + '. Your book title and word list are still here — paste in the next book whenever you’re ready.';
      paint();
    });
  }

