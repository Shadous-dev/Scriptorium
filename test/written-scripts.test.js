#!/usr/bin/env node
/*
 * written-scripts.test.js — checks SOURCE-OF-TRUTH 4.9: the teachers' written
 * scripts are kept as a reference, matched to their guides, sent with the
 * guide's one edit call, and never made into the transcript. Also checks the
 * sign-off that turns an Edited Transcript into a Final one, and that only
 * Final Transcripts reach the Google Doc.
 *
 *   node test/written-scripts.test.js
 *
 * No dependencies and no call to Claude, Google Drive or the store: each is a
 * stand-in here. The page's modules are written for the browser (build.js
 * pastes them into one shared scope), so this loads their text the same way.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const assert = require('assert');

const load = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', file), 'utf8');
const source = ['02-helpers.js', '03-text.js', '07-fields.js', '08-actions.js', '09-prompts.js', '10-edit-pipeline.js', '12-google-doc.js', '13-captions.js', '14-descript.js', '15-written-scripts.js', '16-references.js', '18-glossary.js'].map(load).join('\n');

function makePage() {
  return new Function(`
    var state = { bookTitle: 'Luke', wordsToSearchFor: '', sections: [] }, bookId = 'b1', view = 'written', dbStatus = 'ready', flash = null, confirmState = null, dbApi = null, collapsed = {};
    var root = { querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
    var store = new Map(), log = [], mcp = null, failWrites = null;
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
    function saveSection(id) { log.push('save:' + id); return Promise.resolve(); } function saveMeta() { return Promise.resolve(); } function saveMetaSoon() {} function saveCaptions() { return Promise.resolve(); }
    function openConfirm(opts) { confirmState = opts; }
    function useCap(name) { return Promise.resolve(name === 'mcp' ? mcp : null); }
    function noticeHtml() { return ''; } function renderSkeleton() { return ''; } function versionLine() { return ''; } function renderModal() { return ''; }
    function newSection() { return { id: 'n' + state.sections.length, name: '', raw: '', captions: '', descriptId: '' }; }
    ${source}
    return { state, store, log, textSketch, sketchShared, placeOf, placeLabel, samePlace, matchWritten, writtenFor, entryFromDoc, loadWrittenIndex, readWrittenText, startWrittenForm, saveWritten, deleteWritten, renameWritten, readWritten,
             driveFileId, driveFileText, driveProblem, fetchWrittenFromDrive, docxText, docxXmlToText, zipFiles, readWrittenFile, renderWrittenLine, renderWritten, setWritten,
             runEditOnSection, buildEditsPrompt, approveSection, unapproveSection, saveHandEdit, isFinal, docBody, finalSections, syncOneField, WRITTEN_MAX,
             get form() { return writtenForm; }, get index() { return writtenIndex; }, get open() { return writtenOpen; }, get flash() { return flash; }, get confirm() { return confirmState; },
             setIndex: function (list) { writtenIndex = list; writtenStamp += 1; }, setMcp: function (m) { mcp = m; }, setFailWrites: function (e) { failWrites = e; }, setNoStore: function () { dbRoot = null; },
             openForRename: function (id) { writtenOpen = { id: id, text: '', loading: false, error: '', title: null, busy: false }; }, renameBox: function (value) { root.querySelector = function () { return { value: value, focus: function () {}, select: function () {} }; }; } };
  `)();
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const tick = () => new Promise((r) => setTimeout(r, 5));
const editor = (answer) => ({ json: () => Promise.resolve(answer) });
const nothing = { edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' };
let nextId = 1;
const guide = (P, name, raw, more) => { const s = Object.assign({ id: 'g' + (nextId++), name, raw: raw || '', corrected: '', editedFromRaw: null, status: 'draft', edits: [], verses: [], captions: '', writtenId: '', writtenUsed: null, approvedAt: 0 }, more || {}); P.state.sections.push(s); return s; };

// What a teacher wrote, and what Descript heard when it was recorded: the same talk, read loosely.
const WRITTEN_LUKE = `Luke 24 — The Empty Tomb

Welcome back, my friends. We have come to the last chapter of Luke, and it begins in the dark.

Verse 1: "On the first day of the week, very early in the morning, the women took the spices they had prepared and went to the tomb." (Luke 24:1)

They are not going to see a miracle. They are going to finish a burial. Nobody in this story expects what happens next, and that matters, because people who expect nothing do not invent what they find.

"They found the stone rolled away from the tomb, but when they entered, they did not find the body of the Lord Jesus." (Luke 24:2-3)

Notice what Luke does not say. He does not say they were glad. He says they were wondering about this. Is that not how it goes? God does the very thing he promised, and we stand there puzzled.

Then two men in clothes that gleamed like lightning stood beside them. "Why do you look for the living among the dead? He is not here; he has risen!" (Luke 24:5-6)

Remember how he told you. That is the whole sermon in four words. The answer to their confusion was something they had already been told.`;
const HEARD_LUKE = `welcome back my friends we have come to the last chapter of luke and it begins in the dark. verse one on the first day of the week very early in the morning the women took the spices they had prepared and went to the tomb

now they are not going to see a miracle they are going to finish a burial. nobody in this story expects what happens next and that really matters because people who expect nothing do not invent what they find

they found the stone rolled away from the tomb but when they entered they did not find the body of the lord jesus

notice what luke does not say he does not say they were glad he says they were wondering about this is that not how it goes god does the very thing he promised and we stand there puzzled

then two men in clothes that gleamed like lightning stood beside them why do you look for the living among the dead he is not here he has risen

remember how he told you that is the whole sermon in four words the answer to their confusion was something they had already been told`;
const WRITTEN_JOB = `Job 2 — The Second Test

Welcome back, my friends. Satan comes before the Lord a second time, and the question on the table is whether a man will hold on to his integrity when his own body is taken from him.

"Skin for skin!" Satan replied. "A man will give all he has for his own life." (Job 2:4)

So Job sits among the ashes and scrapes himself with a piece of broken pottery. His wife tells him to curse God and die. And Job answers her with one of the hardest questions in the Bible. Shall we accept good from God, and not trouble?

Then come the three friends, Eliphaz the Temanite, Bildad the Shuhite and Zophar the Naamathite. And for seven days and seven nights they sit with him on the ground and nobody says a word, because they saw how great his suffering was.`;

const entry = (P, id, title, text, at) => P.entryFromDoc(id, { title, chars: text.length, at: at || 1, source: 'paste', sourceName: '', sketch: P.textSketch(text) });

/* ---- Matching ---- */

