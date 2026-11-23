#!/usr/bin/env node
/*
 * edit-rules.test.js — checks the rules the page enforces on the edit pass
 * (SOURCE-OF-TRUTH 4.1, 4.2, 4.4 and 6): the wording guard, references in
 * digits, notes for the teacher, hand corrections, how a quoted verse is laid
 * out, and when a transcript counts as Final.
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
  return { state, numberFromWords, fixReferences, fixNames, fixCapitals, mechanics, soundsAlike, wordingProblem, guardEdits, runEditOnSection, buildEditsPrompt, promptHeader, handEditRows, safeLink,
           layoutBlocks, blocksToPlain, blocksToHtml, normalizeVerseQuotes, isFinal, isStale };
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

/* ---- 6: how a quoted verse is laid out ---- */

const plain = (corrected, verses) => P.blocksToPlain(P.layoutBlocks({ corrected, verses }));

test('found in review: the closing marks after a verse stay with the verse — no floating \'" on the next paragraph', () => {
  // The case from the Luke 7 guide: speech inside the verse closes, then the verse closes.
  const text = 'In verse 13, "When the Lord saw her, his heart went out to her and he said, \'Don\'t cry.\' Then he went up and touched the bier they were carrying him on, and the bearers stood still. He said, \'Young man, I say to you, get up.\'" The dead man sat up and began to talk, and Jesus gave him back to his mother. The response of the people is stirring.';
  const verses = [{ reference: 'verse 13', startsWith: 'When the Lord saw her,', endsWith: 'I say to you, get up.', canonical: 'Luke 7:13-14', confidence: 'high' }];
  const blocks = P.layoutBlocks({ corrected: text, verses });
  assert.deepStrictEqual(blocks.map((b) => b.type), ['p', 'verse', 'p']);
  assert.strictEqual(blocks[1].text, '"When the Lord saw her, his heart went out to her and he said, \'Don\'t cry.\' Then he went up and touched the bier they were carrying him on, and the bearers stood still. He said, \'Young man, I say to you, get up.\'"');
  assert.strictEqual(blocks[2].text, 'The dead man sat up and began to talk, and Jesus gave him back to his mother. The response of the people is stirring.');
  assert.ok(!/^['"”’]/.test(blocks[2].text), 'the next paragraph must not open with a left-over mark');
});

test('found in review: every variation of a stray mark after a verse is tidied the same way', () => {
  const verse = [{ startsWith: 'For God so loved', endsWith: 'have eternal life', canonical: 'John 3:16', confidence: 'high' }];
  const want = 'He said this.\n\n"For God so loved the world that whoever believes shall have eternal life." (John 3:16)\n\nThat is the heart of it.';
  [ '"For God so loved the world that whoever believes shall have eternal life." That is the heart of it.',
    '"For God so loved the world that whoever believes shall have eternal life."" That is the heart of it.',          // doubled
    '"For God so loved the world that whoever believes shall have eternal life." " That is the heart of it.',         // one left a space away
    '"For God so loved the world that whoever believes shall have eternal life". That is the heart of it.',           // the full stop left outside
    '"For God so loved the world that whoever believes shall have eternal life.". That is the heart of it.',          // a full stop on both sides
    '“For God so loved the world that whoever believes shall have eternal life.” That is the heart of it.',           // curly
    '" For God so loved the world that whoever believes shall have eternal life. " That is the heart of it.',         // marks a space away on both sides
    '"For God so loved the world that whoever believes shall have eternal life.\'" That is the heart of it.'          // a single mark with nothing open: a stray
  ].forEach((tail) => assert.strictEqual(plain('He said this. ' + tail, verse), want, tail));
  // A mark that opens the next quotation belongs to that quotation, and stays.
  assert.strictEqual(plain('"For God so loved the world that whoever believes shall have eternal life." "Amen," they said.', verse),
    '"For God so loved the world that whoever believes shall have eternal life." (John 3:16)\n\n"Amen," they said.');
  // A reference already written after the verse is not printed twice, and its full stop does not start the next paragraph.
  // The verse itself had no full stop, and is not given one (4.2).
  assert.strictEqual(plain('"For God so loved the world that whoever believes shall have eternal life" (John 3:16). That is the heart of it.', verse),
    '"For God so loved the world that whoever believes shall have eternal life" (John 3:16)\n\nThat is the heart of it.');
});

test('a verse keeps the marks that are its own: a question, speech that opens it, an apostrophe', () => {
  assert.strictEqual(P.normalizeVerseQuotes('"How will this be," Mary asked, "since I am a virgin?"'), '"\'How will this be,\' Mary asked, \'since I am a virgin?\'"');
  assert.strictEqual(P.normalizeVerseQuotes('Jesus said, \'Feed my sheep.\''), '"Jesus said, \'Feed my sheep.\'"');
  assert.strictEqual(P.normalizeVerseQuotes('It is the Lord\'s doing, and it is marvelous'), '"It is the Lord\'s doing, and it is marvelous"');
  assert.strictEqual(P.normalizeVerseQuotes('Why do you look for the living among the dead?!'), '"Why do you look for the living among the dead?!"');
});

test('found in review: two verses that open with the same words are both set in bold', () => {
  const s = { corrected: 'First. "Jesus answered and said to him, I am the way." Then later. "Jesus answered and said to him, feed my sheep." End.', verses: [
    { startsWith: 'Jesus answered and said to', endsWith: 'I am the way.', canonical: 'John 14:6', confidence: 'high' },
    { startsWith: 'Jesus answered and said to', endsWith: 'feed my sheep.', canonical: 'John 21:17', confidence: 'high' }] };
  const blocks = P.layoutBlocks(s);
  assert.deepStrictEqual(blocks.filter((b) => b.type === 'verse').map((b) => b.ref), ['John 14:6', 'John 21:17']);
  assert.deepStrictEqual(blocks.filter((b) => b.type === 'verse').map((b) => b.index), [0, 1]);
});

/* ---- found in review of 1.2.1 ---- */

test('found in review: numbers cannot be regrouped — "3:16" is not "31:6"', () => {
  [['John 3:16', 'John 31:6'], ['Isaiah 35 1', 'Isaiah 3:51'], ['verses 1, 2', 'verses 12'], ['verse 3-4', 'verse 34'], ['about 3.5 miles', 'about 35 miles']]
    .forEach(([find, replace]) => assert.ok(P.wordingProblem({ find, replace }), find + ' → ' + replace + ' changes what was said'));
  [['Isaiah 35 1', 'Isaiah 35:1'], ['1,000 people', '1000 people'], ['chapter twenty four', 'chapter 24'], ['Luke twenty four, one', 'Luke 24:1'], ['verses 2 - 4', 'verses 2–4']]
    .forEach(([find, replace]) => assert.strictEqual(P.wordingProblem({ find, replace }), '', find + ' → ' + replace + ' only changes how it is written'));
});

test('found in review: "th" is its own sound — then / ten and wrath / rat are different words', () => {
  [['then', 'ten'], ['three', 'tree'], ['wrath', 'rat'], ['with', 'wit'], ['thank', 'tank'], ['both', 'bot'], ['tenth', 'tent'], ['thin', 'tin']]
    .forEach(([said, other]) => assert.ok(!P.soundsAlike(said, other), said + ' / ' + other + ' must not count as a mishearing'));
  // …while a long name Descript spelled without its h is still a mishearing of that name.
  [['Timoty', 'Timothy'], ['Betlehem', 'Bethlehem'], ['Mathew', 'Matthew'], ['Natanael', 'Nathanael']]
    .forEach(([heard, meant]) => assert.ok(P.soundsAlike(heard, meant), heard + ' / ' + meant + ' should count as a mishearing'));
  assert.ok(P.soundsAlike('Ester', 'Esther', ['esther']), 'a short name passes once it is listed under Words to Search For');
});

test('found in review: a word in another alphabet cannot be quietly deleted', () => {
  assert.ok(/removes words/.test(P.wordingProblem({ find: 'the λόγος was', replace: 'the was' })));
  assert.ok(P.wordingProblem({ find: 'שלום friends', replace: 'friends' }));
  assert.strictEqual(P.wordingProblem({ find: 'the λόγος was', replace: 'The λόγος was,' }), '');
});

test('found in review: words already in capitals are left alone, and a decimal keeps its space', () => {
  const rows = [];
  assert.strictEqual(P.fixNames('and the LORD said to JESUS, GOD is good', rows), 'and the LORD said to JESUS, GOD is good');
  assert.strictEqual(P.fixNames('and the lord said to jesus, god is good', []), 'and the Lord said to Jesus, God is good');
  assert.strictEqual(P.fixNames('and i, for one, think i am', []), 'and I, for one, think I am');
  assert.strictEqual(P.mechanics('about .5 percent , more or less', []), 'about .5 percent, more or less');
});

test('found in review: a break closed up mid-thought leaves no capital stranded in the middle of the sentence', async () => {
  const s = script('and the women took the spices\n\nwent to the tomb early.\n\nthen they left');
  let sent = '';
  await P.runEditOnSection(s, { json: (prompt) => { sent = /TRANSCRIPT:\n"""\n([\s\S]*)\n"""/.exec(prompt)[1];
    return Promise.resolve({ edits: [], verses: [], joins: [{ endsWith: 'took the spices', startsWith: 'went to the tomb' }], misquotes: [], nonsensical: [], summary: '' }); } });
  assert.strictEqual(sent, 'And the women took the spices\n\nwent to the tomb early.\n\nThen they left', 'a paragraph after one with no full stop is not capitalised before the edit pass');
  assert.strictEqual(s.corrected, 'And the women took the spices went to the tomb early.\n\nThen they left.');
  // The editor may capitalise that word itself while also closing the break. The capital is taken back.
  const u = script('and the women took the spices\n\nwent to the tomb early.');
  await P.runEditOnSection(u, editor({ edits: [{ find: 'went to the tomb', replace: 'Went to the tomb' }], verses: [], joins: [{ endsWith: 'took the spices', startsWith: 'Went to the tomb' }], misquotes: [], nonsensical: [], summary: '' }));
  assert.strictEqual(u.corrected, 'And the women took the spices went to the tomb early.');
  // A name keeps its capital across a closed break: it was a capital when it was sent.
  const n = script('and so they spoke to\n\nJesus about it.');
  await P.runEditOnSection(n, editor({ edits: [], verses: [], joins: [{ endsWith: 'they spoke to', startsWith: 'Jesus about it' }], misquotes: [], nonsensical: [], summary: '' }));
  assert.strictEqual(n.corrected, 'And so they spoke to Jesus about it.');
  // With no join, the same paragraph does get its capital and the one before it its full stop.
  const t = script('and the women took the spices\n\nwent to the tomb early.');
  await P.runEditOnSection(t, editor({ edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' }));
  assert.strictEqual(t.corrected, 'And the women took the spices.\n\nWent to the tomb early.');
});

test('found in review: a transcript changed while the edit pass runs is marked as changed since', async () => {
  const s = script('welcome back my friends');
  await P.runEditOnSection(s, { json: () => { s.raw = 'welcome back my dear friends'; return Promise.resolve({ edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' }); } });
  assert.strictEqual(s.editedFromRaw, 'welcome back my friends');
  assert.ok(P.isStale(s), 'the Edited Transcript was made from the older text');
});

/* ---- The stages: an Edited Transcript becomes Final only by a person's approval ---- */

test('a new edit pass takes a Final Transcript back to Edited, and a changed 1st Draft is not Final', async () => {
  const s = script('welcome back my friends');
  await P.runEditOnSection(s, editor({ edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' }));
  assert.ok(!P.isFinal(s), 'the edit pass alone never makes a Final Transcript');
  s.approvedAt = 1700000000000;
  assert.ok(P.isFinal(s));
  s.raw = 'welcome back my dear friends';
  assert.ok(!P.isFinal(s), 'what was approved is no longer what Descript has');
  await P.runEditOnSection(s, editor({ edits: [], verses: [], joins: [], misquotes: [], nonsensical: [], summary: '' }));
  assert.strictEqual(s.approvedAt, 0);
  assert.ok(!P.isFinal(s));
});

(async () => {
  let passed = 0;
  for (const [name, fn] of tests) {
    try { await fn(); passed += 1; console.log('  ok  ' + name); }
    catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
  }
  console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
})();
