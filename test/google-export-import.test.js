#!/usr/bin/env node
/*
 * google-export-import.test.js — checks SOURCE-OF-TRUTH 4.11 and what was added
 * with it: one Google Doc with a tab for each guide, a whole book's caption
 * files in the kind the reader picks, and written scripts brought in many at a
 * time from Google Drive.
 *
 *   node test/google-export-import.test.js
 *
 * No dependencies and no call to Claude, Google or the store: each is a
 * stand-in here. The page's modules are written for the browser (build.js
 * pastes them into one shared scope), so this loads their text the same way.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const load = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', file), 'utf8');
const source = ['02-helpers.js', '03-text.js', '07-fields.js', '08-actions.js', '09-prompts.js', '10-edit-pipeline.js', '12-google-doc.js', '13-captions.js', '14-descript.js', '15-written-scripts.js', '16-references.js'].map(load).join('\n');

function makePage() {
  return new Function(`
    var state = { bookTitle: 'Luke', wordsToSearchFor: '', sections: [], docResult: null, lastDoc: null }, bookId = 'b1', view = 'written', dbStatus = 'ready', flash = null, confirmState = null, dbApi = null, collapsed = {};
    var root = { querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
    var store = new Map(), log = [], mcp = null, failWrites = null, saved = [];
    var dbRoot = {
      doc: function (path) { return {
        get: function () { return Promise.resolve(store.has(path) ? { exists: true, data: function () { return store.get(path); } } : { exists: false }); },
        set: function (d) { if (failWrites) return Promise.reject(failWrites); log.push('set:' + path); store.set(path, JSON.parse(JSON.stringify(d))); return Promise.resolve(); },
        delete: function () { log.push('delete:' + path); store.delete(path); return Promise.resolve(); } }; },
      collection: function (path) { return { limit: function () { return { get: function () {
        var depth = path.split('/').length + 1;
        return Promise.resolve({ docs: Array.from(store.keys()).filter(function (k) { return k.indexOf(path + '/') === 0 && k.split('/').length === depth; }).map(function (k) { return { id: k.split('/').pop(), data: function () { return store.get(k); } }; }) });
      } }; } }; }
    };
    function readAll(path) { return dbRoot.collection(path).limit(1000).get(); }
    function findSection(id) { return state.sections.filter(function (x) { return x.id === id; })[0]; }
    function paint() {} function paintSection() {} function persistCollapsed() {} function syncFieldsFromDom() {}
    function saveSection() { return Promise.resolve(); } function saveMeta() { return Promise.resolve(); } function saveMetaSoon() {} function saveCaptions() { return Promise.resolve(); }
    function openConfirm(opts) { confirmState = opts; }
    function useCap(name) { return Promise.resolve(name === 'mcp' ? mcp : name === 'downloads' ? { save: function (f) { saved.push(f); return Promise.resolve(); } } : null); }
    function noticeHtml() { return ''; } function renderSkeleton() { return ''; } function versionLine() { return ''; } function renderModal() { return ''; }
    function newSection() { return { id: 'n' + state.sections.length, name: '', raw: '', captions: '', descriptId: '' }; }
    ${source}
    function bulkWait() { return Promise.resolve(); }            // no real waiting in a test
    return { state, store, log, saved, captionFiles, downloadAllCaptions, tabRequests, tabIdsOf, tabTitle, docBody, conclude, layoutBlocks, splitWritten, driveTarget, driveFolderFiles,
             openWrittenBulk, listWrittenBulk, startWrittenBulk, bulkPick, renderWrittenBulk, fetchWrittenFromDrive, startWrittenForm, saveWritten, renameWritten, docModeOf, captionFormatOf, WRITTEN_MAX,
             get bulk() { return writtenBulk; }, get index() { return writtenIndex; }, get form() { return writtenForm; }, get flash() { return flash; },
             setMcp: function (m) { mcp = m; }, setDocMode: function (m) { docMode = m; }, setCaptionFormat: function (f) { captionFormat = f; }, setFailWrites: function (e) { failWrites = e; },
             openForRename: function (id) { writtenOpen = { id: id, text: '', loading: false, error: '', title: null, busy: false }; }, renameBox: function (value) { root.querySelector = function () { return { value: value, focus: function () {}, select: function () {} }; }; } };
  `)();
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const settle = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0)); };
let nextId = 1;
const finalGuide = (P, name, corrected, verses) => {
  const s = { id: 'g' + (nextId++), name, raw: corrected, corrected, editedFromRaw: corrected, status: 'edited', edits: [], verses: verses || [], captions: '', writtenId: '', writtenUsed: null, approvedAt: 5 };
  P.state.sections.push(s); return s;
};
const SRT = '1\n00:00:01,000 --> 00:00:03,000\nwelcome back my friends\n\n2\n00:00:03,000 --> 00:00:06,000\nto the land of us\n';
const captioned = (P, name) => Object.assign(finalGuide(P, name, 'Welcome back, my friends, to the land of Uz.'), { captions: SRT });

// A stand-in for Claude's connectors: Google Drive and Google Docs, with every call written down.
function google(opts) {
  opts = opts || {};
  const calls = [];
  const servers = [{ server: 'Google Drive', tools: [{ name: 'create_file' }, { name: 'read_file_content' }, { name: 'search_files' }] }];
  if (!opts.noDocs) servers.push({ server: 'Google Docs', tools: [{ name: 'read_doc' }, { name: 'update_doc' }] });
  let made = 0;
  return {
    calls,
    listTools: () => Promise.resolve({ servers }),
    callTool: (server, tool, input) => {
      calls.push({ server, tool, input: JSON.parse(JSON.stringify(input)) });
      if (opts.fail) { const err = opts.fail({ server, tool, input }); if (err) return Promise.reject(err); }
      if (tool === 'create_file') { made += 1; return Promise.resolve({ payload: { id: 'doc' + made, viewUrl: 'https://docs.google.com/document/d/doc' + made + '/edit' } }); }
      if (tool === 'update_doc') {
        // As Google's connector answered a real Doc on 2026-11-24: a label over 50 characters refuses the whole
        // request, and the answers come back one level down, in replies[0].api_replies.
        const long = (input.requests || []).filter((r) => r.addDocumentTab && r.addDocumentTab.tabProperties.title.length > 50)[0];
        if (long) return Promise.reject({ code: 'tool_error', message: 'The tab title cannot be longer than 50 characters.' });
        const answers = (input.requests || []).map((r, i) => r.addDocumentTab ? { addDocumentTab: { tabProperties: { index: i + 1, tabId: 't.new' + (i + 1), title: r.addDocumentTab.tabProperties.title } } } : {});
        return Promise.resolve({ payload: opts.flatReplies ? { documentId: input.documentId, replies: answers } : { replies: [{ api_replies: answers, errors: [], warnings: [] }], writeControl: { requiredRevisionId: 'rev' } } });
      }
      if (tool === 'search_files') return Promise.resolve({ payload: opts.search ? opts.search(input) : {} });
      if (tool === 'read_file_content') return Promise.resolve(opts.read ? opts.read(input.fileId) : { content: [{ type: 'text', text: '' }] });
      return Promise.reject({ code: 'tool_error' });
    }
  };
}
// Plays a tab's requests against an empty tab the way Google Docs would, far enough to check positions.
function playTab(requests) {
  const insert = requests[0].insertText;
  assert.strictEqual(insert.location.index, 1, 'the text goes in at the start of the tab');
  const body = '\u0000' + insert.text + '\n';                       // index 0 is the section break; the tab ends in one newline
  const slice = (r) => body.slice(r.startIndex, r.endIndex);
  requests.slice(1).forEach((r) => {
    const range = (r.updateParagraphStyle || r.updateTextStyle).range;
    assert.ok(range.startIndex >= 1 && range.endIndex > range.startIndex && range.endIndex <= body.length, 'every range lies inside the tab');
  });
  return { body, slice };
}

/* ---- Caption files for the whole book ---- */

