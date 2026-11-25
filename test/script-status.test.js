#!/usr/bin/env node
/*
 * script-status.test.js — checks SOURCE-OF-TRUTH 4.9's last paragraph: every
 * guide says at a glance whether its transcript was compared with a written
 * script, and with which one, and the book says how many stand in each state.
 *
 *   node test/script-status.test.js
 *
 * No dependencies. The whole page is loaded against a stand-in store.
 */
const assert = require('assert');
const { makeStore, makePage, settle } = require('./whole-page');

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const now = 1795600000000;
const guide = (name, more) => Object.assign({ name, raw: 'what Descript heard for ' + name, corrected: 'The edited words.', editedFromRaw: 'what Descript heard for ' + name, hasEditedFrom: true, summary: '', changeCount: 0, misheard: [], nonsensical: [],
  edits: [], unapplied: [], verses: [], method: 'edits', status: 'edited', error: '', editedAt: now, descriptId: '', descriptName: '', suggested: [], misquotes: [], approvedAt: 0, writtenId: '', writtenUsed: null }, more || {});
const draft = (name, more) => guide(name, Object.assign({ corrected: '', status: 'draft', editedFromRaw: '', hasEditedFrom: false, editedAt: 0 }, more || {}));
const written = (title) => ({ title, chars: 100, at: now, source: 'paste', sourceName: '', sourceId: '', sketch: [], terms: [] });
async function bookWith(docs, scripts, S) {
  S = S || makeStore();
  S.store.set('books/b1', { bookTitle: 'Luke', wordsToSearchFor: '', order: Object.keys(docs), nextId: 99, lastEditAt: now, createdAt: now, touchedAt: now, lastDoc: null });
  Object.keys(docs).forEach((id) => S.store.set('books/b1/scripts/' + id, docs[id]));
  Object.keys(scripts || {}).forEach((id) => { S.store.set('written/' + id, written(scripts[id])); S.store.set('writtenText/' + id, { text: 'The teacher wrote this for ' + scripts[id] + '.' }); });
  const P = makePage(S);
  P.ev('initStore')(); await settle(); await P.ev('openBook')('b1'); await settle();
  return P;
}
const state = (P, n) => P.ev('scriptState')(P.ev('state').sections[n]);
const badge = (P, n) => P.ev('scriptBadge')(P.ev('state').sections[n]);

test('each state a guide can be in, and what its badge says', async () => {
  const P = await bookWith({
    g1: guide('Luke – Chapter 1', { writtenUsed: { id: 'w1', title: 'Luke 1 — Jones' } }),          // used
    g2: guide('Luke – Chapter 2'),                                                                   // matched after the edit: not used yet
    g3: guide('Luke – Chapter 3', { writtenId: 'w2', writtenUsed: { id: 'w3', title: 'Luke 3 — Jones' } }),   // a different one was used
    g4: draft('Luke – Chapter 4'),                                                                   // matched, not edited yet
    g5: guide('Luke – Chapter 5'),                                                                   // nothing matches
    g6: guide('Luke – Chapter 6', { writtenId: 'none' }),                                            // none, by choice
    g7: guide('Luke – Chapter 7', { writtenUsed: { id: 'gone', title: 'Luke 7 — deleted since' } }), // the one used is no longer there
    g8: draft('', { raw: '' }),                                                                      // an empty card
  }, { w1: 'Luke 1 — Jones', w2: 'Luke 2 — Jones', w3: 'Luke 3 — Jones', w4: 'Luke 4 — Jones' });
  assert.deepStrictEqual([0, 1, 2, 3, 4, 5, 6].map((n) => state(P, n).kind), ['used', 'pending', 'pending', 'ready', 'none', 'off', 'used']);
  assert.ok(/class="script-badge script-used"/.test(badge(P, 0)) && />Script used: Luke 1 — Jones</.test(badge(P, 0)));
  assert.ok(/compared this transcript with the written script “Luke 1 — Jones” \(matched by title\)/.test(badge(P, 0)), 'and how it was matched, to judge whether it is the right one');
  assert.ok(/script-pending/.test(badge(P, 1)) && />Script not used yet</.test(badge(P, 1)) && /“Luke 2 — Jones” is matched to this guide \(matched by title\), but the edit pass ran without it\. Click Redo/.test(badge(P, 1)));
  assert.ok(/script-pending/.test(badge(P, 2)) && /\(chosen by hand\), but the edit pass used “Luke 3 — Jones” instead/.test(badge(P, 2)));
  assert.ok(/script-ready/.test(badge(P, 3)) && />Script ready: Luke 4 — Jones</.test(badge(P, 3)) && /will compare/.test(badge(P, 3)));
  assert.ok(/script-none/.test(badge(P, 4)) && />No script</.test(badge(P, 4)) && /nothing to compare the transcript with/.test(badge(P, 4)));
  assert.ok(/script-none/.test(badge(P, 5)) && />No script, by choice</.test(badge(P, 5)));
  assert.ok(/script-used/.test(badge(P, 6)) && />Script used: Luke 7 — deleted since</.test(badge(P, 6)) && /no longer matched/.test(badge(P, 6)));
  assert.strictEqual(badge(P, 7), '', 'an empty card has nothing to compare');
});

