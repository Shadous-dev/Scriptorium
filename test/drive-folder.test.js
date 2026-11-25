#!/usr/bin/env node
/*
 * drive-folder.test.js — checks sending a book's files to one Google Drive
 * folder (SOURCE-OF-TRUTH 4.11): every kind ticked lands in the one folder
 * named, each as a new file, and nothing in Drive is read, edited or deleted.
 *
 *   node test/drive-folder.test.js
 *
 * No dependencies and no call to Google: the connectors are stand-ins that
 * answer the way the real ones were seen to on 2026-11-24.
 */
const assert = require('assert');
const { makeStore, makePage, settle } = require('./whole-page');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const now = 1795600000000;
const FOLDER = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const FOLDER_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const SRT = '1\n00:00:00,000 --> 00:00:02,000\nwelcome back my friends\n\n2\n00:00:02,000 --> 00:00:04,000\ntoday we open the chapter\n';
const TEXT = 'Welcome back, my friends. Today we open the chapter.';
const guide = (name, more) => Object.assign({ name, raw: 'welcome back my friends today we open the chapter', corrected: TEXT, editedFromRaw: 'welcome back my friends today we open the chapter', hasEditedFrom: true, summary: '', changeCount: 0,
  misheard: [], nonsensical: [], edits: [], unapplied: [], verses: [], method: 'edits', status: 'edited', error: '', editedAt: now, descriptId: '', descriptName: '', suggested: [], misquotes: [], approvedAt: now, writtenId: '', writtenUsed: null }, more || {});

// Stand-ins for the Google Drive and Google Docs connectors. Every call is kept, and a test can make any fail.
function google(opts) {
  opts = opts || {};
  const calls = []; let made = 0;
  const servers = [{ server: 'Google Drive', tools: [{ name: 'create_file' }, { name: 'read_file_content' }, { name: 'search_files' }] }];
  if (!opts.noDocs) servers.push({ server: 'Google Docs', tools: [{ name: 'read_doc' }, { name: 'update_doc' }] });
  return { calls, listTools: () => Promise.resolve({ servers: opts.noDrive ? [] : servers }),
    callTool: (server, tool, input) => {
      calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)) });
      const err = opts.fail && opts.fail({ server, tool, input }, calls.length);
      if (err) return Promise.reject(err);
      if (tool === 'create_file') { made += 1; const folder = input.contentMimeType === 'application/vnd.google-apps.folder'; return Promise.resolve({ payload: { id: 'made' + made, title: input.title, viewUrl: 'https://drive.google.com/' + (folder ? 'drive/folders/' : 'file/d/') + 'made' + made + 'xxxxxxxxxxxxxxxxxxxx' } }); }
      if (tool === 'update_doc') {
        const answers = (input.requests || []).map((r, i) => (r.addDocumentTab ? { addDocumentTab: { tabProperties: { index: i + 1, tabId: 't.new' + (i + 1), title: r.addDocumentTab.tabProperties.title } } } : {}));
        return Promise.resolve({ payload: { replies: [{ api_replies: answers, errors: [], warnings: [] }] } });
      }
      return Promise.reject({ code: 'tool_error' });
    } };
}
async function bookWith(docs, G, captions) {
  const S = makeStore(), opts = { caps: { mcp: G } };
  S.store.set('books/b1', { bookTitle: 'Luke', wordsToSearchFor: '', order: Object.keys(docs), nextId: 99, lastEditAt: now, createdAt: now, touchedAt: now, lastDoc: null });
  Object.keys(docs).forEach((id) => { S.store.set('books/b1/scripts/' + id, docs[id]); if (!captions || captions.includes(id)) S.store.set('books/b1/captions/' + id, { srt: SRT }); });
  const P = makePage(S, opts);
  P.ev('initStore')(); await settle(); await P.ev('openBook')('b1'); await settle();
  P.ev('bulkWait = function () { return Promise.resolve(); }');                 // no real waiting in a test
  return P;
}
const kinds = (P, list) => P.ev('driveKinds = ' + JSON.stringify(Object.fromEntries(['doc', 'srt', 'vtt', 'pdf', 'html'].map((k) => [k, list.includes(k)]))));
const creates = (G) => G.calls.filter((c) => c.tool === 'create_file');