test('the book\'s caption files come in the kind that was picked: both, .srt only, or .vtt only', () => {
  const P = makePage();
  captioned(P, 'Job – Chapter 1'); captioned(P, 'Job – Chapter 2'); finalGuide(P, 'Job – Chapter 3', 'No captions for this one.');
  const names = (format) => P.captionFiles(P.state.sections, true, format).map((f) => f.name);
  assert.deepStrictEqual(names('both'), ['srt/Job – Chapter 1.srt', 'vtt/Job – Chapter 1.vtt', 'srt/Job – Chapter 2.srt', 'vtt/Job – Chapter 2.vtt']);
  assert.deepStrictEqual(names('srt'), ['Job – Chapter 1.srt', 'Job – Chapter 2.srt'], 'one kind needs no folders');
  assert.deepStrictEqual(names('vtt'), ['Job – Chapter 1.vtt', 'Job – Chapter 2.vtt']);
  assert.deepStrictEqual(names(undefined), names('both'), 'no choice means both, as before');
});

test('4.7: whichever kind is picked, the words and Descript\'s timings are the same', () => {
  const P = makePage();
  captioned(P, 'Job – Chapter 1');
  const srt = P.captionFiles(P.state.sections, true, 'srt')[0].text, vtt = P.captionFiles(P.state.sections, true, 'vtt')[0].text;
  assert.ok(/00:00:01,000 --> 00:00:03,000/.test(srt) && /00:00:03,000 --> 00:00:06,000/.test(srt));
  assert.ok(/^WEBVTT/.test(vtt) && /00:00:01\.000 --> 00:00:03\.000/.test(vtt));
  assert.ok(/land of Uz/.test(srt) && /land of Uz/.test(vtt), 'the corrected word, not what Descript heard');
});

