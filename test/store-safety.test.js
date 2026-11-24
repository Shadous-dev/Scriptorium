#!/usr/bin/env node
/*
 * store-safety.test.js — checks the three things the shared store has to get
 * right: SECURITY (what comes back from the store is shown as text, never run
 * as markup, and cannot knock the page over), CONSISTENCY (saves to one
 * document go one at a time and in order, and nothing is lost or put in the
 * wrong book), and CAPACITY (sizes are measured in bytes before saving, the
 * written scripts are listed past the first thousand, and nothing is left
 * behind in storage).
 *
 *   node test/store-safety.test.js
 *
 * No dependencies and no call to Claude, Google or the real store. Unlike the
 * other test files this one loads the WHOLE page (every module but the event
 * wiring) against a stand-in document and a stand-in store, so the real
 * drawing code runs on everything that is loaded.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dir = path.join(__dirname, '..', 'src', 'app');
const modules = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).filter((f) => f !== '17-events.js');
const source = modules.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

// A stand-in for the artifact's document store. `ctl` lets a test hold writes in the air and land them in any order.
function makeStore() {
  const store = new Map();
  const ctl = { hold: false, inflight: [], sets: [], deletes: [], reads: [], failSet: null, failRead: null, canOrder: true };
  const snap = (p) => ({ id: p.split('/').pop(), exists: store.has(p), data: () => (store.has(p) ? JSON.parse(JSON.stringify(store.get(p))) : undefined) });
  function doc(p) {
    return {
      id: p.split('/').pop(), path: p,
      get: () => Promise.resolve(snap(p)),
      set: (d) => {
        const data = JSON.parse(JSON.stringify(d));
        ctl.sets.push({ path: p, data });
        const err = ctl.failSet && ctl.failSet(p, data);
        if (err) return Promise.reject(err);
        if (!ctl.hold) { store.set(p, data); return Promise.resolve(); }
        return new Promise((resolve, reject) => ctl.inflight.push({ path: p, data, land: () => { store.set(p, data); resolve(); }, fail: (e) => reject(e) }));
      },
      delete: () => { ctl.deletes.push(p); store.delete(p); return Promise.resolve(); },
    };
  }
  function coll(p, filters, order, lim) {
    const q = {
      path: p,
      limit: (n) => coll(p, filters, order, n),
      doc: (id) => doc(p + '/' + id),
      get: () => {
        ctl.reads.push({ path: p, filters, order, limit: lim });
        const err = ctl.failRead && ctl.failRead({ path: p, filters, order });
        if (err) return Promise.reject(err);
        const depth = p.split('/').length + 1;
        let docs = Array.from(store.keys()).filter((k) => k.indexOf(p + '/') === 0 && k.split('/').length === depth).map(snap);
        filters.forEach(([f, op, v]) => { docs = docs.filter((d) => { const x = d.data()[f]; return x != null && (op === '>=' ? x >= v : op === '>' ? x > v : x === v); }); });
        if (order) docs.sort((a, b) => { const x = a.data()[order], y = b.data()[order]; return x == null ? 1 : y == null ? -1 : x - y; });
        else docs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        return Promise.resolve({ docs: docs.slice(0, lim || 1000) });
      },
    };
    if (ctl.canOrder) { q.where = (f, op, v) => coll(p, filters.concat([[f, op, v]]), order, lim); q.orderBy = (f) => coll(p, filters, f, lim); }
    return q;
  }
  return { store, ctl, db: { doc, collection: (p) => coll(p, [], null, 0) } };
}

function makePage(S) {
  S = S || makeStore();
  const page = new Function('S', `
    var root = { innerHTML: '', querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
    var document = { activeElement: null, getElementById: function (id) { return id === 'app-root' ? root : id === 'seed-state' ? { textContent: '' } : null; } };
    var window = { claude: { use: function (name) { return Promise.resolve(name === 'db' ? S.db : null); } } };
    var navigator = {};
    ${source}
    return { root: root, initStore: initStore, openBook: openBook, leaveBook: leaveBook, showLibrary: showLibrary, saveSection: saveSection, saveMeta: saveMeta, saveCaptions: saveCaptions, flushSaves: flushSaves,
             saveSectionSoon: saveSectionSoon, docToSection: docToSection, sectionToDoc: sectionToDoc, docsById: docsById, flatRows: flatRows, chipClass: chipClass, renderSectionSafe: renderSectionSafe, renderSection: renderSection,
             esc: esc, escAttr: escAttr, jsonBytes: jsonBytes, tameSpaces: tameSpaces, trimLineEnds: trimLineEnds, cleanWritten: cleanWritten, splitWritten: splitWritten, layoutBlocks: layoutBlocks, tabRequests: tabRequests, tabTitle: tabTitle,
             removeSection: removeSection, deleteBook: deleteBook, isStale: isStale, needsEdit: needsEdit, isFinal: isFinal, loadWrittenIndex: loadWrittenIndex, startWrittenForm: startWrittenForm, saveWritten: saveWritten, paint: paint, clearAllScripts: clearAllScripts, saveHandEdit: saveHandEdit,
             DOC_MAX_BYTES: DOC_MAX_BYTES, WRITTEN_MAX: WRITTEN_MAX,
             get state() { return state; }, get view() { return view; }, get bookId() { return bookId; }, get saveError() { return saveError; }, get flash() { return flash; }, get form() { return writtenForm; },
             get index() { return writtenIndex; }, get more() { return writtenMore; }, get dbStatus() { return dbStatus; }, setClearing: function (v) { clearing = v; } };
  `)(S);
  page.S = S;
  return page;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const settle = async () => { for (let i = 0; i < 60; i++) await new Promise((r) => setTimeout(r, 0)); };
const now = 1795500000000;
const guideDoc = (more) => Object.assign({ name: 'Luke – Chapter 1', raw: 'In the days of Herod.', corrected: 'In the days of Herod.', editedFromRaw: 'In the days of Herod.', hasEditedFrom: true, summary: '', changeCount: 0,
  misheard: [], nonsensical: [], edits: [], unapplied: [], verses: [], method: 'edits', status: 'edited', error: '', editedAt: now, descriptId: '', descriptName: '', suggested: [], misquotes: [], approvedAt: 0, writtenId: '', writtenUsed: null }, more || {});
const bookDoc = (order, more) => Object.assign({ bookTitle: 'Luke', wordsToSearchFor: '', order, nextId: 2, lastEditAt: now, approved: false, createdAt: now, touchedAt: now, finalCount: 0, scriptCount: order.length, editedCount: order.length, lastDoc: null }, more || {});
async function openWith(docs, order) {
  const S = makeStore();
  S.store.set('books/b1', bookDoc(order || Object.keys(docs)));
  Object.keys(docs).forEach((id) => S.store.set('books/b1/scripts/' + id, docs[id]));
  const P = makePage(S);
  P.initStore(); await settle();
  await P.openBook('b1'); await settle();
  return P;
}
const timed = (fn) => { const t = process.hrtime.bigint(); const out = fn(); return { out, ms: Number(process.hrtime.bigint() - t) / 1e6 }; };

/* ---- Security: what the store holds is text to show, never markup to run ---- */

