#!/usr/bin/env node
/*
 * edit-rules.test.js — checks the rules the page enforces on the edit pass
 * (SOURCE-OF-TRUTH 4.1, 4.2, 4.4 and 6): the wording guard, references in
 * digits, notes for the teacher, and hand corrections.
 *
 *   node test/edit-rules.test.js
 *
 * No dependencies and no call to Claude: where a test needs the edit pass's
 * answer, it supplies one. The page's modules are written for the browser
 * (build.js pastes them into one shared scope), so this loads their text the
 * same way and adds the two things they expect from the page around them.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const load = (file) => fs.readFileSync(path.join(__dirname, '..', 'src', 'app', file), 'utf8');
const source = ['02-helpers.js', '03-text.js', '09-prompts.js', '10-edit-pipeline.js', '13-captions.js'].map(load).join('\n');
const P = new Function(`
  var state = { bookTitle: 'John', wordsToSearchFor: 'Elihu, Zophar', sections: [] }, bookId = 'b1', root = null;
  ${source}
  return { state, numberFromWords, fixReferences, fixNames, mechanics, soundsAlike, wordingProblem, guardEdits, runEditOnSection, buildEditsPrompt, promptHeader, handEditRows, safeLink };
`)();

const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const script = (raw) => ({ id: 's1', name: 'John – Chapter 19', raw, corrected: '', edits: [], status: 'draft' });
const editor = (answer) => ({ json: () => Promise.resolve(answer) });      // a stand-in for the edit pass, answering as told

/* ---- 4.1 and 4.2: the wording guard ---- */

test('what may sound the same, and what may not', () => {
  [['Eli who', 'Elihu'], ['so far', 'Zophar'], ['the land of us', 'the land of Uz'], ['the sabians', 'the Sabeans'], ['bill dad', 'Bildad'], ['a liphaz', 'Eliphaz'], ['levy athan', 'Leviathan'], ['there', 'their'], ['sun', 'Son'], ['profit', 'prophet'], ["you're", 'your']]
    .forEach(([heard, meant]) => assert.ok(P.soundsAlike(heard, meant), heard + ' / ' + meant + ' should count as a mishearing'));
  [['wine vinegar', 'sour wine'], ['Moses', 'Jesus'], ['love', 'charity'], ['happy', 'blessed'], ['servant', 'slave'], ['wine', ''], ['', 'wine'],
   // found in review: little words, and words that differ only by a vowel, are different words
   ['we', 'you'], ['I', 'you'], ['who', 'you'], ['why', 'how'], ['a', 'I'], ['Son', 'sin'], ['good', 'God'], ['man', 'men'], ['lives', 'loves'], ['is', 'his'], ['word', 'ward']]
    .forEach(([said, other]) => assert.ok(!P.soundsAlike(said, other), said + ' / ' + other + ' must not count as a mishearing'));
});

test('a name listed under Words to Search For is matched more loosely — and only that name', () => {
  assert.ok(!P.soundsAlike('never can nezzar', 'Nebuchadnezzar'), 'unlisted, this is too far apart to apply');
  assert.ok(P.soundsAlike('never can nezzar', 'Nebuchadnezzar', ['nebuchadnezzar']));
  assert.ok(!P.soundsAlike('wine vinegar', 'sour wine', ['nebuchadnezzar']), 'listing one name loosens nothing else');
  assert.ok(!P.soundsAlike('the people', 'Nebuchadnezzar', ['nebuchadnezzar']), 'a listed name still has to resemble what was heard');
  P.state.wordsToSearchFor = 'Elihu, Nebuchadnezzar';
  assert.strictEqual(P.guardEdits([{ find: 'never can nezzar', replace: 'Nebuchadnezzar', kind: 'misheard' }], '').ok.length, 1);
  P.state.wordsToSearchFor = 'Elihu, Zophar';
  assert.strictEqual(P.guardEdits([{ find: 'never can nezzar', replace: 'Nebuchadnezzar', kind: 'misheard' }], '').held.length, 1);
});

test('the "wine vinegar" case: a verse fix that swaps in another translation\'s words is held back', () => {
  const short = { find: 'wine vinegar', replace: 'sour wine', kind: 'verse-fix', note: 'matches the verse' };
  assert.ok(P.wordingProblem(short));
  // …and it cannot hide inside a longer edit that also fixes punctuation.
  const long = { find: 'A jar of wine vinegar was there so they soaked a sponge', replace: 'A jar of sour wine was there, so they soaked a sponge', kind: 'verse-fix', note: '' };
  assert.ok(P.wordingProblem(long));
  const { ok, held } = P.guardEdits([short, long]);
  assert.strictEqual(ok.length, 0);
  assert.strictEqual(held.length, 2);
  assert.ok(/matches the verse/.test(held[0].note), 'the editor\'s own reason is kept beside ours');
});