test('the whole book downloads as one .zip named for the book and the kind, and says what was left out', async () => {
  const P = makePage();
  captioned(P, 'Job – Chapter 1'); finalGuide(P, 'Job – Chapter 2', 'No captions here.');
  P.state.bookTitle = 'Job';
  P.setCaptionFormat('vtt'); P.downloadAllCaptions(); await settle();
  assert.strictEqual(P.saved.length, 1);
  assert.strictEqual(P.saved[0].filename, 'Job captions (vtt).zip');
  assert.ok(/1 audio guide as caption files — a \.vtt each/.test(P.flash), P.flash);
  assert.ok(/1 guide had no caption files ready and was left out/.test(P.flash), P.flash);
  P.setCaptionFormat('both'); P.downloadAllCaptions(); await settle();
  assert.strictEqual(P.saved[1].filename, 'Job captions.zip');
});

/* ---- One Google Doc, a tab for each guide ---- */

const VERSE = { quote: 'On the first day of the week, very early in the morning, the women took the spices they had prepared and went to the tomb.', canonical: 'Luke 24:1' };
const LUKE24 = 'Welcome back, my friends.\n\n"On the first day of the week, very early in the morning, the women took the spices they had prepared and went to the tomb."\n\nThey came expecting a body. 🙂 What they found changed everything.';

test('a tab\'s requests put the guide\'s name as a heading and every paragraph where its styling points', () => {
  const P = makePage();
  const s = finalGuide(P, 'Luke – Chapter 24', LUKE24, [VERSE]);
  const requests = P.tabRequests(s, 't.abc', 1), tab = playTab(requests);
  const heading = requests[1].updateParagraphStyle;
  assert.strictEqual(tab.slice(heading.range), 'Luke – Chapter 24');
  assert.strictEqual(heading.paragraphStyle.namedStyleType, 'HEADING_1');
  const bold = requests.filter((r) => r.updateTextStyle);
  assert.strictEqual(bold.length, 1, 'one quoted verse, one bold range');
  assert.strictEqual(tab.slice(bold[0].updateTextStyle.range), '"On the first day of the week, very early in the morning, the women took the spices they had prepared and went to the tomb." (Luke 24:1)');
  const indent = requests.filter((r) => r.updateParagraphStyle && /indentStart/.test(r.updateParagraphStyle.fields));
  assert.deepStrictEqual(indent[0].updateParagraphStyle.range, bold[0].updateTextStyle.range, 'the verse is set in as well as bold');
  const gap = requests[requests.length - 1].updateParagraphStyle;
  assert.strictEqual(gap.fields, 'spaceBelow');
  assert.ok(tab.slice(gap.range).startsWith('Welcome back, my friends.') && tab.slice(gap.range).endsWith('changed everything.'), 'the gap covers the transcript and not the heading');
  requests.forEach((r) => { const k = Object.keys(r)[0], at = r[k].range || r[k].location; assert.strictEqual(at.tabId, 't.abc', k + ' names its tab'); });
});

