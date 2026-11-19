/* 04-render.js — All HTML rendering, plus focus-preserving repaints. */
  /* ==================================================================
     Rendering
     ================================================================== */

  function statusLabel(s) {
    if (s.status === 'editing') return 'Editing…';
    if (s.status === 'edited') return isStale(s) ? 'Edited — transcript changed' : 'Edited ' + relTime(s.editedAt);
    if (s.status === 'error') return 'Needs attention';
    return 'Not yet edited';
  }
  function chipClass(s) { return (s.status === 'edited' && isStale(s)) ? 'chip-stale' : 'chip-' + s.status; }

  function changeTable(rows, h1, h2, kept) {
    var why = rows.some(function (m) { return m.note; });
    return '<table class="misheard-table' + (kept ? ' is-kept' : '') + '"><thead><tr><th>' + h1 + '</th><th>' + h2 + '</th>' + (why ? '<th>Why</th>' : '') + '</tr></thead><tbody>' +
      rows.map(function (m) { return '<tr><td class="mono was">' + esc(m.find != null ? m.find : m.heard) + '</td><td class="mono now">' + esc(m.replace != null ? m.replace : m.likely) + '</td>' + (why ? '<td>' + esc(m.note || '') + '</td>' : '') + '</tr>'; }).join('') +
      '</tbody></table>';
  }

  function renderSectionDetails(s, blocks) {
    var edits = s.edits || [];
    var misheardRows = edits.length ? edits.filter(function (e) { return e.kind === 'misheard'; }) : (s.misheard || []);
    var verseFixRows = edits.filter(function (e) { return e.kind === 'verse-fix'; });
    var handRows = edits.filter(function (e) { return e.kind === 'hand'; });
    var grammarRows = edits.filter(function (e) { return e.kind !== 'misheard' && e.kind !== 'verse-fix' && e.kind !== 'hand'; });
    var misheardHtml = misheardRows.length ? '<div class="detail-block"><h4>Words that may have been misheard</h4>' + changeTable(misheardRows, 'Heard as', 'Likely meant') + '</div>' : '';
    var verseFixHtml = verseFixRows.length ? '<div class="detail-block"><h4>Mishearings fixed inside a verse</h4>' + changeTable(verseFixRows, 'Transcript had', 'Corrected to') + '</div>' : '';
    var joinCount = grammarRows.filter(function (e) { return e.kind === 'paragraph'; }).length;
    var cueCount = grammarRows.filter(function (e) { return e.kind === 'cue'; }).length;
    var capCount = grammarRows.filter(function (e) { return e.kind === 'capitalization'; }).length;
    var grammarHtml = grammarRows.length ? '<details class="detail-block detail-fold"><summary>' + grammarRows.length + ' grammar, punctuation &amp; paragraph change' + plural(grammarRows.length) + (joinCount ? ' (' + joinCount + ' paragraph' + plural(joinCount) + ' joined)' : '') + (cueCount ? ' (stage cues removed)' : '') + (capCount ? ' (' + capCount + ' capitalization fix' + (capCount === 1 ? '' : 'es') + ')' : '') + '</summary>' + changeTable(grammarRows, 'Before', 'After') + '</details>' : '';
    var unappliedHtml = (s.unapplied && s.unapplied.length) ? '<div class="detail-block"><h4>Suggested but couldn’t be placed — check by hand</h4>' + changeTable(s.unapplied, 'Looked for', 'Wanted to make it') + '</div>' : '';
    var placed = blocks.filter(function (b) { return b.type === 'verse'; }).length;
    var versesHtml = (s.verses && s.verses.length) ?
      '<div class="detail-block"><h4>Scripture used — ' + placed + ' of ' + s.verses.length + ' set in bold' + (placed < s.verses.length ? ' (the rest could not be found in the text)' : '') + '</h4><ul class="verse-list">' +
      s.verses.map(function (v) {
        var q = v.startsWith ? v.startsWith + ' … ' + v.endsWith : String(v.quote || '');
        var short = q.length > 90 ? q.slice(0, 88).replace(/\s+\S*$/, '') + '…' : q;
        var label = v.canonical ? esc(refLabel(v)) : '<em>reference unknown — check</em>';
        if (v.reference) label += '<span class="verse-spoken">spoken: ' + esc(v.reference) + '</span>';
        var unsure = isUncertain(v);
        var warn = unsure ? '<span class="verse-warn">' + esc(v.note || (v.canonical ? 'Not sure of this reference' : 'Could not work out the reference')) + '</span>' : '';
        return '<li' + (unsure ? ' class="is-uncertain"' : '') + '><span class="verse-ref">' + label + '</span><span class="verse-quote">“' + esc(short) + '”' + warn + '</span></li>';
      }).join('') + '</ul></div>' : '';
    var nonsenseHtml = (s.nonsensical && s.nonsensical.length) ?
      '<div class="detail-block"><h4>Doesn’t quite make sense</h4><ul class="flag-list">' +
      s.nonsensical.map(function (n) { return '<li><span class="mono flag-quote">“' + esc(n.original) + '”</span><span class="flag-issue">' + esc(n.issue) + '</span></li>'; }).join('') +
      '</ul></div>' : '';
    var misquotes = s.misquotes || [], suggested = s.suggested || [];
    var misquotesHtml = misquotes.length ?
      '<div class="detail-block"><h4>For the teacher — a quotation that may not match the verse</h4>' +
      '<p class="detail-note">Left exactly as spoken. Checked against the NIV and ESV from memory, not looked up — confirm before raising it.</p><ul class="flag-list">' +
      misquotes.map(function (q) { return '<li><span class="mono flag-quote">“' + esc(q.said) + '”</span><span class="flag-issue">' + (q.reference ? esc(q.reference) + ' reads: ' : 'The verse reads: ') + esc(q.verse || 'not given') + '</span></li>'; }).join('') +
      '</ul></div>' : '';
    var suggestedHtml = suggested.length ?
      '<div class="detail-block"><h4>Suggested but not applied — it would change the speaker’s words</h4>' +
      '<p class="detail-note">The script still reads as spoken. If one of these is right, make it with Edit by hand.</p>' +
      changeTable(suggested, 'Script says', 'Suggested', true) + '</div>' : '';
    var handHtml = handRows.length ? '<div class="detail-block"><h4>Changed by hand</h4>' + changeTable(handRows.map(function (r) { return { find: r.find, replace: r.replace, note: '' }; }), 'Before', 'After') + '</div>' : '';
    return '<div class="section-details"><p class="section-summary">' + esc(s.summary || '') + '</p>' + versesHtml + misquotesHtml + misheardHtml + verseFixHtml + suggestedHtml + nonsenseHtml + unappliedHtml + handHtml + grammarHtml + '</div>';
  }

  function sectionMeta(s) {
    if (s.status !== 'edited') return '';
    var bits = [];
    if (s.verses && s.verses.length) {
      var unsure = s.verses.filter(isUncertain).length;
      bits.push(s.verses.length + ' verse' + plural(s.verses.length) + (unsure ? ' (' + unsure + ' to check)' : ''));
    }
    if (s.misheard && s.misheard.length) bits.push(s.misheard.length + ' misheard');
    if (s.nonsensical && s.nonsensical.length) bits.push(s.nonsensical.length + ' to check');
    if (s.suggested && s.suggested.length) bits.push(s.suggested.length + ' not applied');
    if (s.misquotes && s.misquotes.length) bits.push(s.misquotes.length + ' for the teacher');
    return bits.join(' · ');
  }

  function renderSection(s) {
    var isCollapsed = !!collapsed[s.id];
    var head =
      '<div class="section-head">' +
      '<button type="button" class="collapse-btn" data-action="toggle-collapse" data-id="' + s.id + '" aria-label="' + (isCollapsed ? 'Expand' : 'Collapse') + '" title="' + (isCollapsed ? 'Expand' : 'Collapse') + '">' + (isCollapsed ? '▸' : '▾') + '</button>' +
      '<input class="section-name" data-field="name" data-id="' + s.id + '" type="text" placeholder="e.g. Job – Chapter 2" value="' + escAttr(s.name) + '" aria-label="Script name">' +
      (isCollapsed && sectionMeta(s) ? '<span class="section-meta">' + esc(sectionMeta(s)) + '</span>' : '') +
      '<span class="chip ' + chipClass(s) + '"' + (s.status === 'edited' && !isStale(s) && s.editedAt ? ' data-ts="' + s.editedAt + '"' : '') + '>' + esc(statusLabel(s)) + '</span>' +
      '<button type="button" class="icon-btn" data-action="remove-section" data-id="' + s.id + '" aria-label="Remove this script" title="Remove this script">−</button>' +
      '</div>';
    if (isCollapsed) return '<article class="section-card is-collapsed" data-section="' + s.id + '">' + head + '</article>';

    var blocks = s.corrected ? layoutBlocks(s) : [];
    var corrected = s.corrected ? blocksToHtml(blocks, false) : 'Not edited yet — click “Edit All Scripts” above.';
    var extra = '';
    if (s.status === 'edited') {
      extra = (isStale(s) ? '<p class="stale-note">The transcript has changed since this was edited — run Edit again to refresh the corrected script.</p>' : '') +
        renderSectionDetails(s, blocks) +
        '<p class="redo-line"><button type="button" class="link-btn" data-action="redo-section" data-id="' + s.id + '">Redo this one</button></p>';
    }
    if (s.status === 'error' && s.error === '__stopped__') extra = '<p class="section-error">Stopped before this one finished. <button type="button" class="link-btn" data-action="redo-section" data-id="' + s.id + '">Try again</button></p>';
    else if (s.status === 'error') extra = '<p class="section-error">Couldn’t edit this one: ' + esc(s.error || 'unknown error') + '. <button type="button" class="link-btn" data-action="redo-section" data-id="' + s.id + '">Try again</button></p>';
    return (
      '<article class="section-card" data-section="' + s.id + '">' + head +
      '<div class="section-body">' +
      '<div class="pane"><div class="pane-head"><label>Raw transcript (from Descript)</label></div>' +
      '<textarea data-field="raw" data-id="' + s.id + '" rows="8" placeholder="Paste the Descript transcript here — e.g. &quot;So Eli who answered and said, so far said unto Job…&quot;">' + esc(s.raw) + '</textarea></div>' +
      '<div class="pane pane-corrected"><div class="pane-head"><label>Corrected script</label>' +
      (s.handDraft != null ? '<span class="pane-actions"><button type="button" class="copy-btn" data-action="hand-cancel" data-id="' + s.id + '">Cancel</button><button type="button" class="copy-btn is-primary" data-action="hand-save" data-id="' + s.id + '">Save changes</button></span>' :
        s.corrected ? '<span class="pane-actions"><button type="button" class="copy-btn" data-action="hand-edit" data-id="' + s.id + '" title="Make a small correction yourself. Each change is listed below."' + (s.status === 'editing' ? ' disabled' : '') + '>Edit by hand</button>' +
        '<button type="button" class="copy-btn" data-action="copy-corrected" data-id="' + s.id + '" title="Copies the script with bold verses and block quotes, ready to paste">Copy for YouVersion</button></span>' : '') + '</div>' +
      (s.handDraft != null ?
        '<textarea data-field="handDraft" data-id="' + s.id + '" rows="8" aria-label="Corrected script, editable">' + esc(s.handDraft) + '</textarea>' +
        '<p class="hand-hint">For small corrections the edit pass missed. Keep the speaker’s words as spoken. Every change you save is listed under “Changed by hand”, and carries into the Google Doc and the caption files.</p>' :
        '<div class="corrected-output' + (s.corrected ? ' is-blocks' : ' is-empty') + '">' + corrected + '</div>') + '</div>' +
      '</div>' + renderCaptionFold(s) + extra +
      '</article>'
    );
  }

  function renderOverview() {
    if (!state.lastEditAt) return '';
    var rows = state.sections.map(function (s) {
      var detail;
      if (s.status === 'edited') {
        var unsureRefs = (s.verses || []).filter(isUncertain).length;
        detail = (s.verses || []).length + ' verse' + plural((s.verses || []).length) + (unsureRefs ? ' (' + unsureRefs + ' reference' + plural(unsureRefs) + ' to check)' : '') + ', ' + s.misheard.length + ' misheard word' + plural(s.misheard.length) + ', ' + s.nonsensical.length + ' sentence' + plural(s.nonsensical.length) + ' to double-check' + (isStale(s) ? ' — transcript changed since' : '');
      }
      else if (s.status === 'error' && s.error === '__stopped__') detail = 'stopped before finishing';
      else if (s.status === 'error') detail = 'couldn’t be edited (' + esc(s.error || 'error') + ')';
      else if (!s.raw.trim()) detail = 'no transcript yet';
      else detail = 'not yet edited';
      return '<li><strong>' + esc(s.name || 'Untitled script') + '</strong> — ' + detail + '</li>';
    }).join('');
    return '<section class="overview"><h3>Overview — last edit pass <span data-ts="' + state.lastEditAt + '">' + esc(relTime(state.lastEditAt)) + '</span></h3><ul class="overview-list">' + rows + '</ul></section>';
  }

  function statusSummary() {
    var total = state.sections.length;
    var edited = state.sections.filter(function (s) { return s.status === 'edited'; }).length;
    var errored = state.sections.filter(function (s) { return s.status === 'error'; }).length;
    if (dbStatus === 'loading') return 'Loading your saved scripts…';
    if (editState) {
      var activeNow = state.sections.filter(function (s) { return s.status === 'editing'; }).length;
      return editState.done + ' of ' + editState.total + ' done in this pass — editing ' + activeNow + ' now…';
    }
    var line = total + ' script' + plural(total) + ' · ' + edited + ' edited';
    if (errored) line += ' · ' + errored + ' needs attention';
    return line;
  }

  function renderDocResult() {
    if (state.docResult) {
      if (state.docResult.method === 'pending') return '<p class="doc-result" id="doc-progress">' + esc(state.docResult.progress || 'Building your Google Doc…') + '</p>';
      if (state.docResult.method === 'drive') {
        if (state.docResult.count != null) {
          var failedNote = state.docResult.failed ? ' ' + state.docResult.failed + ' could not be created — try again for those.' : '';
          return '<p class="doc-result">Created ' + state.docResult.count + ' Doc' + plural(state.docResult.count) + ' in a new folder in your Google Drive — <a href="' + escAttr(state.docResult.url) + '" target="_blank" rel="noopener">open the folder</a>.' + esc(failedNote) + '</p>';
        }
        return '<p class="doc-result">Created in your Google Drive — <a href="' + escAttr(state.docResult.url) + '" target="_blank" rel="noopener">open the doc</a>.</p>';
      }
      if (state.docResult.method === 'download') return '<p class="doc-result">Saved as a file — open it with Google Docs (File › Open, or drag it into Drive) to keep editing there.</p>';
      return '<p class="doc-result is-error">' + esc(state.docResult.message || 'Something went wrong.') + '</p>';
    }
    if (state.lastDoc && state.lastDoc.url) {
      return '<p class="doc-link-line">Last created <span data-ts="' + state.lastDoc.at + '">' + esc(relTime(state.lastDoc.at)) + '</span> — <a href="' + escAttr(state.lastDoc.url) + '" target="_blank" rel="noopener">' + (state.lastDoc.kind === 'folder' ? 'open the folder of Docs' : 'open the Google Doc') + '</a>.</p>';
    }
    return '';
  }

  function renderModal() {
    if (!confirmState) return '';
    return (
      '<div class="modal-backdrop" data-action="confirm-cancel" role="dialog" aria-modal="true" aria-label="' + escAttr(confirmState.title) + '">' +
      '<div class="modal-card" data-stop-click>' +
      '<h2 class="modal-title">' + esc(confirmState.title) + '</h2>' +
      '<p class="modal-body">' + esc(confirmState.body) + '</p>' +
      (confirmState.warn ? '<p class="modal-warn">' + esc(confirmState.warn) + '</p>' : '') +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" data-action="confirm-cancel">Cancel</button>' +
      '<button type="button" class="btn btn-danger" data-action="confirm-ok">' + esc(confirmState.confirmLabel) + '</button>' +
      '</div></div></div>'
    );
  }

  function renderSkeleton() {
    var card = '<div class="skeleton-card" aria-hidden="true"><div class="skeleton-line w40"></div><div class="skeleton-line tall"></div></div>';
    return '<div class="sections">' + card + card + card + '</div>';
  }

  function saveStateLabel() {
    if (dbStatus !== 'ready') return '';
    if (savesInFlight > 0 || Object.keys(pendingSaves).length || Object.keys(pendingCaptionSaves).length || metaTimer) return 'Saving…';
    return everSaved ? 'All changes saved' : '';
  }

  function versionLine() { return '<p class="version-line">The Scriptorium ' + esc(VERSION) + '</p>'; }

  function noticeHtml() {
    var notice = '';
    if (dbStatus === 'unavailable') notice = '<p class="notice notice-warn">Saved work can’t be reached in this view, so anything you change here won’t be kept. Reload the page, or open the artifact from your Claude gallery.</p>';
    else if (saveError) notice = '<p class="notice notice-warn">' + esc(saveError) + '</p>';
    if (flash) notice += '<div class="notice notice-info"><span>' + esc(flash) + '</span><button type="button" class="notice-dismiss" data-action="dismiss-flash" aria-label="Dismiss">×</button></div>';
    return notice;
  }

  function renderBookRow(b) {
    var busy = deletingBook === b.id;
    var bits = [b.scripts + ' script' + plural(b.scripts)];
    if (b.scripts) bits.push(b.edited + ' edited');
    if (b.at) bits.push('last worked on ' + relTime(b.at));
    return '<article class="book-row' + (busy ? ' is-busy' : '') + '">' +
      '<button type="button" class="book-open" data-action="open-book" data-id="' + escAttr(b.id) + '"' + (busy ? ' disabled' : '') + '>' +
      '<span class="book-name' + (b.title ? '' : ' is-untitled') + '">' + esc(b.title || 'Untitled book') + '</span>' +
      '<span class="book-meta">' + esc(busy ? 'Deleting…' : bits.join(' · ')) + '</span></button>' +
      '<button type="button" class="link-btn book-delete" data-action="delete-book" data-id="' + escAttr(b.id) + '"' + (busy ? ' disabled' : '') + '>Delete</button>' +
      '</article>';
  }

  // The front page: every book the team has, each one its own workbench.
  function renderLibrary() {
    var loading = dbStatus === 'loading';
    return (
      '<div class="wrap">' +
      '<header class="hero">' +
      '<p class="eyebrow">Through the Word · Script Workbench</p>' +
      '<h1 class="library-title">The Scriptorium</h1>' +
      '<p class="dek">Turn Descript’s AI transcript of each audio guide into a clean, accurate script and searchable caption files. Every book below is shared with the whole team: open one to pick up where anyone left off.</p>' +
      '</header>' +
      noticeHtml() +
      '<div class="action-bar">' +
      '<div class="bar-group"><button type="button" class="btn btn-add" data-action="new-book"' + (loading ? ' disabled' : '') + '>+ New Book</button></div>' +
      '<p class="status-line">' + (loading ? 'Loading the team’s books…' : library.length + ' book' + plural(library.length)) + '</p>' +
      '</div>' +
      (loading ? renderSkeleton() :
        library.length ? '<div class="book-list">' + library.map(renderBookRow).join('') + '</div>' :
        '<p class="library-empty">No books yet. Start one with <strong>+ New Book</strong> — everyone on the team will see it here.</p>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  function renderApp() { return view === 'library' ? renderLibrary() : renderBook(); }

  function renderBook() {
    var loading = dbStatus === 'loading';
    var anyEdited = state.sections.some(function (s) { return s.status === 'edited'; });
    var editRunning = !!editState || state.sections.some(function (s) { return s.status === 'editing'; });
    var pending = !!(state.docResult && state.docResult.method === 'pending');
    var hasAnything = state.sections.some(function (s) { return s.raw.trim() || s.name.trim(); });
    var toEdit = state.sections.filter(needsEdit).length;
    var anyCollapsible = state.sections.some(function (s) { return s.status === 'edited' && !collapsed[s.id]; });
    var anyCollapsed = state.sections.some(function (s) { return collapsed[s.id]; });
    var concludeDisabled = (!anyEdited || !state.approved || editRunning || pending || loading) ? ' disabled' : '';
    var dis = loading ? ' disabled' : '';
    var pulling = !!(pull && pull.step === 'pulling');
    var anyCaptions = state.sections.some(function (s) { return s.status === 'edited' && (s.captions || '').trim(); });

    var notice = noticeHtml();

    var editLabel = editRunning ? 'Editing…' : (toEdit && toEdit < state.sections.length ? 'Edit ' + toEdit + ' Script' + plural(toEdit) : 'Edit All Scripts');
    var saveLabel = saveStateLabel();

    return (
      '<div class="wrap">' +
      (dbRoot ? '<p class="back-line"><button type="button" class="link-btn" data-action="go-library">← All books</button></p>' : '') +
      '<header class="hero">' +
      '<p class="eyebrow">Through the Word · Script Workbench</p>' +
      '<input class="title-field" data-field="bookTitle" type="text" placeholder="Untitled book or plan" value="' + escAttr(state.bookTitle) + '" aria-label="Book or plan title"' + dis + '>' +
      '<p class="dek">Turn Descript’s AI transcript of each audio guide into a clean, accurate script — grammar fixed, misheard names caught, nothing about how it sounds changed.</p>' +
      '</header>' +
      '<details class="tip"><summary>How this works</summary><ol>' +
      '<li>Click <strong>Pull from Descript</strong> and pick the audio guides to bring in. Each becomes a script below, with its transcript and its timed captions. Or paste a transcript into a script by hand — use <strong>+ Add Script</strong> for as many as the plan needs.</li>' +
      '<li>List any names or terms Descript’s AI likely misheard under <strong>Words to Search For</strong>.</li>' +
      '<li>Click <strong>Edit All Scripts</strong> to fix grammar, catch misheard words, and flag anything that still doesn’t make sense. Bible verses and their references come back in <strong>bold</strong> — their wording is left alone apart from misheard words, which are listed separately. Each finished script is saved on its own, so you can stop and resume anytime without losing what’s already done.</li>' +
      '<li>The edit pass may only fix punctuation, capitals and words Descript misheard. Anything that would change the speaker’s words is listed as a suggestion and <strong>not applied</strong>, and a quotation that may not match the verse is listed <strong>for the teacher</strong>. For a small fix of your own, use <strong>Edit by hand</strong> on a corrected script.</li>' +
      '<li>Review the overview, check the approval box, then click <strong>Create Google Docs</strong> — one Doc per script in a folder, or one Doc for the book. Or use <strong>Copy for YouVersion</strong> on any script to paste it straight in with the verses already formatted.</li>' +
      '<li>For searchable captions, use <strong>Download .srt + .vtt</strong> under <strong>Timed captions for search</strong> on a script once it is edited. Both files carry the corrected words on Descript’s timings. Pulling from Descript fills the timings in; for a pasted transcript, paste in the .srt file Descript exports.</li>' +
      '</ol></details>' +
      '<section class="search-panel"><label for="wordsToSearchFor">Words to Search For</label>' +
      '<p class="hint">Names or terms Descript’s AI probably didn’t recognize — e.g. Elihu, Eliphaz, Zophar, Bildad, Leviathan. List them and the edit pass will watch for homophones of each.</p>' +
      '<textarea id="wordsToSearchFor" data-field="wordsToSearchFor" rows="2" placeholder="Elihu, Eliphaz, Zophar, Bildad, Behemoth, Leviathan…"' + dis + '>' + esc(state.wordsToSearchFor) + '</textarea></section>' +
      notice +
      '<div class="action-bar">' +
      '<div class="bar-group">' +
      '<button type="button" class="btn btn-add" data-action="add-section"' + dis + '>+ Add Script</button>' +
      '<button type="button" class="btn" data-action="pull-descript"' + (loading || editRunning || pulling || dbStatus === 'unavailable' ? ' disabled' : '') + '>Pull from Descript</button>' +
      '<button type="button" class="btn btn-quiet-danger" data-action="clear-all"' + (loading || editRunning || pulling || clearing || !hasAnything ? ' disabled' : '') + '>' + (clearing ? 'Clearing…' : 'Clear All') + '</button>' +
      (anyCollapsible ? '<button type="button" class="btn btn-ghost btn-sm" data-action="collapse-edited"' + dis + '>Collapse edited</button>' : '') +
      (anyCollapsed ? '<button type="button" class="btn btn-ghost btn-sm" data-action="expand-all"' + dis + '>Expand all</button>' : '') +
      '</div>' +
      '<p class="status-line">' + esc(statusSummary()) + '</p>' +
      '<p class="save-state' + (saveLabel === 'Saving…' ? ' is-saving' : '') + '" id="save-state">' + esc(saveLabel) + '</p>' +
      '<div class="action-bar-end">' +
      '<label class="speed-pick" title="Close paragraph breaks that fall mid-thought (Descript breaks on pauses)"><input type="checkbox" data-action="set-repair"' + (repairParagraphs ? ' checked' : '') + (editRunning ? ' disabled' : '') + '> Fix mid-thought breaks</label>' +
      '<label class="speed-pick" title="How many scripts to edit at the same time">Speed <select data-action="set-concurrency"' + (editRunning ? ' disabled' : '') + '><option value="1"' + (concurrency === 1 ? ' selected' : '') + '>1 at a time</option><option value="2"' + (concurrency === 2 ? ' selected' : '') + '>2 at a time</option></select></label>' +
      '<button type="button" class="btn btn-edit" data-action="edit-all"' + (editRunning || loading || pulling ? ' disabled' : '') + '>' + editLabel + '</button>' +
      (editRunning ? '<button type="button" class="btn btn-ghost" data-action="stop-edit">Stop</button>' : '') + '</div>' +
      '</div>' +
      (loading ? renderSkeleton() :
        renderPull() +
        renderOverview() +
        '<div class="sections">' + state.sections.map(renderSection).join('') + '</div>' +
        '<footer class="conclude-bar">' +
        '<p class="approve-prompt">Ready to turn these scripts into a Google Doc?</p>' +
        '<label class="approve-row"><input type="checkbox" data-action="toggle-approve"' + (state.approved ? ' checked' : '') + (anyEdited ? '' : ' disabled') + '><span>I’ve reviewed the corrections above and approve moving forward.</span></label>' +
        '<div class="conclude-row">' +
        '<button type="button" class="btn btn-conclude" data-action="conclude"' + concludeDisabled + '>' + (docMode === 'perScript' ? 'Create Google Docs' : 'Create Google Doc') + '</button>' +
        '<label class="speed-pick"><select data-action="set-docmode"' + (pending ? ' disabled' : '') + '><option value="perScript"' + (docMode === 'perScript' ? ' selected' : '') + '>One Doc per script, in a folder</option><option value="one"' + (docMode === 'one' ? ' selected' : '') + '>One Doc for the whole book</option></select></label>' +
        '<button type="button" class="btn btn-ghost" data-action="download-copy"' + (anyEdited ? '' : ' disabled') + '>Download a copy instead</button>' +
        '</div>' + renderDocResult() +
        '<div class="conclude-row caption-row">' +
        '<button type="button" class="btn btn-ghost" data-action="download-all-captions"' + (anyCaptions ? '' : ' disabled') + '>Download all caption files</button>' +
        '<p class="hint">An .srt and a .vtt for every edited script that has timed captions, in one .zip.</p>' +
        '</div>' +
        '</footer>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  /* ---- Repainting: keep the caret where it was; repaint one card when that is all that changed ---- */

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset || !el.dataset.field) return null;
    return { field: el.dataset.field, id: el.dataset.id || '', start: el.selectionStart, end: el.selectionEnd, scrollTop: el.scrollTop };
  }
  function restoreFocus(f) {
    if (!f) return;
    var el = root.querySelector('[data-field="' + f.field + '"]' + (f.id ? '[data-id="' + f.id + '"]' : ':not([data-id])'));
    if (!el) return;
    try { el.focus({ preventScroll: true }); if (f.start != null && el.setSelectionRange) el.setSelectionRange(f.start, f.end); el.scrollTop = f.scrollTop; } catch (e) {}
  }
  function paint() { var f = captureFocus(); root.innerHTML = renderApp(); restoreFocus(f); }
  function paintSection(id) {
    var s = findSection(id), el = root.querySelector('[data-section="' + id + '"]');
    if (!s || !el) { paint(); return; }
    var f = captureFocus(); el.outerHTML = renderSection(s); restoreFocus(f);
  }
  function paintStatus() {
    var el = root.querySelector('.status-line'); if (el) el.textContent = statusSummary();
    var sv = document.getElementById('save-state');
    if (sv) { var label = saveStateLabel(); sv.textContent = label; sv.classList.toggle('is-saving', label === 'Saving…'); }
  }
  function paintChipOnly(s) {
    var card = root.querySelector('[data-section="' + s.id + '"]');
    var chip = card && card.querySelector('.chip');
    if (chip) { chip.className = 'chip ' + chipClass(s); chip.textContent = statusLabel(s); if (isStale(s)) chip.removeAttribute('data-ts'); else if (s.editedAt) chip.setAttribute('data-ts', s.editedAt); }
    if (card) {
      var note = card.querySelector('.stale-note');
      if (isStale(s) && !note) {
        var details = card.querySelector('.section-details');
        var p = document.createElement('p'); p.className = 'stale-note';
        p.textContent = 'The transcript has changed since this was edited — run Edit again to refresh the corrected script.';
        if (details) card.insertBefore(p, details); else card.appendChild(p);
      } else if (!isStale(s) && note) note.remove();
    }
    var btn = root.querySelector('[data-action="edit-all"]');
    if (btn && !editState) {
      var toEdit = state.sections.filter(needsEdit).length;
      btn.textContent = (toEdit && toEdit < state.sections.length) ? 'Edit ' + toEdit + ' Script' + plural(toEdit) : 'Edit All Scripts';
    }
  }
  // "Edited 3 minutes ago" stays truthful without a repaint.
  setInterval(function () {
    root.querySelectorAll('[data-ts]').forEach(function (el) {
      var ts = Number(el.getAttribute('data-ts')); if (!ts) return;
      el.textContent = el.classList.contains('chip') ? 'Edited ' + relTime(ts) : relTime(ts);
    });
  }, 60000);

