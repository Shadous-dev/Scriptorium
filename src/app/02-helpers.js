/* 02-helpers.js — Escaping, pluralising, relative times, stored per-viewer prefs. */
  /* ==================================================================
     Small helpers
     ================================================================== */

  function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escAttr(str) { return esc(str).replace(/"/g, '&quot;'); }
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
  var docMode = prefGet('docMode', 'perScript') === 'one' ? 'one' : 'perScript';