test('4.1: a tab holds the transcript word for word, in order', () => {
  const P = makePage();
  const s = finalGuide(P, 'Luke – Chapter 24', LUKE24, [VERSE]);
  const text = P.tabRequests(s, 't.abc', 0)[0].insertText.text;
  const words = (t) => t.replace(/\(Luke 24:1\)/, '').match(/[\p{L}\p{N}']+/gu);
  assert.deepStrictEqual(words(text.split('\n').slice(1).join(' ')), words(LUKE24));
});

test('the first guide goes into the Doc\'s own first tab: its requests name no tab', () => {
  const P = makePage();
  const s = finalGuide(P, 'Luke – Introduction', 'Welcome to Luke.');
  P.tabRequests(s, '', 0).forEach((r) => { const k = Object.keys(r)[0], at = r[k].range || r[k].location; assert.ok(!('tabId' in at)); });
});

test('one Doc with tabs: an empty Doc from Drive, one call that adds the tabs, then one call for each guide', async () => {
  const P = makePage(), G = google();
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.'); finalGuide(P, 'Luke – Chapter 3', 'Three.');
  P.state.sections.push({ id: 'draft', name: 'Luke – Chapter 4', raw: 'Four.', corrected: 'Four.', editedFromRaw: 'Four.', status: 'edited', verses: [], approvedAt: 0 });
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  assert.deepStrictEqual(G.calls.map((c) => c.tool), ['create_file', 'update_doc', 'update_doc', 'update_doc', 'update_doc', 'update_doc']);
  assert.deepStrictEqual(G.calls[0].input, { title: 'Luke — Audio Guide Transcripts', contentMimeType: 'application/vnd.google-apps.document' });
  assert.deepStrictEqual(G.calls[1].input.requests.map((r) => r.addDocumentTab.tabProperties.title), ['Luke – Chapter 2', 'Luke – Chapter 3'], 'only Final Transcripts get a tab');
  assert.ok(!('tabId' in G.calls[2].input.requests[0].insertText.location), 'the first guide is written into the first tab');
  assert.strictEqual(G.calls[3].input.requests[0].insertText.location.tabId, 't.new1');
  assert.strictEqual(G.calls[4].input.requests[0].insertText.location.tabId, 't.new2');
  assert.ok(/^Luke – Chapter 3\nThree\.$/.test(G.calls[4].input.requests[0].insertText.text));
  assert.deepStrictEqual(G.calls[5].input.requests, [{ updateDocumentTabProperties: { tabProperties: { tabId: 't.0', title: 'Luke – Chapter 1' }, fields: 'title' } }], 'last, the first tab is named for its guide');
  assert.strictEqual(P.state.docResult.tabs, 3);
  assert.strictEqual(P.state.docResult.failed, 0);
  assert.strictEqual(P.state.lastDoc.url, 'https://docs.google.com/document/d/doc1/edit');
});

test('a long guide name: the tab label is cut to the 50 characters Google allows, and the heading keeps every word', async () => {
  const P = makePage(), G = google();
  const long = 'Luke – Chapter 2, which has a very long name on purpose so that the label must be cut';
  finalGuide(P, 'Luke – Chapter 1', 'One.'); const s = finalGuide(P, long, 'Two.');
  assert.ok(P.tabTitle(s, 1).length <= 50 && long.indexOf(P.tabTitle(s, 1)) === 0, 'the label is the start of the name');
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  assert.strictEqual(P.state.docResult.tabs, 2, 'both tabs were written: Google did not refuse the label');
  assert.ok(!P.state.docResult.note, 'and it did not fall back to a page for each guide');
  assert.strictEqual(G.calls.filter((c) => c.tool === 'create_file').length, 1, 'one Doc, not two');
  assert.strictEqual(G.calls[2].input.requests[0].insertText.text.split('\n')[0], 'Luke – Chapter 1');
  assert.strictEqual(G.calls[3].input.requests[0].insertText.text.split('\n')[0], long, 'the heading inside the tab is the whole name');
});

test('a label is never cut through the middle of a character', () => {
  const P = makePage();
  const s = finalGuide(P, 'x'.repeat(49) + '\uD83D\uDD4A' + ' tail', 'One.');
  const label = P.tabTitle(s, 0);
  assert.strictEqual(label, 'x'.repeat(49), 'the half character at the cut is dropped');
});

test('the new tabs\' ids are read from the connector\'s answer, and from Google\'s own shape too', async () => {
  const P = makePage();
  const tab = (id) => ({ addDocumentTab: { tabProperties: { index: 1, tabId: id, title: 'x' } } });
  assert.deepStrictEqual(P.tabIdsOf({ payload: { replies: [{ api_replies: [tab('t.a'), tab('t.b')], errors: [], warnings: [] }] } }), ['t.a', 't.b'], 'as the connector answers');
  assert.deepStrictEqual(P.tabIdsOf({ payload: { replies: [tab('t.a'), tab('t.b')] } }), ['t.a', 't.b'], 'as Google\'s API answers');
  assert.deepStrictEqual(P.tabIdsOf({ payload: { replies: [{ api_replies: [{}, {}] }] } }), [], 'no tabs in the answer: none claimed');
  assert.deepStrictEqual(P.tabIdsOf({ payload: { replies: 'nonsense' } }), []);
  for (const flat of [false, true]) {
    const Q = makePage(), G = google({ flatReplies: flat });
    finalGuide(Q, 'Luke – Chapter 1', 'One.'); finalGuide(Q, 'Luke – Chapter 2', 'Two.');
    Q.setMcp(G); Q.setDocMode('tabs'); Q.conclude(); await settle();
    assert.strictEqual(Q.state.docResult.tabs, 2);
    assert.strictEqual(G.calls[3].input.requests[0].insertText.location.tabId, 't.new1', 'the second guide is written into the tab Google made for it');
  }
});

test('4.11: every write goes to the Doc that was just made, and nothing is read or searched', async () => {
  const P = makePage(), G = google();
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.');
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  G.calls.filter((c) => c.tool === 'update_doc').forEach((c) => assert.strictEqual(c.input.documentId, 'doc1'));
  assert.ok(G.calls.every((c) => c.tool === 'create_file' || c.tool === 'update_doc'));
});

test('a tab that could not be written is counted and named, and the others still are', async () => {
  const P = makePage();
  const G = google({ fail: (c) => c.tool === 'update_doc' && c.input.requests[0].insertText && /Chapter 2/.test(c.input.requests[0].insertText.text) ? { code: 'tool_error' } : null });
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.'); finalGuide(P, 'Luke – Chapter 3', 'Three.');
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  assert.strictEqual(P.state.docResult.tabs, 2);
  assert.deepStrictEqual(P.state.docResult.failedNames, ['Luke – Chapter 2']);
});

test('no Google Docs connector: one Doc with each guide on its own page instead, and the page says why', async () => {
  const P = makePage(), G = google({ noDocs: true });
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.');
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  assert.strictEqual(G.calls.length, 1, 'no empty Doc is left behind');
  assert.strictEqual(G.calls[0].input.contentMimeType, 'text/html');
  assert.ok(/<h2>Luke – Chapter 1<\/h2>/.test(G.calls[0].input.textContent), 'the first guide follows the title');
  assert.ok(/<h2 style="page-break-before:always">Luke – Chapter 2<\/h2>/.test(G.calls[0].input.textContent), 'each later guide starts a page');
  assert.ok(/Tabs need the Google Docs connector/.test(P.state.docResult.note));
});

test('Google refuses to add tabs: the book still gets its Doc, and the empty one is owned up to', async () => {
  const P = makePage(), G = google({ fail: (c) => c.tool === 'update_doc' ? { code: 'tool_error' } : null });
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.');
  P.setMcp(G); P.setDocMode('tabs'); P.conclude(); await settle();
  assert.deepStrictEqual(G.calls.map((c) => c.tool), ['create_file', 'update_doc', 'create_file']);
  assert.ok(/empty Doc with the same name was also left/.test(P.state.docResult.note));
  assert.strictEqual(P.state.lastDoc.url, 'https://docs.google.com/document/d/doc2/edit', 'the link is to the Doc that holds the book');
});

test('the other two ways still work: one Doc with a page per guide, and a folder of Docs', async () => {
  const P = makePage(), G = google();
  finalGuide(P, 'Luke – Chapter 1', 'One.'); finalGuide(P, 'Luke – Chapter 2', 'Two.');
  P.setMcp(G); P.setDocMode('one'); P.conclude(); await settle();
  assert.deepStrictEqual(G.calls.map((c) => c.tool), ['create_file']);
  P.setDocMode('perScript'); P.conclude(); await settle();
  assert.deepStrictEqual(G.calls.slice(1).map((c) => c.input.contentMimeType), ['application/vnd.google-apps.folder', 'text/html', 'text/html']);
  assert.strictEqual(P.state.docResult.count, 2);
});

test('a choice that is not one of the three falls back to tabs, and to both kinds of caption file', () => {
  const P = makePage();
  assert.strictEqual(P.docModeOf('one'), 'one'); assert.strictEqual(P.docModeOf('perScript'), 'perScript');
  assert.strictEqual(P.docModeOf(undefined), 'tabs'); assert.strictEqual(P.docModeOf('nonsense'), 'tabs');
  assert.strictEqual(P.captionFormatOf('srt'), 'srt'); assert.strictEqual(P.captionFormatOf('nonsense'), 'both');
});

/* ---- Written scripts, many at a time ---- */

const script = (n) => 'Welcome back, my friends. Today we open Luke chapter ' + n + ' together and read it slowly, line by line, asking what Luke wanted us to see.';
const BOOK_DOC = '# Luke – written scripts\n\nNotes for the team: record in order. These scripts were drafted in the spring and revised twice after the read-through with the whole teaching team in the room together. Keep each one under eight minutes when it is read aloud.\n\n## Luke 1\n\n' + script(1) +
  '\n\n### 1. Opening\n\nA numbered section inside the script.\n\n## Luke 2\n\n' + script(2) + '\n\n## Isaiah 53\n\nA passage this chapter leans on, quoted inside the script for Luke 2.\n\n## Luke 2\n\nMore of chapter two under a second heading.\n\n## Luke – Conclusion\n\nThank you for reading Luke with us.';

test('a link says whether it is a folder or a file', () => {
  const P = makePage();
  assert.deepStrictEqual(P.driveTarget('https://drive.google.com/drive/folders/1Fo6gVeE1CWEQCid_43TDneDJAE7vYssG?usp=sharing'), { kind: 'folder', id: '1Fo6gVeE1CWEQCid_43TDneDJAE7vYssG' });
  assert.deepStrictEqual(P.driveTarget('https://drive.google.com/drive/u/0/folders/1Fo6gVeE1CWEQCid_43TDneDJAE7vYssG'), { kind: 'folder', id: '1Fo6gVeE1CWEQCid_43TDneDJAE7vYssG' });
  assert.deepStrictEqual(P.driveTarget('https://docs.google.com/document/d/1IlLAA4wi_VZ14cBbh-sE7ZfNqWNslSXi6_JhvBGElis/edit'), { kind: 'file', id: '1IlLAA4wi_VZ14cBbh-sE7ZfNqWNslSXi6_JhvBGElis' });
  assert.strictEqual(P.driveTarget('luke scripts'), null);
});

test('a Doc that holds a book is cut at the headings that name a chapter, and nowhere else', () => {
  const P = makePage();
  const parts = P.splitWritten(BOOK_DOC, 'Luke – Jones');
  assert.deepStrictEqual(parts.map((p) => p.title), ['Luke – Jones – before the first heading', 'Luke 1', 'Luke 2', 'Luke – Conclusion']);
  assert.deepStrictEqual(parts.map((p) => p.key), ['opening', 'luke-1', 'luke-2', 'luke-conclusion']);
  assert.ok(/1\. Opening/.test(parts[1].text), 'a numbered heading inside a script stays inside it');
  assert.ok(/Isaiah 53/.test(parts[2].text) && /second heading/.test(parts[2].text), 'another book\'s heading, and a second heading for the same chapter, stay with the script they are in');
  assert.strictEqual(parts.map((p) => p.text).join('\n\n').replace(/\s+/g, ' '), BOOK_DOC.replace(/\s+/g, ' ').trim(), '4.9: every word of the file is kept, in order, and none is changed');
});

test('"Chapter 3" under a file named for a book is that book\'s chapter 3', () => {
  const P = makePage();
  const parts = P.splitWritten('# Introduction\n\n' + 'Luke wrote for Theophilus. '.repeat(12) + '\n\n# Chapter 1\n\n' + script(1) + '\n\n# Chapter 2\n\n' + script(2), 'Luke');
  assert.deepStrictEqual(parts.map((p) => p.title), ['Luke – Introduction', 'Luke – Chapter 1', 'Luke – Chapter 2']);
  assert.deepStrictEqual(parts.map((p) => p.key), ['opening', 'luke-1', 'luke-2']);
});

test('a short opening before the first chapter is kept at the head of that chapter, not dropped', () => {
  const P = makePage();
  const parts = P.splitWritten('# Luke scripts\n\nDraft two.\n\n## Luke 1\n\n' + script(1) + '\n\n## Luke 2\n\n' + script(2), 'Jones');
  assert.deepStrictEqual(parts.map((p) => p.title), ['Luke 1', 'Luke 2']);
  assert.ok(/^# Luke scripts\n\nDraft two\.\n\n## Luke 1/.test(parts[0].text));
});

test('a file that is one written script stays whole', () => {
  const P = makePage();
  assert.strictEqual(P.splitWritten(BOOK_DOC, 'Luke 2 — Jones').length, 1, 'its name already says which chapter it is');
  assert.strictEqual(P.splitWritten('# Luke 24\n\n' + script(24) + '\n\n## The road to Emmaus\n\nTwo of them were going to a village.', 'Jones scripts').length, 1, 'one chapter heading is not a book');
  const plain = P.splitWritten(script(3), '');
  assert.strictEqual(plain.length, 1);
  assert.ok(/^Welcome back, my friends/.test(plain[0].title), 'with no name to go by, its first words are its title');
});

const FOLDER = '1Fo6gVeE1CWEQCid_43TDneDJAE7vYssG';
const DOC = 'application/vnd.google-apps.document';
const folderOf = (files) => (input) => input.pageToken ? {} : { files };
const asText = (text) => ({ content: [{ type: 'text', text }] });

test('a folder is listed once, by its id, without reading any file; sub-folders and pictures are left alone', async () => {
  const P = makePage();
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 2 — Jones', mimeType: DOC }, { id: 'fileBBBBBBBBBBBBBBBBBBBB', title: 'Luke 1 — Jones', mimeType: DOC },
    { id: 'subfolderCCCCCCCCCCCCCCC', title: 'Old drafts', mimeType: 'application/vnd.google-apps.folder' }, { id: 'pictureDDDDDDDDDDDDDDDDD', title: 'cover.png', mimeType: 'image/png' }]) });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle();
  assert.deepStrictEqual(G.calls.map((c) => c.tool), ['search_files']);
  assert.deepStrictEqual(G.calls[0].input, { query: "parentId = '" + FOLDER + "' and trashed = false", excludeContentSnippets: true, pageSize: 100 });
  assert.deepStrictEqual(P.bulk.files.map((f) => f.name), ['Luke 1 — Jones', 'Luke 2 — Jones'], 'in order');
  assert.strictEqual(P.bulk.other, 2);
  assert.ok(P.bulk.files.every((f) => f.pick), 'new files start ticked');
  assert.ok(/2 sub-folders or other files in there were left alone/.test(P.renderWrittenBulk()));
});

