/* 12-google-doc.js — Building the Google Doc from the Final Transcripts, with an HTML download fallback. */
  /* ---- Building the Google Doc ----
     Only a Final Transcript goes in: one a person has reviewed and approved. A guide that is still a
     1st Draft or an Edited Transcript is left out, and the page says how many were. ---- */

  function docTitle() { return (state.bookTitle.trim() || 'Untitled') + ' — Audio Guide Transcripts'; }
  function finalSections() { return state.sections.filter(isFinal); }

  // In one Doc for the whole book, every guide after the first starts on a page of its own.
  function scriptBody(s, withHeading, newPage) {
    return (withHeading ? '<h2' + (newPage ? ' style="page-break-before:always"' : '') + '>' + esc(s.name || 'Untitled guide') + '</h2>' : '') + blocksToHtml(layoutBlocks(s), true);
  }
  function docBody(list) {
    return '<h1>' + esc(docTitle()) + '</h1>' + (list || finalSections()).map(function (s, i) { return scriptBody(s, true, i > 0); }).join('');
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

  // The two Google tools this page writes with: Drive makes a file, Docs writes into one this page has just made (4.11).
  function googleTools(mcp) {
    return mcp.listTools().then(function (list) {
      var servers = (list && list.servers) || [];
      function tool(serverName, pattern) {
        var server = servers.filter(function (sv) { return sv.server === serverName; })[0];
        var found = server && (server.tools || []).filter(function (t) { return pattern.test(t.name); })[0];
        return found ? found.name : null;
      }
      return { create: tool('Google Drive', /create.*file/i), update: tool('Google Docs', /update.*doc/i) };
    });
  }
  function payloadOf(res) {
    var payload = res && res.payload;
    if (!payload && res && res.content && res.content[0] && res.content[0].text) { try { payload = JSON.parse(res.content[0].text); } catch (e) {} }
    return payload || {};
  }
  function urlOf(p) { return safeLink(p && (p.viewUrl || p.webViewLink || p.url)); }

  /* ---- One Doc, a tab for each guide ----
     Drive makes an empty Doc. The Google Docs connector adds a tab for every guide after the first, and each
     transcript is written into its own tab: the text in one insert, then its styling by position. Nothing here
     calls Claude, and nothing is written outside the Doc just made (4.6, 4.11). ---- */

  // Google refuses a tab label longer than 50 characters, and one refusal stops every tab in the request.
  var TAB_TITLE_MAX = 50;
  var VERSE_INDENT = { magnitude: 24, unit: 'PT' }, PARAGRAPH_GAP = { magnitude: 10, unit: 'PT' };
  function tabTitle(s, i) { return String(s.name || '').replace(/[\u0000-\u001F\u007F\u2028\u2029\uE000-\uF8FF]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TAB_TITLE_MAX).replace(/[\uD800-\uDBFF]$/, '').trim() || 'Guide ' + (i + 1); }

  // The requests that write one guide into an empty tab. Positions count UTF-16 units from 1, which is how a
  // JavaScript string counts its own length. With no tabId the requests land in the Doc's first tab.
  // Google drops some characters from text it is given (control characters, the private-use range) and treats a
  // few as breaks. Every position after one would then be off by one, and the bold would land on the wrong words.
  // They are taken out here first, so what is counted is what Google keeps. None of them is part of a word.
  function docLine(text) { return String(text == null ? '' : text).replace(/[\u0000-\u001F\u007F\u2028\u2029\uE000-\uF8FF]+/g, ' ').replace(/ {2,}/g, ' ').trim(); }
  function tabRequests(s, tabId, i) {
    // The heading is the guide's whole name. Only the tab's own label is cut to fit.
    var title = docLine(s.name) || tabTitle(s, i || 0), lines = [title], marks = [], at = 1 + title.length + 1;
    layoutBlocks(s).forEach(function (b) {
      var line = docLine(b.type === 'verse' ? b.text + (b.ref ? ' (' + b.ref + ')' : '') : b.text);
      if (!line) return;
      marks.push({ verse: b.type === 'verse', start: at, end: at + line.length });
      lines.push(line); at += line.length + 1;
    });
    function range(start, end) { var r = { startIndex: start, endIndex: end }; if (tabId) r.tabId = tabId; return r; }
    var text = lines.join('\n'), place = { index: 1 };
    if (tabId) place.tabId = tabId;
    var requests = [
      { insertText: { location: place, text: text } },
      { updateParagraphStyle: { range: range(1, 1 + title.length), paragraphStyle: { namedStyleType: 'HEADING_1' }, fields: 'namedStyleType' } }
    ];
    // A quoted verse is bold and set in from the margin, as it is everywhere else the transcript is shown (section 6).
    marks.forEach(function (m) {
      if (!m.verse) return;
      requests.push({ updateTextStyle: { range: range(m.start, m.end), textStyle: { bold: true }, fields: 'bold' } });
      requests.push({ updateParagraphStyle: { range: range(m.start, m.end), paragraphStyle: { indentStart: VERSE_INDENT, indentFirstLine: VERSE_INDENT }, fields: 'indentStart,indentFirstLine' } });
    });
    // Space between paragraphs is set last, and only on the transcript, so the heading keeps its own.
    if (marks.length) requests.push({ updateParagraphStyle: { range: range(marks[0].start, 1 + text.length), paragraphStyle: { spaceBelow: PARAGRAPH_GAP }, fields: 'spaceBelow' } });
    return requests;
  }
  // The ids Google gave the tabs it added, in the order they were asked for. The connector hands the answers
  // back one level down, as replies[0].api_replies; Google's own API gives them as replies. Both are read.
  function tabIdsOf(res) {
    var out = [];
    function take(list) {
      (Array.isArray(list) ? list : []).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var props = r.addDocumentTab && r.addDocumentTab.tabProperties;
        if (props && props.tabId) out.push(String(props.tabId));
        else if (Array.isArray(r.api_replies)) take(r.api_replies);
      });
    }
    take(payloadOf(res).replies);
    return out;
  }

  function docDone(url, extra) {
    state.docResult = Object.assign({ method: 'drive', url: url, at: Date.now() }, extra || {});
    if (url) { state.lastDoc = { url: url, at: Date.now(), kind: 'doc' }; saveMeta(); }
    return true;
  }
  function oneDoc(mcp, createTool, finals, note) {
    return mcp.callTool('Google Drive', createTool, { title: docTitle(), textContent: wrapDoc(docBody(finals), false), contentMimeType: 'text/html' }).then(function (res) {
      return docDone(urlOf(payloadOf(res)), note ? { note: note } : null);
    });
  }
  function tabsDoc(mcp, tools, finals) {
    if (!tools.update) return oneDoc(mcp, tools.create, finals, 'Tabs need the Google Docs connector, which isn’t connected for you, so each guide starts on its own page instead. To get tabs, add Google Docs in Claude under Settings → Connectors and create the Doc again.');
    var docId = '', url = '';
    function docs(requests) { return mcp.callTool('Google Docs', tools.update, { documentId: docId, requests: requests }); }
    return mcp.callTool('Google Drive', tools.create, { title: docTitle(), contentMimeType: 'application/vnd.google-apps.document' }).then(function (res) {
      var made = payloadOf(res);
      docId = String(made.id || ''); url = urlOf(made);
      if (!docId) throw { code: 'no_doc' };
      if (finals.length < 2) return [];
      state.docResult = { method: 'pending', progress: 'Adding a tab for each of ' + finals.length + ' guides…' }; paintDocResult();
      return docs(finals.slice(1).map(function (s, i) { return { addDocumentTab: { tabProperties: { title: tabTitle(s, i + 1) } } }; })).then(function (res2) {
        var ids = tabIdsOf(res2);
        if (ids.length !== finals.length - 1) throw { code: 'no_tabs' };
        return ids;
      }).catch(function (err) {
        // The Doc exists but Google would not give it tabs. Nothing has been written to it, so the book goes
        // into a Doc of its own, and the reader is told about the empty one.
        console.warn('Scriptorium: tabs could not be added', err);
        return oneDoc(mcp, tools.create, finals, 'Google would not add tabs, so each guide starts on its own page instead. An empty Doc with the same name was also left in your Drive; it can be deleted.').then(function () { return null; });
      });
    }).then(function (ids) {
      if (!ids) return true;                                  // the page-per-guide Doc was made instead
      var done = 0, failed = [], i = 0;
      function next() {
        if (i >= finals.length) return Promise.resolve();
        var at = i, s = finals[at]; i += 1;
        state.docResult = { method: 'pending', progress: 'Writing tab ' + (at + 1) + ' of ' + finals.length + ' — ' + tabTitle(s, at) + '…' }; paintDocResult();
        return docs(tabRequests(s, at ? ids[at - 1] : '', at))
          .then(function () { done += 1; }, function (err) { failed.push(tabTitle(s, at)); console.warn('Scriptorium: tab failed for ' + s.name, err); })
          .then(next);
      }
      return next().then(function () {
        // The first tab was there before anything was written, named "Tab 1". On a new Doc its id is t.0; if
        // Google says otherwise the name is left as it is, and the guide's own heading still says which it is.
        return docs([{ updateDocumentTabProperties: { tabProperties: { tabId: 't.0', title: tabTitle(finals[0], 0) }, fields: 'title' } }]).catch(function () {});
      }).then(function () {
        return docDone(url, { tabs: done, failed: failed.length, failedNames: failed });
      });
    });
  }
  function folderOfDocs(mcp, createTool, finals) {
    return mcp.callTool('Google Drive', createTool, { title: docTitle(), contentMimeType: 'application/vnd.google-apps.folder' }).then(function (res) {
      var folder = payloadOf(res), folderId = folder && folder.id, folderUrl = urlOf(folder);
      if (!folderId) throw { code: 'no_folder' };
      var queue = finals.slice(), done = 0, failed = 0;
      function next() {
        var s = queue.shift();
        if (!s) return Promise.resolve();
        state.docResult = { method: 'pending', progress: 'Creating Doc ' + (done + failed + 1) + ' of ' + finals.length + ' — ' + (s.name || 'Untitled guide') + '…' };
        paintDocResult();
        return mcp.callTool('Google Drive', createTool, { title: s.name || 'Untitled guide', textContent: scriptDocHtml(s), contentMimeType: 'text/html', parentId: folderId })
          .then(function () { done += 1; }, function (err) { failed += 1; console.warn('Scriptorium: doc failed for ' + s.name, err); })
          .then(next);
      }
      return next().then(function () {
        state.docResult = { method: 'drive', url: folderUrl, at: Date.now(), count: done, failed: failed };
        if (folderUrl) { state.lastDoc = { url: folderUrl, at: Date.now(), kind: 'folder' }; saveMeta(); }
        return true;
      });
    });
  }

  function conclude() {
    syncFieldsFromDom();
    var finals = finalSections();                       // fixed now: a guide approved while the Docs are being made is not slipped in half-way
    if (!finals.length) { showFlash('No guide has been approved as a Final Transcript yet. Approve one and try again.'); return; }
    state.docResult = { method: 'pending', progress: docMode === 'perScript' ? 'Creating a folder in your Google Drive…' : 'Building your Google Doc…' };
    paint();
    useCap('mcp').then(function (mcp) {
      if (!mcp) return false;
      return googleTools(mcp).then(function (tools) {
        if (!tools.create) return false;
        if (docMode === 'tabs') return tabsDoc(mcp, tools, finals);
        if (docMode === 'one') return oneDoc(mcp, tools.create, finals, '');
        return folderOfDocs(mcp, tools.create, finals);           // one Doc per guide, inside a new folder named for the book
      }).catch(function (err) { console.warn('Scriptorium: Drive create failed', err); return false; });
    }).then(function (driveOk) { if (!driveOk) return saveDownload(true); })
      .then(function () { paint(); });
  }

