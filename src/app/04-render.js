/* 04-render.js — All HTML rendering, plus focus-preserving repaints. */
  /* ==================================================================
     Rendering
     ================================================================== */

  function statusLabel(s) {
    if (s.status === 'editing') return 'Editing…';
    if (s.status === 'edited') {
      if (isStale(s)) return (s.approvedAt ? 'Approved earlier' : 'Edited') + ' — 1st Draft changed since';
      return isFinal(s) ? 'Final · approved ' + relTime(s.approvedAt) : 'Edited ' + relTime(s.editedAt);
    }
    if (s.status === 'error') return 'Needs attention';
    return s.raw.trim() ? '1st Draft — not yet edited' : 'No transcript yet';
  }
  // The class is chosen from a fixed list, never built from the stored word: what is saved for a guide's status
  // comes from the shared store, and anything from there is text to show, not markup to trust.
  var CHIP_CLASSES = { draft: 'chip-draft', editing: 'chip-editing', edited: 'chip-edited', error: 'chip-error' };
  function chipClass(s) { return (s.status === 'edited' && isStale(s)) ? 'chip-stale' : isFinal(s) ? 'chip-final' : (CHIP_CLASSES.hasOwnProperty(s.status) ? CHIP_CLASSES[s.status] : 'chip-draft'); }
  // A chip that tells the time ("Edited 3 minutes ago") says which moment it counts from, so it can be kept truthful without a repaint.
  function chipClock(s) {
    if (s.status !== 'edited' || isStale(s)) return null;
    return isFinal(s) ? { ts: s.approvedAt, prefix: 'Final · approved ' } : s.editedAt ? { ts: s.editedAt, prefix: 'Edited ' } : null;
  }

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
    var checks = refChecks(s), toCheck = flaggedRefs(s), sid = escAttr(s.id);
    var versesHtml = (s.verses && s.verses.length) ?
      '<div class="detail-block"><h4>Scripture used — ' + placed + ' of ' + s.verses.length + ' set in bold' + (placed < s.verses.length ? ' (the rest could not be found in the text)' : '') +
      (toCheck ? ' · ' + toCheck + ' reference' + plural(toCheck) + ' to check' : '') + '</h4>' +
      '<p class="detail-note">Each reference is checked against the chapter this guide is on, what was said aloud, and the written script when there is one. Nothing is changed unless you choose it.</p>' +
      '<ul class="verse-list">' +
      s.verses.map(function (v, i) {
        var q = v.startsWith ? v.startsWith + ' … ' + v.endsWith : String(v.quote || '');
        var short = q.length > 90 ? q.slice(0, 88).replace(/\s+\S*$/, '') + '…' : q;
        var check = checks[i], unsure = isUncertain(v), flagged = unsure || check.issues.length > 0;
        var at = ' data-id="' + sid + '" data-i="' + i + '"';
        var label;
        if (refEdit && refEdit.id === s.id && refEdit.i === i) {
          label = '<input class="ref-input" data-ref-input type="text" value="' + escAttr(v.canonical || '') + '" placeholder="Luke 24:1" aria-label="Reference for this quotation">' +
            '<span class="ref-actions"><button type="button" class="link-btn" data-action="ref-save">Save</button><button type="button" class="link-btn" data-action="ref-cancel">Cancel</button></span>';
        } else {
          label = (v.canonical ? esc(refLabel(v)) : '<em>reference unknown — check</em>') +
            '<button type="button" class="link-btn ref-change" data-action="ref-edit"' + at + '>Change</button>';
        }
        if (v.reference) label += '<span class="verse-spoken">spoken: ' + esc(v.reference) + '</span>';
        if (v.written) label += '<span class="verse-spoken">written script: ' + esc(v.written) + '</span>';
        var notes = (unsure ? [v.note || (v.canonical ? 'Not sure of this reference.' : 'Could not work out the reference.')] : []).concat(check.issues);
        var warn = notes.length ? '<span class="verse-warn">' + esc(notes.join(' ')) + '</span>' : '';
        var picks = check.suggestions.length ? '<span class="verse-picks">' + check.suggestions.map(function (g) {
          return '<button type="button" class="copy-btn" data-action="use-ref"' + at + ' data-ref="' + escAttr(g.ref) + '">Use ' + esc(g.ref) + '</button><span class="verse-why">from ' + esc(g.why) + '</span>';
        }).join('') + '</span>' : '';
        var settled = flagged ? '' : v.byHand ? '<span class="verse-ok">set by hand</span>' : check.confirmed === 'written' ? '<span class="verse-ok">agrees with the written script</span>' : '';
        return '<li' + (flagged ? ' class="is-uncertain"' : '') + '><span class="verse-ref">' + label + '</span><span class="verse-quote">“' + esc(short) + '”' + warn + picks + settled + '</span></li>';
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
      '<p class="detail-note">The transcript still reads as spoken. If one of these is right, make it with Edit by hand.</p>' +
      changeTable(suggested, 'Transcript says', 'Suggested', true) + '</div>' : '';
    var handHtml = handRows.length ? '<div class="detail-block"><h4>Changed by hand</h4>' + changeTable(handRows.map(function (r) { return { find: r.find, replace: r.replace, note: /^reference/.test(r.note || '') ? r.note : '' }; }), 'Before', 'After') + '</div>' : '';
    return '<div class="section-details"><p class="section-summary">' + esc(s.summary || '') + '</p>' + versesHtml + misquotesHtml + misheardHtml + verseFixHtml + suggestedHtml + nonsenseHtml + unappliedHtml + handHtml + grammarHtml + '</div>';
  }

  function sectionMeta(s) {
    if (s.status !== 'edited') return '';
    var bits = [];
    if (s.verses && s.verses.length) {
      var unsure = flaggedRefs(s);
      bits.push(s.verses.length + ' verse' + plural(s.verses.length) + (unsure ? ' (' + unsure + ' to check)' : ''));
    }
    if (s.misheard && s.misheard.length) bits.push(s.misheard.length + ' misheard');
    if (s.nonsensical && s.nonsensical.length) bits.push(s.nonsensical.length + ' to check');
    if (s.suggested && s.suggested.length) bits.push(s.suggested.length + ' not applied');
    if (s.misquotes && s.misquotes.length) bits.push(s.misquotes.length + ' for the teacher');
    return bits.join(' · ');
  }

  // One guide whose saved data cannot be drawn must not take the whole book off the screen with it.
  function renderSectionSafe(s) {
    try { return renderSection(s); }
    catch (err) {
      console.warn('Scriptorium: a guide could not be shown', err);
      return '<article class="section-card" data-section="' + escAttr(s && s.id) + '"><p class="section-error">“' + esc((s && s.name) || 'This guide') +
        '” holds something the page can’t show. Its saved data may have been changed from outside the Scriptorium. Nothing has been deleted; tell whoever looks after the Scriptorium.</p></article>';
    }
  }
  function renderSection(s) {
    var isCollapsed = !!collapsed[s.id], clock = chipClock(s), id = escAttr(s.id);
    var head =
      '<div class="section-head">' +
      '<button type="button" class="collapse-btn" data-action="toggle-collapse" data-id="' + id + '" aria-label="' + (isCollapsed ? 'Expand' : 'Collapse') + '" title="' + (isCollapsed ? 'Expand' : 'Collapse') + '">' + (isCollapsed ? '▸' : '▾') + '</button>' +
      '<input class="section-name" data-field="name" data-id="' + id + '" type="text" placeholder="e.g. Job – Chapter 2" value="' + escAttr(s.name) + '" aria-label="Audio guide name">' +
      (isCollapsed && sectionMeta(s) ? '<span class="section-meta">' + esc(sectionMeta(s)) + '</span>' : '') +
      scriptBadge(s) +
      '<span class="chip ' + chipClass(s) + '"' + (clock ? ' data-ts="' + Number(clock.ts) + '" data-prefix="' + escAttr(clock.prefix) + '"' : '') + '>' + esc(statusLabel(s)) + '</span>' +
      '<button type="button" class="icon-btn" data-action="remove-section" data-id="' + id + '" aria-label="Remove this guide" title="Remove this guide">−</button>' +
      '</div>';
    if (isCollapsed) return '<article class="section-card is-collapsed" data-section="' + id + '">' + head + '</article>';

    var blocks = s.corrected ? layoutBlocks(s) : [];
    if (s.corrected && s.verses && s.verses.length) {
      var checks = refChecks(s);                       // a reference the checks disagree with is marked on the page, like one the edit pass was unsure of
      blocks.forEach(function (b) { if (b.type === 'verse' && checks[b.index] && checks[b.index].issues.length) b.uncertain = true; });
    }
    var corrected = s.corrected ? blocksToHtml(blocks, false) : 'Not edited yet — click “Edit All Guides” above.';
    var staleText = 'The 1st Draft Transcript has changed since this was edited — run Edit again to refresh it.';
    var extra = '';
    if (s.status === 'edited') {
      extra = (isStale(s) ? '<p class="stale-note">' + staleText + '</p>' : '') +
        renderSectionDetails(s, blocks) +
        '<p class="redo-line"><button type="button" class="link-btn" data-action="redo-section" data-id="' + id + '">Redo this one</button></p>';
    }
    if (s.status === 'error' && s.error === '__stopped__') extra = '<p class="section-error">Stopped before this one finished. <button type="button" class="link-btn" data-action="redo-section" data-id="' + id + '">Try again</button></p>';
    else if (s.status === 'error') extra = '<p class="section-error">Couldn’t edit this one: ' + esc(s.error || 'unknown error') + '. <button type="button" class="link-btn" data-action="redo-section" data-id="' + id + '">Try again</button></p>';

    // The right-hand pane names the stage the guide has reached, and carries the one step that moves it on.
    var final = isFinal(s), actions = '';
    if (s.handDraft != null) {
      actions = '<span class="pane-actions"><button type="button" class="copy-btn" data-action="hand-cancel" data-id="' + id + '">Cancel</button><button type="button" class="copy-btn is-primary" data-action="hand-save" data-id="' + id + '">Save changes</button></span>';
    } else if (s.corrected) {
      actions = '<span class="pane-actions">' +
        '<button type="button" class="copy-btn" data-action="hand-edit" data-id="' + id + '" title="Make a small correction yourself. Each change is listed below."' + (s.status === 'editing' ? ' disabled' : '') + '>Edit by hand</button>' +
        '<button type="button" class="copy-btn" data-action="copy-corrected" data-id="' + id + '" title="Copies the transcript with bold verses and block quotes, ready to paste">Copy for YouVersion</button>' +
        (s.status !== 'edited' ? '' : final
          ? '<button type="button" class="copy-btn" data-action="unapprove" data-id="' + id + '" title="Take this back to an Edited Transcript">Undo approval</button>'
          : '<button type="button" class="copy-btn is-approve" data-action="approve" data-id="' + id + '" title="You have reviewed the changes below. Only a Final Transcript goes into the Google Doc.">Approve as Final</button>') +
        '</span>';
    }
    var stage = !s.corrected ? 'Edited Transcript' : stageName(s);
    return (
      '<article class="section-card' + (final ? ' is-final' : '') + '" data-section="' + id + '">' + head +
      renderWrittenLine(s) +
      '<div class="section-body">' +
      '<div class="pane"><div class="pane-head"><label>1st Draft Transcript <span class="pane-sub">what Descript heard</span></label></div>' +
      '<textarea data-field="raw" data-id="' + id + '" rows="8" placeholder="Paste the Descript transcript here — e.g. &quot;So Eli who answered and said, so far said unto Job…&quot;">' + esc(s.raw) + '</textarea></div>' +
      '<div class="pane pane-corrected"><div class="pane-head"><label>' + stage + (final ? ' <span class="pane-sub">approved — goes into the Google Doc</span>' : s.corrected ? ' <span class="pane-sub">not yet approved</span>' : '') + '</label>' + actions + '</div>' +
      (s.handDraft != null ?
        '<textarea data-field="handDraft" data-id="' + id + '" rows="8" aria-label="Edited Transcript, editable">' + esc(s.handDraft) + '</textarea>' +
        '<p class="hand-hint">For small corrections the edit pass missed. Keep the speaker’s words as spoken. Every change you save is listed under “Changed by hand”, and carries into the Google Doc and the caption files.' + (final ? ' Saving a change takes this back to an Edited Transcript until it is approved again.' : '') + '</p>' :
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
        var unsureRefs = flaggedRefs(s);
        detail = (isFinal(s) ? 'Final · ' : 'Edited · ') + (s.verses || []).length + ' verse' + plural((s.verses || []).length) + (unsureRefs ? ' (' + unsureRefs + ' reference' + plural(unsureRefs) + ' to check)' : '') + ', ' + s.misheard.length + ' misheard word' + plural(s.misheard.length) + ', ' + s.nonsensical.length + ' sentence' + plural(s.nonsensical.length) + ' to double-check' + (isStale(s) ? ' — 1st Draft changed since' : '');
      }
      else if (s.status === 'error' && s.error === '__stopped__') detail = 'stopped before finishing';
      else if (s.status === 'error') detail = 'couldn’t be edited (' + esc(s.error || 'error') + ')';
      else if (!s.raw.trim()) detail = 'no transcript yet';
      else detail = 'not yet edited';
      return '<li><strong>' + esc(s.name || 'Untitled guide') + '</strong> — ' + detail + '</li>';
    }).join('');
    return '<section class="overview"><h3>Overview — last edit pass <span data-ts="' + state.lastEditAt + '">' + esc(relTime(state.lastEditAt)) + '</span></h3><ul class="overview-list">' + rows + '</ul></section>';
  }

  function statusSummary() {
    var total = state.sections.length;
    var edited = state.sections.filter(function (s) { return s.status === 'edited'; }).length;
    var errored = state.sections.filter(function (s) { return s.status === 'error'; }).length;
    var finals = state.sections.filter(isFinal).length;
    if (dbStatus === 'loading') return 'Loading your saved guides…';
    if (editState) {
      var activeNow = state.sections.filter(function (s) { return s.status === 'editing'; }).length;
      return editState.done + ' of ' + editState.total + ' done in this pass — editing ' + activeNow + ' now…';
    }
    var line = total + ' guide' + plural(total) + ' · ' + edited + ' edited · ' + finals + ' final';
    if (errored) line += ' · ' + errored + ' needs attention';
    return line;
  }

  // Where the book's caption files stand, in one sentence, so the export button never surprises.
  function captionsLine() {
    var all = state.sections.length, n = captionsReadyCount();
    if (!n) return 'No guide has caption files ready yet. A guide needs its timed captions from Descript and the edit pass run.';
    return n + ' of ' + all + ' guide' + plural(all) + ' ' + (n === 1 ? 'has' : 'have') + ' caption files ready.';
  }

  function renderDocResult() {
    if (state.docResult) {
      if (state.docResult.method === 'pending') return '<p class="doc-result" id="doc-progress">' + esc(state.docResult.progress || 'Building your Google Doc…') + '</p>';
      if (state.docResult.method === 'drive') {
        var docNote = state.docResult.note ? ' ' + esc(state.docResult.note) : '';
        if (state.docResult.tabs != null) {
          var tabsFailed = state.docResult.failed ? ' ' + state.docResult.failed + ' could not be written (' + esc((state.docResult.failedNames || []).join(', ')) + '). Their tabs are there but empty: create the Doc again to get them all.' : '';
          return '<p class="doc-result">Created one Doc in your Google Drive with ' + state.docResult.tabs + ' tab' + plural(state.docResult.tabs) + ', one for each guide' +
            (state.docResult.url ? ' — <a href="' + escAttr(state.docResult.url) + '" target="_blank" rel="noopener">open the doc</a>' : '') + '.' + tabsFailed + '</p>';
        }
        if (state.docResult.count != null) {
          var failedNote = state.docResult.failed ? ' ' + state.docResult.failed + ' could not be created — try again for those.' : '';
          return '<p class="doc-result">Created ' + state.docResult.count + ' Doc' + plural(state.docResult.count) + ' in a new folder in your Google Drive' +
            (state.docResult.url ? ' — <a href="' + escAttr(state.docResult.url) + '" target="_blank" rel="noopener">open the folder</a>' : '') + '.' + esc(failedNote) + '</p>';
        }
        return '<p class="doc-result">Created in your Google Drive' + (state.docResult.url ? ' — <a href="' + escAttr(state.docResult.url) + '" target="_blank" rel="noopener">open the doc</a>' : '') + '.' + docNote + '</p>';
      }
      if (state.docResult.method === 'download') return '<p class="doc-result">Saved the Final Transcripts as a file — open it with Google Docs (File › Open, or drag it into Drive) to keep editing there.</p>';
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
    var bits = [b.scripts + ' guide' + plural(b.scripts)];
    if (b.scripts) bits.push(b.edited + ' edited', b.finals + ' final');
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
      '<p class="eyebrow">Through the Word · Transcript Workbench</p>' +
      '<h1 class="library-title">The Scriptorium</h1>' +
      '<p class="dek">Turn Descript’s 1st Draft Transcript of each audio guide into a clean, accurate Final Transcript and searchable caption files, checked against what the teacher wrote. Every book below is shared with the whole team: open one to pick up where anyone left off.</p>' +
      '</header>' +
      noticeHtml() +
      '<div class="action-bar">' +
      '<div class="bar-group"><button type="button" class="btn btn-add" data-action="new-book"' + (loading ? ' disabled' : '') + '>+ New Book</button>' +
      '<button type="button" class="btn" data-action="go-written"' + (loading ? ' disabled' : '') + ' title="What each teacher wrote before recording, kept as a reference">Written Scripts' + (writtenIndex.length ? ' (' + writtenIndex.length + ')' : '') + '</button>' +
      '<button type="button" class="btn" data-action="go-glossary"' + (loading ? ' disabled' : '') + ' title="Bible names and terms, and the ways Descript has misheard them">Glossary' + (approvedTerms().length ? ' (' + approvedTerms().length + ')' : '') + '</button></div>' +
      '<p class="status-line">' + (loading ? 'Loading the team’s books…' : library.length + ' book' + plural(library.length)) + '</p>' +
      '</div>' +
      (loading ? renderSkeleton() :
        library.length ? '<div class="book-list">' + library.map(renderBookRow).join('') + '</div>' :
        '<p class="library-empty">No books yet. Start one with <strong>+ New Book</strong> — everyone on the team will see it here.</p>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  function renderApp() { return view === 'library' ? renderLibrary() : view === 'written' ? renderWritten() : view === 'glossary' ? renderGlossary() : renderBook(); }

  function renderBook() {
    var loading = dbStatus === 'loading';
    var anyEdited = state.sections.some(function (s) { return s.status === 'edited'; });
    var editRunning = !!editState || state.sections.some(function (s) { return s.status === 'editing'; });
    var pending = !!(state.docResult && state.docResult.method === 'pending');
    var hasAnything = state.sections.some(function (s) { return s.raw.trim() || s.name.trim(); });
    var toEdit = state.sections.filter(needsEdit).length;
    var anyCollapsible = state.sections.some(function (s) { return s.status === 'edited' && !collapsed[s.id]; });
    var anyCollapsed = state.sections.some(function (s) { return collapsed[s.id]; });
    var editedCount = state.sections.filter(function (s) { return s.status === 'edited'; }).length, finalCount = state.sections.filter(isFinal).length;
    var concludeDisabled = (!finalCount || editRunning || pending || loading) ? ' disabled' : '';
    var dis = loading ? ' disabled' : '';
    var pulling = !!(pull && pull.step === 'pulling');
    var anyCaptions = state.sections.some(function (s) { return s.status === 'edited' && (s.captions || '').trim(); });

    var notice = noticeHtml();

    var editLabel = editRunning ? 'Editing…' : (toEdit && toEdit < state.sections.length ? 'Edit ' + toEdit + ' Guide' + plural(toEdit) : 'Edit All Guides');
    var saveLabel = saveStateLabel();

    return (
      '<div class="wrap">' +
      (dbRoot ? '<p class="back-line"><button type="button" class="link-btn" data-action="go-library">← All books</button></p>' : '') +
      '<header class="hero">' +
      '<p class="eyebrow">Through the Word · Transcript Workbench</p>' +
      '<input class="title-field" data-field="bookTitle" type="text" placeholder="Untitled book or plan" value="' + escAttr(state.bookTitle) + '" aria-label="Book or plan title"' + dis + '>' +
      '<p class="dek">Turn Descript’s 1st Draft Transcript of each audio guide into a clean, accurate Final Transcript — grammar fixed, misheard names caught, nothing about how it sounds changed.</p>' +
      '</header>' +
      '<details class="tip"><summary>How this works</summary><ol>' +
      '<li>Click <strong>Pull from Descript</strong> and pick the audio guides to bring in. Each gets a card below, with its <strong>1st Draft Transcript</strong> (what Descript heard) and its timed captions. Or paste a transcript into a card by hand — use <strong>+ Add Guide</strong> for as many as the plan needs.</li>' +
      '<li>List any names or terms Descript’s AI likely misheard under <strong>Words to Search For</strong>. Terms the team has approved in the <strong>Glossary</strong> (on the front page) are passed along by themselves.</li>' +
      '<li>If the teacher’s <strong>written script</strong> has been added (front page › Written Scripts), each card says which one it is matched to. It is a reference only: evidence for a misheard word, a question mark, or where a sentence ends. The transcript is never changed to match it.</li>' +
      '<li>Click <strong>Edit All Guides</strong> to fix grammar, catch misheard words, and flag anything that still doesn’t make sense. The result is the <strong>Edited Transcript</strong>. Bible verses and their references come back in <strong>bold</strong> — their wording is left alone apart from misheard words, which are listed separately. Each finished guide is saved on its own, so you can stop and resume anytime.</li>' +
      '<li>The edit pass may only fix punctuation, capitals and words Descript misheard. Anything that would change the speaker’s words is listed as a suggestion and <strong>not applied</strong>, and a quotation that may not match the verse is listed <strong>for the teacher</strong>. For a small fix of your own, use <strong>Edit by hand</strong>.</li>' +
      '<li>Check the scripture. Every reference is checked against the chapter the guide is on, what was said aloud, and the written script. Where one looks wrong, the likelier references are listed — click one to use it, or <strong>Change</strong> to type your own.</li>' +
      '<li>When you have reviewed a guide, click <strong>Approve as Final</strong>. That makes it the <strong>Final Transcript</strong>. Changing it afterwards takes it back to Edited until it is approved again.</li>' +
      '<li>Click <strong>Create Google Doc</strong> — one Doc with a tab for each guide, one Doc with a page for each guide, or one Doc per guide in a folder. Only Final Transcripts go in. <strong>Copy for YouVersion</strong> works on any Edited or Final Transcript, with the verses already formatted. <strong>Download</strong>, under it, saves the Final Transcripts as a PDF or a web page, as one file or one for each guide.</li>' +
      '<li>For searchable captions, use <strong>Download .srt + .vtt</strong> under <strong>Timed captions for search</strong> on a guide once it is edited, or <strong>Download all caption files</strong> at the bottom for the whole book, as .srt, .vtt or both. Every file carries the corrected words on Descript’s timings.</li>' +
      '</ol></details>' +
      '<section class="search-panel"><label for="wordsToSearchFor">Words to Search For</label>' +
      '<p class="hint">Names or terms Descript’s AI probably didn’t recognize — e.g. Elihu, Eliphaz, Zophar, Bildad, Leviathan. List them and the edit pass will watch for homophones of each.</p>' +
      '<textarea id="wordsToSearchFor" data-field="wordsToSearchFor" rows="2" placeholder="Elihu, Eliphaz, Zophar, Bildad, Behemoth, Leviathan…"' + dis + '>' + esc(state.wordsToSearchFor) + '</textarea>' + glossaryLine() + '</section>' +
      notice +
      '<div class="action-bar">' +
      '<div class="bar-group">' +
      '<button type="button" class="btn btn-add" data-action="add-section"' + dis + '>+ Add Guide</button>' +
      '<button type="button" class="btn" data-action="pull-descript"' + (loading || editRunning || pulling || dbStatus === 'unavailable' ? ' disabled' : '') + '>Pull from Descript</button>' +
      '<button type="button" class="btn btn-quiet-danger" data-action="clear-all"' + (loading || editRunning || pulling || clearing || !hasAnything ? ' disabled' : '') + '>' + (clearing ? 'Clearing…' : 'Clear All') + '</button>' +
      (anyCollapsible ? '<button type="button" class="btn btn-ghost btn-sm" data-action="collapse-edited"' + dis + '>Collapse edited</button>' : '') +
      (anyCollapsed ? '<button type="button" class="btn btn-ghost btn-sm" data-action="expand-all"' + dis + '>Expand all</button>' : '') +
      '</div>' +
      '<p class="status-line">' + esc(statusSummary()) + '</p>' +
      '<p class="save-state' + (saveLabel === 'Saving…' ? ' is-saving' : '') + '" id="save-state">' + esc(saveLabel) + '</p>' +
      '<div class="action-bar-end">' +
      '<label class="speed-pick" title="Close paragraph breaks that fall mid-thought (Descript breaks on pauses)"><input type="checkbox" data-action="set-repair"' + (repairParagraphs ? ' checked' : '') + (editRunning ? ' disabled' : '') + '> Fix mid-thought breaks</label>' +
      '<label class="speed-pick" title="How many guides to edit at the same time">Speed <select data-action="set-concurrency"' + (editRunning ? ' disabled' : '') + '><option value="1"' + (concurrency === 1 ? ' selected' : '') + '>1 at a time</option><option value="2"' + (concurrency === 2 ? ' selected' : '') + '>2 at a time</option></select></label>' +
      '<button type="button" class="btn btn-edit" data-action="edit-all"' + (editRunning || loading || pulling ? ' disabled' : '') + '>' + editLabel + '</button>' +
      (editRunning ? '<button type="button" class="btn btn-ghost" data-action="stop-edit">Stop</button>' : '') + '</div>' +
      '</div>' +
      (loading ? renderSkeleton() :
        renderPull() +
        renderScriptSummary() +
        renderOverview() +
        '<div class="sections">' + state.sections.map(renderSectionSafe).join('') + '</div>' +
        '<footer class="conclude-bar">' +
        '<p class="approve-prompt">Turn the Final Transcripts into a Google Doc</p>' +
        '<p class="hint conclude-note">' + (finalCount
          ? finalCount + ' of ' + state.sections.length + ' guide' + plural(state.sections.length) + ' ' + (finalCount === 1 ? 'is' : 'are') + ' approved as a Final Transcript' + (editedCount > finalCount ? ', and ' + (editedCount - finalCount) + ' edited guide' + plural(editedCount - finalCount) + ' still wait' + (editedCount - finalCount === 1 ? 's' : '') + ' for approval' : '') + '.'
          : 'No guide is approved yet. Review an Edited Transcript, then click Approve as Final on its card.') +
        ' Only Final Transcripts go into the Google Doc.</p>' +
        '<div class="conclude-row">' +
        '<button type="button" class="btn btn-conclude" data-action="conclude"' + concludeDisabled + '>' + (docMode === 'perScript' ? 'Create Google Docs' : 'Create Google Doc') + '</button>' +
        '<label class="speed-pick"><select data-action="set-docmode"' + (pending ? ' disabled' : '') + '><option value="tabs"' + (docMode === 'tabs' ? ' selected' : '') + '>One Doc, a tab for each guide</option><option value="one"' + (docMode === 'one' ? ' selected' : '') + '>One Doc, a page for each guide</option><option value="perScript"' + (docMode === 'perScript' ? ' selected' : '') + '>One Doc per guide, in a folder</option></select></label>' +
        '</div>' + renderDocResult() +
        renderExport(finalCount) +
        '<div class="caption-export">' +
        '<p class="approve-prompt">Export every guide’s caption files</p>' +
        '<p class="hint conclude-note">' + captionsLine() + ' Each file carries the corrected transcript on Descript’s own timings. These do not wait for approval.</p>' +
        '<div class="conclude-row">' +
        '<button type="button" class="btn btn-conclude" data-action="download-all-captions"' + (anyCaptions ? '' : ' disabled') + '>Download all caption files</button>' +
        '<label class="speed-pick"><select data-action="set-captionformat" aria-label="Which caption files"><option value="both"' + (captionFormat === 'both' ? ' selected' : '') + '>Both .srt and .vtt</option><option value="srt"' + (captionFormat === 'srt' ? ' selected' : '') + '>.srt only</option><option value="vtt"' + (captionFormat === 'vtt' ? ' selected' : '') + '>.vtt only</option></select></label>' +
        '</div>' +
        '</div>' +
        '</footer>') +
      versionLine() +
      '</div>' + renderModal()
    );
  }

  /* ---- Repainting: keep the caret where it was; repaint one card when that is all that changed ---- */

  function captureFocus() {
    var el = document.activeElement;
    if (!el || !el.dataset) return null;
    var pos = { start: el.selectionStart, end: el.selectionEnd, scrollTop: el.scrollTop };
    if (el.dataset.field) { pos.selector = '[data-field="' + el.dataset.field + '"]' + (el.dataset.id ? '[data-id="' + el.dataset.id + '"]' : ':not([data-id])'); return pos; }
    if (el.dataset.wfield) { pos.selector = '[data-wfield="' + el.dataset.wfield + '"]'; return pos; }
    if (el.hasAttribute('data-ref-input')) { pos.selector = '[data-ref-input]'; return pos; }
    return null;
  }
  function restoreFocus(f) {
    if (!f) return;
    var el = root.querySelector(f.selector);
    if (!el) return;
    try { el.focus({ preventScroll: true }); if (f.start != null && el.setSelectionRange) el.setSelectionRange(f.start, f.end); el.scrollTop = f.scrollTop; } catch (e) {}
  }
  function paint() { var f = captureFocus(); root.innerHTML = renderApp(); restoreFocus(f); }
  function paintSection(id) {
    var s = findSection(id), el = root.querySelector('[data-section="' + id + '"]');
    if (!s || !el) { paint(); return; }
    var f = captureFocus(); el.outerHTML = renderSectionSafe(s); restoreFocus(f);
    paintScriptSummary();                              // one card changing can change the book's count of written scripts
  }
  function paintStatus() {
    var el = root.querySelector('.status-line'); if (el) el.textContent = statusSummary();
    paintScriptSummary();
    var sv = document.getElementById('save-state');
    if (sv) { var label = saveStateLabel(); sv.textContent = label; sv.classList.toggle('is-saving', label === 'Saving…'); }
  }
  function paintChipOnly(s) {
    paintScriptBadge(s);
    var card = root.querySelector('[data-section="' + s.id + '"]');
    var chip = card && card.querySelector('.chip');
    if (chip) {
      var clock = chipClock(s);
      chip.className = 'chip ' + chipClass(s); chip.textContent = statusLabel(s);
      if (clock) { chip.setAttribute('data-ts', clock.ts); chip.setAttribute('data-prefix', clock.prefix); } else { chip.removeAttribute('data-ts'); chip.removeAttribute('data-prefix'); }
    }
    if (card) {
      var note = card.querySelector('.stale-note');
      if (isStale(s) && !note) {
        var details = card.querySelector('.section-details');
        var p = document.createElement('p'); p.className = 'stale-note';
        p.textContent = 'The 1st Draft Transcript has changed since this was edited — run Edit again to refresh it.';
        if (details) card.insertBefore(p, details); else card.appendChild(p);
      } else if (!isStale(s) && note) note.remove();
    }
    var btn = root.querySelector('[data-action="edit-all"]');
    if (btn && !editState) {
      var toEdit = state.sections.filter(needsEdit).length;
      btn.textContent = (toEdit && toEdit < state.sections.length) ? 'Edit ' + toEdit + ' Guide' + plural(toEdit) : 'Edit All Guides';
    }
  }
  // "Edited 3 minutes ago" stays truthful without a repaint.
  setInterval(function () {
    root.querySelectorAll('[data-ts]').forEach(function (el) {
      var ts = Number(el.getAttribute('data-ts')); if (!ts) return;
      el.textContent = (el.getAttribute('data-prefix') || '') + relTime(ts);
    });
  }, 60000);