test('bringing a folder in: one read for each ticked file, each kept as its own written script', async () => {
  const P = makePage();
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1 — Jones', mimeType: DOC }, { id: 'fileBBBBBBBBBBBBBBBBBBBB', title: 'Luke 2 — Jones', mimeType: DOC }, { id: 'fileCCCCCCCCCCCCCCCCCCCC', title: 'Luke 3 — Jones', mimeType: DOC }]),
    read: (id) => asText(script(id === 'fileAAAAAAAAAAAAAAAAAAAA' ? 1 : 2)) });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle();
  P.bulkPick('fileCCCCCCCCCCCCCCCCCCCC', false); P.startWrittenBulk(); await settle();
  assert.deepStrictEqual(G.calls.slice(1).map((c) => [c.tool, c.input.fileId]), [['read_file_content', 'fileAAAAAAAAAAAAAAAAAAAA'], ['read_file_content', 'fileBBBBBBBBBBBBBBBBBBBB']]);
  assert.deepStrictEqual(P.index.map((w) => [w.title, w.source, w.sourceId, w.book, w.chapter]), [['Luke 1 — Jones', 'drive', 'fileAAAAAAAAAAAAAAAAAAAA', 'Luke', 1], ['Luke 2 — Jones', 'drive', 'fileBBBBBBBBBBBBBBBBBBBB', 'Luke', 2]]);
  assert.strictEqual(P.bulk.report.saved, 2);
  assert.strictEqual(P.store.get('writtenText/' + P.index[0].id).text, script(1), '4.9: kept as written');
  assert.ok(P.log.every((l) => /^set:written(Text)?\//.test(l)), 'nothing in any book is touched');
});

