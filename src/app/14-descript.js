/* 14-descript.js — Pulling transcripts and timed captions from Descript. Reading only (SOURCE-OF-TRUTH 4.8). */
  /* ==================================================================
     Descript — read, never written (SOURCE-OF-TRUTH 4.8)

     Uses the viewer's own Descript connector, and only three of its
     tools, all of them reads:

       list_folders       the folders in the Drive
       list_projects      the projects in one folder — in the TTW Drive,
                          one project is one audio guide
       export_transcript  a project's transcript, once as plain text
                          (the raw transcript) and once as .srt (the
                          timed captions)

     Each audio guide pulled becomes a script in the open book. Pulling
     the same one again updates that script rather than adding a second.
     Nothing here calls Claude, so pulling costs no usage (4.6).
     ================================================================== */

  var DESCRIPT_GAP_MS = 6500;    // Descript allows ten exports a minute, and each audio guide takes two
  var DESCRIPT_PAGES = 10;       // up to 1,000 projects listed per folder
  var DESCRIPT_SCAN_PAGES = 20;  // up to 2,000 projects looked through for ones that are in no folder
  var pull = null;               // the Pull from Descript panel, while it is open
  var lastExportAt = 0;

  // "Isaiah_2" before "Isaiah_10".
  function naturalCompare(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }

  // The words a tool sent back, exactly as sent — a transcript is text, and must not be read as JSON.
  function toolText(res) {
    var blocks = (res && Array.isArray(res.content)) ? res.content : [];
    var text = blocks.filter(function (b) { return b && b.type === 'text' && typeof b.text === 'string'; }).map(function (b) { return b.text; }).join('');
    if (!text && res && typeof res.payload === 'string') text = res.payload;
    return text;
  }
  // The JSON answer of a listing call, or {} when there is none.
  function toolData(res) {
    var p = res && res.payload;
    if (!p || typeof p !== 'object') { try { p = JSON.parse(toolText(res)); } catch (e) { p = null; } }
    return (p && typeof p === 'object') ? p : {};
  }

  // One plain sentence per kind of failure, each with the thing that fixes it.
  function descriptProblem(err) {
    var code = err && err.code;
    if (code === 'needs_reauth') return 'Descript needs reconnecting. In Claude, open Settings → Connectors, reconnect Descript, then try again.';
    if (code === 'server_not_connected' || code === 'server_not_found' || code === 'selection_required') return 'Descript isn’t connected for you yet. In Claude, open Settings → Connectors, add Descript, then try again.';
    if (code === 'not_in_manifest' || code === 'approval_required' || code === 'consent_required') return 'This page wasn’t allowed to use Descript. Reload the page and choose Allow when it asks.';
    if (code === 'blocked_by_policy') return 'Your organization doesn’t allow this page to use Descript.';
    if (code === 'server_unavailable' || code === 'rate_limited') return 'Descript didn’t answer just now. Wait a minute and try again.';
    if (code === 'not_granted' || code === 'capability_disabled' || code === 'capability_removed') return 'Descript can’t be reached in this view. Open the Scriptorium inside Claude and try again.';
    if (code === 'tool_error') return 'Descript reported a problem: ' + ((err && err.message) || 'no details given') + '.';
    return 'Couldn’t reach Descript: ' + ((err && err.message) || 'unknown error') + '.';
  }
  // A failure that every remaining audio guide would hit the same way.
  function isAccessProblem(err) {
    return !!(err && /^(needs_reauth|server_not_connected|server_not_found|selection_required|not_in_manifest|blocked_by_policy|approval_required|consent_required|not_granted|capability_disabled|capability_removed)$/.test(err.code));
  }

  function descriptConnect() {
    return useCap('mcp').then(function (mcp) {
      if (!mcp) throw { code: 'capability_disabled' };
      return mcp.listTools().then(function (list) {
        var sv = ((list && list.servers) || []).filter(function (x) { return /^descript$/i.test(String((x && x.server) || '').trim()); })[0];
        if (!sv) throw { code: 'server_not_connected' };
        if (sv.authStatus === 'needs_reauth') throw { code: 'needs_reauth' };
        return { mcp: mcp, server: sv.server };
      });
    });
  }

  // The projects in one folder — or, with `unfiled`, the projects that are in no folder at all. Descript can only
  // list a folder or the whole Drive, so the second is the whole Drive with everything foldered left out.
  // Resolves { list, more }: `more` is true when Descript had further pages than were read.
  function listAllProjects(conn, path, unfiled) {
    var all = [];
    function page(cursor, pagesLeft) {
      var input = { limit: 100, sort: 'name', direction: 'asc' };
      if (!unfiled) input.folder_path = path;
      if (cursor) input.cursor = cursor;
      return conn.mcp.callTool(conn.server, 'list_projects', input).then(function (res) {
        var d = toolData(res);
        (Array.isArray(d.data) ? d.data : []).forEach(function (p) {
          if (p && p.id && !(unfiled && String(p.folder_path || '').trim())) all.push({ id: String(p.id), name: String(p.name || 'Untitled'), updated: Date.parse(p.updated_at) || 0 });
        });
        var next = d.pagination && d.pagination.next_cursor;
        if (next && pagesLeft > 1) return page(next, pagesLeft - 1);
        return { list: all.sort(function (x, y) { return naturalCompare(x.name, y.name); }), more: !!next };
      });
    }
    return page(null, unfiled ? DESCRIPT_SCAN_PAGES : DESCRIPT_PAGES);
  }

  /* ---- Browsing the Drive ---- */

  function openPull() {
    syncFieldsFromDom();
    pull = { step: 'browse', path: '', folders: [], projects: [], selected: {}, loading: true, error: null, conn: null, token: 0 };
    pullOpenFolder('');
  }
  function closePull() { if (pull && pull.step === 'pulling') return; pull = null; paint(); }

  function pullOpenFolder(path, unfiled) {
    if (!pull || pull.step === 'pulling') return;
    pull.step = 'browse'; pull.path = path; pull.unfiled = !!unfiled; pull.more = false; pull.loading = true; pull.error = null; pull.folders = []; pull.projects = []; pull.selected = {};
    var token = pull.token = pull.token + 1;
    paint();
    var ready = pull.conn ? Promise.resolve(pull.conn) : descriptConnect().then(function (conn) { if (pull) pull.conn = conn; return conn; });
    ready.then(function (conn) {
      return Promise.all([
        unfiled ? null : conn.mcp.callTool(conn.server, 'list_folders', path ? { parent_path: path } : {}),
        (path || unfiled) ? listAllProjects(conn, path, unfiled) : { list: [], more: false }
      ]);
    }).then(function (res) {
      if (!pull || pull.token !== token) return;          // the reader has already opened another folder
      var folders = toolData(res[0]).data;
      pull.folders = (Array.isArray(folders) ? folders : []).map(function (f) { return String((f && f.path) || ''); }).filter(function (p) { return p.trim(); }).sort(naturalCompare);
      pull.projects = res[1].list; pull.more = res[1].more;
      pull.loading = false; paint();
    }).catch(function (err) {
      if (!pull || pull.token !== token) return;
      console.warn('Scriptorium: Descript listing failed', err);
      pull.loading = false; pull.error = descriptProblem(err); paint();
    });
  }

  function pullSelectedCount() { return pull ? pull.projects.filter(function (p) { return pull.selected[p.id]; }).length : 0; }
  // Refresh the button and the time estimate in place, so ticking a box never moves the page.
  function paintPullCount() {
    var btn = root.querySelector('[data-action="pull-start"]'), note = root.querySelector('.pull-count'), all = root.querySelector('[data-action="pull-all"]');
    var n = pullSelectedCount();
    if (btn) { btn.disabled = !n; btn.textContent = n ? 'Pull ' + n + ' audio guide' + plural(n) : 'Pull selected'; }
    if (note) { var mins = Math.max(1, Math.ceil(n * 2 * DESCRIPT_GAP_MS / 60000)); note.textContent = n ? 'About ' + mins + ' minute' + plural(mins) + '.' : ''; }
    if (all && pull) all.checked = !!n && n === pull.projects.length;
  }
  function pullPick(id, checked) { if (!pull) return; if (checked) pull.selected[id] = true; else delete pull.selected[id]; paintPullCount(); }
  function pullPickAll(checked) {
    if (!pull) return;
    pull.selected = {};
    if (checked) pull.projects.forEach(function (p) { pull.selected[p.id] = true; });
    root.querySelectorAll('[data-action="pull-pick"]').forEach(function (box) { box.checked = !!checked; });
    paintPullCount();
  }

  /* ---- Pulling ---- */

  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  function exportOnce(conn, id, format) {
    return delay(Math.max(0, lastExportAt + DESCRIPT_GAP_MS - Date.now())).then(function () {
      lastExportAt = Date.now();
      return conn.mcp.callTool(conn.server, 'export_transcript', { project_id: id, format: format, include_speaker_labels: 'off' }, { cache: false });
    }).then(toolText);
  }
  // One more try, and only for a failure that waiting can fix. An export is a read, so repeating it is safe.
  function exportPaced(conn, id, format) {
    return exportOnce(conn, id, format).catch(function (err) {
      if (!(err && (err.retryable || err.code === 'server_unavailable' || err.code === 'rate_limited'))) throw err;
      return delay(Math.min(Number(err.retryAfterMs) || 20000, 60000)).then(function () { return exportOnce(conn, id, format); });
    });
  }

  // Put one audio guide into the open book: its own card if it has one already, else an empty card, else a new one.
  function placeFromDescript(project, text, srt) {
    syncFieldsFromDom();
    var s = state.sections.filter(function (x) { return x.descriptId === project.id; })[0], isNew = !s;
    if (!s) {
      s = state.sections.filter(function (x) { return !x.descriptId && !x.raw.trim() && !x.name.trim() && !(x.captions || '').trim(); })[0];
      if (!s) { s = newSection(); state.sections.push(s); }
      // Two versions of one chapter would otherwise share a name. The later arrival says which it is.
      var base = scriptNameFromDescript(project.name), name = base, variant = descriptVariant(project.name);
      var taken = function (n) { return state.sections.some(function (x) { return x !== s && x.name === n; }); };
      if (taken(name) && variant && base !== project.name) name = base + ' (' + variant + ')';
      for (var copy = 2; taken(name); copy++) name = base + ' (' + copy + ')';
      s.name = name; s.descriptId = project.id;
    }
    s.descriptName = project.name;
    s.raw = String(text).trimEnd();
    s.captions = String(srt || '').trimEnd();
    touchBook();
    return saveSection(s.id).then(function () { return saveCaptions(s.id); }).then(function () { return saveMeta(); }).then(function () { return isNew; });
  }

  function pullStart() {
    if (!pull || pull.step !== 'browse' || !pull.conn) return;
    var queue = pull.projects.filter(function (p) { return pull.selected[p.id]; });
    if (!queue.length) return;
    var book = bookId, conn = pull.conn, run = pull;
    syncFieldsFromDom();
    if (!String(state.bookTitle || '').trim() && run.path) state.bookTitle = bookTitleFromFolder(run.path);   // an untitled book takes the folder's name
    run.step = 'pulling'; run.total = queue.length; run.done = 0; run.added = 0; run.updated = 0; run.failed = []; run.stop = false; run.current = '';
    paint();
    function next() {
      var p = queue.shift();
      if (!p || run.stop || pull !== run || bookId !== book) return Promise.resolve();
      run.current = p.name; paintPull();
      return exportPaced(conn, p.id, 'txt').then(function (text) {
        if (!String(text || '').trim()) throw { code: 'empty' };
        return exportPaced(conn, p.id, 'srt').then(function (srt) { return placeFromDescript(p, text, srt); });
      }).then(function (isNew) {
        if (isNew) run.added += 1; else run.updated += 1;
      }, function (err) {
        console.warn('Scriptorium: Descript pull failed for ' + p.name, err);
        run.failed.push({ name: p.name, why: (err && err.code === 'empty') ? 'Descript has no transcript for it.' : descriptProblem(err) });
        if (isAccessProblem(err)) run.stop = true;          // the rest would fail the same way
      }).then(function () { run.done += 1; paint(); return next(); });
    }
    next().then(function () { if (pull === run) { run.step = 'done'; run.current = ''; paint(); } });
  }
  function pullStop() { if (pull && pull.step === 'pulling') { pull.stop = true; paintPull(); } }

  /* ---- The panel ---- */

  function paintPull() {
    var el = root.querySelector('.pull-panel');
    if (el && pull) el.outerHTML = renderPull(); else paint();
  }

  function renderPull() {
    if (!pull) return '';
    var head = '<div class="pull-head"><h3>Pull from Descript</h3>' + (pull.step === 'pulling' ? '' : '<button type="button" class="link-btn" data-action="pull-close">Close</button>') + '</div>';

    if (pull.step === 'pulling') {
      return '<section class="pull-panel">' + head +
        '<p class="pull-progress">' + esc(pull.stop ? 'Stopping after this one…' : 'Pulling ' + Math.min(pull.done + 1, pull.total) + ' of ' + pull.total + (pull.current ? ' — ' + pull.current : '') + '…') + '</p>' +
        '<p class="hint">Descript lets a page pull about five audio guides a minute. Keep this page open until it finishes; each one is saved as it arrives.</p>' +
        '<div class="pull-foot"><button type="button" class="btn btn-ghost" data-action="pull-stop"' + (pull.stop ? ' disabled' : '') + '>Stop</button></div>' +
        '</section>';
    }

    if (pull.step === 'done') {
      var got = pull.added + pull.updated, left = pull.total - pull.done;
      var line = got ? 'Pulled ' + got + ' audio guide' + plural(got) + ' from Descript' + (pull.updated ? ' — ' + pull.added + ' new, ' + pull.updated + ' updated' : '') + '.' : 'Nothing was pulled.';
      if (left > 0) line += ' Stopped with ' + left + ' still to go.';
      return '<section class="pull-panel">' + head +
        '<p class="pull-progress">' + esc(line) + '</p>' +
        (pull.failed.length ? '<ul class="pull-failed">' + pull.failed.map(function (f) { return '<li><strong>' + esc(f.name) + '</strong> — ' + esc(f.why) + '</li>'; }).join('') + '</ul>' : '') +
        (got ? '<p class="hint">Next: check the guide names, list any names Descript tends to mishear under Words to Search For, then click Edit All Guides.</p>' : '') +
        '<div class="pull-foot"><button type="button" class="btn" data-action="pull-more">Pull more</button></div>' +
        '</section>';
    }

    var parts = pull.path ? pull.path.split('/') : [], soFar = '';
    var crumbs = (parts.length || pull.unfiled) ? '<button type="button" class="link-btn" data-action="pull-open" data-path="">All folders</button>' : '<strong>All folders</strong>';
    if (pull.unfiled) crumbs += ' <span class="pull-sep">/</span> <strong>Not in a folder</strong>';
    parts.forEach(function (seg, i) {
      soFar = i ? soFar + '/' + seg : seg;
      crumbs += ' <span class="pull-sep">/</span> ' + (i === parts.length - 1 ? '<strong>' + esc(seg) + '</strong>' : '<button type="button" class="link-btn" data-action="pull-open" data-path="' + escAttr(soFar) + '">' + esc(seg) + '</button>');
    });

    var body;
    if (pull.loading) body = '<p class="hint">Loading from Descript…</p>';
    else if (pull.error) body = '<p class="notice notice-warn">' + esc(pull.error) + '</p><div class="pull-foot"><button type="button" class="btn" data-action="pull-open" data-path="' + escAttr(pull.path) + '"' + (pull.unfiled ? ' data-unfiled="1"' : '') + '>Try again</button></div>';
    else {
      var have = {};
      state.sections.forEach(function (s) { if (s.descriptId) have[s.descriptId] = true; });
      var folders = pull.folders.map(function (path) {
        return '<li><button type="button" class="pull-folder" data-action="pull-open" data-path="' + escAttr(path) + '"><span aria-hidden="true">▸</span> ' + esc(path.split('/').pop()) + '</button></li>';
      }).join('');
      var projects = pull.projects.map(function (p) {
        return '<li><label class="pull-item"><input type="checkbox" data-action="pull-pick" data-id="' + escAttr(p.id) + '"' + (pull.selected[p.id] ? ' checked' : '') + '>' +
          '<span class="pull-name">' + esc(p.name) + '</span>' +
          (have[p.id] ? '<span class="pull-tag">already in this book — pulling again replaces its 1st Draft Transcript</span>' : '') + '</label></li>';
      }).join('');
      // At the top of the Drive, one extra row reaches the projects that are in no folder.
      var loose = (!pull.path && !pull.unfiled) ? '<li><button type="button" class="pull-folder" data-action="pull-open" data-path="" data-unfiled="1"><span aria-hidden="true">▸</span> Not in a folder</button></li>' : '';
      body = ((folders || loose) ? '<ul class="pull-list">' + folders + loose + '</ul>' : '') +
        (projects ? '<ul class="pull-list">' + projects + '</ul>' : '') +
        (pull.more ? '<p class="notice notice-warn">' + (pull.unfiled
          ? 'Only the first 2,000 projects in the Drive were looked through, so some that are in no folder may be missing here.'
          : 'Only the first ' + pull.projects.length + ' are listed. This folder holds more than the page can show — move some into a sub-folder in Descript to reach the rest.') + '</p>' : '') +
        (!folders && !projects && !loose ? '<p class="hint">' + (pull.unfiled ? 'Every project in this Drive is inside a folder.' : 'This folder has no audio guides in it.') + '</p>' : '') +
        (!pull.path && !pull.unfiled ? '<p class="hint">Open a folder to see its audio guides.</p>' : '') +
        (projects ? '<div class="pull-foot">' +
          '<label class="speed-pick"><input type="checkbox" data-action="pull-all"' + (pullSelectedCount() === pull.projects.length ? ' checked' : '') + '> Select all ' + pull.projects.length + '</label>' +
          '<button type="button" class="btn btn-edit" data-action="pull-start"' + (pullSelectedCount() ? '' : ' disabled') + '>' + (pullSelectedCount() ? 'Pull ' + pullSelectedCount() + ' audio guide' + plural(pullSelectedCount()) : 'Pull selected') + '</button>' +
          '<span class="pull-count"></span></div>' : '');
    }
    return '<section class="pull-panel">' + head +
      '<p class="hint">Pick the audio guides to bring into this book. Each one gets its own card, with its 1st Draft Transcript and its timed captions. Nothing in Descript is changed.</p>' +
      '<p class="pull-path">' + crumbs + '</p>' + body +
      '</section>';
  }

  /* ---- Names — SOURCE-OF-TRUTH 6. A guide pulled from Descript is named from its project. ---- */

  var BIBLE_BOOKS = ('Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Ezra|Nehemiah|Esther|Job|Psalms|Proverbs|Ecclesiastes|Song of Songs|Song of Solomon|' +
    'Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|' +
    'Galatians|Ephesians|Philippians|Colossians|Titus|Philemon|Hebrews|James|Jude|Revelation').split('|');
  var NUMBERED_BOOKS = { Samuel: 2, Kings: 2, Chronicles: 2, Corinthians: 2, Thessalonians: 2, Timothy: 2, Peter: 2, John: 3 };   // book → how many there are
  var BOOK_BY_KEY = {};
  BIBLE_BOOKS.concat(Object.keys(NUMBERED_BOOKS)).forEach(function (b) { BOOK_BY_KEY[b.toLowerCase().replace(/[^a-z]/g, '')] = b; });
  BOOK_BY_KEY.psalm = 'Psalms';

  // "ED_Isaiah_24_Jones_v1_DS" → "Isaiah – Chapter 24". A name that does not start with a Bible book is returned exactly as it came.
  function scriptNameFromDescript(name) {
    var t = String(name).replace(/\s*\(.*$/, '').replace(/^ED[_ ]+/i, '').split(/[_ ]+/).filter(Boolean), which = '';
    if (/^[123]$/.test(t[0] || '') && t.length > 1) which = t.shift();
    else { var m = /^([123])(?:st|nd|rd)?([A-Za-z].*)$/.exec(t[0] || ''); if (m) { which = m[1]; t[0] = m[2]; } }
    // A book of several words is tried first ("Song_of_Songs_3"); a single word otherwise.
    var book = null;
    for (var take = 3; take >= 1 && !book; take--) {
      var found = BOOK_BY_KEY[t.slice(0, take).join('').toLowerCase().replace(/[^a-z]/g, '')];
      if (found && (take === 1 || (/ /.test(found) && t.slice(0, take).every(function (w) { return /^[A-Za-z]+$/.test(w); })))) { book = found; t = t.slice(take); }
    }
    if (!book) return name;
    if (which && !(Number(which) <= NUMBERED_BOOKS[book])) return name;        // "2 Isaiah", "3 Kings": not a book
    if (!which && NUMBERED_BOOKS[book] && book !== 'John') return name;         // "Samuel" alone: which one?
    var full = (which ? which + ' ' : '') + book, next = t[0] || '';
    if (/^\d{1,3}$/.test(next)) return book === 'Psalms' ? 'Psalm ' + Number(next) : full + ' – Chapter ' + Number(next);
    if (/^intro(duction)?$/i.test(next)) return full + ' – Introduction';
    if (/^conclusion$/i.test(next)) return full + ' – Conclusion';
    return name;
  }

  // What tells two versions of one audio guide apart: "ED_Isaiah_24_Jones_v2_DS (KRIS UPDATE)" → "v2, KRIS UPDATE".
  function descriptVariant(name) {
    var version = /(?:^|[_ ])(v\d+)(?=[_ ]|$)/i.exec(String(name).replace(/\s*\(.*$/, '')), note = /\(([^)]+)\)\s*$/.exec(String(name));
    return [version && version[1].toLowerCase(), note && note[1].trim()].filter(Boolean).join(', ');
  }

  // "3.0) Peyton Jones/isaiah-project" → "Isaiah"; "…/science-and-the-bible-project" → "Science and the Bible".
  function bookTitleFromFolder(path) {
    var words = String(path).split('/').pop().replace(/[-_ ]*project\s*$/i, '').split(/[-_ ]+/).filter(Boolean);
    var known = BOOK_BY_KEY[words.join('').toLowerCase().replace(/[^a-z]/g, '')];
    if (known && !NUMBERED_BOOKS[known]) return known;
    return words.map(function (w, i) {
      return (i && /^(a|an|and|the|of|in|on|to|for)$/i.test(w)) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ');
  }
