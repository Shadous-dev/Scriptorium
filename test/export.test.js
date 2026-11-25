#!/usr/bin/env node
/*
 * export.test.js — checks downloading the Final Transcripts as a PDF or a web
 * page, for the whole book or a file for each guide: only Final Transcripts
 * go in, every word is there in order (4.1), and the PDF the page writes is
 * a well-formed file.
 *
 *   node test/export.test.js
 *
 * No dependencies. The PDF is read back here by a small reader written for
 * the purpose, which checks the file's own table of where everything is.
 */
const assert = require('assert');
const { makeStore, makePage, settle } = require('./whole-page');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const now = 1795600000000, WHEN = new Date(2026, 10, 25, 9, 30, 0);
const MACRON = String.fromCharCode(0x101), ALEPH = String.fromCharCode(0x5D0), DOVE = String.fromCodePoint(0x1F54A);

const PROSE = 'Welcome back, my friends. Today we open the second chapter, and it’s a long one — longer than most. ' + 'The teacher goes on at a steady pace through every part of it. '.repeat(6);
const LUKE1 = PROSE.trim() + '\n\nThe verse says, "In the beginning was the test, and the test was good." And that is where we begin.\n\nA last paragraph, with a café and a naïve reading.';
const VERSE = { startsWith: 'In the beginning was', endsWith: 'the test was good.', canonical: 'John 1:1', reference: 'John 1:1', confidence: 'high', note: '' };
const guideDoc = (name, more) => Object.assign({ name, raw: 'heard', corrected: LUKE1, editedFromRaw: 'heard', hasEditedFrom: true, summary: '', changeCount: 0, misheard: [], nonsensical: [], edits: [], unapplied: [], verses: [VERSE],
  method: 'edits', status: 'edited', error: '', editedAt: now, descriptId: '', descriptName: '', suggested: [], misquotes: [], approvedAt: now, writtenId: '', writtenUsed: null }, more || {});
async function bookWith(docs, title, noDownloads) {
  const S = makeStore(), saved = [], ctl = { fail: null }, opts = { caps: { downloads: { save: (f) => { saved.push(f); return ctl.fail ? Promise.reject(ctl.fail) : Promise.resolve({ status: 'saved' }); } } } };
  S.store.set('books/b1', { bookTitle: title || 'Luke', wordsToSearchFor: '', order: Object.keys(docs), nextId: 99, lastEditAt: now, createdAt: now, touchedAt: now, finalCount: 0, scriptCount: 0, editedCount: 0, lastDoc: null });
  Object.keys(docs).forEach((id) => S.store.set('books/b1/scripts/' + id, docs[id]));
  if (noDownloads) opts.caps.downloads = null;
  const P = makePage(S, opts);
  P.ev('initStore')(); await settle(); await P.ev('openBook')('b1'); await settle();
  P.saved = saved; P.ctl = ctl;
  return P;
}