test('4.11: bringing in many only lists and reads; Google Drive is never written', async () => {
  const P = makePage();
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1', mimeType: DOC }]), read: () => asText(script(1)) });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = FOLDER.replace(/^/, 'https://drive.google.com/drive/folders/'); P.listWrittenBulk(); await settle(); P.startWrittenBulk(); await settle();
  assert.ok(G.calls.every((c) => c.server === 'Google Drive' && (c.tool === 'search_files' || c.tool === 'read_file_content')));
});

test('one Doc that holds a book is read once and kept as a written script for each chapter', async () => {
  const P = makePage();
  const G = google({ read: () => ({ payload: { title: 'Luke – Jones', content: BOOK_DOC } }) });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://docs.google.com/document/d/1IlLAA4wi_VZ14cBbh-sE7ZfNqWNslSXi6_JhvBGElis/edit'; P.listWrittenBulk(); await settle();
  assert.strictEqual(G.calls.length, 0, 'a link to a file needs no listing');
  P.startWrittenBulk(); await settle();
  assert.strictEqual(G.calls.length, 1);
  assert.deepStrictEqual(P.index.map((w) => w.title), ['Luke – Jones – before the first heading', 'Luke 1', 'Luke 2', 'Luke – Conclusion']);
  assert.deepStrictEqual(P.index.map((w) => w.sourceId.split('#')[1]), ['opening', 'luke-1', 'luke-2', 'luke-conclusion']);
  assert.deepStrictEqual(P.bulk.report.split, [{ name: 'Luke – Jones', count: 4 }]);
  assert.ok(/held 4 written scripts and was cut at its headings/.test(P.renderWrittenBulk()), 'the page says the file was cut');
});