test('punctuation, capitals, hyphens and spacing are always allowed', () => {
  [['Welcome back my friends', 'Welcome back, my friends.'], ['so called answer', 'so-called answer'], ['or was it a big bang.', 'Or was it a Big Bang?'],
   ['he said dont', 'he said, "Don\'t"'], ['and so we go and so we wait', 'And so we go — and so we wait'], ['can not', 'cannot']]
    .forEach(([find, replace]) => assert.strictEqual(P.wordingProblem({ find, replace }), '', find + ' → ' + replace));
});

test('any other change to the words is held back, whatever the editor called it', () => {
  [['gonna go', 'going to go'], ['He was very very tired', 'He was very tired'], ['we see that', 'we can see that'], ['the church', 'the Church of God'], ['kids', 'children']]
    .forEach(([find, replace]) => assert.ok(P.wordingProblem({ find, replace }), find + ' → ' + replace + ' changes the wording'));
  assert.ok(/adds words/.test(P.wordingProblem({ find: 'we see that', replace: 'we can see that' })));
  assert.ok(/removes words/.test(P.wordingProblem({ find: 'He was very very tired', replace: 'He was very tired' })));
  // found in review: labelled a mishearing or not, these change what was said
  [['we', 'you'], ['the Son of God', 'the sin of God'], ['a good man', 'a God man'], ['that is right', 'that his right']]
    .forEach(([find, replace]) => assert.ok(P.wordingProblem({ find, replace, kind: 'misheard' }), find + ' → ' + replace));
});

test('a section label in capitals may be removed; spoken words in capitals may not', () => {
  const text = 'Welcome back.\n\nBEARINGS\n\nSo here we are. NO SOAPBOX. Then, 1964.\n\nNO SOAPBOX.\n\nJob 2:4';
  assert.strictEqual(P.wordingProblem({ find: 'BEARINGS', replace: '' }, text), '');
  assert.ok(P.wordingProblem({ find: 'Bearings', replace: '' }, text));
  assert.ok(P.wordingProblem({ find: 'and that is the point', replace: '' }, text));
  // found in review: capitals alone do not make a label
  assert.ok(P.wordingProblem({ find: 'NO SOAPBOX.', replace: '' }, text), 'a sentence spoken in capitals is speech, even alone on a line');
  assert.ok(P.wordingProblem({ find: '2:4', replace: '' }, text), 'a reference is not a label');
  assert.ok(P.wordingProblem({ find: 'BEARINGS', replace: '' }, 'Take your BEARINGS from this.'), 'a capital word inside a sentence is not a label');
});

test('a sound-alike swap the editor did not label is still shown as a misheard word', () => {
  const e = { find: 'over their', replace: 'over there' };
  assert.strictEqual(P.wordingProblem(e), '');
  assert.strictEqual(e.kind, 'misheard');
  assert.ok(e.note);
});

test('a reference may change notation, never words', () => {
  [['Isaiah thirty-five verse one', 'Isaiah 35 verse 1'], ['chapter twelve', 'chapter 12'], ['verses two through four', 'verses 2 through 4'], ['Psalm one hundred nineteen', 'Psalm 119']]
    .forEach(([find, replace]) => assert.strictEqual(P.wordingProblem({ find, replace }), '', find + ' → ' + replace));
  assert.ok(P.wordingProblem({ find: 'Isaiah 35 verse one', replace: 'Isaiah 35:1' }), 'dropping the spoken word "verse" changes what was said');
  assert.ok(P.wordingProblem({ find: 'verse one', replace: 'verse 2' }), 'a different number is a different word');
});

/* ---- 6: references in digits ---- */

test('number words are read exactly, and only when they are one number', () => {
  const cases = { one: 1, nineteen: 19, twenty: 20, 'thirty-five': 35, 'thirty five': 35, 'one hundred': 100, 'one hundred nineteen': 119, 'one hundred and fifty': 150, 'nine hundred ninety-nine': 999 };
  Object.keys(cases).forEach((w) => assert.strictEqual(P.numberFromWords(w), cases[w], w));
  ['thirty-five one', 'one nineteen', 'hundred', 'one hundred and', 'and', 'twenty twenty'].forEach((w) => assert.strictEqual(P.numberFromWords(w), null, w));
});

test('a number spelled out beside a reference colon becomes digits — Jared\'s "Isaiah thirty-five:1"', () => {
  const rows = [];
  assert.strictEqual(P.fixReferences('Turn to Isaiah thirty-five:1 and read.', rows), 'Turn to Isaiah 35:1 and read.');
  assert.deepStrictEqual(rows.map((r) => [r.find, r.replace, r.kind]), [['thirty-five', '35', 'reference']]);
  assert.strictEqual(P.fixReferences('Psalm one hundred nineteen:105', []), 'Psalm 119:105');
  assert.strictEqual(P.fixReferences('John 3:sixteen', []), 'John 3:16');
  assert.strictEqual(P.fixReferences('John three:sixteen', []), 'John 3:16');
});

