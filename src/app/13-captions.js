/* 13-captions.js — Timed captions: reading .srt/.vtt, carrying the corrected transcript onto Descript's timings, writing .srt, .vtt and .zip. */
  /* ==================================================================
     Captions — SOURCE-OF-TRUTH 4.7

     A caption file is the corrected script on Descript's timings, and
     nothing else. Everything here is code: no call to Claude, so it
     costs nothing (4.6).

       1. parseCaptions   reads the timed captions Descript exported
       2. matchWords      lines the corrected transcript's words up with the
                          captions' words (a standard longest-common-
                          subsequence diff)
       3. buildCaptions   gives every corrected word, once and in order,
                          to the caption its matching word came from
       4. toSrt / toVtt   write the two file formats from the same list

     Timings are copied, never computed. The only decision made here is
     which caption a word belongs to.
     ================================================================== */

  var CAPTION_MAX = 240000;          // characters of pasted captions one guide may hold (the store's document cap is 256 KiB)
  var CAPTION_MIN_MATCH = 0.7;       // below this share of words lining up, the captions are for a different guide
  var CAPTION_MAX_DIFF = 4000;       // give up lining words up past this many differences
  var TIME_RE = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;

  function captionMs(m, at) {
    return (Number(m[at] || 0) * 3600 + Number(m[at + 1]) * 60 + Number(m[at + 2])) * 1000 + Number((m[at + 3] + '00').slice(0, 3));
  }

  // Reads .srt or .vtt text into [{start, end, lines}] (times in milliseconds). Counter lines, the
  // WEBVTT header, NOTE blocks, styling tags and position settings are dropped; the words are kept.
  function parseCaptions(text) {
    var lines = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n');
    var cues = [], cur = null;
    lines.forEach(function (line) {
      var m = line.match(TIME_RE);
      if (m) {
        // A counter line directly above a timing line, with no blank line between, belongs to no caption.
        if (cur && cur.lines.length && /^\d+$/.test(cur.lines[cur.lines.length - 1])) cur.lines.pop();
        cur = { start: captionMs(m, 1), end: captionMs(m, 5), lines: [] };
        cues.push(cur);
        return;
      }
      if (!cur) return;
      if (!line.trim()) { cur = null; return; }
      var clean = line.replace(/<[^>]*>/g, '').replace(/\{\\[^}]*\}/g, '')
        .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
      if (clean) cur.lines.push(clean);
    });
    return cues;
  }

  // What makes two words "the same word" for lining up: letters and digits only, lowercase.
  // So "friends," and "Friends" match, and a punctuation or capital fix never moves a word.
  function wordKey(word) { return String(word).toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ''); }

  // Longest common subsequence of two word lists (Myers' diff). Returns [[indexInA, indexInB], …]
  // in order, or null when the lists differ in more than `limit` places.
  function matchWords(a, b, limit) {
    var n = a.length, m = b.length, pre = 0, suf = 0;
    while (pre < n && pre < m && a[pre] === b[pre]) pre++;
    while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++;
    var N = n - pre - suf, M = m - pre - suf, pairs = [], i;
    for (i = 0; i < pre; i++) pairs.push([i, i]);
    if (N > 0 && M > 0) {
      var cap = Math.min(N + M, limit), off = cap + 1, v = new Int32Array(2 * cap + 3), trace = [], found = -1, d, k, x, y;
      for (d = 0; d <= cap && found < 0; d++) {
        trace.push(v.slice(off - d - 1, off + d + 2));      // the furthest reach on each diagonal before this round
        for (k = -d; k <= d; k += 2) {
          x = (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) ? v[off + k + 1] : v[off + k - 1] + 1;
          y = x - k;
          while (x < N && y < M && a[pre + x] === b[pre + y]) { x++; y++; }
          v[off + k] = x;
          if (x >= N && y >= M) { found = d; break; }
        }
      }
      if (found < 0) return null;
      var mid = [];
      x = N; y = M;
      for (d = found; d > 0; d--) {
        var snap = trace[d], base = d + 1;
        k = x - y;
        var prevK = (k === -d || (k !== d && snap[base + k - 1] < snap[base + k + 1])) ? k + 1 : k - 1;
        var prevX = snap[base + prevK], prevY = prevX - prevK;
        while (x > prevX && y > prevY) { x--; y--; mid.push([pre + x, pre + y]); }
        x = prevX; y = prevY;
      }
      while (x > 0 && y > 0) { x--; y--; mid.push([pre + x, pre + y]); }
      mid.reverse();
      pairs = pairs.concat(mid);
    }
    for (i = suf; i > 0; i--) pairs.push([n - i, m - i]);
    return pairs;
  }

  // The corrected transcript on the captions' timings. Returns { ok: true, cues: [{start, end, text}], stats }
  // or { ok: false, reason } — 'no-cues', 'no-script', 'too-long' or 'mismatch' (with `share`).
  function buildCaptions(captionText, corrected) {
    if (String(captionText || '').length > CAPTION_MAX) return { ok: false, reason: 'too-long' };
    var cues = parseCaptions(captionText);
    var a = [], aCue = [], aBreak = [];
    cues.forEach(function (c, ci) {
      c.lines.forEach(function (line, li) {
        var ws = line.match(/\S+/g) || [];
        ws.forEach(function (w, wi) { a.push(wordKey(w)); aCue.push(ci); aBreak.push(wi === ws.length - 1 && li < c.lines.length - 1); });
      });
    });
    if (!a.length) return { ok: false, reason: 'no-cues' };
    var words = String(corrected || '').match(/\S+/g) || [];
    if (!words.length) return { ok: false, reason: 'no-script', cuesIn: cues.length };
    var b = words.map(wordKey);
    var pairs = matchWords(a, b, CAPTION_MAX_DIFF);
    var share = pairs ? pairs.length / Math.max(a.length, b.length) : 0;
    if (!pairs || share < CAPTION_MIN_MATCH) return { ok: false, reason: 'mismatch', share: share, cuesIn: cues.length };

    // Every corrected word gets a caption. A word that lined up takes its partner's caption. A word
    // that did not (a corrected name, say) takes the caption of the words it replaced, spread in
    // order across them — or, where it replaced nothing, the caption of the word before it.
    var cueOf = new Array(b.length), breakAfter = new Array(b.length), prevA = -1, prevB = -1;
    function place(fromB, toB, fromA, toA) {
      var run = toB - fromB, gap = toA - fromA;
      for (var r = 0; r < run; r++) {
        var ai = gap > 0 ? fromA + Math.floor(r * gap / run) : (fromA > 0 ? fromA - 1 : toA);
        cueOf[fromB + r] = aCue[Math.min(Math.max(ai, 0), a.length - 1)];
      }
    }
    pairs.forEach(function (p) {
      place(prevB + 1, p[1], prevA + 1, p[0]);
      cueOf[p[1]] = aCue[p[0]]; breakAfter[p[1]] = aBreak[p[0]];
      prevA = p[0]; prevB = p[1];
    });
    place(prevB + 1, b.length, prevA + 1, a.length);

    var texts = cues.map(function () { return ''; });
    words.forEach(function (w, j) { texts[cueOf[j]] += w + (breakAfter[j] ? '\n' : ' '); });
    var out = [];
    cues.forEach(function (c, ci) {
      var t = texts[ci].replace(/[ \t]+\n/g, '\n').trim();
      if (t) out.push({ start: c.start, end: c.end, text: t });
    });
    return { ok: true, cues: out, stats: {
      cuesIn: cues.length, cuesOut: out.length, dropped: cues.length - out.length,
      words: b.length, placedByPosition: b.length - pairs.length, captionWordsUnused: a.length - pairs.length
    } };
  }

  function pad(n, width) { n = String(n); while (n.length < width) n = '0' + n; return n; }
  function stamp(ms, sep) {
    return pad(Math.floor(ms / 3600000), 2) + ':' + pad(Math.floor(ms % 3600000 / 60000), 2) + ':' + pad(Math.floor(ms % 60000 / 1000), 2) + sep + pad(ms % 1000, 3);
  }
  function toSrt(cues) {
    return cues.map(function (c, i) { return (i + 1) + '\n' + stamp(c.start, ',') + ' --> ' + stamp(c.end, ',') + '\n' + c.text + '\n'; }).join('\n');
  }
  // Same captions, WebVTT dress: a header, a full stop in the times, no counters, and & < > escaped.
  function toVtt(cues) {
    return 'WEBVTT\n\n' + cues.map(function (c) { return stamp(c.start, '.') + ' --> ' + stamp(c.end, '.') + '\n' + esc(c.text) + '\n'; }).join('\n');
  }

  /* ---- A plain (uncompressed) .zip, because the viewer saves .zip but not .srt or .vtt ---- */

  var CRC_TABLE = (function () {
    var table = [], c, n, k;
    for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    return table;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  // files: [{name, text}] or [{name, bytes}] → Uint8Array holding a .zip of them, stored without compression.
  function zipFiles(files, now) {
    var enc = new TextEncoder(), when = now || new Date();
    var time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
    var date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
    var chunks = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.bytes instanceof Uint8Array ? f.bytes : enc.encode(f.text), crc = crc32(data);
      function header(isCentral) {
        var skip = isCentral ? 2 : 0, h = new Uint8Array((isCentral ? 46 : 30) + name.length), v = new DataView(h.buffer);
        v.setUint32(0, isCentral ? 0x02014b50 : 0x04034b50, true);
        if (isCentral) v.setUint16(4, 20, true);
        v.setUint16(4 + skip, 20, true); v.setUint16(6 + skip, 0x0800, true);      // names are UTF-8
        v.setUint16(10 + skip, time, true); v.setUint16(12 + skip, date, true);
        v.setUint32(14 + skip, crc, true); v.setUint32(18 + skip, data.length, true); v.setUint32(22 + skip, data.length, true);
        v.setUint16(26 + skip, name.length, true);
        if (isCentral) v.setUint32(42, offset, true);
        h.set(name, isCentral ? 46 : 30);
        return h;
      }
      var local = header(false);
      central.push(header(true));
      chunks.push(local, data);
      offset += local.length + data.length;
    });
    var centralSize = central.reduce(function (sum, h) { return sum + h.length; }, 0);
    var end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
    var all = chunks.concat(central, [end]), out = new Uint8Array(offset + centralSize + 22), at = 0;
    all.forEach(function (part) { out.set(part, at); at += part.length; });
    return out;
  }

  /* ---- In the workbench ---- */

  var captionOpen = {};      // which guides have the captions box unfolded, this visit
  var captionMemo = {};      // last result per guide, so a repaint does not line the words up again

  function captionResult(s) {
    var text = s.captions || '', memo = captionMemo[s.id];
    if (memo && memo.captions === text && memo.corrected === s.corrected) return memo.result;
    var result = buildCaptions(text, s.corrected);
    captionMemo[s.id] = { captions: text, corrected: s.corrected, result: result };
    return result;
  }
  function captionsReady(s) { return s.status === 'edited' && !!s.corrected && !!(s.captions || '').trim() && captionResult(s).ok; }

  // One plain sentence on where a guide's captions stand. Every outcome is said out loud (4.4).
  function captionNote(s) {
    if (!(s.captions || '').trim()) return { text: '', warn: false };
    var r = captionResult(s);
    if (r.reason === 'too-long') return { text: 'This is too long to keep — paste the captions for one audio guide at a time.', warn: true };
    if (r.reason === 'no-cues') return { text: 'No timed captions found in this text. Paste the contents of the .srt file Descript exports — it has lines like 00:00:01,000 --> 00:00:04,000.', warn: true };
    if (s.status !== 'edited' || r.reason === 'no-script') return { text: (r.cuesIn || parseCaptions(s.captions).length) + ' timed captions read. Run the edit pass and the caption files will be ready to download.', warn: false };
    if (r.reason === 'mismatch') return { text: 'These captions don’t match this guide’s transcript — only ' + Math.round((r.share || 0) * 100) + '% of the words line up. Check that both came from the same audio guide.', warn: true };
    var st = r.stats;
    return { text: 'Caption files ready — ' + st.cuesOut + ' caption' + plural(st.cuesOut) + ' on Descript’s timings' +
      (st.dropped ? ', ' + st.dropped + ' with no spoken words left out' : '') +
      (st.placedByPosition ? '. ' + st.placedByPosition + ' corrected word' + plural(st.placedByPosition) + ' differ from Descript’s and sit where the words they replaced were' : '') +
      (isStale(s) ? '. The transcript has changed since the edit — run Edit again before downloading' : '') + '.', warn: false };
  }

  function renderCaptionFold(s) {
    var has = !!(s.captions || '').trim(), note = captionNote(s);
    var open = captionOpen[s.id] != null ? captionOpen[s.id] : has;
    return '<details class="caption-fold" data-caption-fold="' + s.id + '"' + (open ? ' open' : '') + '>' +
      '<summary>Timed captions for search' + (has ? '' : ' <span class="caption-optional">— optional</span>') + '</summary>' +
      '<p class="hint"><strong>Pull from Descript</strong> fills this in for you. By hand: in Descript, export this audio guide’s subtitles as <strong>.srt</strong>, open the file, and paste everything in it here. The Scriptorium puts the corrected transcript onto those timings and gives you an .srt and a .vtt.</p>' +
      (s.descriptName ? '<p class="hint">Pulled from the Descript project <span class="caption-source">' + esc(s.descriptName) + '</span>.</p>' : '') +
      '<textarea data-field="captions" data-id="' + s.id + '" rows="5" placeholder="1&#10;00:00:00,000 --> 00:00:03,200&#10;welcome back my friends">' + esc(s.captions || '') + '</textarea>' +
      '<div class="caption-bar"><p class="caption-note' + (note.warn ? ' is-warn' : '') + '">' + esc(note.text) + '</p>' +
      '<button type="button" class="copy-btn" data-action="download-captions" data-id="' + s.id + '"' + (captionsReady(s) ? '' : ' disabled') + '>Download .srt + .vtt</button></div>' +
      '</details>';
  }
  // Refresh the sentence and the button in place, so typing in the box never loses the caret.
  function paintCaptionNote(s) {
    var fold = root.querySelector('[data-caption-fold="' + s.id + '"]');
    if (!fold) return;
    var note = captionNote(s), p = fold.querySelector('.caption-note'), btn = fold.querySelector('[data-action="download-captions"]');
    if (p) { p.textContent = note.text; p.classList.toggle('is-warn', note.warn); }
    if (btn) btn.disabled = !captionsReady(s);
  }

  function fileSafe(name, fallback) {
    return String(name || '').replace(/[\\/:*?"<>|\u0000-\u001F]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ .]+|[ .]+$/g, '') || fallback;
  }
  // The caption files for each guide that has captions ready, with names that cannot collide. `format` is 'srt',
  // 'vtt' or 'both'. With both kinds in a book's download, each kind gets a folder of its own.
  function captionFiles(sections, nested, format) {
    format = captionFormatOf(format);
    var files = [], used = {}, folders = nested && format === 'both';
    sections.forEach(function (s) {
      if (!captionsReady(s)) return;
      var base = fileSafe(s.name, 'Guide ' + (state.sections.indexOf(s) + 1)), name = base, n = 2;
      while (used[name.toLowerCase()]) { name = base + ' (' + n + ')'; n += 1; }
      used[name.toLowerCase()] = true;
      var cues = captionResult(s).cues;
      if (format !== 'vtt') files.push({ name: (folders ? 'srt/' : '') + name + '.srt', text: toSrt(cues) });
      if (format !== 'srt') files.push({ name: (folders ? 'vtt/' : '') + name + '.vtt', text: toVtt(cues) });
    });
    return files;
  }
  function captionKinds(format) { return format === 'srt' ? 'an .srt each' : format === 'vtt' ? 'a .vtt each' : 'an .srt and a .vtt each'; }
  function saveCaptionZip(sections, zipName, nested, format) {
    syncFieldsFromDom();
    format = captionFormatOf(format);
    var files = captionFiles(sections, nested, format), guides = files.length / (format === 'both' ? 2 : 1);
    if (!files.length) { showFlash('No caption files are ready yet. A guide needs its timed captions and the edit pass run.'); return Promise.resolve(); }
    return useCap('downloads').then(function (downloads) {
      if (!downloads) { showFlash('Downloads aren’t available in this view, so caption files can’t be saved from here.'); return; }
      return downloads.save({ filename: zipName, data: zipFiles(files) }).then(function () {
        var left = sections.length - guides;
        showFlash('Saved ' + guides + ' audio guide' + plural(guides) + ' as caption files — ' + captionKinds(format) + ', inside ' + zipName + '.' +
          (nested && left > 0 ? ' ' + left + ' guide' + plural(left) + ' had no caption files ready and ' + (left === 1 ? 'was' : 'were') + ' left out.' : ''));
      }, function (err) {
        var code = err && err.code;
        if (code === 'declined') return;
        if (code === 'rejected_extension' || code === 'extension_not_enabled') showFlash('This view doesn’t allow .zip downloads, so caption files can’t be saved from here.');
        else showFlash('Couldn’t save the caption files: ' + ((err && err.message) || 'unknown error'));
      });
    });
  }
  function downloadCaptions(id) {
    var s = findSection(id);
    if (s) saveCaptionZip([s], fileSafe(s.name, 'guide') + ' captions.zip', false);
  }
  // The whole book in one download, in the kind of file the reader picked at the bottom of the page.
  function captionsReadyCount() { return state.sections.filter(captionsReady).length; }
  function downloadAllCaptions() {
    saveCaptionZip(state.sections, fileSafe(state.bookTitle, 'audio guide') + ' captions' + (captionFormat === 'both' ? '' : ' (' + captionFormat + ')') + '.zip', true, captionFormat);
  }