test('every kind ticked lands in the one folder named: the Google Doc, each caption file, the PDF and the web page', async () => {
  const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2') }, G);
  kinds(P, ['doc', 'srt', 'vtt', 'pdf', 'html']); P.ev('setDriveLink')(FOLDER);
  await P.ev('sendToDrive')(); await settle();
  const made = creates(G);
  assert.deepStrictEqual(made.map((c) => c.input.title), ['Luke — Audio Guide Transcripts', 'Luke – Chapter 1.srt', 'Luke – Chapter 2.srt', 'Luke – Chapter 1.vtt', 'Luke – Chapter 2.vtt', 'Luke transcripts.pdf', 'Luke transcripts.html']);
  made.forEach((c) => assert.strictEqual(c.input.parentId, FOLDER_ID, c.input.title + ' goes into the folder that was named'));
  assert.ok(!made.some((c) => c.input.contentMimeType === 'application/vnd.google-apps.folder'), 'no folder is made when one was named');
  // Caption files and the web page are kept as they are, not turned into Google Docs.
  const srt = made[1].input;
  assert.deepStrictEqual([srt.contentMimeType, srt.disableConversionToGoogleType], ['text/plain', true]);
  assert.ok(/^1\n00:00:00,000 --> 00:00:0\d,\d{3}\n/.test(srt.textContent) && /Welcome back/.test(srt.textContent), 'the corrected words on Descript\'s timings');
  assert.ok(/^WEBVTT/.test(made[3].input.textContent));
  const pdf = made[5].input;
  assert.deepStrictEqual([pdf.contentMimeType, pdf.disableConversionToGoogleType, 'textContent' in pdf], ['application/pdf', true, false]);
  assert.ok(Buffer.from(pdf.base64Content, 'base64').toString('latin1').startsWith('%PDF-1.4\n') && Buffer.from(pdf.base64Content, 'base64').toString('latin1').endsWith('%%EOF\n'), 'the PDF arrives whole');
  assert.deepStrictEqual([made[6].input.contentMimeType, made[6].input.disableConversionToGoogleType, made[6].input.textContent.startsWith('<!doctype html>')], ['text/html', true, true]);
  // The Google Doc is the same tabbed Doc as before, made in the folder.
  assert.strictEqual(made[0].input.contentMimeType, 'application/vnd.google-apps.document');
  assert.ok(G.calls.some((c) => c.tool === 'update_doc' && c.input.documentId === 'made1'));
  const r = P.ev('driveSend').report, said = P.ev('driveReportText')(r).join(' ');
  assert.strictEqual(P.ev('driveSend').step, 'done');
  assert.ok(/^Sent to your Google Drive folder: one Google Doc with 2 tabs, 2 \.srt files, 2 \.vtt files, 1 PDF, 1 web page\./.test(said), said);
  assert.ok(P.root.innerHTML.includes('href="' + FOLDER + '"') && /Open the folder/.test(P.root.innerHTML));
});

test('with no folder named, one is made for the book first, everything goes into it, and the next send goes to the same place', async () => {
  const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1') }, G);
  kinds(P, ['doc', 'srt', 'vtt']);
  await P.ev('sendToDrive')(); await settle();
  const made = creates(G);
  assert.deepStrictEqual([made[0].input.title, made[0].input.contentMimeType, 'parentId' in made[0].input], ['Luke — transcripts and captions', 'application/vnd.google-apps.folder', false]);
  made.slice(1).forEach((c) => assert.strictEqual(c.input.parentId, 'made1'));
  assert.strictEqual(made.length, 4);
  assert.ok(/^Sent to a new Google Drive folder: one Google Doc with 1 tab, 1 \.srt file, 1 \.vtt file\./.test(P.ev('driveReportText')(P.ev('driveSend').report).join(' ')));
  assert.ok(/\/drive\/folders\/made1/.test(P.ev('driveLink')()), 'the new folder\'s link is in the box');
  await P.ev('sendToDrive')(); await settle();
  assert.strictEqual(creates(G).filter((c) => c.input.contentMimeType === 'application/vnd.google-apps.folder').length, 1, 'a second folder is not made');
});

test('4.11: only new files are made, and only in that folder — nothing is read, searched, moved or deleted, and no other Doc is written to', async () => {
  const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2') }, G);
  kinds(P, ['doc', 'srt', 'vtt', 'pdf', 'html']); P.ev('setDriveLink')(FOLDER);
  await P.ev('sendToDrive')(); await settle();
  assert.deepStrictEqual(Array.from(new Set(G.calls.map((c) => c.server + ':' + c.tool))).sort(), ['Google Docs:update_doc', 'Google Drive:create_file']);
  const docId = 'made1';
  G.calls.filter((c) => c.tool === 'update_doc').forEach((c) => assert.strictEqual(c.input.documentId, docId, 'the only Doc written to is the one just made'));
  creates(G).forEach((c) => assert.ok(!('pregeneratedId' in c.input) && !('fileId' in c.input)));
});