const ATTACK = 'x" onmouseover="alert(1)" data-x="';

test('SECURITY: a status that is really markup cannot reach the page — the chip takes its class from a fixed list', async () => {
  const P = await openWith({ g1: guideDoc({ status: ATTACK }) });
  assert.strictEqual(P.state.sections[0].status, 'draft', 'a status the page does not know is read as a draft');
  assert.ok(!/onmouseover/.test(P.root.innerHTML), 'nothing of it is in the page');
  assert.strictEqual(P.chipClass({ status: ATTACK, raw: '', corrected: '' }), 'chip-draft', 'even handed one directly, the class is never built from it');
  ['draft', 'editing', 'edited', 'error'].forEach((st) => assert.strictEqual(P.chipClass({ status: st, raw: 'a', editedFromRaw: 'a', corrected: '', approvedAt: 0 }), 'chip-' + st));
});

test('SECURITY: markup in any stored text is shown as text — names, transcripts, summaries, change rows, references, errors', async () => {
  const bad = '<img src=x onerror=alert(1)>', close = '</textarea><script>alert(1)</script>';
  const P = await openWith({
    g1: guideDoc({ name: bad + '"\'', raw: close, corrected: 'He said, ' + bad, summary: bad, edits: [{ find: bad, replace: close, kind: 'misheard', note: bad }], unapplied: [{ find: bad, replace: bad }],
      verses: [{ quote: bad, canonical: bad, reference: bad, written: bad, note: bad, confidence: 'low' }], nonsensical: [{ original: bad, issue: bad }], misquotes: [{ said: bad, verse: bad, reference: bad }], suggested: [{ find: bad, replace: bad, note: bad }] }),
    g2: guideDoc({ name: 'Second', status: 'error', error: bad }),
  });
  const html = P.root.innerHTML;
  assert.ok(html.length > 2000, 'the book was drawn');
  assert.ok(!/<img\b/i.test(html) && !/<script\b/i.test(html), 'no tag of the attacker\'s is in the page');
  assert.ok(!/<\/textarea><script/i.test(html), 'a transcript cannot close its own box');
  assert.ok(/&lt;img src=x onerror=alert\(1\)&gt;/.test(html), 'it is there as text');
  assert.strictEqual(P.escAttr('a"b\'c<d>&'), 'a&quot;b&#39;c&lt;d&gt;&amp;', 'both kinds of quote are escaped for an attribute');
});