// Reads a PDF back: its table of contents is checked, and every line drawn on every page is returned.
function readPdf(bytes, cp1252) {
  const str = Buffer.from(bytes).toString('latin1');
  assert.ok(str.startsWith('%PDF-1.4\n'), 'it says it is a PDF');
  assert.ok(str.endsWith('%%EOF\n'), 'and where it ends');
  const sx = /startxref\n(\d+)\n%%EOF\n$/.exec(str);
  assert.ok(sx, 'it says where its table is');
  const xref = Number(sx[1]);
  assert.strictEqual(str.substr(xref, 5), 'xref\n', 'and the table is there');
  const head = /^xref\n0 (\d+)\n/.exec(str.slice(xref, xref + 40)), count = Number(head[1]);
  const rows = str.slice(xref + head[0].length, xref + head[0].length + count * 20);
  assert.strictEqual(rows.slice(0, 20), '0000000000 65535 f \n');
  for (let n = 1; n < count; n++) {
    const row = rows.slice(n * 20, n * 20 + 20);
    assert.ok(/^\d{10} 00000 n \n$/.test(row), 'row ' + n + ' is twenty bytes');
    assert.strictEqual(str.substr(Number(row.slice(0, 10)), (n + ' 0 obj\n').length), n + ' 0 obj\n', 'object ' + n + ' is where the table says');
  }
  assert.ok(new RegExp('/Size ' + count + ' /Root 1 0 R').test(str));
  const pages = [], streamRe = /<< \/Length (\d+) >>\nstream\n/g;
  let m;
  while ((m = streamRe.exec(str))) {
    const len = Number(m[1]), body = str.substr(m.index + m[0].length, len);
    assert.strictEqual(str.substr(m.index + m[0].length + len, 10), '\nendstream', 'a page is exactly as long as it says');
    const lines = [], lineRe = /BT \/F(\d) ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\[\s\S]|[^\\)])*)\) Tj ET/g;
    let l;
    while ((l = lineRe.exec(body))) {
      const text = l[5].replace(/\\([\s\S])/g, '$1').split('').map((c) => cp1252(c.charCodeAt(0))).join('');
      lines.push({ bold: l[1] === '2', size: Number(l[2]), x: Number(l[3]), y: Number(l[4]), text });
    }
    // With the words taken out, every command on the page must be one the page is known to write: a line of
    // text in one of its two fonts, or the grey for the foot. Anything else would be a command that got in by another way.
    let bare = '', i = 0, strings = 0;
    while (i < body.length) {
      if (body[i] !== '(') { bare += body[i]; i += 1; continue; }
      i += 1; strings += 1;
      while (i < body.length && body[i] !== ')') i += body[i] === '\\' ? 2 : 1;
      i += 1; bare += '()';
    }
    bare.split('\n').forEach((cmd) => assert.ok(/^(BT \/F[12] [\d.]+ Tf [\d.]+ [\d.]+ Td \(\) Tj ET|0\.45 g|0 g)$/.test(cmd), 'a command the page does not write: ' + cmd.slice(0, 60)));
    assert.strictEqual(lines.length, strings, 'every line drawn was read');
    pages.push(lines);
    streamRe.lastIndex = m.index + m[0].length + len;
  }
  const kids = /\/Type \/Pages \/Kids \[([^\]]*)\] \/Count (\d+)/.exec(str);
  assert.strictEqual(Number(kids[2]), pages.length, 'the page count is right');
  assert.strictEqual(kids[1].split(' 0 R').length - 1, pages.length);
  const titles = [];
  const titleRe = /\/Title <FEFF([0-9A-F]*)> \/Parent/g;
  while ((m = titleRe.exec(str))) titles.push(m[1].match(/.{4}/g).map((h) => String.fromCharCode(parseInt(h, 16))).join(''));
  return { str, pages, outline: titles };
}
const body = (page) => page.filter((l) => !(l.y === 40 && l.size === 9));
const words = (text) => text.split(/\s+/).filter(Boolean);

/* ---- Letters and lines ---- */

test('the PDF\'s letters: quotes, dashes and accents as themselves; a letter the fonts lack as its plain letter, or "?", and counted', () => {
  const P = makePage(), enc = P.ev('pdfEncode'), cp = P.ev('cp1252'), back = (codes) => codes.map(cp).join('');
  assert.strictEqual(P.ev('PDF_WIDE').length, 95); assert.strictEqual(P.ev('PDF_WIDE_BOLD').length, 95);
  const tally = { plain: 0, lost: 0 };
  assert.strictEqual(back(enc('He said, “it’s a café” — naïve… 100% (yes) [no] \\ end', tally)), 'He said, “it’s a café” — naïve… 100% (yes) [no] \\ end');
  assert.deepStrictEqual(tally, { plain: 0, lost: 0 }, 'none of that is outside the fonts');
  assert.strictEqual(back(enc('sh' + MACRON + 'l' + 'o' + String.fromCharCode(0x304) + 'm', tally)), 'shalom');
  assert.deepStrictEqual(tally, { plain: 2, lost: 0 }, 'a macron is dropped, and it is counted');
  assert.strictEqual(back(enc('the letter ' + ALEPH + ' and a dove ' + DOVE + '.', tally)), 'the letter ? and a dove ?.');
  assert.deepStrictEqual(tally, { plain: 2, lost: 2 });
  assert.strictEqual(back(enc('a\tb\nc' + String.fromCharCode(0x2011) + 'd' + String.fromCharCode(0xAD) + 'e' + String.fromCharCode(0x202F) + 'f' + String.fromCharCode(0xFB01) + '  ', null)), 'a b c-de ffi');
  assert.strictEqual(back(enc('e' + String.fromCharCode(0x301), null)), 'é', 'an accent typed as its own character is joined to its letter first');
  assert.deepStrictEqual(enc(null, null), []);
  assert.ok(P.ev('pdfWidth')(105, false) < P.ev('pdfWidth')(109, false) && P.ev('pdfWidth')(233, false) === P.ev('pdfWidth')(101, false), 'an accented letter is as wide as its letter');
});