test('the three ways of making the Google Doc all go into the folder; one Doc per guide makes no folder of its own', async () => {
  for (const mode of ['tabs', 'one', 'perScript']) {
    const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2') }, G);
    kinds(P, ['doc']); P.ev('setDriveLink')(FOLDER); P.ev('docMode = "' + mode + '"');
    await P.ev('sendToDrive')(); await settle();
    const made = creates(G);
    assert.strictEqual(made.length, mode === 'perScript' ? 2 : 1, mode);
    made.forEach((c) => assert.strictEqual(c.input.parentId, FOLDER_ID, mode));
    assert.ok(!made.some((c) => c.input.contentMimeType === 'application/vnd.google-apps.folder'), mode);
    const said = P.ev('driveReportText')(P.ev('driveSend').report)[0];
    assert.ok(mode === 'tabs' ? /one Google Doc with 2 tabs/.test(said) : mode === 'one' ? /one Google Doc\./.test(said) : /2 Google Docs/.test(said), said);
    if (mode === 'perScript') assert.ok(/in the folder you chose/.test(P.root.innerHTML));
  }
});

test('only Final Transcripts go into the Google Doc, PDF and web page; caption files do not wait for approval; the message says what was left', async () => {
  const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2', { approvedAt: 0 }), g3: guide('Luke – Chapter 3') }, G, ['g1', 'g2']);
  kinds(P, ['doc', 'srt', 'pdf']); P.ev('setDriveLink')(FOLDER); P.ev('exportSplit = "guide"');
  await P.ev('sendToDrive')(); await settle();
  assert.deepStrictEqual(creates(G).map((c) => c.input.title), ['Luke — Audio Guide Transcripts', 'Luke – Chapter 1.srt', 'Luke – Chapter 2.srt', 'Luke – Chapter 1.pdf', 'Luke – Chapter 3.pdf']);
  const tabs = G.calls.filter((c) => c.tool === 'update_doc')[0].input.requests.map((r) => r.addDocumentTab.tabProperties.title);
  assert.deepStrictEqual(tabs, ['Luke – Chapter 3'], 'the guide not approved has no tab');
  const said = P.ev('driveReportText')(P.ev('driveSend').report).join(' ');
  assert.ok(/1 guide not yet approved is not in the Google Doc, PDF or web page\./.test(said) && /1 guide had no caption files ready\./.test(said), said);
});

test('what is asked for is checked before anything is sent: nothing ticked, a link that is not a folder, nothing ready', async () => {
  const G = google(), P = await bookWith({ g1: guide('Luke – Chapter 1', { approvedAt: 0 }) }, G, []);
  kinds(P, []); await P.ev('sendToDrive')(); await settle();
  assert.ok(/Tick at least one kind/.test(P.ev('driveSend').error));
  kinds(P, ['doc', 'srt']); P.ev('setDriveLink')('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit');
  await P.ev('sendToDrive')(); await settle();
  assert.ok(/doesn’t look like a link to a Google Drive folder/.test(P.ev('driveSend').error));
  P.ev('setDriveLink')('not a link at all'); await P.ev('sendToDrive')(); await settle();
  assert.ok(/doesn’t look like a link to a Google Drive folder/.test(P.ev('driveSend').error));
  P.ev('setDriveLink')(FOLDER); await P.ev('sendToDrive')(); await settle();
  assert.ok(/Nothing is ready to send yet/.test(P.ev('driveSend').error));
  assert.strictEqual(G.calls.length, 0, 'Google was not called once');
  assert.ok(/Nothing is ready to send yet/.test(P.root.innerHTML));
});

test('one file that cannot be sent is named and the rest still go; a busy Drive is tried again', async () => {
  let busy = 0;
  const G = google({ fail: ({ input }) => (input.title === 'Luke – Chapter 2.srt' ? { code: 'tool_error' } : input.title === 'Luke – Chapter 1.vtt' && busy++ < 2 ? { code: 'rate_limited' } : null) });
  const P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2') }, G);
  kinds(P, ['srt', 'vtt']); P.ev('setDriveLink')(FOLDER);
  await P.ev('sendToDrive')(); await settle();
  const r = P.ev('driveSend').report;
  assert.deepStrictEqual([r.sent, r.failed, r.counts], [3, ['Luke – Chapter 2.srt'], { srt: 1, vtt: 2 }]);
  assert.strictEqual(creates(G).filter((c) => c.input.title === 'Luke – Chapter 1.vtt').length, 3, 'asked again until Drive answered');
  assert.ok(/1 could not be sent: Luke – Chapter 2\.srt\./.test(P.ev('driveReportText')(r).join(' ')) && !P.ev('driveSend').error);
});