test('a fingerprint: a written script and the recording made from it share dozens of runs of words, and unrelated texts share almost none', () => {
  const P = makePage();
  const luke = P.textSketch(WRITTEN_LUKE), heard = P.textSketch(HEARD_LUKE), job = P.textSketch(WRITTEN_JOB);
  assert.ok(luke.length === 96 && heard.length === 96, 'a fingerprint is 96 numbers');
  assert.ok(P.sketchShared(heard, luke) >= 30, 'shared ' + P.sketchShared(heard, luke));
  assert.ok(P.sketchShared(heard, job) <= 2, 'both open with "Welcome back, my friends" — a shared greeting is not a match');
  assert.strictEqual(P.sketchShared(heard, []), 0);
  assert.deepStrictEqual(P.textSketch(WRITTEN_LUKE), luke, 'the same text always gives the same fingerprint');
  assert.deepStrictEqual(P.textSketch('too short'), []);
});

test('a title says where a written script belongs', () => {
  const P = makePage();
  const where = (t) => { const p = P.placeOf(t); return [p.book, p.chapter, p.part]; };
  assert.deepStrictEqual(where('Luke 24 — Jones'), ['Luke', 24, '']);
  assert.deepStrictEqual(where('Jones – Luke 24 (final draft)'), ['Luke', 24, '']);
  assert.deepStrictEqual(where('1 Samuel – Chapter 3'), ['1 Samuel', 3, '']);
  assert.deepStrictEqual(where('Psalm 23'), ['Psalms', 23, '']);
  assert.deepStrictEqual(where('Isaiah – Introduction'), ['Isaiah', 0, 'intro']);
  assert.deepStrictEqual(where('Isaiah Conclusion'), ['Isaiah', 0, 'conclusion']);
  assert.deepStrictEqual(where('Jude'), ['Jude', 1, '']);
  assert.deepStrictEqual(where('Easter talk, second draft'), ['', 0, '']);
  assert.strictEqual(P.placeLabel(P.placeOf('Luke 24 — Jones')), 'Luke 24');
  assert.ok(P.samePlace(P.placeOf('Luke – Chapter 24'), P.placeOf('Luke 24 — Jones')));
  assert.ok(!P.samePlace(P.placeOf('Luke – Chapter 2'), P.placeOf('Luke 24 — Jones')));
  assert.ok(!P.samePlace(P.placeOf('Luke – Introduction'), P.placeOf('Luke – Conclusion')));
});