test('a paragraph is broken at spaces into lines that fit; a word longer than a line is broken inside; no word is lost', () => {
  const P = makePage(), enc = P.ev('pdfEncode'), wrap = P.ev('pdfWrap'), measure = P.ev('pdfMeasure'), cp = P.ev('cp1252');
  const text = PROSE + ' ' + 'x'.repeat(300) + ' and the end.';
  [[false, 11, 468], [true, 11, 444], [true, 18, 468], [false, 9, 100]].forEach(([bold, size, width]) => {
    const lines = wrap(enc(text, null), bold, size, width);
    lines.forEach((line) => {
      assert.ok(measure(line, bold, size) <= width + 0.01, 'no line is wider than the page allows');
      assert.ok(line[0] !== 32 && line[line.length - 1] !== 32, 'no line starts or ends with a space');
    });
    assert.strictEqual(lines.map((l) => l.map(cp).join('')).join(' ').replace(/x+( x+)*/g, (m) => m.replace(/ /g, '')), text.replace(/\s+/g, ' ').trim());
  });
  assert.deepStrictEqual(wrap([], false, 11, 468), []);
  assert.deepStrictEqual(wrap(enc('   ', null), false, 11, 468), []);
});

/* ---- The PDF ---- */

test('one PDF for the whole book: a well-formed file, the book\'s title, each guide on a page of its own, and an outline to jump by', async () => {
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1'), g2: guideDoc('Luke – Chapter 2'), g3: guideDoc('Luke – Chapter 3') });
  const made = P.ev('exportFile')('pdf', 'book', P.ev('finalSections')(), WHEN);
  assert.strictEqual(made.filename, 'Luke transcripts.pdf');
  const pdf = readPdf(made.data, P.ev('cp1252'));
  assert.strictEqual(made.pages, pdf.pages.length);
  assert.deepStrictEqual(pdf.outline, ['Luke – Chapter 1', 'Luke – Chapter 2', 'Luke – Chapter 3']);
  assert.ok(/\/Outlines \d+ 0 R \/PageMode \/UseOutlines/.test(pdf.str) && /\/Count 3 >>/.test(pdf.str));
  assert.ok(/\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/.test(pdf.str) && /\/BaseFont \/Helvetica-Bold /.test(pdf.str));
  assert.ok(/\/CreationDate \(D:20261125093000\)/.test(pdf.str) && /\/Producer \(The Scriptorium [\d.]+\)/.test(pdf.str));
  const first = body(pdf.pages[0]);
  assert.deepStrictEqual([first[0].text, first[0].bold, first[0].size], ['Luke — Audio Guide Transcripts', true, 22]);
  assert.deepStrictEqual([first[1].text, first[1].bold, first[1].size, first[1].x], ['Luke – Chapter 1', true, 18, 72]);
  // Each guide's heading is the first thing on its page.
  const starts = pdf.pages.map((pg, n) => ({ n, top: body(pg)[0] })).filter((p) => p.top.size === 18 || p.n === 0).map((p) => p.n);
  assert.strictEqual(starts.length, 3, 'three guides, three pages that open with a heading');
  // Nothing is drawn outside the margins, and every page says which guide it is and its number.
  pdf.pages.forEach((pg, n) => {
    body(pg).forEach((l) => assert.ok(l.y >= 72 && l.y <= 792 - 72 && l.x >= 72, 'inside the margins'));
    const foot = pg.filter((l) => l.y === 40 && l.size === 9);
    assert.strictEqual(foot[foot.length - 1].text, String(n + 1));
    assert.ok(/^Luke – Chapter [123]$/.test(foot[0].text));
  });
});