test('SECURITY: the book title, a link to the last Doc and the library list take nothing on trust', async () => {
  const S = makeStore();
  S.store.set('books/b1', bookDoc(['g1'], { bookTitle: '"><script>alert(1)</script>', lastDoc: { url: 'javascript:alert(1)', at: now, kind: 'doc' } }));
  S.store.set('books/b2', bookDoc([], { bookTitle: 'Acts', lastDoc: { url: 'https://docs.google.com/document/d/abc/edit', at: now, kind: '"><b>' } }));
  S.store.set('books/b1/scripts/g1', guideDoc());
  const P = makePage(S);
  P.initStore(); await settle();
  assert.ok(!/<script\b/i.test(P.root.innerHTML), 'the library list');
  await P.openBook('b1'); await settle();
  assert.ok(!/<script\b/i.test(P.root.innerHTML) && !/javascript:/i.test(P.root.innerHTML), 'only an https link is ever shown as a link');
  assert.strictEqual(P.state.lastDoc, null);
  await P.openBook('b2'); await settle();
  assert.ok(/href="https:\/\/docs\.google\.com\/document\/d\/abc\/edit"/.test(P.root.innerHTML) && !/<b>/.test(P.root.innerHTML));
});

test('SECURITY: a document named like part of the page\'s own machinery is ignored', async () => {
  const P = await openWith({ g1: guideDoc(), constructor: guideDoc({ name: 'Trap' }), __proto__x: guideDoc({ name: 'Fine' }) }, ['g1', 'constructor', 'toString', '__proto__x']);
  assert.deepStrictEqual(P.state.sections.map((s) => s.id), ['g1', '__proto__x'], 'only real guides');
  const byId = P.docsById({ docs: [{ id: '__proto__', data: () => ({ raw: 'x' }) }, { id: 'constructor', data: () => ({}) }, { id: 'g9', data: () => ({ raw: 'y' }) }] });
  assert.deepStrictEqual(Object.keys(byId), ['g9']);
  assert.strictEqual(byId.toString, undefined, 'nothing is inherited, so a missing id is simply missing');
});

