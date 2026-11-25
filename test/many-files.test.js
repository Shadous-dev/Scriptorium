#!/usr/bin/env node
/*
 * many-files.test.js — checks bringing in many written-script files from the
 * computer at once: each kind of file read in the page (4.6: none of it calls
 * Claude), each kept under its own title, and a file that cannot be read named
 * with the reason while the rest still come in.
 *
 *   node test/many-files.test.js
 *
 * No dependencies. The PDF library is a stand-in here: the real one is fetched
 * from a CDN in the browser, which a test must not do.
 */
const assert = require('assert');
const zlib = require('zlib');
const { makeStore, makePage, settle } = require('./whole-page');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const B = String.fromCharCode(92);                       // one backslash, so no escape in this file can be misread
const bytesOf = (text) => new Uint8Array(Buffer.from(text, 'latin1'));
const buf = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

function deflatedZip(name, text) {
  const raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), nameBytes = Buffer.from(name, 'utf8');
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(raw.length, 22); local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(raw.length, 24); central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + nameBytes.length, 12); end.writeUInt32LE(30 + nameBytes.length + data.length, 16);
  return new Uint8Array(Buffer.concat([local, nameBytes, data, central, nameBytes, end]));
}

const DOCX_XML = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>Luke 24 from Word</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Welcome back, </w:t></w:r><w:r><w:t>friends.</w:t></w:r></w:p></w:body></w:document>';
const ODT_XML = '<?xml version="1.0"?><office:document-content><office:body><office:text>' +
  '<text:tracked-changes><text:changed-region><text:deletion><text:p>words that were deleted</text:p></text:deletion></text:changed-region></text:tracked-changes>' +
  '<text:h text:outline-level="1">Luke 24</text:h>' +
  '<text:p text:style-name="P1">He said,<text:s/>&quot;caf&#233;&quot; <text:span text:style-name="T1">na&#239;ve</text:span><text:tab/>end' +
  '<office:annotation office:name="c1"><dc:creator>Someone</dc:creator><text:p>a comment in the margin</text:p></office:annotation><office:annotation-end office:name="c1"/> here</text:p>' +
  '<text:p>Second<text:line-break/>line &amp; more</text:p></office:text></office:body></office:document-content>';
const ODT_TEXT = 'Luke 24\nHe said, "café" naïve\tend here\nSecond\nline & more\n';
// Rich text, written with ~ for each backslash.
const RTF = ('{~rtf1~ansi~ansicpg1252~deff0{~fonttbl{~f0 Helvetica;}}{~colortbl;~red0~green0~blue0;}{~*~generator Test 1.0;}~f0~fs24 Luke 24~par He said, ~ldblquote caf~\'e9~rdblquote  and it~\'92s na~u239?ve ~u8212- done.~par ' +
  '{~b Bold} ~{braces~} and a back~~slash.~line Next~tab end {~*~bkmkstart x}{~pict~picw1 ffff00}~u-10179?~u-8886?}').replace(/~/g, B);
const RTF_TEXT = 'Luke 24\nHe said, “café” and it’s naïve — done.\nBold {braces} and a back' + B + 'slash.\nNext\tend ' + String.fromCodePoint(0x1F54A);

// Stand-ins for what the browser hands over when files are chosen.
const textFile = (name, text, more) => Object.assign({ name, size: Buffer.byteLength(text), type: 'text/plain', text: () => Promise.resolve(text) }, more || {});
const binFile = (name, u8, type) => ({ name, size: u8.length, type: type || '', arrayBuffer: () => Promise.resolve(buf(u8)) });
// A stand-in for pdf.js: a "PDF" here is JSON listing each page's pieces of text.
function pdfStub(calls) {
  return (el, window) => {
    if (/pdf\.min\.js$/.test(el.src)) {
      window.pdfjsLib = { getDocument: (opts) => {
        calls.push(opts);
        const pages = JSON.parse(Buffer.from(opts.data).toString('utf8'));
        return { promise: Promise.resolve({ numPages: pages.length, destroy: () => {}, getPage: (n) => Promise.resolve({ getTextContent: () => Promise.resolve({ items: pages[n - 1] }) }) }) };
      } };
    } else window.pdfjsWorker = { WorkerMessageHandler: {} };
    el.onload();
  };
}
const pdfFile = (name, pages) => binFile(name, new Uint8Array(Buffer.from(JSON.stringify(pages), 'utf8')), 'application/pdf');
const line = (str, y, h) => ({ str, transform: [1, 0, 0, 1, 72, y], height: h || 12 });
const PDF_PAGES = [[line('Luke 24 from a PDF', 700, 20), line('Welcome back, friends. This is a long line that', 660), line(' ', 660), line('runs on to the next line and is hyphen-', 646), line('ated across a break.', 632), line('A new paragraph starts here.', 600)],
                   [line('And a second page.', 700)]];