test('the badge is on every card, open or folded, and the book says how many guides stand in each state', async () => {
  const P = await bookWith({
    g1: guide('Luke – Chapter 1', { writtenUsed: { id: 'w1', title: 'Luke 1 — Jones' } }), g2: guide('Luke – Chapter 2'),
    g4: draft('Luke – Chapter 4'), g5: guide('Luke – Chapter 5'), g6: guide('Luke – Chapter 6', { writtenId: 'none' }), g8: draft('', { raw: '' }),
  }, { w1: 'Luke 1 — Jones', w2: 'Luke 2 — Jones', w4: 'Luke 4 — Jones' });
  assert.deepStrictEqual(P.ev('scriptCounts')(), { total: 5, used: 1, pending: 1, ready: 1, none: 2 });
  let html = P.root.innerHTML;
  assert.strictEqual((html.match(/class="script-badge /g) || []).length, 5, 'one on each card that has a transcript');
  const line = /<p class="script-summary"[^>]*>([\s\S]*?)<\/p>/.exec(html)[1].replace(/<[^>]+>/g, '');
  assert.strictEqual(line, '1 of 5 guides edited against a written script · 1 matched but not used yet (Redo to use it) · 1 matched, waiting for the edit pass · 2 with no written script');
  // Folded, the badge is still there.
  P.ev('collapsed.g1 = true; collapsed.g2 = true'); P.ev('paint')();
  html = P.root.innerHTML;
  const card = (id) => new RegExp('is-collapsed" data-section="' + id + '">([\\s\\S]*?)</article>').exec(html)[1];
  assert.ok(/script-used/.test(card('g1')) && /script-pending/.test(card('g2')));
});

test('until the library has been read nothing is claimed either way; with no written scripts at all the book says so', async () => {
  const S = makeStore();
  S.ctl.failRead = (r) => (r.path === 'written' ? { code: 'unavailable' } : null);
  const P = await bookWith({ g1: guide('Luke – Chapter 1') }, {}, S);
  assert.ok(!/script-badge|script-summary/.test(P.root.innerHTML), 'the list could not be read: no badge says "No script" on a guess');
  const Q = await bookWith({ g1: guide('Luke – Chapter 1'), g2: draft('Luke – Chapter 2') }, {});
  assert.ok(/No guide in this book is compared with a written script: there are none in the library yet\./.test(Q.root.innerHTML));
  assert.strictEqual((Q.root.innerHTML.match(/>No script</g) || []).length, 2);
});

test('the badge follows what happens: an edit pass that uses the script, and a person taking it off', async () => {
  const P = await bookWith({ g1: draft('Luke – Chapter 1', { raw: 'welcome back my friends' }) }, { w1: 'Luke 1 — Jones' });
  const s = P.ev('state').sections[0];
  assert.strictEqual(state(P, 0).kind, 'ready');
  const sent = [], sample = { json: (prompt) => { sent.push(prompt); return Promise.resolve({ edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' }); } };
  await P.ev('runEditOnSection')(s, sample, null, false, await P.ev('writtenFor')(s));
  assert.ok(/WRITTEN SCRIPT/.test(sent[0]) && /The teacher wrote this for Luke 1 — Jones\./.test(sent[0]), 'the written script really went with the edit call');
  assert.deepStrictEqual([state(P, 0).kind, state(P, 0).title], ['used', 'Luke 1 — Jones']);
  P.ev('setWritten')('g1', 'none'); await settle();
  assert.strictEqual(state(P, 0).kind, 'used', 'the Edited Transcript was still compared with it');
  assert.ok(/no longer matched/.test(badge(P, 0)));
  // An edit pass that ran with none says so afterwards.
  const Q = await bookWith({ g1: draft('Luke – Chapter 1', { raw: 'welcome back my friends' }) }, {});
  const q = Q.ev('state').sections[0];
  await Q.ev('runEditOnSection')(q, sample, null, false, await Q.ev('writtenFor')(q));
  assert.strictEqual(state(Q, 0).kind, 'none');
  assert.ok(!/WRITTEN SCRIPT/.test(sent[1]));
});

test('SECURITY: a written script\'s title is shown as text in the badge and in the words behind it', async () => {
  const bad = 'Luke 1 "><img src=x onerror=alert(1)>';
  const P = await bookWith({ g1: guide('Luke – Chapter 1', { writtenUsed: { id: 'w1', title: bad } }), g2: guide('Luke – Chapter 2', { writtenUsed: { id: 'zz', title: '<script>alert(1)</script>' } }) }, { w1: bad });
  const html = P.root.innerHTML;
  assert.strictEqual(state(P, 0).kind, 'used');
  assert.ok(!/<img\b/i.test(html) && !/<script\b/i.test(html), 'no tag of the attacker\'s is in the page');
  assert.ok(/&lt;img src=x onerror=alert\(1\)&gt;/.test(html) && /&lt;script&gt;/.test(html), 'it is there as text');
  assert.ok(!/title="[^"]*"><img/.test(html) && /&quot;&gt;&lt;img/.test(html), 'and cannot close the attribute it sits in');
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