test('4.1: every word of a Final Transcript is in the PDF, in order; a verse is bold and set in, with its reference', async () => {
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1') });
  const s = P.ev('finalSections')()[0], blocks = P.ev('layoutBlocks')(s);
  assert.ok(blocks.some((b) => b.type === 'verse'), 'the sample has a quoted verse');
  const made = P.ev('exportFile')('pdf', 'guide', [s], WHEN);
  const pdfBytes = await P.ev('zipEntry')(made.data, 'Luke – Chapter 1.pdf');
  const pdf = readPdf(pdfBytes, P.ev('cp1252')), drawn = [].concat(...pdf.pages.map(body));
  assert.strictEqual(drawn[0].text, 'Luke – Chapter 1');
  assert.strictEqual(pdf.outline.length, 0, 'one guide needs no outline');
  const want = blocks.map((b) => (b.type === 'verse' ? b.text + (b.ref ? ' (' + b.ref + ')' : '') : b.text)).join(' ');
  assert.deepStrictEqual(words(drawn.slice(1).map((l) => l.text).join(' ')), words(want), 'word for word');
  const verse = blocks.filter((b) => b.type === 'verse')[0];
  const verseLines = drawn.filter((l) => l.bold && l.size === 11);
  assert.deepStrictEqual(words(verseLines.map((l) => l.text).join(' ')), words(verse.text + ' (' + verse.ref + ')'));
  verseLines.forEach((l) => assert.strictEqual(l.x, 96, 'set in from the margin'));
  drawn.filter((l) => !l.bold).forEach((l) => assert.strictEqual(l.x, 72));
  assert.ok(/John 1:1/.test(verseLines[verseLines.length - 1].text));
});

test('one file for each guide: a .zip with a PDF apiece, each named for its guide, no two the same', async () => {
  const P = await bookWith({ g1: guideDoc('Luke: Chapter 1?'), g2: guideDoc('Luke: Chapter 1?'), g3: guideDoc('') });
  const made = P.ev('exportFile')('pdf', 'guide', P.ev('finalSections')(), WHEN);
  assert.strictEqual(made.filename, 'Luke transcripts (pdf).zip');
  for (const name of ['Luke Chapter 1.pdf', 'Luke Chapter 1 (2).pdf', 'Guide 3.pdf']) {
    const got = await P.ev('zipEntry')(made.data, name);
    assert.ok(got, name + ' is in the .zip');
    readPdf(got, P.ev('cp1252'));
  }
});

test('a long guide runs on to more pages; a paragraph does not leave one line alone at the foot of a page', async () => {
  const long = Array.from({ length: 40 }, (_, i) => 'Paragraph ' + (i + 1) + '. ' + 'The teacher goes on at a steady pace. '.repeat(9).trim()).join('\n\n');
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1', { corrected: long, verses: [] }) });
  const made = P.ev('exportFile')('pdf', 'book', P.ev('finalSections')(), WHEN), pdf = readPdf(made.data, P.ev('cp1252'));
  assert.ok(pdf.pages.length >= 4, 'several pages');
  assert.deepStrictEqual(words([].concat(...pdf.pages.map(body)).slice(2).map((l) => l.text).join(' ')), words(long));
  pdf.pages.slice(0, -1).forEach((pg) => { const last = body(pg).pop(); assert.ok(!/^Paragraph \d+\./.test(last.text) || last.y > 72 + 15.5, 'a paragraph\'s first line is not the last on a page'); });
});

/* ---- The web page ---- */

