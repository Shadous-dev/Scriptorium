/* 12-google-doc.js — Building the Google Doc, with an HTML download fallback. */
  /* ---- Building the Google Doc ---- */

  function docTitle() { return (state.bookTitle.trim() || 'Untitled') + ' — Audio Guide Scripts'; }

  function scriptBody(s, withHeading) {
    var edited = s.status === 'edited';
    var body = withHeading ? '<h2>' + esc(s.name || 'Untitled script') + '</h2>' : '';
    if (!edited) body += '<p><em>Not run through the edit pass — shown as originally entered.</em></p>';
    if (edited) return body + blocksToHtml(layoutBlocks(s), true);
    var paras = [];
    String(s.raw || '').split(/\n{2,}/).forEach(function (para) { if (para.trim()) paras.push('<p>' + esc(para).replace(/\n/g, '<br>') + '</p>'); });
    return body + paras.join(DOC_GAP);
  }
  function docBody() {
    return '<h1>' + esc(docTitle()) + '</h1>' + state.sections.map(function (s) { return scriptBody(s, true); }).join('');
  }
  var DOC_STYLE = '<style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.55;color:#222}p{margin:0}h1{font-size:26px}h2{font-size:19px;margin-top:36px}em{color:#777}blockquote{margin:0 0 0 24px;padding-left:12px;border-left:3px solid #c9b48a}</style>';
  // One wrapper for every document the tool emits: Drive gets a bare document, the download a styled one.
  function wrapDoc(body, styled) {
    return styled ? '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(docTitle()) + '</title>' + DOC_STYLE + '</head><body>' + body + '</body></html>' : '<html><body>' + body + '</body></html>';
  }
  function scriptDocHtml(s) { return wrapDoc('<h1>' + esc(s.name || 'Untitled script') + '</h1>' + scriptBody(s, false), false); }
  function downloadName() { return ((state.bookTitle.trim() || 'audio-guide').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'audio-guide') + '-scripts.html'; }

  function saveDownload(isFallback) {
    return useCap('downloads').then(function (downloads) {
      if (!downloads) { state.docResult = { method: 'error', message: 'Downloads aren’t available in this view — use Copy on each corrected script instead.' }; return; }
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
    state.docResult = { method: 'pending', progress: docMode === 'perScript' ? 'Creating a folder in your Google Drive…' : 'Building your Google Doc…' };
    paint();
    useCap('mcp').then(function (mcp) {
      if (!mcp) return false;
      return driveTool(mcp).then(function (toolName) {
        if (!toolName) return false;
        if (docMode !== 'perScript') {
          return mcp.callTool('Google Drive', toolName, { title: docTitle(), textContent: wrapDoc(docBody(), false), contentMimeType: 'text/html' }).then(function (res) {
            var url = urlOf(payloadOf(res));
            state.docResult = { method: 'drive', url: url || '#', at: Date.now() };
            if (url) { state.lastDoc = { url: url, at: Date.now(), kind: 'doc' }; saveMeta(); }
            return true;
          });
        }
        // One Doc per script, inside a new folder named for the book.
        return mcp.callTool('Google Drive', toolName, { title: docTitle(), contentMimeType: 'application/vnd.google-apps.folder' }).then(function (res) {
          var folder = payloadOf(res), folderId = folder && folder.id, folderUrl = urlOf(folder);
          if (!folderId) throw { code: 'no_folder' };
          var queue = state.sections.slice(), done = 0, failed = 0;
          function next() {
            var s = queue.shift();
            if (!s) return Promise.resolve();
            state.docResult = { method: 'pending', progress: 'Creating Doc ' + (done + failed + 1) + ' of ' + state.sections.length + ' — ' + (s.name || 'Untitled script') + '…' };
            paintDocResult();
            return mcp.callTool('Google Drive', toolName, { title: s.name || 'Untitled script', textContent: scriptDocHtml(s), contentMimeType: 'text/html', parentId: folderId })
              .then(function () { done += 1; }, function (err) { failed += 1; console.warn('Scriptorium: doc failed for ' + s.name, err); })
              .then(next);
          }
          return next().then(function () {
            state.docResult = { method: 'drive', url: folderUrl || '#', at: Date.now(), count: done, failed: failed };
            if (folderUrl) { state.lastDoc = { url: folderUrl, at: Date.now(), kind: 'folder' }; saveMeta(); }
            return true;
          });
        });
      }).catch(function (err) { console.warn('Scriptorium: Drive create failed', err); return false; });
    }).then(function (driveOk) { if (!driveOk) return saveDownload(true); })
      .then(function () { paint(); });
  }