test('a guide is matched to its written script by title and wording, and the card says how', () => {
  const P = makePage();
  P.setIndex([entry(P, 'wJ', 'Job 2 — Jones', WRITTEN_JOB), entry(P, 'wL', 'Luke 24 — Jones', WRITTEN_LUKE)]);
  let m = P.matchWritten(guide(P, 'Luke – Chapter 24', HEARD_LUKE));
  assert.deepStrictEqual([m.entry.id, m.how, m.byHand], ['wL', 'matched by title and wording', false]);
  // The title alone is enough — a guide with no transcript yet, say.
  m = P.matchWritten(guide(P, 'Job – Chapter 2', ''));
  assert.deepStrictEqual([m.entry.id, m.how], ['wJ', 'matched by title']);
  // The wording alone is enough when a title says nothing.
  m = P.matchWritten(guide(P, 'Recording Session Nov 27', HEARD_LUKE));
  assert.deepStrictEqual([m.entry.id, m.how], ['wL', 'matched by wording']);
  // Neither: no match is made up.
  assert.strictEqual(P.matchWritten(guide(P, 'Luke – Chapter 3', 'in the fifteenth year of the reign of tiberius caesar the word of god came to john son of zechariah in the wilderness')), null);
  assert.strictEqual(P.matchWritten(guide(P, 'Recording Session Nov 28', '')), null);
});

test('two written scripts for one chapter: the one whose wording fits is used', () => {
  const P = makePage();
  P.setIndex([entry(P, 'wOld', 'Luke 24 — first draft', WRITTEN_JOB, 5), entry(P, 'wNew', 'Luke 24 — Jones', WRITTEN_LUKE, 1)]);
  assert.strictEqual(P.matchWritten(guide(P, 'Luke – Chapter 24', HEARD_LUKE)).entry.id, 'wNew');
});

test('a person\'s choice wins: one picked by hand is used, "none" means none, and a deleted pick falls back to matching', () => {
  const P = makePage();
  P.setIndex([entry(P, 'wJ', 'Job 2 — Jones', WRITTEN_JOB), entry(P, 'wL', 'Luke 24 — Jones', WRITTEN_LUKE)]);
  const s = guide(P, 'Luke – Chapter 24', HEARD_LUKE);
  P.setWritten(s.id, 'wJ');
  assert.deepStrictEqual([P.matchWritten(s).entry.id, P.matchWritten(s).how], ['wJ', 'chosen by hand']);
  assert.ok(P.log.includes('save:' + s.id), 'the choice is saved with the guide');
  P.setWritten(s.id, 'none');
  assert.strictEqual(P.matchWritten(s), null);
  assert.ok(/No written script is used/.test(P.renderWrittenLine(s)));
  P.setWritten(s.id, 'gone');
  assert.strictEqual(P.matchWritten(s).entry.id, 'wL');
});

/* ---- 4.9 in the edit pass ---- */

test('4.6: the written script travels in the guide\'s one call, and only for a guide that has one', () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', HEARD_LUKE);
  const without = P.buildEditsPrompt(s, HEARD_LUKE);
  assert.ok(!/WRITTEN SCRIPT/.test(without), 'a guide with no written script pays for none of it');
  const withIt = P.buildEditsPrompt(s, HEARD_LUKE, WRITTEN_LUKE);
  assert.ok(withIt.includes(WRITTEN_LUKE) && /NEVER change the transcript to match it/.test(withIt));
  assert.ok(withIt.indexOf('WRITTEN SCRIPT (reference only') < withIt.indexOf('TRANSCRIPT:'), 'the transcript comes last');
  assert.ok(withIt.endsWith('"""'), 'and nothing follows the transcript');
});

