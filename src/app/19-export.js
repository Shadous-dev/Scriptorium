/* 19-export.js — Downloading the Final Transcripts as a PDF or a web page: one file for the book, or one for each guide. */
  /* ==================================================================
     Only a Final Transcript goes in, laid out as it is everywhere else: the guide's name as a heading, each
     paragraph, and each quoted verse bold and set in with its reference. The files are made here, by the
     page. Nothing calls Claude (4.6) and nothing touches Google Drive.

     The PDF is written directly, with no library: a PDF of plain text is a short, fixed recipe. It is drawn
     with Helvetica, one of the fonts every PDF reader carries, so no font has to be fetched or embedded. Those
     fonts cover English and Western European letters. A letter they lack is drawn as its plain letter, or as
     "?", and the page says how many were (SOURCE-OF-TRUTH section 7). The web page keeps every character.
     ================================================================== */

  function exportKindOf(v) { return v === 'html' ? 'html' : 'pdf'; }
  function exportSplitOf(v) { return v === 'guide' ? 'guide' : 'book'; }
  var exportKind = exportKindOf(prefGet('exportKind', 'pdf'));
  var exportSplit = exportSplitOf(prefGet('exportSplit', 'book'));
  var exportResult = null;           // what the last download said: { book, text } or { book, error }
  var exportBusy = false;

  /* ---- Letters: what the PDF's fonts can draw ---- */

  // How wide each character from space to ~ is in Helvetica and in Helvetica-Bold, in thousandths of the type size.
  var PDF_WIDE = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ').map(Number);
  var PDF_WIDE_BOLD = '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584'.split(' ').map(Number);
  // The same for the marks above ~ that are not a letter with an accent: quotes, dashes, the ellipsis and so on.
  var PDF_WIDE_HIGH = { 128: 556, 133: 1000, 140: 1000, 145: 222, 146: 222, 147: 333, 148: 333, 149: 350, 150: 556, 151: 1000, 153: 1000, 156: 944, 160: 278, 169: 737, 174: 737, 198: 1000, 230: 889 };
  var PDF_WIDE_HIGH_BOLD = { 145: 278, 146: 278, 147: 500, 148: 500 };
  function pdfWidth(code, bold) {
    if (code >= 32 && code < 127) return (bold ? PDF_WIDE_BOLD : PDF_WIDE)[code - 32];
    if (bold && PDF_WIDE_HIGH_BOLD[code]) return PDF_WIDE_HIGH_BOLD[code];
    if (PDF_WIDE_HIGH[code]) return PDF_WIDE_HIGH[code];
    // A letter with an accent is as wide as the letter under it.
    var base = (code >= 160 ? String.fromCharCode(code) : cp1252(code)).normalize('NFD').charCodeAt(0);
    return base >= 32 && base < 127 ? (bold ? PDF_WIDE_BOLD : PDF_WIDE)[base - 32] : 556;
  }
  // The byte each character is written as (the Windows Western set the fonts are told to use).
  var pdfCodeMemo = null;
  function pdfCodes() {
    if (pdfCodeMemo) return pdfCodeMemo;
    var map = Object.create(null);
    CP1252.forEach(function (point, i) { if (point > 255) map[point] = 128 + i; });
    // Other ways of writing a hyphen, a space, a quote mark, or two letters as one. None of these changes a word.
    [0x2010, 0x2011, 0x2012, 0x2212].forEach(function (p) { map[p] = [45]; });
    [0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007, 0x2008, 0x2009, 0x200A, 0x202F, 0x205F, 0x3000, 0x2028, 0x2029].forEach(function (p) { map[p] = [32]; });
    [0x00AD, 0x200B, 0x200C, 0x200D, 0x2060, 0xFEFF].forEach(function (p) { map[p] = []; });
    map[0x2015] = [151]; map[0x2032] = [39]; map[0x2033] = [34]; map[0x02BC] = [146]; map[0x02BB] = [145]; map[0x2019] = 146;
    map[0xFB00] = [102, 102]; map[0xFB01] = [102, 105]; map[0xFB02] = [102, 108];
    return (pdfCodeMemo = map);
  }
  function plainByte(point) { return (point >= 32 && point < 127) || (point >= 160 && point <= 255 && point !== 173); }
  // Text as the bytes the PDF holds. `tally.plain` counts letters drawn as their plain letter, `tally.lost` those drawn as "?".
  function pdfEncode(text, tally) {
    var out = [], map = pdfCodes(), i, k, point, hit, base, ok;
    text = String(text == null ? '' : text).normalize('NFC');
    for (i = 0; i < text.length; i++) {
      point = text.codePointAt(i); if (point > 0xFFFF) i += 1;
      if (point === 9 || point === 10 || point === 13) { out.push(32); continue; }
      if (point < 32 || point === 127) continue;
      if (plainByte(point)) { out.push(point); continue; }
      hit = map[point];
      if (typeof hit === 'number') { out.push(hit); continue; }
      if (hit) { for (k = 0; k < hit.length; k++) out.push(hit[k]); continue; }
      if (point >= 0x300 && point <= 0x36F) { if (tally) tally.plain += 1; continue; }      // an accent with no letter of its own left to sit on
      // A letter the fonts do not have: its plain form if it has one (a macron dropped), else "?".
      base = String.fromCodePoint(point).normalize('NFKD'); ok = [];
      for (k = 0; k < base.length; k++) {
        var c = base.charCodeAt(k);
        if (c >= 0x300 && c <= 0x36F) continue;
        if (plainByte(c)) ok.push(c); else if (typeof map[c] === 'number') ok.push(map[c]); else { ok = null; break; }
      }
      if (ok && ok.length) { out.push.apply(out, ok); if (tally) tally.plain += 1; }
      else { out.push(63); if (tally) tally.lost += 1; }
    }
    while (out.length && out[out.length - 1] === 32) out.pop();
    return out;
  }
  function pdfMeasure(codes, bold, size) { var w = 0, i; for (i = 0; i < codes.length; i++) w += pdfWidth(codes[i], bold); return w * size / 1000; }
  // One paragraph broken into lines no wider than `width`: at a space where there is one, inside a word only
  // when a single word is longer than the line. No line starts with a space.
  function pdfWrap(codes, bold, size, width) {
    var max = width * 1000 / size, lines = [], start = 0, w = 0, space = -1, i = 0, end;
    function keep(from, to) { while (to > from && codes[to - 1] === 32) to -= 1; if (to > from) lines.push(codes.slice(from, to)); }   // no line ends with a space
    while (i < codes.length) {
      if (codes[i] === 32 && i === start) { start = i + 1; i += 1; continue; }
      w += pdfWidth(codes[i], bold);
      if (codes[i] === 32) space = i;
      if (w > max && i > start) {
        end = space > start ? space : i;
        keep(start, end);
        start = space > start ? space + 1 : i;
        i = start; w = 0; space = -1; continue;
      }
      i += 1;
    }
    keep(start, codes.length);
    return lines;
  }

  /* ---- Pages ---- */

  // US Letter, an inch of margin all round. Sizes are in points.
  var PDF_PAGE = { w: 612, h: 792, left: 72, right: 72, top: 72, bottom: 72, body: 11, lead: 15.5, gap: 9, head: 18, headLead: 23, title: 22, titleLead: 28, indent: 24, foot: 9 };
  function pdfString(codes) {
    var s = '', i, c;
    for (i = 0; i < codes.length; i++) { c = codes[i]; s += (c === 40 || c === 41 || c === 92 ? '\\' : '') + String.fromCharCode(c); }
    return '(' + s + ')';
  }
  // Lays the guides out on pages. guides: [{ name, blocks }], blocks as layoutBlocks gives them. `title` heads the
  // first page when there is one. Returns the pages (each a list of drawing commands), where each guide starts, and the tally.
  function pdfLayout(title, guides) {
    var P = PDF_PAGE, width = P.w - P.left - P.right, pages = [], marks = [], tally = { plain: 0, lost: 0 }, page = null, y = 0;
    function newPage(label) { page = { ops: [], label: label }; pages.push(page); y = P.h - P.top; }
    function put(codes, bold, size, x) { page.ops.push('BT /F' + (bold ? 2 : 1) + ' ' + size + ' Tf ' + x + ' ' + y.toFixed(2) + ' Td ' + pdfString(codes) + ' Tj ET'); }
    function lines(text, bold, size, lead, x, room, keep) {
      var list = pdfWrap(pdfEncode(text, tally), bold, size, room);
      // A heading stays with what follows it, and a paragraph does not leave one line alone at the foot of a page.
      if (y - Math.min(list.length, keep) * lead < P.bottom) newPage(page.label);
      list.forEach(function (line) {
        if (y - lead < P.bottom) newPage(page.label);
        y -= lead; put(line, bold, size, x);
      });
      return list.length;
    }
    guides.forEach(function (g, n) {
      var name = String(g.name || 'Untitled guide');
      if (n > 0 || !page) newPage(name);
      page.label = name;
      if (n === 0 && title) { lines(title, true, P.title, P.titleLead, P.left, width, 99); y -= 12; }
      if (y - (P.headLead + 2 * P.lead) < P.bottom) newPage(name);
      marks.push({ title: name, page: pages.length - 1 });
      lines(name, true, P.head, P.headLead, P.left, width, 99); y -= 6;
      (g.blocks || []).forEach(function (b) {
        var verse = b.type === 'verse', text = verse ? b.text + (b.ref ? ' (' + b.ref + ')' : '') : b.text;
        if (lines(text, verse, P.body, P.lead, P.left + (verse ? P.indent : 0), width - (verse ? P.indent : 0), 2)) y -= P.gap;
      });
    });
    if (!pages.length) newPage('');
    // The foot of each page: which guide it is, and the page number.
    pages.forEach(function (pg, n) {
      var label = pdfEncode(pg.label, null), num = pdfEncode(String(n + 1), null), room = width - 60;
      while (label.length > 1 && pdfMeasure(label, false, P.foot) > room) { label = label.slice(0, -2); label[label.length - 1] = 133; }
      pg.ops.push('0.45 g');
      if (label.length) pg.ops.push('BT /F1 ' + P.foot + ' Tf ' + P.left + ' 40 Td ' + pdfString(label) + ' Tj ET');
      pg.ops.push('BT /F1 ' + P.foot + ' Tf ' + (P.w - P.right - pdfMeasure(num, false, P.foot)).toFixed(2) + ' 40 Td ' + pdfString(num) + ' Tj ET');
      pg.ops.push('0 g');
    });
    return { pages: pages, marks: marks, tally: tally };
  }

  /* ---- The file ---- */

  // A name or title as the PDF keeps text that is not drawn on a page: every character, two bytes each.
  function pdfHex(text) {
    var out = 'FEFF', i;
    text = String(text == null ? '' : text);
    for (i = 0; i < text.length && i < 400; i++) out += ('000' + text.charCodeAt(i).toString(16).toUpperCase()).slice(-4);
    return '<' + out + '>';
  }
  function pdfStamp(when) {
    function two(n) { return (n < 10 ? '0' : '') + n; }
    return 'D:' + when.getFullYear() + two(when.getMonth() + 1) + two(when.getDate()) + two(when.getHours()) + two(when.getMinutes()) + two(when.getSeconds());
  }
  // The laid-out pages as the bytes of a PDF. With more than one guide the file carries an outline, so a
  // reader can jump to a guide by name.
  function pdfBuild(layout, title, when) {
    var objs = [];
    function add(body) { objs.push(body); return objs.length; }
    function ref(id) { return id + ' 0 R'; }
    var catalog = add(''), tree = add('');
    var plain = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    var bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    var pageIds = layout.pages.map(function (pg) {
      var stream = pg.ops.join('\n'), content = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
      return add('<< /Type /Page /Parent ' + ref(tree) + ' /MediaBox [0 0 ' + PDF_PAGE.w + ' ' + PDF_PAGE.h + '] /Contents ' + ref(content) + ' /Resources << /Font << /F1 ' + ref(plain) + ' /F2 ' + ref(bold) + ' >> >> >>');
    });
    objs[tree - 1] = '<< /Type /Pages /Kids [' + pageIds.map(ref).join(' ') + '] /Count ' + pageIds.length + ' >>';
    var outline = 0;
    if (layout.marks.length > 1) {
      outline = add('');
      var items = layout.marks.map(function () { return add(''); });
      layout.marks.forEach(function (m, n) {
        objs[items[n] - 1] = '<< /Title ' + pdfHex(m.title) + ' /Parent ' + ref(outline) + (n > 0 ? ' /Prev ' + ref(items[n - 1]) : '') + (n < items.length - 1 ? ' /Next ' + ref(items[n + 1]) : '') + ' /Dest [' + ref(pageIds[m.page]) + ' /Fit] >>';
      });
      objs[outline - 1] = '<< /Type /Outlines /First ' + ref(items[0]) + ' /Last ' + ref(items[items.length - 1]) + ' /Count ' + items.length + ' >>';
    }
    objs[catalog - 1] = '<< /Type /Catalog /Pages ' + ref(tree) + (outline ? ' /Outlines ' + ref(outline) + ' /PageMode /UseOutlines' : '') + ' >>';
    var info = add('<< /Title ' + pdfHex(title) + ' /Producer (The Scriptorium ' + String(VERSION).replace(/[^0-9.]/g, '') + ') /CreationDate (' + pdfStamp(when || new Date()) + ') >>');
    // Every character from here on is one byte, so a position in this string is a position in the file.
    var out = '%PDF-1.4\n%' + String.fromCharCode(226, 227, 207, 211) + '\n', at = [];
    objs.forEach(function (body, n) { at.push(out.length); out += (n + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
    var xref = out.length;
    out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n' + at.map(function (o) { return ('0000000000' + o).slice(-10) + ' 00000 n \n'; }).join('') +
      'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + ref(catalog) + ' /Info ' + ref(info) + ' >>\nstartxref\n' + xref + '\n%%EOF\n';
    var bytes = new Uint8Array(out.length), i;
    for (i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return bytes;
  }

  /* ---- What is downloaded ---- */

  function exportBase() { return fileSafe(state.bookTitle, 'Audio guides'); }
  // A file name for each guide that is safe to save and cannot collide with another's.
  function exportNames(finals) {
    var used = {};
    return finals.map(function (s) {
      var base = fileSafe(s.name, 'Guide ' + (state.sections.indexOf(s) + 1)), name = base, n = 2;
      while (used[name.toLowerCase()]) { name = base + ' (' + n + ')'; n += 1; }
      used[name.toLowerCase()] = true;
      return name;
    });
  }
  // The file to save for the choices made: { filename, data, pages, plain, lost }. `when` is the time written into it.
  function exportFile(kind, split, finals, when) {
    kind = exportKindOf(kind); split = exportSplitOf(split);
    var base = exportBase(), names = exportNames(finals), out = { filename: '', data: null, pages: 0, plain: 0, lost: 0 };
    function pdfOf(title, list) {
      var layout = pdfLayout(title, list.map(function (s) { return { name: s.name || 'Untitled guide', blocks: layoutBlocks(s) }; }));
      out.pages += layout.pages.length; out.plain += layout.tally.plain; out.lost += layout.tally.lost;
      return pdfBuild(layout, title || list[0].name || 'Untitled guide', when);
    }
    function htmlOf(s) { return wrapDoc('<h1>' + esc(s.name || 'Untitled guide') + '</h1>' + scriptBody(s, false), true); }
    if (split === 'book') {
      out.filename = base + ' transcripts.' + kind;
      out.data = kind === 'pdf' ? pdfOf(docTitle(), finals) : wrapDoc(docBody(finals), true);
    } else {
      out.filename = base + ' transcripts (' + kind + ').zip';
      out.data = zipFiles(finals.map(function (s, n) {
        return kind === 'pdf' ? { name: names[n] + '.pdf', bytes: pdfOf('', [s]) } : { name: names[n] + '.html', text: htmlOf(s) };
      }), when);
    }
    return out;
  }
  function exportSaid(made, kind, split, count, left) {
    var what = kind === 'pdf' ? 'PDF' : 'web page';
    var text = 'Saved ' + count + ' Final Transcript' + plural(count) + (split === 'book'
      ? ' as one ' + what + (kind === 'pdf' ? ', ' + made.pages + ' page' + plural(made.pages) : '') + ': ' + made.filename + '.'
      : ' as ' + (kind === 'pdf' ? 'a PDF' : 'a web page') + ' each, inside ' + made.filename + '.');
    if (left > 0) text += ' ' + left + ' guide' + plural(left) + ' not yet approved ' + (left === 1 ? 'was' : 'were') + ' left out.';
    var odd = made.plain + made.lost;
    if (kind === 'pdf' && odd) {
      text += ' ' + odd + ' letter' + plural(odd) + ' the PDF’s fonts do not have ' + (odd === 1 ? 'was' : 'were') + ' drawn as the plain letter' +
        (made.lost ? ' (' + made.lost + ' as “?”)' : '') + '. The web page keeps every letter as written.';
    }
    return text;
  }
  function exportTranscripts() {
    syncFieldsFromDom();
    if (exportBusy) return Promise.resolve();
    var finals = finalSections(), kind = exportKind, split = exportSplit, book = bookId;
    var left = state.sections.filter(function (s) { return String(s.raw || '').trim() || s.corrected; }).length - finals.length;
    function say(result) { exportBusy = false; exportResult = result ? Object.assign({ book: book }, result) : null; paint(); }
    if (!finals.length) { say({ error: 'No guide has been approved as a Final Transcript yet. Approve one and try again.' }); return Promise.resolve(); }
    exportBusy = true; exportResult = null; paint();
    return useCap('downloads').then(function (downloads) {
      if (!downloads) { say({ error: 'Downloads aren’t available in this view. Use Copy for YouVersion on each guide instead.' }); return; }
      var made;
      try { made = exportFile(kind, split, finals, new Date()); }
      catch (err) { console.warn('Scriptorium: could not make the file', err); say({ error: 'The file could not be made. Try the other kind, and report this.' }); return; }
      return downloads.save({ filename: made.filename, data: made.data }).then(function () {
        say({ text: exportSaid(made, kind, split, finals.length, left) });
      }, function (err) {
        var code = err && err.code;
        if (code === 'declined') say(null);
        else if (code === 'rejected_extension' || code === 'extension_not_enabled') say({ error: 'This view doesn’t allow that kind of file to be saved. Try the other kind.' });
        else say({ error: 'Couldn’t save the file: ' + ((err && err.message) || 'unknown error') });
      });
    }).catch(function (err) { console.warn('Scriptorium: the download failed', err); say({ error: 'Couldn’t save the file just now. Try again.' }); });
  }
  // The part of the book's foot where the Final Transcripts are downloaded.
  function renderExport(finalCount) {
    var r = exportResult && exportResult.book === bookId ? exportResult : null, dis = exportBusy ? ' disabled' : '';
    return '<div class="caption-export transcript-export">' +
      '<p class="approve-prompt">Download the Final Transcripts</p>' +
      '<p class="hint conclude-note">As a PDF to read, print or send, or as a web page that opens in any browser and in Word or Google Docs to keep editing. Only Final Transcripts go in. Nothing is sent anywhere: the file is made here and saved to your computer.</p>' +
      '<div class="conclude-row">' +
      '<button type="button" class="btn btn-conclude" data-action="export-transcripts"' + (finalCount && !exportBusy ? '' : ' disabled') + '>' + (exportBusy ? 'Making the file…' : 'Download') + '</button>' +
      '<label class="speed-pick"><select data-action="set-exportkind" aria-label="Which kind of file"' + dis + '><option value="pdf"' + (exportKind === 'pdf' ? ' selected' : '') + '>PDF</option><option value="html"' + (exportKind === 'html' ? ' selected' : '') + '>Web page (.html)</option></select></label>' +
      '<label class="speed-pick"><select data-action="set-exportsplit" aria-label="One file or many"' + dis + '><option value="book"' + (exportSplit === 'book' ? ' selected' : '') + '>One file for the whole book</option><option value="guide"' + (exportSplit === 'guide' ? ' selected' : '') + '>One file for each guide (.zip)</option></select></label>' +
      '</div>' +
      (r ? '<p class="doc-result' + (r.error ? ' is-error' : '') + '">' + esc(r.error || r.text) + '</p>' : '') +
      '</div>';
  }