test('SECURITY: lists that hold the wrong kind of thing are read as empty rows, and the book still opens', async () => {
  const P = await openWith({
    g1: guideDoc({ verses: [null, 'a string', 7, ['x'], { canonical: { nested: true }, quote: ['a'], reference: 'Luke 1:1' }], edits: 'not a list', misheard: [null, { heard: { a: 1 }, likely: 'Uz' }], nonsensical: { length: 3 }, name: ['x'], raw: { a: 1 }, approvedAt: 'soon', writtenUsed: 'x' }),
    g2: guideDoc({ name: 'Luke – Chapter 2' }),
  });
  assert.deepStrictEqual(P.state.sections[0].verses, [{ reference: 'Luke 1:1' }], 'only flat rows are kept, and only their plain values');
  assert.deepStrictEqual(P.state.sections[0].edits, []);
  assert.deepStrictEqual(P.state.sections[0].misheard, [{ likely: 'Uz' }]);
  assert.strictEqual(P.state.sections[0].approvedAt, 0);
  assert.ok(/Luke – Chapter 2/.test(P.root.innerHTML), 'the rest of the book is on screen');
});

test('SECURITY: one guide that cannot be drawn does not take the book off the screen', () => {
  const P = makePage();
  const broken = { id: 'g"1', name: '<b>Broken</b>', get status() { throw new Error('boom'); } };
  const html = P.renderSectionSafe(broken);
  assert.ok(/holds something the page can’t show/.test(html) && /Nothing has been deleted/.test(html));
  assert.ok(!/<b>/.test(html) && /data-section="g&quot;1"/.test(html));
});

test('SECURITY: text padded with a huge run of spaces no longer freezes the page', () => {
  const P = makePage();
  const pad = ' '.repeat(200000), text = 'Welcome back' + pad + 'my friends.' + pad + '\nNext line.   \n\n\n\nEnd.';
  const a = timed(() => P.cleanWritten(text));
  assert.ok(a.ms < 500, 'cleaning a written script took ' + a.ms.toFixed(0) + ' ms');
  assert.strictEqual(a.out, 'Welcome back my friends.\nNext line.\n\nEnd.', 'the words and the line breaks are untouched');
  const b = timed(() => P.splitWritten('# a' + ' '.repeat(100000) + 'x\n\n## Luke 1\n\nOne.\n\n## Luke 2\n\nTwo.', 'Jones'));
  assert.ok(b.ms < 500, 'reading headings took ' + b.ms.toFixed(0) + ' ms');
  assert.deepStrictEqual(b.out.map((p) => p.title), ['Luke 1', 'Luke 2']);
  const c = timed(() => P.layoutBlocks({ corrected: 'One sentence.' + pad + 'Another one.\n\nA second paragraph.', verses: [] }));
  assert.ok(c.ms < 500, 'laying out a transcript took ' + c.ms.toFixed(0) + ' ms');
  assert.deepStrictEqual(c.out.map((x) => x.text), ['One sentence. Another one.', 'A second paragraph.']);
  assert.strictEqual(P.tameSpaces('a' + ' '.repeat(40) + 'b'), 'a' + ' '.repeat(40) + 'b', 'ordinary spacing is left exactly as it is');
  assert.strictEqual(P.trimLineEnds('a  \nb\t\n c'), 'a\nb\n c');
});

/* ---- Consistency: one write at a time per document, in order, into the right book ---- */

