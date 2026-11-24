/* 02-helpers.js — Escaping, pluralising, relative times, stored per-viewer prefs. */
  /* ==================================================================
     Small helpers
     ================================================================== */

  function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(str) { return esc(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

  // One stored document may be 256 KiB (262,144 bytes) as JSON. The page's own limits are counted in characters,
  // and a character can take up to four bytes, so anything about to be saved is measured in bytes too — with
  // room to spare — and refused here with a plain reason, rather than by the store with a vague one.
  var DOC_MAX_BYTES = 250000;
  function jsonBytes(value) {
    var text = JSON.stringify(value) || '';
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return unescape(encodeURIComponent(text)).length;
  }
  function kb(bytes) { return Math.round(bytes / 1024).toLocaleString('en-US') + ' KB'; }

  // A run of tens of thousands of spaces (a file padded out by whatever made it) makes several of the page's text
  // patterns crawl for minutes. Any run of more than 40 spaces or tabs is taken down to one space here, in a
  // single pass, before those patterns see it. Words and line breaks are untouched.
  function tameSpaces(text) {
    text = String(text == null ? '' : text);
    if (text.length < 200 || !/[ \t\u00a0]{41}/.test(text)) return text;
    var out = '', run = 0, from = 0, i, c;
    for (i = 0; i < text.length; i++) {
      c = text.charCodeAt(i);
      if (c === 32 || c === 9 || c === 160) { run += 1; continue; }
      if (run > 40) { out += text.slice(from, i - run) + ' '; from = i; }
      run = 0;
    }
    if (run > 40) { out += text.slice(from, text.length - run) + ' '; from = text.length; }
    return out + text.slice(from);
  }
  // Spaces and tabs at the end of each line, removed without a pattern that slows on long runs.
  function trimLineEnds(text) {
    return String(text == null ? '' : text).split('\n').map(function (line) {
      var end = line.length, c;
      while (end > 0 && ((c = line.charCodeAt(end - 1)) === 32 || c === 9)) end -= 1;
      return end === line.length ? line : line.slice(0, end);
    }).join('\n');
  }
  function plural(n) { return n === 1 ? '' : 's'; }
  function relTime(ts) {
    if (!ts) return '';
    var diff = Date.now() - ts, min = Math.round(diff / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return min + ' minute' + plural(min) + ' ago';
    var hr = Math.round(min / 60);
    if (hr < 24) return hr + ' hour' + plural(hr) + ' ago';
    var day = Math.round(hr / 24);
    return day + ' day' + plural(day) + ' ago';
  }
  function isStale(s) { return s.status === 'edited' && s.editedFromRaw != null && s.raw !== s.editedFromRaw; }
  // A book was worked on: typing, pulling, a hand correction, an edit pass. Saved with the book so the library can sort by it.
  function touchBook() { state.touchedAt = Date.now(); }
  // Links come from the shared store and from a connector's answer. Only an ordinary https link is ever shown as one.
  function safeLink(url) { url = String(url == null ? '' : url).trim(); return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url : ''; }
  function needsEdit(s) { return !!s.raw.trim() && (s.status !== 'edited' || s.raw !== s.editedFromRaw); }

  /* The stages of a guide (SOURCE-OF-TRUTH, "The words this document uses"): the 1st Draft Transcript is what
     Descript heard; the Edited Transcript is that after the edit pass and any corrections by hand; the Final
     Transcript is an Edited Transcript a person has approved. The approval is of that text, so anything that
     changes the text takes it back to Edited (clearApproval) — and while its 1st Draft has changed since the
     edit, it does not count as Final either: what was approved is no longer what Descript has. */
  function isFinal(s) { return s.status === 'edited' && !!s.corrected && Number(s.approvedAt) > 0 && !isStale(s); }
  function clearApproval(s) { s.approvedAt = 0; }
  function stageName(s) { return isFinal(s) ? 'Final Transcript' : 'Edited Transcript'; }

  // Per-viewer conveniences only; the page must work when storage is unavailable.
  function prefGet(key, fallback) { try { var v = localStorage.getItem('scriptorium.' + key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } }
  function prefSet(key, value) { try { localStorage.setItem('scriptorium.' + key, JSON.stringify(value)); } catch (e) {} }

  var collapsed = {};          // filled per book when one is opened (loadCollapsed)
  function persistCollapsed() { if (bookId) prefSet('collapsed.' + bookId, Object.keys(collapsed)); }
  var concurrency = prefGet('concurrency', 2) === 1 ? 1 : 2;
  var repairParagraphs = prefGet('repairParagraphs', true) !== false;
  // How the Final Transcripts reach Google: one Doc with a tab per guide, one Doc with a page per guide, or a folder of Docs.
  function docModeOf(v) { return v === 'one' || v === 'perScript' ? v : 'tabs'; }
  var docMode = docModeOf(prefGet('docMode', 'tabs'));
  // Which caption files a download holds: both kinds, or one.
  function captionFormatOf(v) { return v === 'srt' || v === 'vtt' ? v : 'both'; }
  var captionFormat = captionFormatOf(prefGet('captionFormat', 'both'));