test('the same file brought in again renews the kept copy: same place in the library, same title, no second copy', async () => {
  const P = makePage();
  let text = script(1);
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1 — Jones', mimeType: DOC }]), read: () => asText(text) });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle(); P.startWrittenBulk(); await settle();
  const id = P.index[0].id;
  P.openForRename(id); P.renameBox('Luke 1 — Jones (final)'); P.renameWritten(); await settle();
  assert.strictEqual(P.index[0].sourceId, 'fileAAAAAAAAAAAAAAAAAAAA', 'a new title does not lose where it came from');
  P.listWrittenBulk(); await settle();
  assert.strictEqual(P.bulk.files[0].have, true);
  assert.strictEqual(P.bulk.files[0].pick, false, 'one already here is not ticked again unless asked');
  text = script(1) + ' A line the teacher added.';
  P.bulkPick('fileAAAAAAAAAAAAAAAAAAAA', true); P.startWrittenBulk(); await settle();
  assert.strictEqual(P.index.length, 1);
  assert.strictEqual(P.index[0].id, id);
  assert.strictEqual(P.index[0].title, 'Luke 1 — Jones (final)');
  assert.ok(/A line the teacher added\.$/.test(P.store.get('writtenText/' + id).text));
  assert.strictEqual(P.bulk.report.replaced, 1);
});