test('a folder that takes nothing, or a Drive that is not connected or not allowed, stops at once with the fix', async () => {
  const refuse = google({ fail: () => ({ code: 'tool_error' }) });
  const P = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2'), g3: guide('Luke – Chapter 3') }, refuse);
  kinds(P, ['srt', 'vtt']); P.ev('setDriveLink')(FOLDER);
  await P.ev('sendToDrive')(); await settle();
  assert.strictEqual(refuse.calls.length, 3, 'three refusals, not six');
  assert.ok(/would not add files to that folder/.test(P.ev('driveSend').error));
  for (const [opts, said] of [[{ fail: () => ({ code: 'needs_reauth' }) }, /needs reconnecting/], [{ fail: () => ({ code: 'consent_required' }) }, /wasn’t allowed to add files/], [{ noDrive: true }, /isn’t connected for you yet/]]) {
    const G = google(opts), Q = await bookWith({ g1: guide('Luke – Chapter 1') }, G);
    kinds(Q, ['doc', 'srt', 'vtt']); Q.ev('setDriveLink')(FOLDER);
    await Q.ev('sendToDrive')(); await settle();
    assert.ok(said.test(Q.ev('driveSend').error), Q.ev('driveSend').error);
    assert.ok(G.calls.length <= 1, 'it did not go on to try every file');
    assert.strictEqual(Q.ev('driveSend').step, 'done');
  }
  // No way to reach connectors at all in this view.
  const S = await bookWith({ g1: guide('Luke – Chapter 1') }, null);
  kinds(S, ['srt']); S.ev('setDriveLink')(FOLDER); await S.ev('sendToDrive')(); await settle();
  assert.ok(/can’t be reached from this view/.test(S.ev('driveSend').error));
});

test('the Google Doc failing does not stop the files; stopping part-way keeps what was sent', async () => {
  const G = google({ fail: ({ input }) => (input.contentMimeType === 'application/vnd.google-apps.document' ? { code: 'tool_error' } : null) });
  const P = await bookWith({ g1: guide('Luke – Chapter 1') }, G);
  kinds(P, ['doc', 'srt']); P.ev('setDriveLink')(FOLDER); P.ev('docMode = "one"'); P.ev('docMode = "tabs"');
  await P.ev('sendToDrive')(); await settle();
  const r = P.ev('driveSend').report;
  assert.deepStrictEqual([r.sent, r.doc, r.failed], [1, '', ['the Google Doc']]);
  // Stop after the first file.
  const H = google(), Q = await bookWith({ g1: guide('Luke – Chapter 1'), g2: guide('Luke – Chapter 2'), g3: guide('Luke – Chapter 3') }, H);
  kinds(Q, ['srt']); Q.ev('setDriveLink')(FOLDER);
  H.callToolReal = H.callTool; H.callTool = (a, b, c) => H.callToolReal(a, b, c).then((x) => { Q.ev('driveSend').stop = true; return x; });
  await Q.ev('sendToDrive')(); await settle();
  assert.deepStrictEqual([Q.ev('driveSend').report.sent, Q.ev('driveSend').report.stopped], [1, true]);
  assert.ok(/Stopped before the end/.test(Q.ev('driveReportText')(Q.ev('driveSend').report).join(' ')));
});

test('SECURITY: file names are safe, a folder link is shown only as an https link, and what is ticked is read strictly', async () => {
  const G = google(), P = await bookWith({ g1: guide('../../evil: <b>name</b>?') }, G);
  kinds(P, ['srt', 'pdf']); P.ev('exportSplit = "guide"'); P.ev('setDriveLink')('javascript:alert(1)//drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  await P.ev('sendToDrive')(); await settle();
  creates(G).forEach((c) => assert.ok(!/[\\/:<>|?*"]/.test(c.input.title) && !/^\./.test(c.input.title), 'safe name: ' + c.input.title));
  assert.strictEqual(creates(G)[0].input.parentId, FOLDER_ID, 'only the folder\'s id is taken from what was pasted');
  assert.ok(!/href="javascript/i.test(P.root.innerHTML), 'what was pasted is never made a link unless it is https');
  assert.strictEqual(P.ev('driveSend').report.folderUrl, '');
  assert.deepStrictEqual(P.ev('driveKindsOf')({ doc: 'yes', srt: 1, vtt: true, constructor: true }), { doc: false, srt: false, vtt: true, pdf: false, html: false });
  assert.deepStrictEqual(P.ev('driveKindsOf')(null), { doc: true, srt: true, vtt: true, pdf: false, html: false });
  assert.ok(/Send it all to one Google Drive folder/.test(P.root.innerHTML) && !/<b>name<\/b>/.test(P.root.innerHTML));
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