test('number words that are not beside a reference colon are left to judgment, not guessed at', () => {
  ['Peter three times denied him.', 'In this verse one thing stands out.', 'his job one day', 'Isaiah thirty-five one', 'There were twelve disciples.', 'someone said it',
   'Look at verse 3: one thing stands out. John 3:16: two ideas.', 'I will say this one: 3 things matter.']   // found in review: a colon followed by a space starts a sentence
   
    .forEach((text) => assert.strictEqual(P.fixReferences(text, []), text, text));
});

/* ---- the whole edit, with a supplied answer ---- */

test('an edit pass that tries to change the speaker\'s words: the rest is applied, that part is not', async () => {
  const s = script('Welcome back my friends\n\nverse twenty-nine a jar of wine vinegar was there so Eli who answered');
  await P.runEditOnSection(s, editor({
    edits: [
      { find: 'Welcome back my friends', replace: 'Welcome back, my friends.' },
      { find: 'wine vinegar', replace: 'sour wine', kind: 'verse-fix', note: 'ESV wording' },
      { find: 'Eli who', replace: 'Elihu', kind: 'misheard', note: 'listed name' }
    ],
    verses: [], joins: [], nonsensical: [],
    misquotes: [{ said: 'money is the root of all evil', verse: 'For the love of money is a root of all kinds of evil', reference: '1 Timothy 6:10' }, { said: '' }, null],
    summary: 'Fixed punctuation.'
  }));
  assert.strictEqual(s.status, 'edited');
  assert.ok(/wine vinegar/.test(s.corrected) && !/sour wine/.test(s.corrected), 'the speaker still says "wine vinegar"');
  assert.ok(/Welcome back, my friends\./.test(s.corrected) && /Elihu answered/.test(s.corrected), 'the legitimate fixes went in');
  assert.deepStrictEqual(s.suggested.map((e) => [e.find, e.replace]), [['wine vinegar', 'sour wine']]);
  assert.ok(/would have altered the speaker’s words/.test(s.summary));
  assert.deepStrictEqual(s.misquotes, [{ said: 'money is the root of all evil', verse: 'For the love of money is a root of all kinds of evil', reference: '1 Timothy 6:10' }]);
  assert.ok(!s.edits.some((e) => e.replace === 'sour wine'), 'a held change is not listed among the changes made');
});

test('the instructions tell the editor the same rules the page enforces', () => {
  const prompt = P.buildEditsPrompt(script('x'), 'x');
  assert.ok(/must SOUND like what was transcribed/.test(prompt));
  assert.ok(/NIV, sometimes the ESV: never change a quotation to match a verse/.test(prompt));
  assert.ok(/"misquotes":\[\{"said":"","verse":"","reference":""\}\]/.test(prompt));
  assert.ok(/Bible references in digits/.test(prompt) && /keep the words "chapter" and "verse"/.test(prompt));
  const overhead = prompt.length - 'x'.length;
  assert.ok(overhead < 5800, 'the fixed instructions grew to ' + overhead + ' characters — every one is paid for on every script (4.6)');
});

test('only an ordinary https link is ever shown as a link', () => {
  assert.strictEqual(P.safeLink('https://docs.google.com/document/d/abc/edit?usp=drivesdk'), 'https://docs.google.com/document/d/abc/edit?usp=drivesdk');
  ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'http://example.com', ' https://ok.example/x" onclick="y', '', null, 'docs.google.com/x']
    .forEach((bad) => assert.strictEqual(P.safeLink(bad), '', String(bad)));
});

/* ---- 4.4: hand corrections are listed ---- */

test('a hand correction is listed as before/after rows, with a word of context', () => {
  const before = 'Welcome back, my friends. So Elihu answered and said, in the land of us there was a man.';
  const after = 'Welcome back, my friends. So Elihu answered and said: in the land of Uz there was a good man.';
  assert.deepStrictEqual(P.handEditRows(before, after).map((r) => [r.find, r.replace, r.kind]), [
    ['and said,', 'and said:', 'hand'], ['of us', 'of Uz', 'hand'], ['a', 'a good', 'hand']
  ]);
  assert.deepStrictEqual(P.handEditRows('one two three', 'one three').map((r) => [r.find, r.replace]), [['one two', 'one']]);
  assert.deepStrictEqual(P.handEditRows('Same words.', 'Same words.'), []);
  assert.deepStrictEqual(P.handEditRows('One para.\n\nTwo para.', 'One para. Two para.').map((r) => r.find), ['paragraph breaks or spacing']);
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