test('4.9: the written script is evidence for a change the wording rule allows — and the row says so', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'is that not how it goes. god does the very thing he promised');
  let calls = 0;
  await P.runEditOnSection(s, { json: () => { calls += 1; return Promise.resolve(Object.assign({}, nothing, { edits: [{ find: 'Is that not how it goes.', replace: 'Is that not how it goes?', source: 'script' }] })); } },
    null, false, { id: 'wL', title: 'Luke 24 — Jones', text: WRITTEN_LUKE });
  assert.strictEqual(calls, 1, 'one guide is one call');
  assert.strictEqual(s.corrected, 'Is that not how it goes? God does the very thing he promised.');
  const row = s.edits.filter((e) => e.replace === 'Is that not how it goes?')[0];
  assert.ok(row && /supported by the written script/.test(row.note));
  assert.deepStrictEqual(s.writtenUsed, { id: 'wL', title: 'Luke 24 — Jones' });
});

test('4.9: the transcript is never made to match the written script — a difference in wording is a suggestion that names its source', async () => {
  const P = makePage();
  // The teacher wrote "that matters"; aloud it was "that really matters". And Descript dropped a "not".
  const s = guide(P, 'Luke – Chapter 24', 'and that really matters. they are going to see a miracle');
  await P.runEditOnSection(s, editor(Object.assign({}, nothing, { edits: [
    { find: 'that really matters', replace: 'that matters', source: 'script' },
    { find: 'They are going to see', replace: 'They are not going to see', source: 'script', note: 'the script has "not"' }
  ] })), null, false, { id: 'wL', title: 'Luke 24 — Jones', text: WRITTEN_LUKE });
  assert.strictEqual(s.corrected, 'And that really matters. They are going to see a miracle.', 'as spoken, both times');
  assert.strictEqual(s.suggested.length, 2);
  s.suggested.forEach((row) => assert.ok(/^the written script reads this way; /.test(row.note), row.note));
  assert.ok(/removes words/.test(s.suggested[0].note) && /adds words/.test(s.suggested[1].note));
});

test('an edit that claims the written script when the guide has none is treated like any other', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'is that not how it goes.');
  await P.runEditOnSection(s, editor(Object.assign({}, nothing, { edits: [{ find: 'Is that not how it goes.', replace: 'Is that not how it goes?', source: 'script' }] })));
  assert.ok(!s.edits.some((e) => /written script/.test(e.note || '')));
  assert.strictEqual(s.writtenUsed, null);
});

test('the guide\'s written script is read for the edit; one that cannot be read is said, and the pass still runs', async () => {
  const P = makePage();
  P.store.set('writtenText/wL', { text: WRITTEN_LUKE });
  P.setIndex([entry(P, 'wL', 'Luke 24 — Jones', WRITTEN_LUKE), entry(P, 'wGone', 'Job 2 — Jones', WRITTEN_JOB)]);
  const s = guide(P, 'Luke – Chapter 24', HEARD_LUKE);
  assert.deepStrictEqual(await P.writtenFor(s), { id: 'wL', title: 'Luke 24 — Jones', text: WRITTEN_LUKE });
  assert.strictEqual(await P.writtenFor(guide(P, 'Luke – Chapter 3', 'in the fifteenth year of tiberius')), null);
  const lost = guide(P, 'Job – Chapter 2', 'skin for skin satan replied');
  const got = await P.writtenFor(lost);
  assert.ok(/could not be read/.test(got.error));
  await P.runEditOnSection(lost, editor(nothing), null, false, got);
  assert.strictEqual(lost.status, 'edited');
  assert.ok(/could not be read, so this pass ran without it/.test(lost.summary));
});

