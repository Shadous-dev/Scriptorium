#!/usr/bin/env node
/*
 * references.test.js — checks SOURCE-OF-TRUTH 4.10: every scripture reference
 * is checked by the page, and never silently changed.
 *
 *   node test/references.test.js
 *
 * No dependencies and no call to Claude. The page's modules are written for
 * the browser (build.js pastes them into one shared scope), so this loads
 * their text the same way and adds the few things they expect around them.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const load = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', file), 'utf8');
const source = ['02-helpers.js', '03-text.js', '10-edit-pipeline.js', '13-captions.js', '16-references.js'].map(load).join('\n');
const P = new Function(`
  var state = { bookTitle: 'Luke', wordsToSearchFor: '', sections: [] }, bookId = 'b1', flashed = [], saved = [];
  var root = { querySelector: function () { return null; } };
  function findSection(id) { return state.sections.filter(function (x) { return x.id === id; })[0]; }
  function showFlash(m) { flashed.push(m); }
  function paint() {} function paintSection() {}
  function saveSection(id) { saved.push(id); return Promise.resolve(); } function saveMeta() { return Promise.resolve(); }
  ${source}
  return { state, flashed, saved, CANON, CHAPTERS, bookName, findBook, parseRef, formatRef, refProblem, parseSpoken, guideRef, refChecks, flaggedRefs, refsIn, writtenRefFor, noteWrittenRefs,
           setReference, useSuggestedRef, isFinal };
`)();

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let nextId = 1;
const guide = (name, verses) => { const s = { id: 'g' + (nextId++), name, raw: 'x', corrected: 'x', editedFromRaw: 'x', status: 'edited', edits: [], verses, approvedAt: 0 }; P.state.sections.push(s); return s; };
const verse = (reference, canonical, more) => Object.assign({ reference, canonical, startsWith: 'On the first day', endsWith: 'to the tomb.', confidence: 'high', note: '' }, more || {});
const check = (name, v) => P.refChecks(guide(name, [v]))[0];
const picks = (c) => c.suggestions.map((x) => x.ref);

test('the Bible\'s own shape: 66 books and 1,189 chapters', () => {
  assert.strictEqual(P.CANON.length, 66);
  assert.strictEqual(P.CANON.reduce((sum, b) => sum + b[1], 0), 1189);
  assert.strictEqual(P.CHAPTERS.Luke, 24);
  assert.strictEqual(P.CHAPTERS.Psalms, 150);
});

test('a book is recognised however it is written, and an ordinary word is not taken for one', () => {
  [['Luke', 'Luke'], ['1 Samuel', '1 Samuel'], ['first samuel', '1 Samuel'], ['2nd Kings', '2 Kings'], ['Psalm', 'Psalms'], ['Ps.', 'Psalms'], ['Song of Solomon', 'Song of Songs'],
   ['Revelations', 'Revelation'], ['John', 'John'], ['3 John', '3 John'], ['Matt', 'Matthew']].forEach(([said, book]) => assert.strictEqual(P.bookName(said), book, said));
  ['Samuel', '3 Kings', '2 Isaiah', 'Hezekiah', 'the song', ''].forEach((not) => assert.strictEqual(P.bookName(not), '', not + ' is not a book'));
  // In a phrase, a name counts only at the start or with a chapter after it.
  assert.strictEqual(P.findBook('Isaiah 3 verses 2 through 4').book, 'Isaiah');
  assert.strictEqual(P.findBook('as we read in John chapter 3').book, 'John');
  assert.strictEqual(P.findBook('he did a good job in verse 3'), null);
  assert.strictEqual(P.findBook('mark my words, verse 5'), null, '"mark" followed by words is not the Gospel');
});

test('a reference is read, and written back the same way', () => {
  [['Luke 24:1', 'Luke 24:1'], ['Luke 1:30-33', 'Luke 1:30-33'], ['1 John 2:3', '1 John 2:3'], ['Luke 23:56-24:1', 'Luke 23:56-24:1'], ['Jude 5', 'Jude 5'], ['Jude 1:5', 'Jude 5'],
   ['Psalm 23:1', 'Psalm 23:1'], ['Psalms 23:1', 'Psalm 23:1'], ['Luke 24', 'Luke 24'], ['luke 7:13–14', 'Luke 7:13-14'], ['Song of Solomon 2:1', 'Song of Songs 2:1']]
    .forEach(([text, out]) => assert.strictEqual(P.formatRef(P.parseRef(text)), out, text));
  ['', 'verse one', 'Luke', 'Luke twenty-four', 'Hezekiah 3:1', 'Luke 1:5, 8'].forEach((text) => assert.strictEqual(P.parseRef(text), null, text + ' cannot be read as one reference'));
});

test('a reference that names no real place says so', () => {
  assert.strictEqual(P.refProblem(P.parseRef('Luke 24:1')), '');
  assert.ok(/24 chapters/.test(P.refProblem(P.parseRef('Luke 31:6'))));
  assert.ok(/one chapter/.test(P.refProblem({ book: 'Jude', chapter: 2, verse: 1, endChapter: 0, endVerse: 0 })));
  assert.ok(P.refProblem(P.parseRef('Luke 23:56-25:1')), 'the end of a span is checked too');
});

test('what was said aloud is read for the book, chapter and verse it names', () => {
  const said = (text) => { const s = P.parseSpoken(text); return [s.book, s.chapter, s.verse, s.endVerse]; };
  assert.deepStrictEqual(said('Verse one'), ['', 0, 1, 0]);
  assert.deepStrictEqual(said('verse 13'), ['', 0, 13, 0]);
  assert.deepStrictEqual(said('verses two through four'), ['', 0, 2, 4]);
  assert.deepStrictEqual(said('Job 2:4'), ['Job', 2, 4, 0]);
  assert.deepStrictEqual(said('Isaiah 3 verses two through four'), ['Isaiah', 3, 2, 4]);
  assert.deepStrictEqual(said('chapter 24, verse 1'), ['', 24, 1, 0]);
  assert.deepStrictEqual(said('Luke chapter twenty-four verse one'), ['Luke', 24, 1, 0]);
  assert.deepStrictEqual(said('Luke 24:1-3'), ['Luke', 24, 1, 3]);
  assert.deepStrictEqual(said('Jude 5'), ['Jude', 1, 5, 0]);
  assert.deepStrictEqual(said(''), ['', 0, 0, 0]);
});

test('a guide says what it is on only when its name is plainly about a book', () => {
  P.state.bookTitle = 'Luke';
  assert.deepStrictEqual(P.guideRef({ name: 'Luke – Chapter 24' }), { book: 'Luke', chapter: 24 });
  assert.deepStrictEqual(P.guideRef({ name: 'Psalm 23' }), { book: 'Psalms', chapter: 23 });
  assert.deepStrictEqual(P.guideRef({ name: '1 Samuel – Chapter 3 (v2, UPDATE)' }), { book: '1 Samuel', chapter: 3 });
  assert.deepStrictEqual(P.guideRef({ name: 'Luke – Introduction' }), { book: 'Luke', chapter: 0 });
  assert.deepStrictEqual(P.guideRef({ name: 'Chapter 7' }), { book: 'Luke', chapter: 7 }, 'the book comes from the book\'s title');
  assert.deepStrictEqual(P.guideRef({ name: 'Jude' }), { book: 'Jude', chapter: 1 });
  P.state.bookTitle = 'Science and the Bible';
  assert.deepStrictEqual(P.guideRef({ name: 'Acts of Kindness – Day 1' }), { book: '', chapter: 0 });
  assert.deepStrictEqual(P.guideRef({ name: 'Mark my words' }), { book: '', chapter: 0 });
  P.state.bookTitle = 'Luke';
});

test('THE CASE: Luke 24:1 that came back as Luke 1:1 is caught, and Luke 24:1 is offered', () => {
  // "Verse one", spoken in the guide on Luke 24.
  let c = check('Luke – Chapter 24', verse('Verse one', 'Luke 1:1'));
  assert.strictEqual(c.issues.length, 1);
  assert.ok(/said “Verse one”/.test(c.issues[0]) && /Luke 24/.test(c.issues[0]), c.issues[0]);
  assert.deepStrictEqual(picks(c), ['Luke 24:1']);
  // Spoken in full.
  c = check('Luke – Chapter 24', verse('Luke 24:1', 'Luke 1:1'));
  assert.deepStrictEqual(picks(c), ['Luke 24:1']);
  // A span the edit pass counted keeps its length.
  c = check('Luke – Chapter 24', verse('verse one', 'Luke 1:1-3'));
  assert.deepStrictEqual(picks(c), ['Luke 24:1-3']);
  // …and a span that was said aloud is used as said.
  c = check('Luke – Chapter 24', verse('verses one through twelve', 'Luke 1:1-3'));
  assert.deepStrictEqual(picks(c), ['Luke 24:1-12']);
});

test('a reference that agrees with what was said raises nothing', () => {
  [['Verse one', 'Luke 24:1'], ['verse 13', 'Luke 24:13-14'], ['verse 14', 'Luke 24:13-14'], ['Luke 24:1', 'Luke 24:1'], ['chapter 24 verse 5', 'Luke 24:5'], ['', 'John 3:16'], ['Isaiah 53:5', 'Isaiah 53:5'], ['Psalm 22', 'Psalm 22:1']]
    .forEach(([said, ref]) => { const c = check('Luke – Chapter 24', verse(said, ref)); assert.deepStrictEqual([c.issues, picks(c)], [[], []], said + ' / ' + ref); });
});

test('each kind of disagreement is said in a sentence, with the likelier reference beside it', () => {
  let c = check('Luke – Chapter 24', verse('verse 13', 'Luke 24:30'));
  assert.ok(c.issues.length === 1 && picks(c)[0] === 'Luke 24:13');
  c = check('Luke – Chapter 24', verse('chapter 23 verse 5', 'Luke 24:5'));
  assert.deepStrictEqual(picks(c), ['Luke 23:5']);
  c = check('Luke – Chapter 24', verse('Isaiah 53:5', 'Isaiah 35:5'));
  assert.deepStrictEqual(picks(c), ['Isaiah 53:5']);
  c = check('Luke – Chapter 24', verse('', 'Luke 31:6'));
  assert.ok(/no Luke 31/.test(c.issues[0]) && !picks(c).length);
  // No reference at all, but it was said aloud: that is offered.
  c = check('Luke – Chapter 24', verse('verse 5', ''));
  assert.deepStrictEqual(picks(c), ['Luke 24:5']);
  // A suggestion is always a real place.
  c = check('Luke – Chapter 24', verse('verse 95', 'Luke 1:95'));
  assert.ok(c.issues.length);
});

test('a chapter named aloud carries forward: after "Isaiah 53", a bare "verse 5" may be Isaiah 53:5', () => {
  const s = guide('Luke – Chapter 24', [verse('Isaiah 53:4', 'Isaiah 53:4'), verse('verse 5', 'Isaiah 53:5'), verse('verse 6', 'Luke 24:6'), verse('verse 7', 'John 3:7')]);
  const checks = P.refChecks(s);
  assert.deepStrictEqual(checks.map((c) => c.issues.length), [0, 0, 0, 1]);
  assert.deepStrictEqual(picks(checks[3]), ['Luke 24:7', 'Isaiah 53:7']);
});

test('a guide the page cannot place raises nothing for a bare "verse one"', () => {
  P.state.bookTitle = 'Science and the Bible';
  const c = check('Day 3', verse('verse one', 'Genesis 1:1'));
  assert.deepStrictEqual([c.issues, picks(c)], [[], []]);
  P.state.bookTitle = 'Luke';
});

test('the written script: its reference settles what was meant, or is offered first', () => {
  let c = check('Luke – Chapter 24', verse('verse one', 'Luke 24:1', { written: 'Luke 24:1' }));
  assert.strictEqual(c.confirmed, 'written');
  // It agrees with the reference even though the words spoken would not have been enough.
  c = check('Luke – Chapter 24', verse('verse 5', 'Isaiah 53:5', { written: 'Isaiah 53:5-6' }));
  assert.deepStrictEqual([c.confirmed, c.issues], ['written', []]);
  // It disagrees: said so, and offered ahead of the rest.
  c = check('Luke – Chapter 24', verse('verse one', 'Luke 1:1', { written: 'Luke 24:1-3' }));
  assert.ok(c.issues.some((i) => /written script has Luke 24:1-3/.test(i)));
  assert.deepStrictEqual(picks(c), ['Luke 24:1-3', 'Luke 24:1']);
  assert.strictEqual(c.suggestions[0].why, 'the written script');
});

test('the reference a teacher wrote is found beside the same quotation in the written script', () => {
  const g = { book: 'Luke', chapter: 7 };
  const v = { startsWith: 'When the Lord saw her', endsWith: 'I say to you, get up' };
  const after = 'Notice the compassion.\n\n"When the Lord saw her, his heart went out to her and he said, \'Don\'t cry.\' … \'Young man, I say to you, get up!\'" (Luke 7:13-14)\n\nThe dead man sat up.';
  assert.strictEqual(P.writtenRefFor(after, v, g), 'Luke 7:13-14');
  const before = 'Earlier, in Luke 7:1-2, a centurion. Now in verse 13,\n"When the Lord saw her, his heart went out to her and he said, Don\'t cry. Young man, I say to you, get up!"\nThe dead man sat up (v. 15).';
  assert.strictEqual(P.writtenRefFor(before, v, g), 'Luke 7:13');
  const bare = '7:13-14 — "When the Lord saw her, his heart went out to her … I say to you, get up!"';
  assert.strictEqual(P.writtenRefFor(bare, v, g), 'Luke 7:13-14');
  assert.strictEqual(P.writtenRefFor('Nothing like it here.', v, g), '', 'a quotation the script does not have gets no reference');
  assert.strictEqual(P.writtenRefFor('"When the Lord saw her … get up!" What a moment.', v, g), '', 'and none is made up when the script gives none');
  // Each verse of a guide remembers what was beside it.
  const s = guide('Luke – Chapter 7', [verse('verse 13', 'Luke 7:13-14', v)]);
  P.noteWrittenRefs(s, after);
  assert.strictEqual(s.verses[0].written, 'Luke 7:13-14');
});

test('4.10: nothing here changes a reference on its own', () => {
  const s = guide('Luke – Chapter 24', [verse('Verse one', 'Luke 1:1', { written: 'Luke 24:1' })]);
  const before = JSON.stringify(s);
  P.refChecks(s); P.flaggedRefs(s);
  assert.strictEqual(JSON.stringify(s), before);
  assert.strictEqual(P.flaggedRefs(s), 1);
});

test('a person choosing a reference: it is set, listed as a change, and the guide is no longer Final', () => {
  const s = guide('Luke – Chapter 24', [verse('Verse one', 'Luke 1:1')]);
  s.approvedAt = 1700000000000;
  assert.ok(P.isFinal(s));
  P.useSuggestedRef(s.id, 0, 'Luke 9:9');                         // not one of the suggestions: ignored
  assert.strictEqual(s.verses[0].canonical, 'Luke 1:1');
  P.useSuggestedRef(s.id, 0, 'Luke 24:1');
  assert.strictEqual(s.verses[0].canonical, 'Luke 24:1');
  assert.ok(s.verses[0].byHand);
  assert.deepStrictEqual(s.edits.map((e) => [e.find, e.replace, e.kind]), [['Luke 1:1', 'Luke 24:1', 'hand']]);
  assert.ok(/reference/.test(s.edits[0].note) && /said aloud/.test(s.edits[0].note));
  assert.ok(!P.isFinal(s), 'the reference is part of what is published, so it must be approved again');
  assert.strictEqual(P.flaggedRefs(s), 0, 'a reference a person set is theirs, and is not second-guessed');
  assert.ok(P.saved.includes(s.id));
});

test('a reference typed by hand must be one the page can read, and a real place', () => {
  const s = guide('Luke – Chapter 24', [verse('', 'Luke 1:1')]);
  assert.ok(/can read/.test(P.setReference(s.id, 0, 'the first one', 'typed by hand')));
  assert.ok(/24 chapters/.test(P.setReference(s.id, 0, 'Luke 31:6', 'typed by hand')));
  assert.strictEqual(s.verses[0].canonical, 'Luke 1:1', 'a refused reference changes nothing');
  assert.strictEqual(P.setReference(s.id, 0, 'luke 24:1–3', 'typed by hand'), '');
  assert.strictEqual(s.verses[0].canonical, 'Luke 24:1-3');
  assert.ok(P.setReference(s.id, 9, 'Luke 24:1', 'typed by hand'), 'a quotation that is not there');
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