test('CONSISTENCY: saves to one guide go one at a time, and of those waiting only the newest is sent', async () => {
  const P = await openWith({ g1: guideDoc() });
  const s = P.state.sections[0], ctl = P.S.ctl;
  ctl.hold = true; ctl.sets.length = 0;
  s.raw = 'first'; P.saveSection('g1');
  s.raw = 'second'; P.saveSection('g1');
  s.raw = 'third'; P.saveSection('g1');
  await settle();
  assert.strictEqual(ctl.sets.length, 1, 'while one save is on its way, no other is sent to the same guide');
  ctl.inflight.shift().land(); await settle();
  assert.deepStrictEqual(ctl.sets.map((x) => x.data.raw), ['first', 'third'], 'the one in between was never needed');
  ctl.inflight.shift().land(); await settle();
  assert.strictEqual(P.S.store.get('books/b1/scripts/g1').raw, 'third');
  assert.strictEqual(ctl.inflight.length, 0);
});

test('CONSISTENCY: an older save can no longer land after a newer one and put old words back', async () => {
  const P = await openWith({ g1: guideDoc() });
  const s = P.state.sections[0], ctl = P.S.ctl;
  ctl.hold = true;
  s.raw = 'old words'; P.saveSection('g1');
  s.raw = 'new words'; P.saveSection('g1');
  await settle();
  // Whatever order the network would have delivered two overlapping saves in, there is now only ever one in the air.
  while (ctl.inflight.length) { ctl.inflight.pop().land(); await settle(); }
  assert.strictEqual(P.S.store.get('books/b1/scripts/g1').raw, 'new words');
});

test('CONSISTENCY: different guides, the book\'s own document and captions do not wait for each other', async () => {
  const P = await openWith({ g1: guideDoc(), g2: guideDoc({ name: 'Luke – Chapter 2' }) });
  const ctl = P.S.ctl;
  ctl.hold = true; ctl.sets.length = 0;
  P.state.sections[0].raw = 'a'; P.state.sections[1].raw = 'b'; P.state.sections[0].captions = '1\n00:00:01,000 --> 00:00:02,000\na\n';
  P.saveSection('g1'); P.saveSection('g2'); P.saveMeta(); P.saveCaptions('g1');
  await settle();
  assert.deepStrictEqual(ctl.sets.map((x) => x.path).sort(), ['books/b1', 'books/b1/captions/g1', 'books/b1/scripts/g1', 'books/b1/scripts/g2']);
});

test('CONSISTENCY: leaving for another book while a save waits loses nothing and writes nothing into the wrong book', async () => {
  const S = makeStore();
  S.store.set('books/b1', bookDoc(['g1'])); S.store.set('books/b1/scripts/g1', guideDoc());
  S.store.set('books/b2', bookDoc(['g1'], { bookTitle: 'Acts' })); S.store.set('books/b2/scripts/g1', guideDoc({ name: 'Acts – Chapter 1', raw: 'The former treatise.' }));
  const P = makePage(S);
  P.initStore(); await settle(); await P.openBook('b1'); await settle();
  S.ctl.hold = true;
  P.state.sections[0].raw = 'typed first'; P.saveSection('g1');
  P.state.sections[0].raw = 'typed last, then left'; P.saveSection('g1');
  P.openBook('b2'); await settle();
  while (S.ctl.inflight.length) { S.ctl.inflight.shift().land(); await settle(); }
  assert.strictEqual(S.store.get('books/b1/scripts/g1').raw, 'typed last, then left', 'the last words typed in the first book are saved there');
  assert.strictEqual(S.store.get('books/b2/scripts/g1').raw, 'The former treatise.', 'and the second book, whose guide has the same id, is untouched');
  assert.strictEqual(P.bookId, 'b2');
});

test('CONSISTENCY: when the page is closing, the last change is sent at once and nothing older can follow it', async () => {
  const P = await openWith({ g1: guideDoc() });
  const s = P.state.sections[0], ctl = P.S.ctl;
  ctl.hold = true; ctl.sets.length = 0;
  s.raw = 'one'; P.saveSection('g1');
  s.raw = 'two'; P.saveSection('g1');                       // waiting behind "one"
  s.raw = 'three'; P.saveSectionSoon('g1');                 // typed, not yet due
  P.flushSaves(true);                                       // the tab is closed
  assert.deepStrictEqual(ctl.sets.map((x) => x.data.raw), ['one', 'three'], 'sent straight away, not queued');
  while (ctl.inflight.length) { ctl.inflight.shift().land(); await settle(); }
  assert.strictEqual(P.S.store.get('books/b1/scripts/g1').raw, 'three', 'the save that was waiting did not put "two" back afterwards');
});