test('4.10: each quotation remembers the reference written beside it in the written script', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'verse one on the first day of the week very early in the morning the women took the spices they had prepared and went to the tomb');
  await P.runEditOnSection(s, editor(Object.assign({}, nothing, { verses: [{ reference: 'Verse 1', startsWith: 'On the first day of', endsWith: 'went to the tomb', canonical: 'Luke 1:1', confidence: 'high', note: '' }] })),
    null, false, { id: 'wL', title: 'Luke 24 — Jones', text: WRITTEN_LUKE });
  assert.strictEqual(s.verses[0].written, 'Luke 24:1');
  assert.strictEqual(s.verses[0].canonical, 'Luke 1:1', 'found, and not applied: a person chooses');
});

/* ---- The library ---- */

test('saving a written script: the text is stored first, then listed; nothing in any book is touched', async () => {
  const P = makePage();
  P.store.set('books/b1', { bookTitle: 'Luke' });
  P.startWrittenForm();
  Object.assign(P.form, { title: '  Luke 24 —  Jones ', text: WRITTEN_LUKE + '\n\n' });
  P.saveWritten(); await tick();
  const sets = P.log.filter((l) => /^set:/.test(l));
  assert.strictEqual(sets.length, 2);
  assert.ok(/^set:writtenText\//.test(sets[0]) && /^set:written\//.test(sets[1]), sets.join(' '));
  const id = sets[1].split('/')[1];
  assert.strictEqual(P.store.get('writtenText/' + id).text, WRITTEN_LUKE, 'kept exactly as given');
  const doc = P.store.get('written/' + id);
  assert.deepStrictEqual([doc.title, doc.chars, doc.source, doc.sketch.length], ['Luke 24 — Jones', WRITTEN_LUKE.length, 'paste', 96]);
  assert.strictEqual(doc.text, undefined, 'the listing holds no text');
  assert.strictEqual(P.form, null);
  assert.ok(/matched to guides on Luke 24/.test(P.flash));
  assert.deepStrictEqual(P.index.map((w) => w.title), ['Luke 24 — Jones']);
  assert.deepStrictEqual(P.store.get('books/b1'), { bookTitle: 'Luke' });
  // Re-read from the store, it is the same list.
  P.setIndex([]); await P.loadWrittenIndex();
  assert.deepStrictEqual(P.index.map((w) => [w.id, w.book, w.chapter]), [[id, 'Luke', 24]]);
});

test('a written script with no title, no text, or too much text is refused with the reason', async () => {
  const P = makePage();
  P.startWrittenForm(); Object.assign(P.form, { title: '', text: WRITTEN_LUKE }); P.saveWritten();
  assert.ok(/Give it a title/.test(P.form.error));
  Object.assign(P.form, { title: 'Luke 24', text: '   ' }); P.saveWritten();
  assert.ok(/no script yet/.test(P.form.error));
  Object.assign(P.form, { title: 'Luke 24', text: 'x'.repeat(P.WRITTEN_MAX + 1) }); P.saveWritten();
  assert.ok(/too long/.test(P.form.error));
  assert.strictEqual(P.log.filter((l) => /^set:/.test(l)).length, 0);
  // A view-only reader is told what would fix it.
  P.setFailWrites({ code: 'invalid_argument' });
  Object.assign(P.form, { title: 'Luke 24', text: WRITTEN_LUKE }); P.saveWritten(); await tick();
  assert.ok(/view-only/.test(P.form.error) && P.form.busy === '');
  assert.strictEqual(P.index.length, 0);
});

test('renaming changes where it is matched; deleting removes that one and no other', async () => {
  const P = makePage();
  P.startWrittenForm(); Object.assign(P.form, { title: 'Easter talk', text: WRITTEN_LUKE }); P.saveWritten(); await tick();
  P.startWrittenForm(); Object.assign(P.form, { title: 'Job 2 — Jones', text: WRITTEN_JOB }); P.saveWritten(); await tick();
  const easter = P.index.filter((w) => w.title === 'Easter talk')[0], job = P.index.filter((w) => w.title === 'Job 2 — Jones')[0];
  assert.strictEqual(easter.book, '');
  P.openForRename(easter.id); P.renameBox('Luke 24 — Jones'); P.renameWritten(); await tick();
  assert.deepStrictEqual([easter.title, easter.book, easter.chapter], ['Luke 24 — Jones', 'Luke', 24]);
  assert.strictEqual(P.store.get('written/' + easter.id).title, 'Luke 24 — Jones');
  assert.strictEqual(P.store.get('writtenText/' + easter.id).text, WRITTEN_LUKE, 'the text is never rewritten');
  P.deleteWritten(easter.id); await tick();
  assert.ok(!P.store.has('written/' + easter.id) && !P.store.has('writtenText/' + easter.id));
  assert.ok(P.store.has('written/' + job.id) && P.store.has('writtenText/' + job.id));
  assert.deepStrictEqual(P.index.map((w) => w.id), [job.id]);
});

/* ---- Bringing one in ---- */

test('a Google Doc or Sheet link gives its file id; anything else does not', () => {
  const P = makePage();
  assert.strictEqual(P.driveFileId('https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit?tab=t.0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.strictEqual(P.driveFileId('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz-_2345/edit#gid=0'), '1AbCdEfGhIjKlMnOpQrStUvWxYz-_2345');
  assert.strictEqual(P.driveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz012345'), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  assert.strictEqual(P.driveFileId(' 1AbCdEfGhIjKlMnOpQrStUvWxYz012345 '), '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  ['', 'Luke 24', 'https://example.com/d/short', 'https://docs.google.com/document/u/0/'].forEach((bad) => assert.strictEqual(P.driveFileId(bad), '', bad));
});

test('bringing one in from Google Drive only reads: one call, to the read tool, for that file', async () => {
  const P = makePage(), calls = [];
  P.setMcp({
    listTools: () => Promise.resolve({ servers: [{ server: 'Google Drive', authStatus: 'connected', tools: [{ name: 'create_file' }, { name: 'read_file_content' }] }] }),
    callTool: (server, tool, input) => { calls.push({ server, tool, input }); return Promise.resolve({ content: [{ type: 'text', text: WRITTEN_LUKE }] }); }
  });
  P.startWrittenForm(); P.form.link = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit';
  P.fetchWrittenFromDrive(); await tick();
  assert.deepStrictEqual(calls, [{ server: 'Google Drive', tool: 'read_file_content', input: { fileId: '1AbCdEfGhIjKlMnOpQrStUvWxYz012345' } }]);
  assert.strictEqual(P.form.text, WRITTEN_LUKE);
  assert.strictEqual(P.form.source, 'drive');
  assert.deepStrictEqual([P.form.title, P.form.sourceName], ['', ''], 'Drive gave no file name, so none is made up');
  assert.strictEqual(P.log.length, 0, 'nothing is saved until the reader clicks Save');
});

test('what Drive sends back is read as text, whether it comes bare or wrapped in JSON', () => {
  const P = makePage();
  assert.deepStrictEqual(P.driveFileText({ content: [{ type: 'text', text: 'Plain words.' }] }), { text: 'Plain words.', name: '' });
  assert.deepStrictEqual(P.driveFileText({ content: [{ type: 'text', text: JSON.stringify({ title: 'Luke 24', content: 'Wrapped words.' }) }] }), { text: 'Wrapped words.', name: 'Luke 24' });
  assert.deepStrictEqual(P.driveFileText({ content: [], payload: { name: 'Luke 24', text: 'In the payload.' } }), { text: 'In the payload.', name: 'Luke 24' });
  assert.deepStrictEqual(P.driveFileText(null), { text: '', name: '' });
});

test('each way Google Drive can fail gets its own sentence, and a link that is not one is caught before any call', async () => {
  const P = makePage();
  const seen = ['needs_reauth', 'server_not_connected', 'not_in_manifest', 'blocked_by_policy', 'server_unavailable', 'capability_disabled', 'tool_error', 'something_else'].map((code) => P.driveProblem({ code, message: 'm' }));
  assert.strictEqual(new Set(seen).size, seen.length);
  seen.forEach((sentence) => assert.ok(/paste|try again/i.test(sentence), sentence));
  let called = false;
  P.setMcp({ listTools: () => { called = true; return Promise.resolve({ servers: [] }); }, callTool: () => { called = true; return Promise.resolve({}); } });
  P.startWrittenForm(); P.form.link = 'my notes on Luke'; P.fetchWrittenFromDrive(); await tick();
  assert.ok(/doesn’t look like a link/.test(P.form.error) && !called);
  P.form.link = 'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit'; P.fetchWrittenFromDrive(); await tick();
  assert.ok(/isn’t connected/.test(P.form.error));
});

// A .docx is a .zip holding word/document.xml. Built here two ways: stored, and compressed as Word does.
const DOC_XML = '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' +
  '<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Luke 24 &#8212; The Empty Tomb</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t xml:space="preserve">Welcome back, </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>my friends</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>' +
  '<w:p><w:r><w:t>Verse 1:</w:t><w:tab/><w:t>&quot;On the first day&quot; &amp; so on</w:t><w:br/><w:t>second line</w:t></w:r></w:p>' +
  '<w:p><w:del><w:r><w:delText>a line the teacher deleted</w:delText></w:r></w:del><w:r><w:t>kept</w:t></w:r></w:p>' +
  '<w:sectPr/></w:body></w:document>';
const DOC_TEXT = 'Luke 24 — The Empty Tomb\nWelcome back, my friends.\nVerse 1:\t"On the first day" & so on\nsecond line\nkept\n';
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

test('a Word file is read for its words: paragraphs, tabs and line breaks kept, tracked deletions left out', async () => {
  const P = makePage();
  assert.strictEqual(P.docxXmlToText(DOC_XML), DOC_TEXT);
  const stored = P.zipFiles([{ name: '[Content_Types].xml', text: '<Types/>' }, { name: 'word/document.xml', text: DOC_XML }]);
  assert.strictEqual(await P.docxText(stored.buffer), DOC_TEXT);
  const squeezed = deflatedZip('word/document.xml', DOC_XML);
  assert.strictEqual(await P.docxText(squeezed.buffer.slice(squeezed.byteOffset, squeezed.byteOffset + squeezed.byteLength)), DOC_TEXT);
  await assert.rejects(P.docxText(P.zipFiles([{ name: 'notes.txt', text: 'not a Word file' }]).buffer));
  await assert.rejects(P.docxText(new Uint8Array([1, 2, 3, 4]).buffer));
});

test('a file from the computer fills the form; a kind that cannot be read says what to do instead', async () => {
  const P = makePage();
  P.startWrittenForm();
  P.readWrittenFile({ name: 'Luke_24_Jones.txt', size: 100, type: 'text/plain', text: () => Promise.resolve(WRITTEN_LUKE + '\r\n') }); await tick();
  assert.deepStrictEqual([P.form.text, P.form.source, P.form.sourceName, P.form.title], [WRITTEN_LUKE, 'file', 'Luke_24_Jones.txt', 'Luke 24 Jones']);
  P.form.title = 'My own title';
  const docx = deflatedZip('word/document.xml', DOC_XML);
  P.readWrittenFile({ name: 'Luke 24.docx', size: docx.length, type: '', arrayBuffer: () => Promise.resolve(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.byteLength)) }); await tick();
  assert.strictEqual(P.form.text, DOC_TEXT.trim());
  assert.strictEqual(P.form.title, 'My own title', 'a title already typed is kept');
  P.readWrittenFile({ name: 'Luke 24.pages', size: 100, type: '' }); await tick();
  assert.ok(/Pages file/.test(P.form.error) && P.form.text === DOC_TEXT.trim(), 'what was there is kept');
  P.readWrittenFile({ name: 'Luke 24.xyz', size: 100, type: '' }); await tick();
  assert.ok(/can’t be read here/.test(P.form.error));
  P.readWrittenFile({ name: 'huge.txt', size: 9e6, type: 'text/plain' }); await tick();
  assert.ok(/too large/.test(P.form.error));
});

/* ---- On a guide's card ---- */

test('the card says which written script stands behind the guide, and when the edit pass ran without it', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', HEARD_LUKE);
  assert.strictEqual(P.renderWrittenLine(s), '', 'with no written scripts at all, the card says nothing');
  P.setIndex([entry(P, 'wL', 'Luke 24 — <Jones>', WRITTEN_LUKE)]);
  let line = P.renderWrittenLine(s);
  assert.ok(/Written script: <strong>Luke 24 — &lt;Jones&gt;<\/strong>/.test(line) && /matched by title and wording/.test(line) && /data-action="written-pick"/.test(line));
  assert.ok(!/Redo this one/.test(line), 'nothing to redo before the first edit pass');
  await P.runEditOnSection(s, editor(nothing));
  assert.ok(/ran before this was matched\. Redo this one to use it/.test(P.renderWrittenLine(s)));
  await P.runEditOnSection(s, editor(nothing), null, false, { id: 'wL', title: 'Luke 24 — <Jones>', text: WRITTEN_LUKE });
  assert.ok(!/Redo this one/.test(P.renderWrittenLine(s)));
  assert.ok(/No written script matches this guide/.test(P.renderWrittenLine(guide(P, 'Luke – Chapter 3', 'in the fifteenth year of tiberius'))));
});

/* ---- The sign-off, and what reaches the Google Doc ---- */

test('approving makes a Final Transcript; a reference still marked to check asks first; a changed 1st Draft is refused', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'verse one on the first day of the week the women went to the tomb');
  await P.runEditOnSection(s, editor(Object.assign({}, nothing, { verses: [{ reference: 'Verse 1', startsWith: 'On the first day of', endsWith: 'went to the tomb', canonical: 'Luke 1:1', confidence: 'high', note: '' }] })));
  P.approveSection(s.id);
  assert.ok(!P.isFinal(s) && /still marked to check/.test(P.confirm.body), 'asked first');
  P.confirm.onConfirm();
  assert.ok(P.isFinal(s) && s.approvedAt > 0);
  P.unapproveSection(s.id);
  assert.ok(!P.isFinal(s));
  s.raw += ' and more';
  P.approveSection(s.id, true);
  assert.ok(!P.isFinal(s) && /has changed since/.test(P.flash));
});

