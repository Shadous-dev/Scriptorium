/* 12-google-doc.js — Building the Google Doc from the Final Transcripts, with an HTML download fallback. */
  /* ---- Building the Google Doc ----
     Only a Final Transcript goes in: one a person has reviewed and approved. A guide that is still a
     1st Draft or an Edited Transcript is left out, and the page says how many were. ---- */

  function docTitle() { return (state.bookTitle.trim() || 'Untitled') + ' — Audio Guide Transcripts'; }
  function finalSections() { return state.sections.filter(isFinal); }

  function scriptBody(s, withHeading) {
    return (withHeading ? '<h2>' + esc(s.name || 'Untitled guide') + '</h2>' : '') + blocksToHtml(layoutBlocks(s), true);
  }
  function docBody() {
    return '<h1>' + esc(docTitle()) + '</h1>' + finalSections().map(function (s) { return scriptBody(s, true); }).join('');
  }
  var DOC_STYLE = '<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.55;color:#222}p{margin:0}h1{font-size:26px}h2{font-size:19px;margin-top:36px}em{color:#777}blockquote{margin:0 0 0 24px;padding-left:12px;border-left:3px solid #c9b48a}</style>';
  // One wrapper for every document the tool emits: Drive gets a bare document, the download a styled one.
  function wrapDoc(body, styled) {
    return styled ? '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(docTitle()) + '</title>' + DOC_STYLE + '</head><body>' + body + '</body></html>' : '<html><body>' + body + '</body></html>';
  }
  function scriptDocHtml(s) { return wrapDoc('<h1>' + esc(s.name || 'Untitled guide') + '</h1>' + scriptBody(s, false), false); }
  function downloadName() { return ((state.bookTitle.trim() || 'audio-guide').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'audio-guide') + '-transcripts.html'; }

  function saveDownload(isFallback) {
    return useCap('downloads').then(function (downloads) {
      if (!finalSections().length) { state.docResult = { method: 'error', message: 'No guide has been approved as a Final Transcript yet.' }; return; }
      if (!downloads) { state.docResult = { method: 'error', message: 'Downloads aren’t available in this view — use Copy for YouVersion on each guide instead.' }; return; }
      return downloads.save({ filename: downloadName(), data: wrapDoc(docBody(), true) }).then(function () {
        state.docResult = { method: 'download', at: Date.now() };
      }).catch(function (err) {
        if (err && err.code === 'declined') state.docResult = isFallback ? { method: 'error', message: 'Google Drive isn’t connected, and the file save was declined. Connect Google Drive in Settings → Connectors, or try again.' } : null;
        else state.docResult = { method: 'error', message: 'Couldn’t save a copy: ' + ((err && err.message) || 'unknown error') };
      });
    });
  }

  function paintDocResult() {
    var footer = root.querySelector('.conclude-bar');
    if (!footer) return;
    var old = footer.querySelector('.doc-result, .doc-link-line');
    var html = renderDocResult();
    if (old) old.outerHTML = html; else footer.insertAdjacentHTML('beforeend', html);
  }

  function driveTool(mcp) {
    return mcp.listTools().then(function (list) {
      var servers = (list && list.servers) || [];
      var server = servers.filter(function (sv) { return sv.server === 'Google Drive'; })[0];
      var tool = server && server.tools.filter(function (t) { return /create.*file/i.test(t.name); })[0];
      return (server && tool) ? tool.name : null;
    });
  }
  function payloadOf(res) {
    var payload = res && res.payload;
    if (!payload && res && res.content && res.content[0] && res.content[0].text) { try { payload = JSON.parse(res.content[0].text); } catch (e) {} }
    return payload || {};
  }
  function urlOf(p) { return safeLink(p && (p.viewUrl || p.webViewLink || p.url)); }

  function conclude() {
    syncFieldsFromDom();
    var finals = finalSections();                       // fixed now: a guide approved while the Docs are being made is not slipped in half-way
    if (!finals.length) { showFlash('No guide has been approved as a Final Transcript yet. Approve one and try again.'); return; }
    state.docResult = { method: 'pending', progress: docMode === 'perScript' ? 'Creating a folder in your Google Drive…' : 'Building your Google Doc…' };
    paint();
    useCap('mcp').then(function (mcp) {
      if (!mcp) return false;
      return driveTool(mcp).then(function (toolName) {
        if (!toolName) return false;
        if (docMode !== 'perScript') {
          return mcp.callTool('Google Drive', toolName, { title: docTitle(), textContent: wrapDoc(docBody(), false), contentMimeType: 'text/html' }).then(function (res) {
            var url = urlOf(payloadOf(res));
            state.docResult = { method: 'drive', url: url, at: Date.now() };
            if (url) { state.lastDoc = { url: url, at: Date.now(), kind: 'doc' }; saveMeta(); }
            return true;
          });
        }
        // One Doc per guide, inside a new folder named for the book.
        return mcp.callTool('Google Drive', toolName, { title: docTitle(), contentMimeType: 'application/vnd.google-apps.folder' }).then(function (res) {
          var folder = payloadOf(res), folderId = folder && folder.id, folderUrl = urlOf(folder);
          if (!folderId) throw { code: 'no_folder' };
          var queue = finals.slice(), done = 0, failed = 0;
          function next() {
            var s = queue.shift();
            if (!s) return Promise.resolve();
            state.docResult = { method: 'pending', progress: 'Creating Doc ' + (done + failed + 1) + ' of ' + finals.length + ' — ' + (s.name || 'Untitled guide') + '…' };
            paintDocResult();
            return mcp.callTool('Google Drive', toolName, { title: s.name || 'Untitled guide', textContent: scriptDocHtml(s), contentMimeType: 'text/html', parentId: folderId })
              .then(function () { done += 1; }, function (err) { failed += 1; console.warn('Scriptorium: doc failed for ' + s.name, err); })
              .then(next);
          }
          return next().then(function () {
            state.docResult = { method: 'drive', url: folderUrl, at: Date.now(), count: done, failed: failed };
            if (folderUrl) { state.lastDoc = { url: folderUrl, at: Date.now(), kind: 'folder' }; saveMeta(); }
            return true;
          });
        });
      }).catch(function (err) { console.warn('Scriptorium: Drive create failed', err); return false; });
    }).then(function (driveOk) { if (!driveOk) return saveDownload(true); })
      .then(function () { paint(); });
  }

