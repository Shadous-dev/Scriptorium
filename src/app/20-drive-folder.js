/* 20-drive-folder.js — Sending a book's files to one Google Drive folder the reader names: the Google Doc, caption files, PDF and web page. SOURCE-OF-TRUTH 4.11. */
  /* ==================================================================
     The reader ticks the kinds of file wanted and names one folder, and every file lands there together. Each
     is added as a new file. Nothing already in Drive is read, edited, moved or deleted (4.11), so sending a
     book twice leaves two copies. The Google Doc, the PDF and the web page hold Final Transcripts only;
     caption files do not wait for approval, here as elsewhere. Nothing calls Claude (4.6).
     ================================================================== */

  var DRIVE_KINDS = ['doc', 'srt', 'vtt', 'pdf', 'html'];
  var DRIVE_KIND_LABEL = { doc: 'Google Doc', srt: '.srt captions', vtt: '.vtt captions', pdf: 'PDF', html: 'Web page (.html)' };
  var DRIVE_KIND_SAID = { srt: ['.srt file', '.srt files'], vtt: ['.vtt file', '.vtt files'], pdf: ['PDF', 'PDFs'], html: ['web page', 'web pages'] };
  // Which kinds are ticked. To begin with: the Google Doc and both caption files.
  function driveKindsOf(v) {
    var out = {}, given = v && typeof v === 'object';
    DRIVE_KINDS.forEach(function (k) { out[k] = given ? v[k] === true : (k === 'doc' || k === 'srt' || k === 'vtt'); });
    return out;
  }
  var driveKinds = driveKindsOf(prefGet('driveKinds', null));
  var driveLinks = {};               // book → the folder link typed for it, remembered in this browser only
  var driveSend = null;              // the run in hand, or the last one: { book, step, progress, stop, error, report }
  function driveLink() {
    if (!bookId) return '';
    if (driveLinks[bookId] == null) driveLinks[bookId] = String(prefGet('driveFolder.' + bookId, '') || '');
    return driveLinks[bookId];
  }
  function setDriveLink(text) { if (bookId) { driveLinks[bookId] = String(text || ''); prefSet('driveFolder.' + bookId, driveLinks[bookId]); } }
  function driveFolderName() { return exportBase() + ' — transcripts and captions'; }
  function toBase64(bytes) {
    var s = '', i;
    for (i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(s);
  }
  // The files to send, apart from the Google Doc: [{ name, text or bytes, mime, kind }], and what the PDF could not draw.
  function driveJobs(kinds, finals, when) {
    var jobs = [], notes = { plain: 0, lost: 0 };
    function captions(kind) { captionFiles(state.sections, false, kind).forEach(function (f) { jobs.push({ name: f.name, text: f.text, mime: 'text/plain', kind: kind }); }); }
    if (kinds.srt) captions('srt');
    if (kinds.vtt) captions('vtt');
    if (kinds.pdf && finals.length) {
      var pdf = exportParts('pdf', exportSplit, finals, when);
      notes.plain = pdf.plain; notes.lost = pdf.lost;
      pdf.files.forEach(function (f) { jobs.push({ name: f.name, bytes: f.bytes, mime: 'application/pdf', kind: 'pdf' }); });
    }
    if (kinds.html && finals.length) exportParts('html', exportSplit, finals, when).files.forEach(function (f) { jobs.push({ name: f.name, text: f.text, mime: 'text/html', kind: 'html' }); });
    return { jobs: jobs, notes: notes };
  }
  // What Drive is asked to make for one file. It is told to keep the file as it is: left to itself Drive turns
  // text and web pages into Google Docs.
  function driveArgs(job, folderId) {
    var args = { title: job.name, contentMimeType: job.mime, disableConversionToGoogleType: true, parentId: folderId };
    if (job.bytes) args.base64Content = toBase64(job.bytes); else args.textContent = job.text;
    return args;
  }
  var DRIVE_HALT = /^(needs_reauth|server_not_connected|server_not_found|selection_required|not_in_manifest|approval_required|consent_required|blocked_by_policy|not_granted|capability_disabled|capability_removed|no_tool|no_folder|folder_refused)$/;
  function driveHalts(err) { return !!(err && DRIVE_HALT.test(String(err.code || ''))); }
  function driveCreate(mcp, tool, args, tries) {
    return mcp.callTool('Google Drive', tool, args).catch(function (err) {
      var code = err && err.code;
      if ((code === 'rate_limited' || code === 'server_unavailable') && tries < 2) return bulkWait(4000 * (tries + 1)).then(function () { return driveCreate(mcp, tool, args, tries + 1); });
      throw err;
    });
  }
  function driveSendProblem(err) {
    var code = err && err.code;
    if (code === 'needs_reauth') return 'Google Drive needs reconnecting. In Claude, open Settings → Connectors, reconnect Google Drive, then send again.';
    if (code === 'server_not_connected' || code === 'server_not_found' || code === 'selection_required' || code === 'no_tool') return 'Google Drive isn’t connected for you yet. In Claude, open Settings → Connectors, add Google Drive, then send again.';
    if (code === 'not_in_manifest' || code === 'approval_required' || code === 'consent_required') return 'This page wasn’t allowed to add files to Google Drive. Reload the page and choose Allow when it asks.';
    if (code === 'blocked_by_policy') return 'Your organization doesn’t allow this page to add files to Google Drive.';
    if (code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') return 'Google Drive can’t be reached from this view.';
    if (code === 'no_folder') return 'Google Drive would not make the folder. Try again, or paste the link to a folder that is already there.';
    if (code === 'folder_refused') return 'Google Drive would not add files to that folder. Check that the link is to the right folder and that you can add files there yourself.';
    if (code === 'server_unavailable' || code === 'rate_limited') return 'Google Drive didn’t answer just now. Wait a minute and send again.';
    return 'Couldn’t send to Google Drive: ' + ((err && err.message) || 'unknown error') + '.';
  }
  // What the Doc builders said they made, in a few words.
  function driveDocSaid() {
    var r = state.docResult || {};
    if (r.method !== 'drive') return '';
    if (r.tabs != null) return 'one Google Doc with ' + r.tabs + ' tab' + plural(r.tabs);
    if (r.count != null) return r.count + ' Google Doc' + plural(r.count);
    return 'one Google Doc';
  }
  function driveProgress(send, text) { send.progress = text; var p = root.querySelector('.drive-progress'); if (p) p.textContent = text; }

  function sendToDrive() {
    syncFieldsFromDom();
    if (driveSend && driveSend.step === 'sending') return Promise.resolve();
    var book = bookId, kinds = driveKindsOf(driveKinds), finals = finalSections(), link = driveLink().trim(), when = new Date();
    function fail(message) { driveSend = { book: book, step: 'done', error: message, report: null }; paint(); return Promise.resolve(); }
    if (!DRIVE_KINDS.some(function (k) { return kinds[k]; })) return fail('Tick at least one kind of file to send.');
    var target = link ? driveTarget(link) : null;
    if (link && (!target || target.kind !== 'folder')) return fail('That doesn’t look like a link to a Google Drive folder. Open the folder in Google Drive, copy the link from the address bar, and paste it here. Or clear the box, and a new folder is made.');
    var built;
    try { built = driveJobs(kinds, finals, when); } catch (err) { console.warn('Scriptorium: could not make the files', err); return fail('The files could not be made. Report this.'); }
    var jobs = built.jobs, wantDoc = kinds.doc && finals.length > 0;
    if (!wantDoc && !jobs.length) return fail('Nothing is ready to send yet. The Google Doc, the PDF and the web page need a guide approved as a Final Transcript. Caption files need a guide’s timed captions and the edit pass run.');
    var withText = state.sections.filter(function (s) { return String(s.raw || '').trim() || s.corrected; }).length;
    var report = { sent: 0, failed: [], doc: '', docNote: '', folderUrl: target ? safeLink(link) : '', made: false, stopped: false, counts: {}, notes: built.notes,
                   notFinal: (kinds.doc || kinds.pdf || kinds.html) ? Math.max(0, withText - finals.length) : 0,
                   noCaptions: (kinds.srt || kinds.vtt) ? Math.max(0, withText - captionsReadyCount()) : 0 };
    var send = driveSend = { book: book, step: 'sending', progress: 'Getting ready…', stop: false, error: '', report: report };
    paint();
    return useCap('mcp').then(function (mcp) {
      if (!mcp) throw { code: 'capability_disabled' };
      return googleTools(mcp).then(function (tools) {
        if (!tools.create) throw { code: 'server_not_connected' };
        // 1. The folder: the one named, or a new one for this book.
        var folder = target ? Promise.resolve(target.id) : driveCreate(mcp, tools.create, { title: driveFolderName(), contentMimeType: 'application/vnd.google-apps.folder' }, 0).then(function (res) {
          var f = payloadOf(res);
          if (!f.id) throw { code: 'no_folder' };
          report.folderUrl = urlOf(f); report.made = true;
          if (report.folderUrl && bookId === book) setDriveLink(report.folderUrl);      // so the next send goes to the same place
          return String(f.id);
        }, function (err) { throw driveHalts(err) ? err : { code: 'no_folder' }; });
        return folder.then(function (folderId) {
          // 2. The Google Doc, made straight into the folder.
          var docStep = Promise.resolve();
          if (wantDoc) {
            driveProgress(send, 'Making the Google Doc…');
            docStep = Promise.resolve().then(function () {
              return docMode === 'tabs' ? tabsDoc(mcp, tools, finals, folderId) : docMode === 'one' ? oneDoc(mcp, tools.create, finals, '', folderId) : folderOfDocs(mcp, tools.create, finals, folderId);
            }).then(function () { report.doc = driveDocSaid(); report.docNote = String((state.docResult && state.docResult.note) || ''); }, function (err) {
              console.warn('Scriptorium: the Google Doc could not be made', err);
              if (driveHalts(err)) throw err;
              report.failed.push('the Google Doc'); state.docResult = null;
            });
          }
          return docStep.then(function () {
            // 3. Every other file, one at a time.
            var i = 0, missesInARow = 0;
            function next() {
              if (i >= jobs.length || send.stop || driveSend !== send) { report.stopped = i < jobs.length; return Promise.resolve(); }
              var job = jobs[i]; i += 1;
              driveProgress(send, 'Sending ' + i + ' of ' + jobs.length + ' — ' + job.name + '…');
              return driveCreate(mcp, tools.create, driveArgs(job, folderId), 0).then(function () {
                report.sent += 1; report.counts[job.kind] = (report.counts[job.kind] || 0) + 1; missesInARow = 0;
              }, function (err) {
                console.warn('Scriptorium: could not send ' + job.name, err);
                if (driveHalts(err)) throw err;
                report.failed.push(job.name); missesInARow += 1;
                // Three refusals in a row with nothing accepted: it is the folder, not the files. Stop rather than fail eighty times.
                if (missesInARow >= 3 && !report.sent && !report.doc) throw { code: 'folder_refused' };
              }).then(next);
            }
            return next();
          });
        });
      });
    }).catch(function (err) {
      console.warn('Scriptorium: sending to Google Drive stopped', err);
      send.error = driveSendProblem(err);
    }).then(function () { if (driveSend === send) { send.step = 'done'; paint(); } });
  }
  // What was sent, in sentences.
  function driveReportText(r) {
    var out = [], bits = [], total = r.sent + (r.doc ? 1 : 0);
    if (r.doc) bits.push(r.doc);
    ['srt', 'vtt', 'pdf', 'html'].forEach(function (k) { if (r.counts[k]) bits.push(r.counts[k] + ' ' + DRIVE_KIND_SAID[k][r.counts[k] === 1 ? 0 : 1]); });
    if (total) out.push('Sent to ' + (r.made ? 'a new Google Drive folder' : 'your Google Drive folder') + ': ' + bits.join(', ') + '.');
    else out.push('Nothing was sent.');
    if (r.docNote) out.push(r.docNote);
    if (r.failed.length) out.push(r.failed.length + ' could not be sent: ' + r.failed.slice(0, 12).join(', ') + (r.failed.length > 12 ? ' and ' + (r.failed.length - 12) + ' more' : '') + '. Send again to add them; files already there are not replaced, so untick what arrived.');
    if (r.stopped) out.push('Stopped before the end. What was sent is in the folder.');
    if (r.notFinal) out.push(r.notFinal + ' guide' + plural(r.notFinal) + ' not yet approved ' + (r.notFinal === 1 ? 'is' : 'are') + ' not in the Google Doc, PDF or web page.');
    if (r.noCaptions) out.push(r.noCaptions + ' guide' + plural(r.noCaptions) + ' had no caption files ready.');
    var odd = r.notes.plain + r.notes.lost;
    if (odd && r.counts.pdf) out.push(odd + ' letter' + plural(odd) + ' the PDF’s fonts do not have ' + (odd === 1 ? 'was' : 'were') + ' drawn as the plain letter' + (r.notes.lost ? ' (' + r.notes.lost + ' as “?”)' : '') + '.');
    return out;
  }
  function renderDriveSend(finalCount) {
    var s = driveSend && driveSend.book === bookId ? driveSend : null, sending = !!s && s.step === 'sending', dis = sending ? ' disabled' : '';
    var caps = captionsReadyCount(), any = DRIVE_KINDS.some(function (k) { return driveKinds[k]; });
    function note(k) { return k === 'doc' || k === 'pdf' || k === 'html' ? finalCount + ' Final' : caps + ' ready'; }
    var result = '';
    if (s && !sending) {
      var lines = s.report ? driveReportText(s.report) : [];
      if (s.report && (s.report.sent || s.report.doc || s.report.failed.length || s.report.stopped)) {
        result += '<div class="notice bulk-report">' + lines.map(function (line) { return '<p>' + esc(line) + '</p>'; }).join('') +
          (s.report.folderUrl ? '<p><a href="' + escAttr(s.report.folderUrl) + '" target="_blank" rel="noopener">Open the folder</a></p>' : '') + '</div>';
      }
      if (s.error) result += '<p class="doc-result is-error">' + esc(s.error) + '</p>';
    }
    return '<div class="caption-export drive-send">' +
      '<p class="approve-prompt">Send it all to one Google Drive folder</p>' +
      '<p class="hint conclude-note">Tick the kinds of file you want and name one folder: every file for this book lands there together. Each is added as a new file. Nothing already in the folder is changed or replaced, so sending twice leaves two copies. The Google Doc, the PDF and the web page are made the way chosen above, and hold Final Transcripts only.</p>' +
      '<div class="conclude-row drive-kinds">' + DRIVE_KINDS.map(function (k) {
        return '<label class="speed-pick"><input type="checkbox" data-action="drive-kind" data-kind="' + k + '"' + (driveKinds[k] ? ' checked' : '') + dis + '> ' + esc(DRIVE_KIND_LABEL[k]) + ' <span class="drive-count">' + esc(note(k)) + '</span></label>';
      }).join('') + '</div>' +
      '<label class="written-label" for="drive-folder">Google Drive folder</label>' +
      '<input id="drive-folder" class="written-input" data-dfield="folder" type="text" placeholder="Paste the folder’s link — or leave this empty and a new folder is made" value="' + escAttr(driveLink()) + '"' + dis + '>' +
      '<div class="conclude-row">' +
      '<button type="button" class="btn btn-conclude" data-action="drive-send"' + (sending || !any ? ' disabled' : '') + '>' + (sending ? 'Sending…' : 'Send to Google Drive') + '</button>' +
      (sending ? '<span class="hint drive-progress">' + esc(s.progress) + '</span><button type="button" class="btn btn-ghost" data-action="drive-stop"' + (s.stop ? ' disabled' : '') + '>Stop</button>' : '') +
      '</div>' + result +
      '</div>';
  }
