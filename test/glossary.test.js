#!/usr/bin/env node
/*
 * glossary.test.js — checks SOURCE-OF-TRUTH 4.12: the glossary holds only what a
 * person approved, and never changes a transcript by itself.
 *
 *   node test/glossary.test.js
 *
 * No dependencies and no call to Claude or the real store. The whole page is
 * loaded against a stand-in store (test/whole-page.js).
 */
const assert = require('assert');
const { makeStore, makePage, settle } = require('./whole-page');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const now = 1795500000000;

const FINAL = 'Then Zophar answered. They came from the land of Uz, and their flocks were many. Eliphaz spoke. He met a bill dad on the road.';
const EDITS = [
  { find: 'Then so far answered', replace: 'Then Zophar answered', kind: 'misheard', note: 'a name' },
  { find: 'the land of us', replace: 'the land of Uz', kind: 'verse-fix', note: 'a place' },
  { find: 'and there flocks', replace: 'and their flocks', kind: 'misheard', note: 'sounds the same' },
  { find: 'a sabian raid', replace: 'a Sabean raid', kind: 'misheard', note: 'a people' },
  { find: 'met a bill dad', replace: 'met Bildad', kind: 'misheard', note: 'a name' },
  { find: 'were many', replace: 'were many.', kind: 'grammar' },
  { find: 'many. Ella fazz', replace: 'many. Eliphaz', kind: 'hand', note: 'changed by hand' },
  { find: 'met Bildad', replace: 'met a bill dad', kind: 'hand', note: 'changed by hand' },
];
const SUGGESTED = [{ find: 'Ella fazz spoke', replace: 'Eliphaz spoke', kind: 'misheard', note: 'the new words do not sound like the old ones' }];
const guideDoc = (more) => Object.assign({ name: 'Job – Chapter 2', raw: 'what Descript heard', corrected: FINAL, editedFromRaw: 'what Descript heard', hasEditedFrom: true, summary: '', changeCount: 0,
  misheard: [], nonsensical: [], edits: EDITS, unapplied: [], verses: [], method: 'edits', status: 'edited', error: '', editedAt: now, descriptId: '', descriptName: '', suggested: SUGGESTED, misquotes: [], approvedAt: 0, writtenId: '', writtenUsed: null }, more || {});
