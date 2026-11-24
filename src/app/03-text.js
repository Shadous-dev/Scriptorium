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
      if (e && e.source === 'script') applied[applied.length - 1].source = 'script';     // 4.9: a change the written script supported says so
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
  //
  // The end of a verse is where the marks pile up: the speech inside it closes, the verse closes, and a
  // full stop or a second mark is often left outside (get up.'"  get up".  get up." "). So the end is
  // rebuilt rather than trusted: the verse's own closing punctuation, once; then one closing mark for the
  // speech inside it, if that speech is open.
  function normalizeVerseQuotes(inner) {
    inner = String(inner).trim().replace(/^(?:["“”]\s*)+/, '');
    var tail = inner.match(/[\s"“”'’.,!?…]*$/)[0], core = inner.slice(0, inner.length - tail.length);
    var own = tail.match(/^[.,!?…]+/), later = tail.match(/[.,!?…]/);
    var hadSingle = /['’]/.test(tail);
    inner = core + (own ? own[0] : later ? later[0] : '');
    var open = false, needLead = false, re = /["“”]/g, m;
    while ((m = re.exec(inner))) {
      var ch = m[0], prev = m.index ? inner[m.index - 1] : '';
      var isOpener = ch === '“' || (ch === '"' && (!prev || /[\s(:—–\-\[]/.test(prev)));
      if (isOpener) open = true; else { if (!open) needLead = true; open = false; }
    }
    inner = inner.replace(/[“”"]/g, "'");
    if (needLead) inner = "'" + inner;
    // A single mark found at the end closes speech that opened earlier in the verse. With nothing open it was a stray, and is dropped.
    if (open || (hadSingle && /(?:^|[\s(:—–\-\[])['‘](?=\S)/.test(inner))) inner = inner + "'";
    return '"' + inner + '"';
  }

  function isUncertain(v) { return v.confidence === 'low' || !v.canonical; }

  // Where a verse sits in the corrected text. New results carry two short anchors (the first
  // and last few words); older saved results carry the whole quote. Either way the text itself
  // is the source — the span is found here, not re-typed by the editor.
  function verseSpan(text, v, from) {
    if (v.startsWith) {
      var head = locate(text, v.startsWith, from || 0, true); if (!head) return null;
      var tail = v.endsWith ? locate(text, v.endsWith, head.start, true) : null;
      if (!tail || tail.start < head.start || tail.end - head.start > 2500) return null;
      return { start: head.start, end: tail.end };
    }
    var quote = String(v.quote || ''); if (!quote) return null;
    var q = locate(text, quote, from || 0, true);
    if (!q && quote.length > 60) {
      var h = locate(text, quote.slice(0, 50), from || 0, true);
      if (h) q = { start: h.start, end: Math.min(text.length, h.start + quote.length) };
    }
    return q;
  }

  function layoutBlocks(s) {
    var text = tameSpaces(s.corrected || '');
    var hits = [], cursor = 0;
    (s.verses || []).forEach(function (v, vi) {
      // Verses are listed in order, so each is looked for after the one before it: two that open with the
      // same words ("Jesus answered and said") are then two places in the text, not the first one twice.
      var q = v && verseSpan(text, v, cursor); if (!q) return;
      var st = q.start, en = q.end;
      // Opening marks that belong to the verse: the quote marks right before it, and one left a space away.
      while (st > 0 && (/["“]/.test(text[st - 1]) || (/['‘]/.test(text[st - 1]) && (st === 1 || /[\s"“(—]/.test(text[st - 2]))))) st--;
      var lead = text.slice(0, st).match(/(?:^|[\s(])(["“'‘]+[ \t]+)$/);
      if (lead) st -= lead[1].length;
      // Closing marks that belong to the verse: the run of marks right after it — the ' and the " in
      // «get up.'" The dead man sat up» — and a stray one left a space away. A mark that opens the next
      // quotation is followed by a letter, and is left where it is.
      // Punctuation hard against the last word is that word's, even when the anchor stopped short of it.
      var stop = text.slice(en).match(/^[.,;:!?…]+/);
      if (stop) en += stop[0].length;
      var close = text.slice(en).match(/^(?:[ \t]*["”'’])+(?=[\s.,;:!?)]|$)/);
      if (close) en += close[0].length; else { while (en < text.length && /["”]/.test(text[en])) en++; }
      // Absorb a reference the speaker or an earlier pass already put after the quote.
      var tail = text.slice(en).match(/^\s*\(([1-3]?\s?[A-Za-z]+\.?\s+\d+(?::\d+(?:[-–]\d+)?)?)\)/);
      if (tail) en += tail[0].length;
      // A full stop or comma left outside the closing mark goes with the verse, not at the head of the next paragraph.
      if ((close || tail) && /^[.,](?=\s|$)/.test(text.slice(en))) en += 1;
      hits.push({ start: st, end: en, verse: v, index: vi });
      cursor = Math.max(cursor, en);
    });
    hits.sort(function (a, b) { return a.start - b.start; });
    var kept = []; hits.forEach(function (h) { var last = kept[kept.length - 1]; if (!last || h.start >= last.end) kept.push(h); });

    var blocks = [], pos = 0;
    function prose(chunk) {
      chunk.split(/\n\s*\n/).forEach(function (p) {
        p = p.replace(/\s*\n\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
        // A quote mark with a space after it opens nothing, and one with a space before it closes nothing: both are
        // left-overs from around a verse. They are dropped here, and so is a paragraph that is nothing but marks.
        p = p.replace(/^(?:["“”'‘’]+\s+)+/, '').replace(/(?:\s+["“”'‘’]+)+$/, '');
        if (p && !/^["“”'‘’.,\s]*$/.test(p)) blocks.push({ type: 'p', text: p });
      });
    }
    kept.forEach(function (h) {
      prose(text.slice(pos, h.start));
      var inner = text.slice(h.start, h.end).replace(/\s*\(([1-3]?\s?[A-Za-z]+\.?\s+\d+(?::\d+(?:[-–]\d+)?)?)\)[.,]?\s*$/, '').replace(/\s*\n+\s*/g, ' ').replace(/[ \t]+/g, ' ').trim();
      // Strip whatever quote marks the transcript had around the verse (doubled, curly, mismatched),
      // turn any double quotes still inside it into single quotes for the speech within the verse,
      // then wrap the whole verse in one clean pair of double quotes.
      inner = normalizeVerseQuotes(inner);
      blocks.push({ type: 'verse', text: inner, ref: refLabel(h.verse), uncertain: isUncertain(h.verse), note: String(h.verse.note || ''), index: h.index });
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

  /* ------------------------------------------------------------------
     Hand edits — SOURCE-OF-TRUTH 4.4. A person may correct the finished
     script by hand, and every such change is listed like any other.
     ------------------------------------------------------------------ */

  // The before/after rows for a hand edit: one row per run of words that changed, each with a word of context in front.
  function handEditRows(before, after) {
    var a = String(before).match(/\S+/g) || [], b = String(after).match(/\S+/g) || [];
    function clip(text) { text = String(text).replace(/\s+/g, ' ').trim(); return text.length > 80 ? text.slice(0, 78) + '…' : text; }
    var pairs = matchWords(a, b, 2000), rows = [], pa = -1, pb = -1;
    if (!pairs) return [{ find: clip(before), replace: clip(after), kind: 'hand', note: 'rewritten by hand' }];
    function gap(toA, toB) {
      if (toA - pa <= 1 && toB - pb <= 1) return;
      var lead = pa >= 0 ? a[pa] + ' ' : '';
      rows.push({ find: clip(lead + a.slice(pa + 1, toA).join(' ')), replace: clip(lead + b.slice(pb + 1, toB).join(' ')), kind: 'hand', note: 'changed by hand' });
    }
    pairs.forEach(function (p) { gap(p[0], p[1]); pa = p[0]; pb = p[1]; });
    gap(a.length, b.length);
    if (!rows.length && String(before) !== String(after)) rows.push({ find: 'paragraph breaks or spacing', replace: '', kind: 'hand', note: 'changed by hand' });
    if (rows.length > 40) rows = rows.slice(0, 40).concat([{ find: '(' + (rows.length - 40) + ' more)', replace: '', kind: 'hand', note: 'further changes by hand' }]);
    return rows;
  }