const PDF_TEXT = 'Luke 24 from a PDF\n\nWelcome back, friends. This is a long line that runs on to the next line and is hyphen-ated across a break.\n\nA new paragraph starts here.\n\nAnd a second page.';

async function writtenPage(S, opts) {
  const P = makePage(S, opts);
  P.ev('initStore')(); await settle();
  await P.ev('openWritten')(); await settle();
  return P;
}

/* ---- Each kind of file ---- */

test('an OpenDocument file is read for its words: headings and paragraphs, spaces, tabs and line breaks; deletions and comments left out', async () => {
  const P = makePage();
  assert.strictEqual(P.ev('odtXmlToText')(ODT_XML), ODT_TEXT);
  assert.strictEqual(await P.ev('odtText')(buf(deflatedZip('content.xml', ODT_XML))), ODT_TEXT);
  await assert.rejects(P.ev('odtText')(buf(deflatedZip('other.xml', ODT_XML))));
  assert.strictEqual(P.ev('cutBlocks')('a<x:note>gone</x:note>b<x:note-end/>c<x:note >gone too</x:note>d', 'x:note'), 'ab<x:note-end/>cd');
  assert.strictEqual(P.ev('cutBlocks')('a<x:note>never closed', 'x:note'), 'a<x:note>never closed', 'a block that never closes is left as it is');
});

test('a rich-text file is read for its words: paragraphs, quotes, accents, dashes and an emoji; fonts, colours and pictures left out', () => {
  const P = makePage(), rtf = P.ev('rtfText');
  assert.strictEqual(rtf(bytesOf(RTF)), RTF_TEXT);
  assert.throws(() => rtf(bytesOf('not rich text at all')));
  assert.strictEqual(rtf(bytesOf(('{~rtf1 a~uc2~u8217??b ~uc0~u233 c}').replace(/~/g, B))), 'a’b éc', 'the stand-in after a character is as long as the file says');
  const big = '{' + B + 'rtf1 ' + ('word ' + B + 'par ').repeat(60000) + '}';
  const t = process.hrtime.bigint(); rtf(bytesOf(big)); assert.ok(Number(process.hrtime.bigint() - t) / 1e6 < 3000, 'a long file is read in one pass');
});

test('a page of a PDF: lines run together into paragraphs, a wide gap starts a new one, a broken word keeps its hyphen', () => {
  const P = makePage(), page = P.ev('pdfPageText');
  assert.strictEqual(page(PDF_PAGES[0]), PDF_TEXT.split('\n\nAnd a second')[0]);
  assert.strictEqual(page([]), '');
  assert.strictEqual(page([{ str: 'no position' }, { str: ' given' }]), 'no position given');
  assert.strictEqual(page(null), '');
});

