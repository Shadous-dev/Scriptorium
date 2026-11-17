/* 03-text.js — Locating and applying edits; verse quoting and block layout. */
  /* ==================================================================
     Text matching — applying the editor's changes, and finding verses
     ================================================================== */

  // A normalised copy of `text` (straight quotes, single spaces) plus a map from each
  // normalised index back to the original, so a loose match can still be applied exactly.
  function normIndex(text) {
    var norm = '', map = [], lastSpace = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], c = ch.charCodeAt(0);
      if (c === 0x2018 || c === 0x2019 || c === 0x02BC) ch = "'";
      else if (c === 0x201C || c === 0x201D) ch = '"';
      else if (c === 0x00A0 || c === 0x200A || c === 0x2009 || /\s/.test(ch)) ch = ' ';
      if (ch === ' ') { if (lastSpace) continue; lastSpace = true; } else lastSpace = false;
      norm += ch; map.push(i);
    }
    return { norm: norm, map: map };
  }
  function normString(str) { return normIndex(String(str || '')).norm.trim(); }

  // Find `needle` in `text` starting near `from`; exact first, then normalised. Returns {start,end} or null.
  function locate(text, needle, from, caseInsensitive) {
    needle = String(needle || ''); if (!needle) return null;
    var idx = text.indexOf(needle, from || 0);
    if (idx === -1 && from) idx = text.indexOf(needle);
    if (idx !== -1) return { start: idx, end: idx + needle.length };
    var ni = normIndex(text), n = normString(needle);
    if (!n) return null;
    var hay = ni.norm, nd = n;
    if (caseInsensitive) { hay = hay.toLowerCase(); nd = nd.toLowerCase(); }
    var nFrom = 0;
    if (from) { while (nFrom < ni.map.length && ni.map[nFrom] < from) nFrom++; }
    var j = hay.indexOf(nd, nFrom);
    if (j === -1 && nFrom) j = hay.indexOf(nd);
    if (j === -1) return null;
    return { start: ni.map[j], end: ni.map[j + nd.length - 1] + 1 };
  }

  // Apply the editor's find/replace list in order. Edits that cannot be placed are returned separately.
  function applyEdits(raw, edits) {
    var text = raw, cursor = 0, applied = [], unapplied = [];
    (edits || []).forEach(function (e) {
      var find = String((e && e.find) || ''), repl = String((e && e.replace) || '');
      if (!find || find === repl) return;
      var hit = locate(text, find, cursor, false);
      if (!hit) { unapplied.push({ find: find, replace: repl, kind: String((e && e.kind) || 'grammar'), note: String((e && e.note) || '') }); return; }
      text = text.slice(0, hit.start) + repl + text.slice(hit.end);
      cursor = hit.start + repl.length;
      applied.push({ find: find, replace: repl, kind: String((e && e.kind) || 'grammar'), note: String((e && e.note) || '') });
    });
    return { text: text, applied: applied, unapplied: unapplied };
  }

  /* ------------------------------------------------------------------
     Layout — the corrected prose plus the verses the editor found, laid
     out the way the finished scripts are published: every quoted verse in
     its own paragraph, in quotation marks, bold, set off as a block quote,
     with its reference after it. Derived from the saved text each time,
     so it is never baked into the script itself.
     ------------------------------------------------------------------ */

  function refLabel(v) {
    var c = String((v && v.canonical) || '').trim();
    if (!c) return '';
    if (v.confidence === 'low') { var m = c.match(/^(.*?\d+):/); return m ? m[1] + ':?' : c + '?'; }
    return c;
  }

  // One clean pair of double quotes around the verse; speech inside it in single quotes. The
  // transcript's own marks are often doubled, curly, or missing a partner, so the inner speech
  // quotes are re-balanced from their positions rather than trusted.
  function normalizeVerseQuotes(inner) {
    inner = inner.replace(/^["“”]+\s*/, '').replace(/\s*["“”]+$/, '').trim();
    var open = false, needLead = false, re = /["“”]/g, m;
    while ((m = re.exec(inner))) {
      var ch = m[0], prev = m.index ? inner[m.index - 1] : '';
      var isOpener = ch === '“' || (ch === '"' && (!prev || /[\s(:—–\-\[]/.test(prev)));
      if (isOpener) open = true; else { if (!open) needLead = true; open = false; }
    }
    inner = inner.replace(/[“”"]/g, "'");
    if (needLead) inner = "'" + inner;
    if (open) inner = inner + "'";
    return '"' + inner + '"';
  }

  function layoutBlocks(s) {
    var text = String(s.corrected || '');
    var hits = [];
    (s.verses || []).forEach(function (v) {
      var quote = String((v && v.quote) || ''); if (!quote) return;
      var q = locate(text, quote, 0, true);
      if (!q && quote.length > 60) {
        var head = locate(text, quote.slice(0, 50), 0, true);
        if (head) q = { start: head.start, end: Math.min(text.length, head.start + quote.length) };
      }
      if (!q) return;
      var st = q.start, en = q.end;
      while (st > 0 && /["“]/.test(text[st - 1])) st--;
      while (en < text.length && /["”]/.test(text[en])) en++;
      // Absorb a reference the speaker or an earlier pass already put after the quote.
      var tail = text.slice(en).match(/^\s*\(([1-3]?\s?[A-Za-z]+\.?\s+\d+(?::\d+(?:[-–]\d+)?)?)\)/);
      if (tail) en += tail[0].length;
      hits.push({ start: st, end: en, verse: v });
    });
    hits.sort(function (a, b) { return a.start - b.start; });
    var kept = []; hits.forEach(function (h) { var last = kept[kept.length - 1]; if (!last || h.start >= last.end) kept.push(h); });

    var blocks = [], pos = 0;
    function prose(chunk) {
      chunk.split(/\n\s*\n/).forEach(function (p) {
        p = p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
        if (p) blocks.push({ type: 'p', text: p });
      });
    }
    kept.forEach(function (h) {
      prose(text.slice(pos, h.start));
      var inner = text.slice(h.start, h.end).replace(/\s*\(([1-3]?\s?[A-Za-z]+\.?\s+\d+(?::\d+(?:[-–]\d+)?)?)\)\s*$/, '').replace(/\s*\n+\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
      // Strip whatever quote marks the transcript had around the verse (doubled, curly, mismatched),
      // turn any double quotes still inside it into single quotes for the speech within the verse,
      // then wrap the whole verse in one clean pair of double quotes.
      inner = normalizeVerseQuotes(inner);
      blocks.push({ type: 'verse', text: inner, ref: refLabel(h.verse), uncertain: h.verse.confidence === 'low' || !h.verse.canonical, note: String(h.verse.note || '') });
      pos = h.end;
    });
    prose(text.slice(pos));
    return blocks;
  }

  var DOC_GAP = '<p>&nbsp;</p>'; // an empty paragraph: the one thing Google keeps as a visible blank line
  function blocksToHtml(blocks, forDoc) {
    return blocks.map(function (b) {
      if (b.type === 'verse') {
        var line = esc(b.text) + (b.ref ? ' (' + esc(b.ref) + ')' : '');
        return forDoc ? '<blockquote><p><b>' + line + '</b></p></blockquote>' : '<blockquote class="verse-block' + (b.uncertain ? ' is-uncertain' : '') + '"><strong>' + line + '</strong></blockquote>';
      }
      return '<p>' + esc(b.text) + '</p>';
    }).join(forDoc ? DOC_GAP : '');
  }
  function blocksToPlain(blocks) {
    return blocks.map(function (b) { return b.type === 'verse' ? b.text + (b.ref ? ' (' + b.ref + ')' : '') : b.text; }).join('\n\n');
  }