test('the web page: one file for the book with every guide, or a .zip with a file apiece; every character kept, markup shown as text', async () => {
  const odd = 'Sh' + MACRON + 'l' + MACRON + 'm, ' + ALEPH + ' ' + DOVE + ' <b>not bold</b> & more.';
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1', { corrected: odd, verses: [] }), g2: guideDoc('Luke <i>2</i>') });
  const finals = P.ev('finalSections')();
  const one = P.ev('exportFile')('html', 'book', finals, WHEN);
  assert.strictEqual(one.filename, 'Luke transcripts.html');
  assert.ok(one.data.startsWith('<!doctype html>') && /<meta charset="utf-8">/.test(one.data));
  assert.ok(one.data.includes('Sh' + MACRON + 'l' + MACRON + 'm, ' + ALEPH + ' ' + DOVE), 'as written');
  assert.ok(one.data.includes('&lt;b&gt;not bold&lt;/b&gt; &amp; more.') && !/<b>not bold/.test(one.data) && one.data.includes('Luke &lt;i&gt;2&lt;/i&gt;'));
  assert.ok(/<h2>Luke – Chapter 1<\/h2>/.test(one.data) && /page-break-before:always/.test(one.data), 'each guide after the first starts a new page when printed');
  assert.deepStrictEqual([one.plain, one.lost], [0, 0]);
  const each = P.ev('exportFile')('html', 'guide', finals, WHEN);
  assert.strictEqual(each.filename, 'Luke transcripts (html).zip');
  const a = new TextDecoder().decode(await P.ev('zipEntry')(each.data, 'Luke – Chapter 1.html')), b = new TextDecoder().decode(await P.ev('zipEntry')(each.data, 'Luke i 2 i.html'));
  assert.ok(a.startsWith('<!doctype html>') && /<h1>Luke – Chapter 1<\/h1>/.test(a) && a.includes(ALEPH) && !a.includes('Luke &lt;i&gt;'));
  assert.ok(/<h1>Luke &lt;i&gt;2&lt;\/i&gt;<\/h1>/.test(b) && /In the beginning was the test/.test(b));
});

/* ---- Downloading ---- */

test('only Final Transcripts go in; the message says what was saved, what was left out, and what the PDF could not draw', async () => {
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1', { corrected: 'Sh' + MACRON + 'l' + MACRON + 'm from ' + ALEPH + '.', verses: [] }), g2: guideDoc('Luke – Chapter 2', { approvedAt: 0 }), g3: guideDoc('Luke – Chapter 3') });
  await P.ev('exportTranscripts')(); await settle();
  assert.strictEqual(P.saved.length, 1);
  assert.strictEqual(P.saved[0].filename, 'Luke transcripts.pdf');
  const pdf = readPdf(P.saved[0].data, P.ev('cp1252'));
  assert.deepStrictEqual(pdf.outline, ['Luke – Chapter 1', 'Luke – Chapter 3'], 'the one not approved is not in it');
  const said = P.ev('exportResult').text;
  assert.ok(/^Saved 2 Final Transcripts as one PDF, 2 pages: Luke transcripts\.pdf\./.test(said), said);
  assert.ok(/1 guide not yet approved was left out\./.test(said));
  assert.ok(/3 letters the PDF’s fonts do not have were drawn as the plain letter \(1 as “\?”\)\. The web page keeps every letter as written\./.test(said), said);
  assert.ok(P.root.innerHTML.includes('Saved 2 Final Transcripts') && /Download the Final Transcripts/.test(P.root.innerHTML));
  // The other three choices.
  P.ev('exportSplit = "guide"'); await P.ev('exportTranscripts')(); await settle();
  assert.strictEqual(P.saved[1].filename, 'Luke transcripts (pdf).zip');
  assert.ok(/as a PDF each, inside Luke transcripts \(pdf\)\.zip\./.test(P.ev('exportResult').text));
  P.ev('exportKind = "html"'); await P.ev('exportTranscripts')(); await settle();
  assert.strictEqual(P.saved[2].filename, 'Luke transcripts (html).zip');
  assert.ok(!/fonts/.test(P.ev('exportResult').text), 'a web page has nothing it could not draw');
  P.ev('exportSplit = "book"'); await P.ev('exportTranscripts')(); await settle();
  assert.strictEqual(P.saved[3].filename, 'Luke transcripts.html');
  assert.ok(/as one web page: Luke transcripts\.html\./.test(P.ev('exportResult').text));
});