test('a correction by hand takes a Final Transcript back to Edited', async () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'welcome back my friends');
  await P.runEditOnSection(s, editor(nothing));
  P.approveSection(s.id);
  assert.ok(P.isFinal(s));
  s.handDraft = s.corrected; P.saveHandEdit(s.id);
  assert.ok(P.isFinal(s), 'saving with nothing changed leaves the approval alone');
  s.handDraft = s.corrected.replace('friends', 'friends!'); P.saveHandEdit(s.id);
  assert.ok(!P.isFinal(s) && s.approvedAt === 0);
});

test('only Final Transcripts go into the Google Doc', async () => {
  const P = makePage();
  const a = guide(P, 'Luke – Chapter 1', 'many have undertaken to draw up an account'), b = guide(P, 'Luke – Chapter 2', 'in those days caesar augustus issued a decree');
  guide(P, 'Luke – Chapter 3', 'in the fifteenth year'); guide(P, '', '');
  await P.runEditOnSection(a, editor(nothing)); await P.runEditOnSection(b, editor(nothing));
  assert.deepStrictEqual(P.finalSections(), []);
  P.approveSection(b.id);
  const body = P.docBody();
  assert.ok(/<h2>Luke – Chapter 2<\/h2><p>In those days caesar augustus issued a decree\.<\/p>/.test(body), body);
  assert.ok(!/Chapter 1<|Chapter 3<|Untitled|Not run through/.test(body), 'an Edited Transcript, a 1st Draft and an empty card are all left out');
});

/* ---- found in review ---- */

test('found in review: a field that was only clicked into and left is not a change', () => {
  const P = makePage();
  const s = guide(P, 'Luke – Chapter 24', 'welcome back');
  assert.strictEqual(P.syncOneField({ dataset: { field: 'name', id: s.id }, value: 'Luke – Chapter 24' }), false);
  assert.strictEqual(P.syncOneField({ dataset: { field: 'raw', id: s.id }, value: 'welcome back my friends' }), true);
  assert.strictEqual(s.raw, 'welcome back my friends');
  assert.strictEqual(P.syncOneField({ dataset: { field: 'bookTitle' }, value: 'Luke' }), false);
  assert.strictEqual(P.syncOneField({ dataset: { field: 'name', id: 'not-there' }, value: 'x' }), false);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