test('a PDF is read with pdf.js, fetched only when one is chosen, from the pinned version on cdnjs', async () => {
  const calls = [], P = makePage(makeStore(), { loadScript: pdfStub(calls) });
  assert.deepStrictEqual(P.opts.scripts, [], 'nothing is fetched until a PDF is chosen');
  assert.strictEqual(await P.ev('readFileText')(pdfFile('Luke 24.pdf', PDF_PAGES)), PDF_TEXT);
  assert.deepStrictEqual(P.opts.scripts, ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js']);
  assert.deepStrictEqual([calls[0].isEvalSupported, calls[0].disableFontFace], [false, true], 'it is asked not to build code or load fonts');
  await P.ev('readFileText')(pdfFile('again.pdf', PDF_PAGES));
  assert.strictEqual(P.opts.scripts.length, 2, 'the library is fetched once');
  // Pictures of pages: no words in it.
  await assert.rejects(P.ev('readFileText')(pdfFile('scan.pdf', [[], [line(' ', 700)]])), (e) => e.code === 'scanned');
  // The library cannot be fetched in this view.
  const Q = makePage(makeStore(), { loadScript: (el) => el.onerror() });
  await assert.rejects(Q.ev('readFileText')(pdfFile('Luke 24.pdf', PDF_PAGES)), (e) => e.code === 'pdf_lib');
  await assert.rejects(Q.ev('readFileText')(pdfFile('Luke 24.pdf', PDF_PAGES)), (e) => e.code === 'pdf_lib');
  assert.strictEqual(Q.opts.scripts.length, 2, 'a second try asks for it again');
});

test('each kind of file is told from its name; a kind that cannot be read is refused with what to do', async () => {
  const P = makePage(), kind = P.ev('fileKind'), read = P.ev('readFileText'), why = P.ev('fileProblem');
  assert.deepStrictEqual(['a.DOCX', 'b.pdf', 'c.odt', 'd.rtf', 'e.txt', 'f.md', 'g.doc', 'h.pages', 'i.xyz', 'noext'].map((n) => kind({ name: n, type: '' })), ['docx', 'pdf', 'odt', 'rtf', 'text', 'text', 'doc', 'pages', '', '']);
  assert.strictEqual(kind({ name: 'noext', type: 'text/plain' }), 'text');
  assert.strictEqual(kind({ name: 'noext', type: 'application/pdf' }), 'pdf');
  await assert.rejects(read({ name: 'old.doc', size: 10 }), (e) => e.code === 'doc' && /save it as \.docx or PDF/.test(why(e)));
  await assert.rejects(read({ name: 'notes.pages', size: 10 }), (e) => e.code === 'pages' && /Export it from Pages/.test(why(e)));
  await assert.rejects(read({ name: 'thing.xyz', size: 10 }), (e) => e.code === 'kind');
  await assert.rejects(read({ name: 'huge.txt', size: 9e6, type: 'text/plain' }), (e) => e.code === 'big');
  await assert.rejects(read({ name: 'huge.pdf', size: 31e6 }), (e) => e.code === 'big');
  assert.strictEqual(P.ev('titleFromName')('Luke_24_Jones.pdf'), 'Luke 24 Jones');
  assert.strictEqual(P.ev('titleFromName')('Job 3.final.rtf'), 'Job 3.final');
});

/* ---- Many at once ---- */

function mixedFiles() {
  return [
    textFile('Luke 1.txt', 'Welcome to Luke one.\r\n'),
    textFile('Luke_2_Jones.md', 'Welcome to Luke two.'),
    binFile('Luke 3.docx', deflatedZip('word/document.xml', DOCX_XML)),
    binFile('Luke 4.odt', deflatedZip('content.xml', ODT_XML)),
    binFile('Luke 5.rtf', bytesOf(RTF)),
    pdfFile('Luke 6.pdf', PDF_PAGES),
    pdfFile('Luke 7 scan.pdf', [[]]),
    { name: 'Luke 8.doc', size: 100, type: 'application/msword' },
    { name: 'Luke 9.pages', size: 100, type: '' },
    textFile('empty.txt', '   \n  '),
  ];
}

test('ten mixed files in one go: each readable one is listed under its own title, and each that is not is named with the reason', async () => {
  const S = makeStore(), P = await writtenPage(S, { loadScript: pdfStub([]) });
  await P.ev('readWrittenFiles')(mixedFiles()); await settle();
  const f = P.ev('writtenFiles');
  assert.strictEqual(f.step, 'review');
  assert.deepStrictEqual(f.items.map((it) => [it.title, it.state, it.pick]), [
    ['Luke 1', 'ready', true], ['Luke 2 Jones', 'ready', true], ['Luke 3', 'ready', true], ['Luke 4', 'ready', true], ['Luke 5', 'ready', true], ['Luke 6', 'ready', true],
    ['Luke 7 scan', 'failed', false], ['Luke 8', 'failed', false], ['Luke 9', 'failed', false], ['empty', 'failed', false]]);
  assert.ok(/scanned PDF/.test(f.items[6].why) && /older Word file/.test(f.items[7].why) && /Pages file/.test(f.items[8].why) && /nothing in it/.test(f.items[9].why));
  assert.strictEqual(S.ctl.sets.length, 0, 'nothing is saved until the reader says so');
  const html = P.root.innerHTML;
  assert.ok(/Add files from this computer/.test(html) && /Save 6 written scripts/.test(html) && /matches guides on Luke 3/.test(html) && /Not read: “Luke 8\.doc”/.test(html));
  // A title is changed before saving, and one file is left out.
  P.ev('filesTitleTouched')({ dataset: { n: '2' }, value: 'Luke 3 — Smith' });
  P.ev('filesPick')(1, false);
  await P.ev('saveWrittenFiles')(); await settle();
  const kept = Array.from(S.store.keys()).filter((k) => k.indexOf('written/') === 0).map((k) => S.store.get(k));
  assert.deepStrictEqual(kept.map((d) => d.title).sort(), ['Luke 1', 'Luke 3 — Smith', 'Luke 4', 'Luke 5', 'Luke 6']);
  kept.forEach((d) => assert.deepStrictEqual([d.source, /^file:luke/.test(d.sourceId), Array.isArray(d.terms)], ['file', true, true]));
  const texts = Array.from(S.store.keys()).filter((k) => k.indexOf('writtenText/') === 0).map((k) => S.store.get(k).text).sort();
  assert.deepStrictEqual(texts, ['Luke 24 from Word\nWelcome back, friends.', ODT_TEXT.trim(), PDF_TEXT, RTF_TEXT.trim(), 'Welcome to Luke one.'].sort(), 'every word of every file, and no more');
  assert.strictEqual(f.step, 'review', 'the one left out is still there to save');
  assert.deepStrictEqual(f.items.filter((it) => it.state === 'saved').length, 5);
  assert.ok(/Kept 5 written scripts from 5 files/.test(P.root.innerHTML) && /4 files could not be read/.test(P.root.innerHTML));
  assert.strictEqual(f.items[0].text, '', 'a saved file\'s text is let go');
});

test('a file already in the library is marked and left unticked; ticking it renews its text and keeps its place and title', async () => {
  const S = makeStore(), P = await writtenPage(S);
  await P.ev('readWrittenFiles')([textFile('Luke 1.txt', 'First wording.')]); await settle();
  P.ev('filesTitleTouched')({ dataset: { n: '0' }, value: 'Luke 1 — the teacher\'s own title' });
  await P.ev('saveWrittenFiles')(); await settle();
  const id = P.ev('writtenIndex')[0].id;
  assert.strictEqual(P.ev('writtenFiles').step, 'done');
  P.ev('writtenFiles = null');
  await P.ev('readWrittenFiles')([textFile('LUKE 1.txt', 'Second wording.'), textFile('Luke 2.txt', 'Another.')]); await settle();
  const f = P.ev('writtenFiles');
  assert.deepStrictEqual(f.items.map((it) => [it.state, it.pick, it.title]), [['have', false, 'Luke 1 — the teacher\'s own title'], ['ready', true, 'Luke 2']]);
  assert.ok(/already in the library: ticking it renews its text/.test(P.root.innerHTML));
  P.ev('filesPick')(0, true);
  await P.ev('saveWrittenFiles')(); await settle();
  assert.strictEqual(S.store.get('writtenText/' + id).text, 'Second wording.');
  assert.strictEqual(S.store.get('written/' + id).title, 'Luke 1 — the teacher\'s own title');
  assert.strictEqual(Array.from(S.store.keys()).filter((k) => k.indexOf('written/') === 0).length, 2, 'renewed, not doubled');
  assert.ok(/1 already here and renewed/.test(P.root.innerHTML));
});

test('one file that cannot be saved does not stop the rest; a full store or view-only access stops at once and says so', async () => {
  const S = makeStore(), P = await writtenPage(S);
  await P.ev('readWrittenFiles')([textFile('Luke 1.txt', 'One.'), textFile('Luke 2.txt', 'Two.'), textFile('Luke 3.txt', 'Three.')]); await settle();
  let n = 0;
  S.ctl.failSet = (p) => (p.indexOf('writtenText/') === 0 && ++n === 2 ? { code: 'unavailable' } : null);
  await P.ev('saveWrittenFiles')(); await settle();
  const f = P.ev('writtenFiles');
  assert.deepStrictEqual(f.items.map((it) => it.state), ['saved', 'ready', 'saved']);
  assert.ok(/1 not kept: “Luke 2”/.test(P.root.innerHTML));
  assert.strictEqual(f.items[1].pick, true, 'the one that failed is still ticked, to try again');
  S.ctl.failSet = null;
  await P.ev('saveWrittenFiles')(); await settle();
  assert.deepStrictEqual(f.items.map((it) => it.state), ['saved', 'saved', 'saved']);
  assert.strictEqual(f.step, 'done');
  // A full store: the next would fail the same way, so it stops.
  const Q = await writtenPage(makeStore());
  await Q.ev('readWrittenFiles')([textFile('Luke 1.txt', 'One.'), textFile('Luke 2.txt', 'Two.'), textFile('Luke 3.txt', 'Three.')]); await settle();
  Q.S.ctl.failSet = (p) => (p.indexOf('writtenText/') === 0 ? { code: 'quota_exceeded' } : null);
  await Q.ev('saveWrittenFiles')(); await settle();
  assert.strictEqual(Q.S.ctl.sets.filter((w) => w.path.indexOf('writtenText/') === 0).length, 1, 'one try, not three');
  assert.ok(/storage is full/.test(Q.root.innerHTML) && /Stopped before the end/.test(Q.root.innerHTML));
});

test('a title is needed before saving; a file too long to keep is refused by name; more than a hundred files are taken a hundred at a time', async () => {
  const P = await writtenPage(makeStore());
  await P.ev('readWrittenFiles')([textFile('Luke 1.txt', 'One.'), textFile('long.txt', 'x'.repeat(200001))]); await settle();
  const f = P.ev('writtenFiles');
  assert.ok(f.items[1].state === 'failed' && /too long to keep in one piece/.test(f.items[1].why));
  P.ev('filesTitleTouched')({ dataset: { n: '0' }, value: '   ' });
  await P.ev('saveWrittenFiles')(); await settle();
  assert.ok(/needs a title/.test(f.error) && P.S.ctl.sets.length === 0);
  const many = []; for (let i = 0; i < 130; i++) many.push(textFile('Luke ' + i + '.txt', 'Words ' + i));
  P.ev('writtenFiles = null');
  await P.ev('readWrittenFiles')(many); await settle();
  assert.strictEqual(P.ev('writtenFiles').items.length, 100);
  assert.ok(/Only the first 100 files were taken\. Add the other 30/.test(P.ev('writtenFiles').error));
});

test('SECURITY: a file\'s name and words are shown as text, and a file cannot be added while another panel is open', async () => {
  const bad = '<img src=x onerror=alert(1)>.txt', S = makeStore(), P = await writtenPage(S);
  await P.ev('readWrittenFiles')([textFile(bad, '</textarea><script>alert(1)</script>'), { name: '"><script>x</script>.doc', size: 5 }]); await settle();
  const html = P.root.innerHTML;
  assert.ok(!/<img\b/i.test(html) && !/<script\b/i.test(html) && /&lt;img src=x/.test(html));
  P.ev('writtenFiles = null'); P.ev('startWrittenForm')();
  await P.ev('readWrittenFiles')([textFile('Luke 1.txt', 'One.')]); await settle();
  assert.strictEqual(P.ev('writtenFiles'), null, 'the single form is open: nothing is read over it');
});

test('the single Add form reads the same kinds of file, and remembers which file it was', async () => {
  const S = makeStore(), P = await writtenPage(S, { loadScript: pdfStub([]) });
  P.ev('startWrittenForm')();
  P.ev('readWrittenFile')(pdfFile('Luke 6.pdf', PDF_PAGES)); await settle();
  const form = P.ev('writtenForm');
  assert.deepStrictEqual([form.text, form.source, form.title], [PDF_TEXT, 'file', 'Luke 6']);
  P.ev('readWrittenFile')({ name: 'old.doc', size: 5 }); await settle();
  assert.ok(/older Word file/.test(form.error) && form.text === PDF_TEXT, 'what was there is kept');
  form.error = '';
  P.ev('saveWritten')(); await settle();
  const d = S.store.get('written/' + P.ev('writtenIndex')[0].id);
  assert.deepStrictEqual([d.source, d.sourceId, d.sourceName], ['file', 'file:luke 6.pdf', 'Luke 6.pdf']);
  // So the many-files list knows it is already here.
  await P.ev('readWrittenFiles')([pdfFile('Luke 6.pdf', PDF_PAGES)]); await settle();
  assert.strictEqual(P.ev('writtenFiles').items[0].state, 'have');
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