test('CONSISTENCY: a guide a teammate added is kept if it holds anything at all — a name is enough', async () => {
  const P = await openWith({ g1: guideDoc(), g2: guideDoc({ name: 'Luke – Chapter 2', raw: '', corrected: '', status: 'draft' }), g3: guideDoc({ name: '', raw: '', corrected: '', status: 'draft' }) }, ['g1']);
  assert.deepStrictEqual(P.state.sections.map((s) => s.id), ['g1', 'g2'], 'the named one is back at the end; the wholly empty one is not shown');
});

test('CONSISTENCY: a book cannot be left while it is being cleared', async () => {
  const P = await openWith({ g1: guideDoc() });
  P.setClearing(true); P.leaveBook(); await settle();
  assert.strictEqual(P.view, 'book');
  assert.ok(/Still clearing this book/.test(P.flash));
});

test('CONSISTENCY: a guide saved without a second copy of its 1st Draft is read as edited from it, not as changed since', async () => {
  const P = await openWith({ g1: guideDoc({ editedFromRaw: '', hasEditedFrom: false, editedSame: true, approvedAt: now }) });
  const s = P.state.sections[0];
  assert.strictEqual(s.editedFromRaw, s.raw);
  assert.ok(!P.isStale(s) && !P.needsEdit(s) && P.isFinal(s));
  assert.strictEqual(P.sectionToDoc(s).editedFromRaw, s.raw, 'this version still writes the copy, so a page left open on the older version reads it correctly');
});

/* ---- Capacity: sizes in bytes, nothing left behind, more than a thousand written scripts ---- */

test('CAPACITY: a guide too large for one document is not sent, and the reader is told which one and how large', async () => {
  const P = await openWith({ g1: guideDoc() });
  const s = P.state.sections[0], ctl = P.S.ctl;
  ctl.sets.length = 0;
  s.name = 'Luke – the whole book'; s.raw = 'word '.repeat(60000);            // 300,000 characters
  P.saveSection('g1'); await settle();
  assert.strictEqual(ctl.sets.length, 0, 'nothing was sent for the store to refuse');
  assert.ok(/“Luke – the whole book” is too large to save: \d+ KB/.test(P.saveError) && /still on screen/.test(P.saveError) && /Split it into two guides/.test(P.saveError), P.saveError);
  s.raw = 'A normal transcript.'; P.saveSection('g1'); await settle();
  assert.strictEqual(P.saveError, null, 'and once it fits, it saves and the message goes');
});

test('CAPACITY: size is counted in bytes — text under the character limit can still be too large', async () => {
  const P = await openWith({ g1: guideDoc() });
  const s = P.state.sections[0], ctl = P.S.ctl;
  assert.strictEqual(P.jsonBytes({ t: 'aé—語😀' }), Buffer.byteLength(JSON.stringify({ t: 'aé—語😀' })));
  ctl.sets.length = 0;
  s.captions = '1\n00:00:01,000 --> 00:00:02,000\n' + '語'.repeat(90000) + '\n';         // 90,000 characters, 270,000 bytes
  P.saveCaptions('g1'); await settle();
  assert.strictEqual(ctl.sets.length, 0);
  assert.ok(/The timed captions for “Luke – Chapter 1” is too large to save/.test(P.saveError), P.saveError);
  P.startWrittenForm(); P.form.title = 'Luke 1'; P.form.text = '語'.repeat(90000);
  assert.ok(P.form.text.length < P.WRITTEN_MAX);
  P.saveWritten(); await settle();
  assert.strictEqual(ctl.sets.length, 0, 'a written script is measured the same way');
  assert.ok(/too long to keep in one piece: \d+ KB/.test(P.form.error), P.form.error);
});