test('the library is read again before judging what is already here: a teammate\'s import since the page was opened is not doubled', async () => {
  const P = makePage();
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1 — Jones', mimeType: DOC }]), read: () => asText(script(1) + ' Revised.') });
  P.setMcp(G); P.openWrittenBulk();
  assert.strictEqual(P.index.length, 0, 'nothing here when this page was opened');
  // A teammate brings the same file in from their own computer.
  P.store.set('writtenText/wTeammate', { text: script(1) });
  P.store.set('written/wTeammate', { title: 'Luke 1 — Jones', chars: script(1).length, at: 5, source: 'drive', sourceName: 'Luke 1 — Jones', sourceId: 'fileAAAAAAAAAAAAAAAAAAAA', sketch: [] });
  P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle();
  assert.strictEqual(P.bulk.files[0].have, true, 'it is marked as already in the library');
  assert.strictEqual(P.bulk.files[0].pick, false);
  P.bulkPick('fileAAAAAAAAAAAAAAAAAAAA', true); P.startWrittenBulk(); await settle();
  assert.deepStrictEqual(Array.from(P.store.keys()).filter((k) => /^written\//.test(k)), ['written/wTeammate'], 'renewed in place, not added a second time');
  assert.ok(/Revised\.$/.test(P.store.get('writtenText/wTeammate').text));
});

test('a single written script brought in by its link remembers its file too', async () => {
  const P = makePage();
  const G = google({ read: () => asText(script(5)) });
  P.setMcp(G); P.startWrittenForm(); P.form.title = 'Luke 5'; P.form.link = 'https://docs.google.com/document/d/1IlLAA4wi_VZ14cBbh-sE7ZfNqWNslSXi6_JhvBGElis/edit';
  P.fetchWrittenFromDrive(); await settle(); P.saveWritten(); await settle();
  assert.strictEqual(P.index[0].sourceId, '1IlLAA4wi_VZ14cBbh-sE7ZfNqWNslSXi6_JhvBGElis');
});

test('a file that cannot be read is named with the reason, and the rest are still brought in', async () => {
  const P = makePage();
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1', mimeType: DOC }, { id: 'fileBBBBBBBBBBBBBBBBBBBB', title: 'Luke 2', mimeType: DOC }, { id: 'fileCCCCCCCCCCCCCCCCCCCC', title: 'Luke 3', mimeType: DOC }]),
    read: (id) => asText(id === 'fileCCCCCCCCCCCCCCCCCCCC' ? '' : script(2)), fail: (c) => c.tool === 'read_file_content' && c.input.fileId === 'fileAAAAAAAAAAAAAAAAAAAA' ? { code: 'tool_error' } : null });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle(); P.startWrittenBulk(); await settle();
  assert.deepStrictEqual(P.index.map((w) => w.title), ['Luke 2']);
  assert.deepStrictEqual(P.bulk.report.failed, [{ name: 'Luke 1', why: 'Google Drive couldn’t open it' }, { name: 'Luke 3', why: 'nothing could be read from it' }]);
  assert.ok(P.bulk.files.filter((f) => f.pick).map((f) => f.name).join() === 'Luke 1,Luke 3', 'what was not kept is still ticked, ready to try again');
});

test('Drive saying "not now" is waited out; Drive saying "not allowed" stops the run with the fix', async () => {
  const P = makePage();
  let turns = 0;
  const G = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1', mimeType: DOC }, { id: 'fileBBBBBBBBBBBBBBBBBBBB', title: 'Luke 2', mimeType: DOC }]), read: () => asText(script(1)),
    fail: (c) => c.tool === 'read_file_content' && c.input.fileId === 'fileAAAAAAAAAAAAAAAAAAAA' && (turns += 1) < 3 ? { code: 'rate_limited' } : null });
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle(); P.startWrittenBulk(); await settle();
  assert.strictEqual(P.index.length, 2, 'the third try got through');
  const P2 = makePage(), G2 = google({ search: folderOf([{ id: 'fileAAAAAAAAAAAAAAAAAAAA', title: 'Luke 1', mimeType: DOC }, { id: 'fileBBBBBBBBBBBBBBBBBBBB', title: 'Luke 2', mimeType: DOC }]), fail: (c) => c.tool === 'read_file_content' ? { code: 'consent_required' } : null });
  P2.setMcp(G2); P2.openWrittenBulk(); P2.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P2.listWrittenBulk(); await settle(); P2.startWrittenBulk(); await settle();
  assert.strictEqual(G2.calls.filter((c) => c.tool === 'read_file_content').length, 1, 'the second file is not tried');
  assert.ok(/wasn’t allowed to read from Google Drive/.test(P2.bulk.error) && !/paste the text in below/i.test(P2.bulk.error), P2.bulk.error);
  assert.strictEqual(P2.bulk.report.stopped, true);
});

test('nothing to look at, or a link that is not one, is said before any call', async () => {
  const P = makePage(), G = google();
  P.setMcp(G); P.openWrittenBulk(); P.bulk.links = 'the Luke folder'; P.listWrittenBulk(); await settle();
  assert.strictEqual(G.calls.length, 0);
  assert.ok(/Paste a link to a Google Drive folder/.test(P.bulk.error));
  P.bulk.links = 'https://drive.google.com/drive/folders/' + FOLDER; P.listWrittenBulk(); await settle();
  assert.ok(/Nothing that can be read was found there/.test(P.bulk.error));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