test('nothing approved, no way to save, a save declined or refused: each is said plainly and nothing is half-done', async () => {
  const none = await bookWith({ g1: guideDoc('Luke – Chapter 1', { approvedAt: 0 }) });
  await none.ev('exportTranscripts')(); await settle();
  assert.ok(/No guide has been approved/.test(none.ev('exportResult').error) && none.saved.length === 0);
  assert.ok(/data-action="export-transcripts" disabled/.test(none.root.innerHTML), 'and the button is off to begin with');
  const P = await bookWith({ g1: guideDoc('Luke – Chapter 1') });
  P.ctl.fail = { code: 'declined' };
  await P.ev('exportTranscripts')(); await settle();
  assert.strictEqual(P.ev('exportResult'), null, 'saying no is not an error');
  P.ctl.fail = { code: 'rejected_extension' };
  await P.ev('exportTranscripts')(); await settle();
  assert.ok(/doesn’t allow that kind of file/.test(P.ev('exportResult').error));
  P.ctl.fail = { code: 'unavailable', message: 'busy' };
  await P.ev('exportTranscripts')(); await settle();
  assert.ok(/Couldn’t save the file: busy/.test(P.ev('exportResult').error));
  assert.strictEqual(P.ev('exportBusy'), false);
  const Q = await bookWith({ g1: guideDoc('Luke – Chapter 1') }, 'Luke', true);
  await Q.ev('exportTranscripts')(); await settle();
  assert.ok(/Downloads aren’t available/.test(Q.ev('exportResult').error) && Q.ev('exportBusy') === false);
  assert.deepStrictEqual([P.ev('exportKindOf')('docx'), P.ev('exportKindOf')('html'), P.ev('exportSplitOf')(null), P.ev('exportSplitOf')('guide')], ['pdf', 'html', 'book', 'guide']);
});

test('SECURITY: a guide\'s name or words cannot write commands of their own into the PDF, or a path into a file name', async () => {
  const bad = ') Tj ET BT /F1 99 Tf 0 0 Td (PWNED) Tj ET (', P = await bookWith({ g1: guideDoc(bad + ' ../../etc/x', { corrected: 'Words ' + bad + ' and a back\\slash \\) here.', verses: [] }) }, '../Book: <x>');
  const made = P.ev('exportFile')('pdf', 'book', P.ev('finalSections')(), WHEN);
  assert.strictEqual(made.filename, 'Book x transcripts.pdf');
  const pdf = readPdf(made.data, P.ev('cp1252')), drawn = [].concat(...pdf.pages.map((p) => p));
  assert.ok(!drawn.some((l) => l.size === 99), 'no line was drawn at a size the page never uses');
  assert.ok(drawn.some((l) => /PWNED/.test(l.text) && (l.size === 11 || l.size === 18)), 'the words are there, as words');
  assert.ok(drawn.some((l) => /back\\slash \\\) here\./.test(l.text)));
  assert.ok(!/\/Title \(/.test(pdf.str), 'the title is kept as numbers, never as a string that could be closed');
  const zip = P.ev('exportFile')('html', 'guide', P.ev('finalSections')(), WHEN);
  const names = []; const view = Buffer.from(zip.data).toString('latin1'); const re = /PK\x03\x04[\s\S]{22}([\s\S]{2})[\s\S]{2}/g; let m;
  while ((m = re.exec(view))) names.push(view.substr(m.index + 30, m[1].charCodeAt(0) + m[1].charCodeAt(1) * 256));
  assert.ok(names.length === 1 && !/[\\/:<>|?*"]/.test(names[0]) && !/^\./.test(names[0]), 'the file inside is named safely: ' + names[0]);
});

test('a whole book of long guides is made quickly, and is no larger than it needs to be', async () => {
  const docs = {}, text = Array.from({ length: 30 }, () => 'The teacher goes on at a steady pace through every part of the chapter. '.repeat(7).trim()).join('\n\n');
  for (let i = 1; i <= 60; i++) docs['g' + i] = guideDoc('Luke – Chapter ' + i, { corrected: text, verses: [] });
  const P = await bookWith(docs), t = process.hrtime.bigint();
  const made = P.ev('exportFile')('pdf', 'book', P.ev('finalSections')(), WHEN);
  const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(ms < 4000, 'made in ' + Math.round(ms) + ' ms');
  assert.ok(made.data.length < text.length * 60 * 1.6, 'about the size of its words');
  assert.strictEqual(readPdf(made.data, P.ev('cp1252')).outline.length, 60);
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ok  ' + name); }
    catch (err) { failed += 1; console.log('FAIL  ' + name + '\n      ' + String(err && err.stack || err).split('\n').slice(0, 7).join('\n      ')); }
  }
  console.log('\n' + (tests.length - failed) + ' checks passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  process.exit(failed ? 1 : 0);
})();