const bookDoc = (order, more) => Object.assign({ bookTitle: 'Job', wordsToSearchFor: '', order, nextId: 9, lastEditAt: now, approved: false, createdAt: now, touchedAt: now, finalCount: 0, scriptCount: order.length, editedCount: order.length, lastDoc: null }, more || {});
async function openWith(docs, S, bookMore) {
  S = S || makeStore();
  S.store.set('books/b1', bookDoc(Object.keys(docs), bookMore));
  Object.keys(docs).forEach((id) => S.store.set('books/b1/scripts/' + id, docs[id]));
  const P = makePage(S);
  P.ev('initStore')(); await settle();
  await P.ev('openBook')('b1'); await settle();
  return P;
}
const term = (key, t, more) => ['glossary/' + key, Object.assign({ term: t, status: 'approved', heard: [], notHeard: [], books: [], seen: 1, at: now }, more || {})];
const withTerms = (S, list) => { list.forEach(([p, d]) => S.store.set(p, d)); return S; };
// A stand-in for Claude: answers the edit call with whatever the test hands it, and keeps the prompt it was sent.
const editor = (answer) => { const sent = []; return { sent, json: (prompt) => { sent.push(prompt); return Promise.resolve(JSON.parse(JSON.stringify(answer))); } }; };
const blank = { edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' };

/* ---- What is written down ---- */

test('the words of a term: nothing around it, no possessive, short; one key for every way of writing it', () => {
  const P = makePage(), text = P.ev('glossText'), key = P.ev('termKey');
  assert.strictEqual(text('  “Zophar’s,” '), 'Zophar');
  assert.strictEqual(text('Beth   Shemesh.'), 'Beth Shemesh');
  assert.strictEqual(text('one two three four five'), '', 'a phrase is not a term');
  assert.strictEqual(text('x'.repeat(61)), '');
  assert.strictEqual(text(null), '');
  assert.strictEqual(key('Beth-el'), key('bethel'));
  assert.strictEqual(key('Uz'), 'g_uz');
  assert.strictEqual(key('...'), '', 'nothing to store it under');
  assert.strictEqual(key('constructor'), 'g_constructor', 'a key always carries the prefix, so it is never one of the page\'s own names');
});

test('where two runs differ in wording, word for word; punctuation and capitals are not wording', () => {
  const P = makePage(), swaps = P.ev('wordSwaps');
  assert.deepStrictEqual(swaps('Then so far answered', 'Then Zophar answered'), [{ heard: 'so far', term: 'Zophar' }]);
  assert.deepStrictEqual(swaps('the land of us.', 'the land of Uz.'), [{ heard: 'us.', term: 'Uz.' }]);
  assert.deepStrictEqual(swaps('welcome back my friends', 'Welcome back, my friends.'), []);
  assert.deepStrictEqual(swaps('', 'Zophar'), []);
  assert.deepStrictEqual(swaps('added nothing here', 'added nothing here at all'), [], 'words only added are not a mishearing');
});

test('what one guide showed: fixes still in the final text, hand fixes, a refused fix made by hand, and a fix that was undone', async () => {
  const P = await openWith({ g1: guideDoc() });
  const got = P.ev('guideEvidence')(P.ev('state').sections[0]);
  assert.deepStrictEqual(got.pairs, [
    { heard: 'so far', term: 'Zophar', from: 'pass' },
    { heard: 'us', term: 'Uz', from: 'pass' },
    { heard: 'ella fazz', term: 'Eliphaz', from: 'refused' },
  ]);
  assert.deepStrictEqual(got.undone, [{ heard: 'a bill dad', term: 'Bildad', from: 'undone' }], 'a fix a person reversed counts against the pair');
  assert.ok(!got.pairs.some((p) => p.term === 'their'), 'two everyday words that sound the same are not a Bible term');
  assert.ok(!got.pairs.some((p) => p.term === 'Sabean'), 'a fix that is no longer in the final text is not evidence');
  assert.strictEqual(got.book, 'Job');
  assert.strictEqual(got.guide, 'Job – Chapter 2');
});

test('a hand change that is plain rewording is not a mishearing', async () => {
  const P = await openWith({ g1: guideDoc({ corrected: 'We are going to begin now with Zophar.', suggested: [], edits: [
    { find: 'are gonna begin', replace: 'are going to begin', kind: 'hand', note: 'changed by hand' },
    { find: 'with so far', replace: 'with Zophar', kind: 'hand', note: 'changed by hand' },
    { find: 'a long passage that was cut sho…', replace: 'something else entirely he…', kind: 'hand', note: 'changed by hand' },
    { find: 'whole thing', replace: 'new thing', kind: 'hand', note: 'rewritten by hand' }] }) });
  assert.deepStrictEqual(P.ev('guideEvidence')(P.ev('state').sections[0]).pairs, [{ heard: 'so far', term: 'Zophar', from: 'hand' }]);
});

test('approving a guide writes down what it showed, once; the approval never waits on it or fails with it', async () => {
  const P = await openWith({ g1: guideDoc() }), S = P.S;
  P.ev('approveSection')('g1'); await settle();
  const log = S.store.get('learned/b1_g1');
  assert.ok(log && log.pairs.length === 3 && log.book === 'Job', 'one document for the guide');
  assert.strictEqual(S.ctl.sets.filter((w) => w.path.indexOf('learned/') === 0).length, 1, 'one write');
  assert.ok(S.store.get('books/b1/scripts/g1').approvedAt > 0);
  // Unapproving leaves the evidence; approving again replaces it whole.
  P.ev('unapproveSection')('g1'); await settle();
  assert.ok(S.store.has('learned/b1_g1'));
  P.ev('state').sections[0].edits = [EDITS[0]];
  P.ev('approveSection')('g1'); await settle();
  assert.deepStrictEqual(S.store.get('learned/b1_g1').pairs.map((p) => p.term), ['Zophar']);
  // The store refusing the evidence does not undo the approval or show an error.
  const Q = await openWith({ g1: guideDoc() });
  Q.S.ctl.failSet = (p) => (p.indexOf('learned/') === 0 ? { code: 'quota_exceeded' } : null);
  Q.ev('approveSection')('g1'); await settle();
  assert.ok(Q.ev('state').sections[0].approvedAt > 0 && Q.S.store.get('books/b1/scripts/g1').approvedAt > 0);
  assert.ok(!Q.ev('saveError'));
});

test('what a guide showed is bounded, however many changes it had', async () => {
  const many = [];
  for (let i = 0; i < 400; i++) many.push({ find: 'said nam' + i + ' then', replace: 'said Name' + String.fromCharCode(97 + (i % 26)) + i + 'x then', kind: 'misheard' });
  const text = many.map((e) => e.replace).join('. ');
  const P = await openWith({ g1: guideDoc({ corrected: text, edits: many, suggested: [] }) });
  const got = P.ev('guideEvidence')(P.ev('state').sections[0]);
  assert.strictEqual(got.pairs.length, 60);
  assert.ok(P.ev('jsonBytes')(got) < 20000);
});

/* ---- Nothing has any effect until a person approves it ---- */

test('4.12: evidence alone changes nothing — not the wording check, not the prompt', async () => {
  const P = await openWith({ g1: guideDoc() });
  P.ev('approveSection')('g1'); await settle();
  await P.ev('loadGlossary')(); await P.ev('loadLearned')();
  assert.deepStrictEqual(P.ev('glossaryNames')(), []);
  assert.strictEqual(P.ev('glossaryAllows')('ella fazz', 'Eliphaz'), false);
  const s = P.ev('state').sections[0], text = 'Then ella fazz spoke.';
  assert.deepStrictEqual(P.ev('glossaryFor')(s, text), { names: [], hints: [] });
  assert.strictEqual(P.ev('buildEditsPrompt')(s, text, '', P.ev('glossaryFor')(s, text)), P.ev('buildEditsPrompt')(s, text, ''), 'the edit call is the same to the character');
  // A fix the wording check refuses is still refused: nobody has approved anything.
  const guard = P.ev('guardEdits')([{ find: 'Then never can nezzar spoke', replace: 'Then Nebuchadnezzar spoke', kind: 'misheard' }], 'Then never can nezzar spoke.');
  assert.strictEqual(guard.ok.length, 0, 'still refused');
  assert.strictEqual(guard.held.length, 1);
});

test('the Glossary page lists what is waiting, with where it came from; approving it makes it the glossary', async () => {
  const P = await openWith({ g1: guideDoc() }), S = P.S;
  P.ev('approveSection')('g1'); await settle();
  await P.ev('openGlossary')(); await settle();
  const waiting = P.ev('glossaryWaiting')();
  assert.deepStrictEqual(waiting.map((r) => r.term).sort(), ['Eliphaz', 'Uz', 'Zophar']);
  const z = waiting.filter((r) => r.term === 'Zophar')[0];
  assert.deepStrictEqual([z.isNew, z.guides, z.books, z.heard.map((h) => h.text)], [true, 1, ['Job'], ['so far']]);
  assert.ok(waiting.filter((r) => r.term === 'Eliphaz')[0].heard[0].refused, 'it says the page had refused this one');
  assert.ok(!waiting.some((r) => r.term === 'Bildad'), 'a term only ever seen being undone is not offered');
  const html = P.root.innerHTML;
  assert.ok(/Waiting for approval/.test(html) && /Zophar/.test(html) && /so far/.test(html) && /the page had refused this/.test(html));
  P.ev('pickTerm')(z.key, true); P.ev('pickTerm')('g_eliphaz', true);
  await P.ev('approveTerms')(); await settle();
  assert.deepStrictEqual(S.store.get('glossary/g_zophar'), { term: 'Zophar', status: 'approved', heard: ['so far'], notHeard: [], books: ['Job'], seen: 1, at: S.store.get('glossary/g_zophar').at });
  assert.ok(!S.store.has('glossary/g_uz'), 'only what was ticked');
  assert.deepStrictEqual(P.ev('glossaryWaiting')().map((r) => r.term), ['Uz']);
  assert.strictEqual(P.ev('glossaryAllows')('Ella fazz', 'Eliphaz'), true);
  assert.ok(/Approved/.test(P.root.innerHTML));
});

test('a term turned down is never offered again, until a person asks for it back', async () => {
  const P = await openWith({ g1: guideDoc() }), S = P.S;
  P.ev('approveSection')('g1'); await settle();
  await P.ev('openGlossary')(); await settle();
  P.ev('pickTerm')('g_uz', true);
  await P.ev('rejectTerms')(); await settle();
  assert.strictEqual(S.store.get('glossary/g_uz').status, 'rejected');
  assert.ok(!P.ev('glossaryWaiting')().some((r) => r.term === 'Uz'));
  assert.deepStrictEqual(P.ev('glossaryNames')(), []);
  // A second page, opened later, does not offer it either.
  const Q = makePage(S); Q.ev('initStore')(); await settle(); await Q.ev('openGlossary')(); await settle();
  assert.ok(!Q.ev('glossaryWaiting')().some((r) => r.term === 'Uz'));
  assert.ok(/Turned down/.test(Q.root.innerHTML));
  await Q.ev('restoreTerm')('g_uz'); await settle();
  assert.ok(!S.store.has('glossary/g_uz'));
  assert.ok(Q.ev('glossaryWaiting')().some((r) => r.term === 'Uz'), 'the evidence still shows it, so it waits again');
});

test('an approved term heard a new way waits again, as a new mishearing of it; "not a term" there means "not a mishearing"', async () => {
  const S = withTerms(makeStore(), [term('g_zophar', 'Zophar', { heard: ['so far'], books: ['Job'] })]);
  S.store.set('learned/b1_g7', { at: now, book: 'Psalms', guide: 'x', pairs: [{ heard: 'sofa', term: 'Zophar', from: 'hand' }, { heard: 'so far', term: 'Zophar', from: 'pass' }], undone: [] });
  const P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  const rows = P.ev('glossaryWaiting')();
  assert.deepStrictEqual(rows.map((r) => [r.term, r.isNew, r.heard.map((h) => h.text)]), [['Zophar', false, ['sofa']]]);
  P.ev('pickTerm')('g_zophar', true);
  await P.ev('rejectTerms')(); await settle();
  const d = S.store.get('glossary/g_zophar');
  assert.deepStrictEqual([d.status, d.heard, d.notHeard], ['approved', ['so far'], ['sofa']], 'the term stays; that one way of hearing it is turned down');
  assert.deepStrictEqual(P.ev('glossaryWaiting')(), []);
});

/* ---- What an approved term does ---- */

test('4.12: an approved pair is applied by the edit pass, and its row says the glossary supported it', async () => {
  const S = makeStore(), raw = 'Then never can nezzar spoke to them. And so far we have seen it.';
  const answer = Object.assign({}, blank, { edits: [{ find: 'Then never can nezzar spoke', replace: 'Then Nebuchadnezzar spoke', kind: 'misheard', note: 'a name' }] });
  // Before anyone approved it: refused, and listed as a suggestion.
  const P = await openWith({ g1: guideDoc({ raw, corrected: '', status: 'draft', edits: [], suggested: [] }) }, S);
  const s = P.ev('state').sections[0];
  await P.ev('runEditOnSection')(s, editor(answer), null, false, null);
  assert.ok(/never can nezzar/.test(s.corrected) && s.suggested.length === 1, 'the transcript is left as spoken');
  // Approved by a person.
  withTerms(S, [term('g_nebuchadnezzar', 'Nebuchadnezzar', { heard: ['never can nezzar'], books: ['Daniel'] })]);
  await P.ev('loadGlossary')();
  const ed = editor(answer);
  await P.ev('runEditOnSection')(s, ed, null, false, null);
  assert.ok(/Then Nebuchadnezzar spoke/.test(s.corrected) && s.suggested.length === 0);
  const row = s.edits.filter((e) => e.replace === 'Then Nebuchadnezzar spoke')[0];
  assert.ok(row && /known from the glossary/.test(row.note) && row.kind === 'misheard', 'the change is a visible row (4.4)');
  assert.ok(!('gloss' in row), 'nothing of the marking is left on the stored row');
  assert.ok(/"never can nezzar" = Nebuchadnezzar/.test(ed.sent[0]), 'the edit pass was told the known mishearing, because its words are in this transcript');
});

test('4.12: an approved name of four letters or more is a listed name for the wording check; a shorter one is not', async () => {
  const S = withTerms(makeStore(), [term('g_nebuchadnezzar', 'Nebuchadnezzar'), term('g_on', 'On'), term('g_uz', 'Uz', { heard: ['us'] })]);
  const P = await openWith({ g1: guideDoc() }, S);
  assert.deepStrictEqual(P.ev('glossaryNames')(), ['nebuchadnezzar']);
  const guard = P.ev('guardEdits');
  const loose = guard([{ find: 'nebu can nezzar came', replace: 'Nebuchadnezzar came' }], 'nebu can nezzar came');
  assert.strictEqual(loose.ok.length, 1, 'a rough match to a listed name goes through');
  assert.ok(/known from the glossary/.test(loose.ok[0].note) && !('gloss' in loose.ok[0]), 'and its row says it was the glossary\'s doing');
  P.ev('state').wordsToSearchFor = 'Nebuchadnezzar';
  const own = guard([{ find: 'nebu can nezzar came', replace: 'Nebuchadnezzar came' }], 'nebu can nezzar came');
  assert.ok(own.ok.length === 1 && !/glossary/.test(own.ok[0].note || ''), 'a name the book lists itself is not credited to the glossary');
  P.ev('state').wordsToSearchFor = '';
  assert.strictEqual(guard([{ find: 'in the city', replace: 'on the city' }], 'in the city').held.length, 1, '"On" in the glossary does not let "in" become "on"');
  assert.strictEqual(guard([{ find: 'he loves them', replace: 'he lives them' }], 'he loves them').held.length, 1, 'ordinary words are as strict as ever');
  assert.strictEqual(guard([{ find: 'the land of us', replace: 'the land of Uz' }], 'the land of us').ok.length, 1);
});

test('a mark claiming the glossary cannot come from the edit pass itself', async () => {
  const P = await openWith({ g1: guideDoc({ raw: 'his so called friends came.', corrected: '', status: 'draft', edits: [], suggested: [] }) });
  const s = P.ev('state').sections[0];
  await P.ev('runEditOnSection')(s, editor(Object.assign({}, blank, { edits: [{ find: 'so called friends', replace: 'so-called friends', gloss: true, note: 'hyphen' }] })), null, false, null);
  assert.ok(/so-called/.test(s.corrected));
  assert.ok(!s.edits.some((e) => /glossary/.test(e.note || '') || 'gloss' in e));
});

test('4.12: the page never swaps a word in because the glossary lists it — "us" stays "us"', async () => {
  const S = withTerms(makeStore(), [term('g_uz', 'Uz', { heard: ['us'], books: ['Job'] }), term('g_zophar', 'Zophar', { heard: ['so far'], books: ['Job'] })]);
  const raw = 'He told us to wait, and so far we have waited.';
  const P = await openWith({ g1: guideDoc({ raw, corrected: '', status: 'draft', edits: [], suggested: [] }) }, S);
  const s = P.ev('state').sections[0], ed = editor(blank);
  await P.ev('runEditOnSection')(s, ed, null, false, null);
  assert.strictEqual(s.corrected, raw, 'with no edit from the edit pass, not a word moved');
  assert.ok(/"us" = Uz/.test(ed.sent[0]) && /"so far" = Zophar/.test(ed.sent[0]), 'the edit pass was told, and it is the one that decides');
  assert.ok(/apply one only where this sentence means that term/.test(ed.sent[0]));
});

test('4.6: a guide the glossary does not bear on is sent nothing extra; one it does is sent little', async () => {
  const many = [];
  for (let i = 0; i < 300; i++) many.push(term('g_name' + i, 'Name' + i, { books: ['Job'], seen: 300 - i }));
  const S = withTerms(makeStore(), many.concat([term('g_zophar', 'Zophar', { heard: ['so far'], books: ['Job'], seen: 999 }), term('g_bartimaeus', 'Bartimaeus', { heard: ['bar to mayus'], books: ['Mark'] })]));
  const P = await openWith({ g1: guideDoc() }, S), state = P.ev('state'), s = state.sections[0], build = P.ev('buildEditsPrompt'), forGuide = P.ev('glossaryFor');
  // A guide on Job: names from Job, capped; no hint, because no known mishearing is in the text.
  let g = forGuide(s, 'A plain sentence about patience.');
  assert.strictEqual(g.names.length, 40);
  assert.strictEqual(g.names[0], 'Zophar', 'the most seen first');
  assert.ok(g.names.join(', ').length <= 500 && g.hints.length === 0);
  assert.ok(!g.names.includes('Bartimaeus'), 'a name from another book is not sent');
  // A name the book already lists is not sent twice.
  state.wordsToSearchFor = 'Zophar, Elihu';
  assert.ok(!forGuide(s, 'x').names.includes('Zophar'));
  state.wordsToSearchFor = '';
  // A guide on another book, with none of the known mishearings in it: the prompt is unchanged to the character.
  state.bookTitle = 'Luke'; s.name = 'Luke – Chapter 1';
  const text = 'In the days of Herod there was a priest.';
  assert.deepStrictEqual(forGuide(s, text), { names: [], hints: [] });
  assert.strictEqual(build(s, text, '', forGuide(s, text)), build(s, text, ''));
  // The same guide with a known mishearing in it: one short line more.
  g = forGuide(s, 'And so far, they had seen nothing.');
  assert.deepStrictEqual(g, { names: [], hints: [{ heard: 'so far', term: 'Zophar' }] });
  assert.ok(build(s, text, '', g).length - build(s, text, '').length < 120);
  // Only whole words count: "sofa" is not "so far", and "focus" does not hold "us".
  assert.deepStrictEqual(forGuide(s, 'The sofa was in focus.').hints, []);
});

test('an approved term used in a book it was not listed for is listed for it, so the next guide there is told', async () => {
  const S = withTerms(makeStore(), [term('g_zophar', 'Zophar', { books: ['Job'] })]);
  const P = await openWith({ g1: guideDoc({ name: 'Psalms – Chapter 3', corrected: 'Remember Zophar and his friends.', edits: [], suggested: [] }) }, S, { bookTitle: 'Psalms' });
  P.ev('approveSection')('g1'); await settle();
  assert.deepStrictEqual(S.store.get('glossary/g_zophar').books, ['Job', 'Psalms']);
  assert.deepStrictEqual(S.store.get('learned/b1_g1').used, ['Zophar']);
  assert.strictEqual(S.ctl.updates.filter((u) => u.path === 'glossary/g_zophar').length, 1);
  P.ev('unapproveSection')('g1'); await settle(); P.ev('approveSection')('g1'); await settle();
  assert.strictEqual(S.ctl.updates.filter((u) => u.path === 'glossary/g_zophar').length, 1, 'and not written again once it is');
});

/* ---- Consistency ---- */

test('CONSISTENCY: two people approving guides at the same moment lose nothing — counts are added up, never stored', async () => {
  const S = makeStore();
  S.store.set('books/b1', bookDoc(['g1', 'g2']));
  S.store.set('books/b1/scripts/g1', guideDoc()); S.store.set('books/b1/scripts/g2', guideDoc({ name: 'Job – Chapter 3' }));
  const A = makePage(S), B = makePage(S);
  A.ev('initStore')(); B.ev('initStore')(); await settle();
  await A.ev('openBook')('b1'); await B.ev('openBook')('b1'); await settle();
  A.ev('approveSection')('g1'); B.ev('approveSection')('g2'); await settle();
  const C = makePage(S); C.ev('initStore')(); await settle(); await C.ev('openGlossary')(); await settle();
  const z = C.ev('glossaryWaiting')().filter((r) => r.term === 'Zophar')[0];
  assert.strictEqual(z.guides, 2);
  assert.strictEqual(z.heard[0].guides, 2);
});

test('CONSISTENCY: the glossary is read again before it is ruled on, and before an edit pass', async () => {
  const S = makeStore();
  S.store.set('learned/b1_g1', { at: now, book: 'Job', guide: 'x', pairs: [{ heard: 'so far', term: 'Zophar', from: 'pass' }, { heard: 'us', term: 'Uz', from: 'pass' }], undone: [] });
  const P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  // A teammate turns Zophar down while this page is open with it ticked.
  S.store.set('glossary/g_zophar', { term: 'Zophar', status: 'rejected', heard: [], notHeard: [], books: [], seen: 0, at: now });
  P.ev('pickTerm')('g_zophar', true); P.ev('pickTerm')('g_uz', true);
  await P.ev('approveTerms')(); await settle();
  assert.strictEqual(S.store.get('glossary/g_zophar').status, 'rejected', 'their ruling is not overwritten');
  assert.strictEqual(S.store.get('glossary/g_uz').status, 'approved');
  // freshGlossary: trusted for a minute, then read again.
  const reads = () => S.ctl.reads.filter((r) => r.path === 'glossary').length, before = reads();
  await P.ev('freshGlossary')();
  assert.strictEqual(reads(), before, 'just read: not read again');
  P.ev('glossaryAt = 0'); await P.ev('freshGlossary')();
  assert.strictEqual(reads(), before + 1);
});

test('CONSISTENCY: approving several stops at the first that cannot be saved, says so, and keeps what was saved', async () => {
  const S = makeStore();
  S.store.set('learned/b1_g1', { at: now, book: 'Job', guide: 'x', pairs: [{ heard: 'so far', term: 'Zophar', from: 'pass' }, { heard: 'us', term: 'Uz', from: 'pass' }, { heard: 'ella fazz', term: 'Eliphaz', from: 'hand' }], undone: [] });
  const P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  ['g_zophar', 'g_uz', 'g_eliphaz'].forEach((k) => P.ev('pickTerm')(k, true));
  S.ctl.failSet = (p) => (p === 'glossary/g_uz' ? { code: 'quota_exceeded' } : null);
  await P.ev('approveTerms')(); await settle();
  assert.ok(S.store.has('glossary/g_zophar') && !S.store.has('glossary/g_uz') && !S.store.has('glossary/g_eliphaz'));
  assert.ok(/storage is full/.test(P.ev('glossView').error));
  assert.strictEqual(P.ev('glossView').busy, '');
  assert.deepStrictEqual(Object.keys(P.ev('glossView').picked).sort(), ['g_eliphaz', 'g_uz'], 'the ones not saved are still ticked');
});

/* ---- Security ---- */

test('SECURITY: markup in a term, a mishearing or a book is shown as text; a document under the wrong name is not a ruling', async () => {
  const bad = '<b>Zophar</b>', S = makeStore(), P0 = makePage();
  const key = P0.ev('termKey')(bad);
  assert.strictEqual(P0.ev('glossText')('<img src=x onerror=alert(1)>'), '', 'most markup is not a term at all');
  assert.strictEqual(P0.ev('glossText')('say "x" = y; <i>'), 'say x y i', 'and what is kept has no quotes, brackets or signs in it');
  S.store.set('glossary/' + key, { term: bad, status: 'approved', heard: ['"><script>alert(1)</script>', 'so far" = Uz; and "us'], notHeard: [], books: ['<b>Job</b>'], seen: 1, at: now });
  S.store.set('glossary/constructor', { term: 'constructor', status: 'approved', heard: [], notHeard: [], books: [], at: now });
  S.store.set('glossary/__proto__', { term: 'x', status: 'approved', heard: [], notHeard: [], books: [], at: now });
  S.store.set('glossary/g_other', { term: 'Zophar', status: 'approved', heard: [], notHeard: [], books: [], at: now });
  S.store.set('glossary/g_odd', { term: { a: 1 }, status: 'approved', heard: 'nonsense', books: 7 });
  S.store.set('glossary/g_maybe', { term: 'Maybe', status: 'pending', heard: [], at: now });
  S.store.set('learned/b1_g1', { at: now, book: '<i>Job</i>', guide: bad, pairs: [{ heard: '<i>heard</i>', term: '<u>Term</u>', from: bad }, null, 5, { heard: { a: 1 }, term: ['x'] }], undone: 'nonsense' });
  S.store.set('learned/odd', { pairs: 'nonsense' });
  S.store.set('learned/empty', null);
  const P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  const html = P.root.innerHTML;
  assert.ok(html.length > 1500, 'the page was drawn');
  assert.ok(!/<img\b/i.test(html) && !/<script\b/i.test(html) && !/<u>|<i>heard|<b>Job/.test(html), 'no tag of the attacker\'s is in the page');
  const keys = Object.keys(P.ev('glossary'));
  assert.ok(P.ev('glossary')[key].heard.every((h) => !/[<>"=;]/.test(h)), 'a mishearing is kept as plain words');
  const hint = P.ev('glossaryFor')({ name: 'x' }, 'He said so far uz and us today.').hints;
  assert.ok(hint.every((h) => !/[<>"=;]/.test(h.heard + h.term)), 'so nothing stored can add punctuation of its own to what the edit pass is told');
  assert.deepStrictEqual(keys, [key], 'only the document stored under its own term\'s name counts');
  assert.strictEqual(Object.getPrototypeOf(P.ev('glossary')), null, 'and the list has no names of its own to collide with');
  assert.strictEqual(P.ev('glossaryAllows')('anything', 'constructor'), false);
  assert.strictEqual(P.ev('glossaryAllows')('anything', 'toString'), false);
});

test('SECURITY: a very long or very large glossary does not slow the edit pass', async () => {
  const many = [];
  for (let i = 0; i < 5000; i++) many.push(term('g_name' + i, 'Name' + i, { heard: ['nay m ' + i, 'nam ' + i], books: ['Job'], at: now + i }));
  const P = await openWith({ g1: guideDoc() }, withTerms(makeStore(), many));
  assert.strictEqual(Object.keys(P.ev('glossary')).length, 5000, 'read past the first thousand');
  const text = 'word '.repeat(3000), t = process.hrtime.bigint();
  const g = P.ev('glossaryFor')(P.ev('state').sections[0], text);
  P.ev('guardEdits')([{ find: 'word word', replace: 'word, word' }, { find: 'word', replace: 'ward' }], text);
  assert.ok(Number(process.hrtime.bigint() - t) / 1e6 < 1500, 'well under two seconds');
  assert.ok(g.names.length <= 40 && g.hints.length === 0);
});

/* ---- A person's own additions and removals ---- */

test('a term typed in by a person is approved as typed; a mishearing and a term can each be taken out', async () => {
  const S = makeStore(), P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  const v = P.ev('glossView');
  v.term = '  Beth Shemesh '; v.heard = 'best shame mesh, beth she mesh; ';
  await P.ev('addTerm')(); await settle();
  let d = S.store.get('glossary/g_bethshemesh');
  assert.deepStrictEqual([d.term, d.status, d.heard], ['Beth Shemesh', 'approved', ['best shame mesh', 'beth she mesh']]);
  assert.deepStrictEqual([v.term, v.heard], ['', ''], 'the boxes are cleared');
  v.term = '!!!'; await P.ev('addTerm')(); await settle();
  assert.ok(/Type the term/.test(v.error));
  await P.ev('removeHeard')('g_bethshemesh', 0); await settle();
  d = S.store.get('glossary/g_bethshemesh');
  assert.deepStrictEqual([d.heard, d.notHeard], [['beth she mesh'], ['best shame mesh']]);
  assert.strictEqual(P.ev('glossaryAllows')('best shame mesh', 'Beth Shemesh'), false);
  assert.strictEqual(P.ev('glossaryAllows')('Beth she mesh', 'Beth Shemesh'), true);
  await P.ev('removeTerm')('g_bethshemesh'); await settle();
  assert.strictEqual(S.store.get('glossary/g_bethshemesh').status, 'rejected');
  assert.deepStrictEqual(P.ev('glossaryNames')(), []);
});

test('approved terms can be copied as a plain list; where copying is not allowed the list is shown instead', async () => {
  const S = withTerms(makeStore(), [term('g_zophar', 'Zophar'), term('g_eliphaz', 'Eliphaz'), ['glossary/g_no', { term: 'No', status: 'rejected', heard: [], notHeard: [], books: [], at: now }]]);
  let copied = '';
  const P = makePage(S, { navigator: { clipboard: { writeText: (t) => { copied = t; return Promise.resolve(); } } } });
  P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  P.ev('copyTerms')(null); await settle();
  assert.strictEqual(copied, 'Eliphaz\nZophar');
  const Q = makePage(S); Q.ev('initStore')(); await settle(); await Q.ev('openGlossary')(); await settle();
  Q.ev('copyTerms')(null); await settle();
  assert.strictEqual(Q.ev('glossView').copyText, 'Eliphaz\nZophar');
  assert.ok(/Select the list and copy it by hand/.test(Q.root.innerHTML));
});

/* ---- Names in written scripts ---- */

const SCRIPT = '# Job 2 notes\nThe Second Test\nWelcome back, friends. Today Zophar speaks, and Zophar is not kind, and Eliphaz agreed. "Eliphaz went first," said the teacher. ' +
  'We read about Uz and the Sabeans. God answers Job. In Beth-shemesh the Red sea was red. Then Bildad.\nLeviathan appears. I think Behemoth is next, and Zophar’s friends know it.';

test('the names in a written script: a capital in the middle of a sentence, never written without one, not already known', () => {
  const P = makePage(), found = P.ev('writtenTerms')(SCRIPT);
  assert.strictEqual(found[0], 'Zophar', 'the one written most comes first');
  assert.deepStrictEqual(found.slice().sort(), ['Behemoth', 'Beth-shemesh', 'Bildad', 'Eliphaz', 'Sabeans', 'Uz', 'Zophar']);
  assert.deepStrictEqual(P.ev('writtenTerms')(''), []);
  assert.deepStrictEqual(P.ev('writtenTerms')('ALL CAPS HEADING\nno names here at all.'), []);
  const big = ('Name' + 'x'.repeat(5) + ' ').repeat(20000);
  const t = process.hrtime.bigint(); P.ev('writtenTerms')('He said ' + big + '.'); assert.ok(Number(process.hrtime.bigint() - t) / 1e6 < 1500);
  const many = []; for (let i = 0; i < 200; i++) many.push('We met Namea' + 'bcdefghij'[i % 9] + 'q'.repeat(i % 7) + 'z'.repeat(Math.floor(i / 9)) + ' today.');
  assert.ok(P.ev('writtenTerms')(many.join(' ')).length <= 60, 'at most sixty are kept for one script');
});

test('a written script\'s names are kept on its listing, survive a new title, and are offered on the Glossary page', async () => {
  const S = makeStore(), P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openWritten')(); await settle();
  P.ev('startWrittenForm')();
  Object.assign(P.ev('writtenForm'), { title: 'Job 2 — Smith', text: SCRIPT });
  P.ev('saveWritten')(); await settle();
  const id = P.ev('writtenIndex')[0].id;
  assert.ok(S.store.get('written/' + id).terms.includes('Zophar'));
  // A new title keeps them.
  P.ev('writtenOpen = { id: "' + id + '", text: "", loading: false, error: "", title: null, busy: false }');
  P.root.querySelector = () => ({ value: 'Job 2 — Smith (final)' });
  P.ev('renameWritten')(); await settle();
  assert.deepStrictEqual([S.store.get('written/' + id).title, S.store.get('written/' + id).terms.includes('Zophar')], ['Job 2 — Smith (final)', true]);
  P.root.querySelector = () => null;
  await P.ev('openGlossary')(); await settle();
  const z = P.ev('glossaryWaiting')().filter((r) => r.term === 'Zophar')[0];
  assert.deepStrictEqual([z.scripts, z.guides, z.books, z.heard], [1, 0, ['Job'], []]);
  assert.ok(/in 1 written script/.test(P.root.innerHTML));
  assert.deepStrictEqual(P.ev('glossaryNames')(), [], 'and they do nothing until approved');
});

test('written scripts kept before the glossary existed are scanned once, on request, and nothing else about them changes', async () => {
  const S = makeStore();
  S.store.set('written/w1', { title: 'Job 2', chars: SCRIPT.length, at: now, source: 'paste', sourceName: '', sourceId: '', sketch: [1, 2, 3] });
  S.store.set('writtenText/w1', { text: SCRIPT });
  S.store.set('written/w2', { title: 'Job 3', chars: 5, at: now + 1, source: 'paste', sourceName: '', sourceId: '', sketch: [], terms: ['Kept'] });
  const P = makePage(S); P.ev('initStore')(); await settle(); await P.ev('openGlossary')(); await settle();
  assert.strictEqual(P.ev('unscanned')().length, 1, 'only the one never looked at');
  assert.ok(/Scan 1 written script for terms/.test(P.root.innerHTML));
  await P.ev('scanWritten')(); await settle();
  const d = S.store.get('written/w1');
  assert.ok(d.terms.includes('Zophar'));
  assert.deepStrictEqual([d.title, d.chars, d.sketch], ['Job 2', SCRIPT.length, [1, 2, 3]]);
  assert.deepStrictEqual(S.ctl.updates.map((u) => u.path), ['written/w1']);
  assert.strictEqual(P.ev('unscanned')().length, 0);
  assert.strictEqual(P.ev('writtenTexts').w1, undefined, 'the text is not kept in memory after the scan');
  assert.ok(!/Scan \d+ written script/.test(P.root.innerHTML));
});

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); console.log('  ok  ' + name); }
    catch (err) { failed += 1; console.log('FAIL  ' + name + '\n      ' + String(err && err.stack || err).split('\n').slice(0, 6).join('\n      ')); }
  }
  console.log('\n' + (tests.length - failed) + ' checks passed' + (failed ? ', ' + failed + ' FAILED' : ''));
  process.exit(failed ? 1 : 0);
})();