test('CAPACITY: when storage is full the reader is told, the work stays on screen, and the save is not hammered', async () => {
  const P = await openWith({ g1: guideDoc() });
  const ctl = P.S.ctl;
  ctl.sets.length = 0; ctl.failSet = () => ({ code: 'quota_exceeded' });
  P.state.sections[0].raw = 'more words'; P.saveSection('g1'); await settle();
  assert.strictEqual(ctl.sets.length, 1, 'tried once; trying again cannot succeed');
  assert.ok(/storage is full/.test(P.saveError) && /still on screen/.test(P.saveError), P.saveError);
  assert.strictEqual(P.state.sections[0].raw, 'more words');
});

test('CAPACITY: a written script whose listing could not be saved leaves no text behind in storage', async () => {
  const S = makeStore(), P = makePage(S);
  P.initStore(); await settle();
  S.ctl.failSet = (p) => (/^written\//.test(p) ? { code: 'unavailable' } : null);
  P.startWrittenForm(); P.form.title = 'Luke 1'; P.form.text = 'Welcome back, my friends.';
  P.saveWritten(); await settle();
  assert.ok(/couldn’t be saved just now/.test(P.form.error));
  assert.deepStrictEqual(Array.from(S.store.keys()).filter((k) => /^written/.test(k)), [], 'neither the listing nor an orphaned text');
  assert.strictEqual(S.ctl.deletes.length, 1);
});

function fillWritten(S, n) {
  for (let i = 0; i < n; i++) S.store.set('written/w' + String(i).padStart(5, '0'), { title: 'Psalm ' + ((i % 150) + 1) + ' — script ' + i, chars: 100, at: now + Math.floor(i / 3), source: 'paste', sourceName: '', sketch: [] });
}

test('CAPACITY: more than a thousand written scripts are all listed — a whole Bible is more than a thousand', async () => {
  const S = makeStore(); fillWritten(S, 2350);
  S.store.set('written/noTime', { title: 'Luke 1 — saved with no time on it', chars: 5, source: 'paste', sketch: [] });
  const P = makePage(S);
  P.initStore(); await settle();
  assert.strictEqual(P.index.length, 2351, 'every one, the one with no time on it included');
  assert.strictEqual(new Set(P.index.map((w) => w.id)).size, 2351, 'and none twice');
  assert.strictEqual(P.more, false);
  assert.ok(S.ctl.reads.filter((r) => r.path === 'written').every((r) => r.limit === 1000), 'each read asks for no more than the store allows');
});

test('CAPACITY: a small library is still read in one go', async () => {
  const S = makeStore(); fillWritten(S, 40);
  const P = makePage(S);
  P.initStore(); await settle();
  assert.strictEqual(P.index.length, 40);
  assert.strictEqual(S.ctl.reads.filter((r) => r.path === 'written').length, 1);
});

test('CAPACITY: if the store will not page, the first thousand are listed and the page says some are missing', async () => {
  const S = makeStore(); fillWritten(S, 1200); S.ctl.canOrder = false;
  const P = makePage(S);
  P.initStore(); await settle();
  assert.strictEqual(P.index.length, 1000); assert.strictEqual(P.more, true);
  const S2 = makeStore(); fillWritten(S2, 1200); S2.ctl.failRead = (r) => (r.order ? { code: 'resource_exhausted' } : null);
  const P2 = makePage(S2);
  P2.initStore(); await settle();
  assert.strictEqual(P2.index.length, 1000); assert.strictEqual(P2.more, true);
});

test('CAPACITY: removing a guide removes both of its documents, and deleting a book removes everything under it', async () => {
  const S = makeStore();
  S.store.set('books/b1', bookDoc(['g1', 'g2'])); S.store.set('books/b1/scripts/g1', guideDoc()); S.store.set('books/b1/scripts/g2', guideDoc());
  S.store.set('books/b1/captions/g1', { srt: 'x' }); S.store.set('books/b1/captions/g2', { srt: 'y' });
  S.store.set('written/w1', { title: 'Luke 1', chars: 1, at: now, source: 'paste', sketch: [] }); S.store.set('writtenText/w1', { text: 'x' });
  const P = makePage(S);
  P.initStore(); await settle(); await P.openBook('b1'); await settle();
  P.removeSection('g1'); await settle();
  assert.ok(!S.store.has('books/b1/scripts/g1') && !S.store.has('books/b1/captions/g1'), 'the guide and its captions are both gone');
  assert.ok(S.store.has('books/b1/scripts/g2') && S.store.has('books/b1/captions/g2'), 'the other guide is untouched');
  assert.deepStrictEqual(S.store.get('books/b1').order, ['g2']);
  await P.showLibrary(); await settle();
  await P.deleteBook('b1'); await settle();
  assert.deepStrictEqual(Array.from(S.store.keys()).sort(), ['written/w1', 'writtenText/w1'], 'nothing of the book is left, and the written scripts are not touched');
});

/* ---- The Google Doc: positions survive awkward characters ---- */

test('a tab\'s positions still point at the right words when the text holds characters Google drops', () => {
  const P = makePage();
  const verse = { quote: 'In the beginning was the Word.', canonical: 'John 1:1' };
  const s = { name: 'John\u0007 – Chapter\u000B 1', corrected: 'Welcome\u0008 back.\uE000\n\n"In the beginning was the Word."\n\nThat is\u2028 where John starts.', verses: [verse] };
  const requests = P.tabRequests(s, 't.1', 0), text = requests[0].insertText.text, body = '\u0000' + text + '\n';
  assert.ok(Array.from(text).every((ch) => { const c = ch.charCodeAt(0); return c === 10 || (c >= 32 && c !== 127 && c !== 0x2028 && c !== 0x2029 && !(c >= 0xE000 && c <= 0xF8FF)); }), 'nothing Google would drop or treat as a break is sent');
  assert.strictEqual(text.split('\n')[0], 'John – Chapter 1');
  const bold = requests.filter((r) => r.updateTextStyle)[0].updateTextStyle.range;
  assert.strictEqual(body.slice(bold.startIndex, bold.endIndex), '"In the beginning was the Word." (John 1:1)', 'the bold is on the verse, exactly');
  assert.ok(/Welcome back\.\n/.test(text) && /That is where John starts\.$/.test(text), 'every word is still there');
});

test('a very long guide name is cut for the tab\'s label only; the heading inside keeps it whole', () => {
  const P = makePage();
  const name = 'Luke – Chapter 24 – ' + 'the road to Emmaus and what was said on it '.repeat(4);
  const requests = P.tabRequests({ name, corrected: 'Welcome back.', verses: [] }, 't.1', 0);
  assert.strictEqual(P.tabTitle({ name }, 0).length <= 100, true);
  assert.strictEqual(requests[0].insertText.text.split('\n')[0], name.trim());
  const h = requests[1].updateParagraphStyle.range;
  assert.strictEqual(h.endIndex - h.startIndex, name.trim().length);
});

test('a heading that quotes a verse is not the start of a new written script', () => {
  const P = makePage();
  const one = 'Welcome back, my friends. Today we look at how the whole of Scripture leans on these two verses and why they matter.';
  assert.strictEqual(P.splitWritten('## John 3:16\n\n' + one + '\n\n## Romans 8:28\n\n' + one, 'Jones sermon notes').length, 1);
  assert.strictEqual(P.splitWritten('## John 3\n\n' + one + '\n\n## Romans 8\n\n' + one, 'Jones scripts').length, 2, 'chapter headings still are');
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
  process.exit(process.exitCode || 0);            // the page keeps a clock ticking; a test run does not wait for it
})();
