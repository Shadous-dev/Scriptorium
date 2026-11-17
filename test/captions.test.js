#!/usr/bin/env node
/*
 * captions.test.js — checks the caption rules in SOURCE-OF-TRUTH 4.7.
 *
 *   node test/captions.test.js
 *
 * No dependencies. src/app/13-captions.js is written for the browser page (it
 * is pasted into one shared scope by build.js), so this loads its text and
 * hands it the three small helpers it borrows from other modules.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', '13-captions.js'), 'utf8');
const helpers = `
  function esc(str) { return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function plural(n) { return n === 1 ? '' : 's'; }
  function isStale(s) { return s.status === 'edited' && s.editedFromRaw != null && s.raw !== s.editedFromRaw; }
`;
const C = new Function(helpers + src + '\nreturn { parseCaptions, wordKey, matchWords, buildCaptions, toSrt, toVtt, zipFiles, crc32, captionNote, fileSafe };')();

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  ok  ' + name); }
  catch (err) { console.error('FAIL  ' + name + '\n      ' + (err && err.message)); process.exitCode = 1; }
}
const wordsOf = (text) => String(text).match(/\S+/g) || [];
const allWords = (cues) => wordsOf(cues.map((c) => c.text).join(' '));

// What Descript hands over: lowercase starts, a misheard name, a stage cue, a two-line caption.
const SRT = [
  '1', '00:00:00,000 --> 00:00:02,500', '[HOOK]', '',
  '2', '00:00:02,500 --> 00:00:05,120', 'welcome back my friends', '',
  '3', '00:00:05,120 --> 00:00:09,000', 'so Eli who answered and said', 'in the land of us', '',
  '4', '00:00:09,000 --> 00:00:12,480', 'there was a man whose name was Job', '',
  '5', '01:02:03,004 --> 01:02:05,060', 'and that is the so called answer', ''
].join('\n');
// What the edit pass produces from the same audio.
const CORRECTED = 'Welcome back, my friends.\n\nSo Elihu answered and said, "In the land of Uz there was a man whose name was Job." And that is the so-called answer.';

test('reads .srt: times in milliseconds, counters dropped, lines kept', () => {
  const cues = C.parseCaptions(SRT);
  assert.strictEqual(cues.length, 5);
  assert.deepStrictEqual([cues[1].start, cues[1].end], [2500, 5120]);
  assert.deepStrictEqual(cues[2].lines, ['so Eli who answered and said', 'in the land of us']);
  assert.deepStrictEqual([cues[4].start, cues[4].end], [3723004, 3725060]);
});

test('reads .vtt: header, notes, tags, settings and short timestamps', () => {
  const vtt = 'WEBVTT\n\nNOTE made by a test\n\nintro\n00:01.000 --> 00:03.500 align:start position:10%\n<v Kris>Hello &amp; welcome</v>\n\n00:00:03.500 --> 00:00:05.000\n<i>friends</i>\n';
  const cues = C.parseCaptions(vtt);
  assert.strictEqual(cues.length, 2);
  assert.deepStrictEqual([cues[0].start, cues[0].end, cues[0].lines], [1000, 3500, ['Hello & welcome']]);
  assert.deepStrictEqual(cues[1].lines, ['friends']);
});

test('reads a messy file: BOM, Windows line ends, no blank lines between captions', () => {
  const messy = '﻿1\r\n00:00:00,000 --> 00:00:01,000\r\none two\r\n2\r\n00:00:01,000 --> 00:00:02,000\r\nthree\r\n';
  const cues = C.parseCaptions(messy);
  assert.strictEqual(cues.length, 2);
  assert.deepStrictEqual(cues[0].lines, ['one two']);
  assert.deepStrictEqual(cues[1].lines, ['three']);
});

test('lining words up finds the longest match (checked against a slow, obviously-right method)', () => {
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  for (let round = 0; round < 300; round++) {
    const a = Array.from({ length: rnd(40) }, () => 'w' + rnd(6));
    const b = Array.from({ length: rnd(40) }, () => 'w' + rnd(6));
    const table = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
    const pairs = C.matchWords(a, b, 4000);
    assert.strictEqual(pairs.length, table[a.length][b.length], 'length of the match');
    pairs.forEach((p, n) => {
      assert.strictEqual(a[p[0]], b[p[1]], 'a matched pair is the same word');
      if (n) assert.ok(p[0] > pairs[n - 1][0] && p[1] > pairs[n - 1][1], 'pairs stay in order');
    });
  }
});

test('lining words up gives up, rather than guessing, past the difference limit', () => {
  const a = Array.from({ length: 50 }, (_, i) => 'a' + i), b = Array.from({ length: 50 }, (_, i) => 'b' + i);
  assert.strictEqual(C.matchWords(a, b, 20), null);
});

test('4.7: every corrected word appears once, in order', () => {
  const r = C.buildCaptions(SRT, CORRECTED);
  assert.ok(r.ok);
  assert.deepStrictEqual(allWords(r.cues), wordsOf(CORRECTED));
});

test('4.7: timings are Descript\'s — copied, never moved', () => {
  const r = C.buildCaptions(SRT, CORRECTED), source = C.parseCaptions(SRT);
  r.cues.forEach((c) => assert.ok(source.some((s) => s.start === c.start && s.end === c.end), 'a timing that Descript did not give'));
  for (let i = 1; i < r.cues.length; i++) assert.ok(r.cues[i].start >= r.cues[i - 1].start, 'captions stay in time order');
});

test('a corrected name lands in the caption of the words it replaced', () => {
  const r = C.buildCaptions(SRT, CORRECTED);
  const third = r.cues.find((c) => c.start === 5120);
  assert.ok(/Elihu/.test(third.text), 'Elihu replaces "Eli who" in caption 3');
  assert.ok(/Uz/.test(third.text), 'Uz replaces "us" in caption 3');
  assert.ok(!/Eli who|land of us/.test(r.cues.map((c) => c.text).join(' ')));
  assert.ok(/so-called/.test(r.cues[r.cues.length - 1].text));
});

test('a caption left with no spoken words is dropped, and the count says so', () => {
  const r = C.buildCaptions(SRT, CORRECTED);
  assert.strictEqual(r.stats.cuesIn, 5);
  assert.strictEqual(r.stats.cuesOut, 4);
  assert.strictEqual(r.stats.dropped, 1);
  assert.ok(!r.cues.some((c) => /HOOK/.test(c.text)));
});

test('a two-line caption keeps its line break', () => {
  const r = C.buildCaptions(SRT, CORRECTED);
  assert.strictEqual(r.cues.find((c) => c.start === 5120).text, 'So Elihu answered and said,\n"In the land of Uz');
});

test('captions from a different script are refused, not forced to fit', () => {
  const r = C.buildCaptions(SRT, 'In the beginning God created the heavens and the earth. Now the earth was formless and empty.');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'mismatch');
});

test('text with no timings, and an empty script, are each reported plainly', () => {
  assert.strictEqual(C.buildCaptions('just some words, no times', CORRECTED).reason, 'no-cues');
  assert.strictEqual(C.buildCaptions(SRT, '').reason, 'no-script');
});

test('.srt out: numbered, comma in the times, reads back identically', () => {
  const r = C.buildCaptions(SRT, CORRECTED), srt = C.toSrt(r.cues);
  assert.ok(srt.startsWith('1\n00:00:02,500 --> 00:00:05,120\nWelcome back, my friends.\n\n2\n'));
  assert.ok(srt.includes('01:02:03,004 --> 01:02:05,060'));
  const back = C.parseCaptions(srt);
  assert.deepStrictEqual(back.map((c) => [c.start, c.end, c.lines.join('\n')]), r.cues.map((c) => [c.start, c.end, c.text]));
});

test('.vtt out: same captions and times as the .srt, in WebVTT form', () => {
  const r = C.buildCaptions(SRT, CORRECTED), vtt = C.toVtt(r.cues);
  assert.ok(vtt.startsWith('WEBVTT\n\n00:00:02.500 --> 00:00:05.120\nWelcome back, my friends.\n'));
  assert.ok(!/^\d+$/m.test(vtt), 'no counter lines');
  const back = C.parseCaptions(vtt);
  assert.deepStrictEqual(back.map((c) => [c.start, c.end, c.lines.join('\n')]), r.cues.map((c) => [c.start, c.end, c.text]));
});

test('.vtt escapes the characters WebVTT treats as markup', () => {
  const vtt = C.toVtt([{ start: 0, end: 1000, text: 'Q & A <aside> a --> b' }]);
  assert.ok(vtt.includes('Q &amp; A &lt;aside&gt; a --&gt; b'));
  assert.deepStrictEqual(C.parseCaptions(vtt)[0].lines, ['Q & A <aside> a --> b']);
});

test('a long script: 3,000 words with a change every 25th still lines up exactly', () => {
  const spoken = Array.from({ length: 3000 }, (_, i) => 'word' + (i % 97));
  const lines = [];
  for (let i = 0, n = 1; i < spoken.length; i += 8, n++) lines.push(n, '00:' + String(Math.floor(i / 480)).padStart(2, '0') + ':' + String(Math.floor(i / 8) % 60).padStart(2, '0') + ',000 --> 00:' + String(Math.floor(i / 480)).padStart(2, '0') + ':' + String(Math.floor(i / 8) % 60).padStart(2, '0') + ',900', spoken.slice(i, i + 8).join(' '), '');
  const corrected = spoken.map((w, i) => (i % 25 === 0 ? 'Fixed' + i + ',' : w)).join(' ');
  const r = C.buildCaptions(lines.join('\n'), corrected);
  assert.ok(r.ok);
  assert.deepStrictEqual(allWords(r.cues), wordsOf(corrected));
  assert.strictEqual(r.stats.cuesOut, 375);
  assert.strictEqual(r.stats.placedByPosition, 120);
  // Each replaced word must sit in the very caption its original was in.
  r.cues.forEach((c, n) => wordsOf(c.text).forEach((w) => { const m = w.match(/^Fixed(\d+),$/); if (m) assert.strictEqual(Math.floor(Number(m[1]) / 8), n); }));
});

test('.zip: a valid archive whose files read back byte for byte', () => {
  const files = [{ name: 'srt/Job – Chapter 2.srt', text: C.toSrt(C.buildCaptions(SRT, CORRECTED).cues) }, { name: 'vtt/Job – Chapter 2.vtt', text: 'WEBVTT\n' }];
  const zip = Buffer.from(C.zipFiles(files, new Date(2026, 10, 16, 9, 30, 0)));
  const end = zip.length - 22;
  assert.strictEqual(zip.readUInt32LE(end), 0x06054b50, 'end-of-archive record');
  assert.strictEqual(zip.readUInt16LE(end + 10), 2, 'two files listed');
  let at = zip.readUInt32LE(end + 16);
  files.forEach((f) => {
    assert.strictEqual(zip.readUInt32LE(at), 0x02014b50, 'directory entry');
    const nameLen = zip.readUInt16LE(at + 28), size = zip.readUInt32LE(at + 24), local = zip.readUInt32LE(at + 42);
    assert.strictEqual(zip.toString('utf8', at + 46, at + 46 + nameLen), f.name);
    assert.strictEqual(zip.readUInt32LE(local), 0x04034b50, 'file header');
    const dataAt = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataAt, dataAt + size);
    assert.strictEqual(data.toString('utf8'), f.text);
    assert.strictEqual(zip.readUInt32LE(at + 16), C.crc32(data), 'checksum matches the contents');
    at += 46 + nameLen;
  });
  assert.strictEqual(C.crc32(Buffer.from('123456789')), 0xCBF43926, 'the standard CRC-32 check value');
  if (process.argv[2]) fs.writeFileSync(process.argv[2], zip);   // lets a person open the archive with a real unzip tool
});

test('file names: characters Windows and macOS refuse are removed, the rest is kept', () => {
  assert.strictEqual(C.fileSafe('Job – Chapter 2: "Why?"', 'x'), 'Job – Chapter 2 Why');
  assert.strictEqual(C.fileSafe('  ', 'Script 3'), 'Script 3');
});

test('the note under the captions box says where things stand', () => {
  const draft = { id: 's1', status: 'draft', captions: SRT, corrected: '', raw: 'x', editedFromRaw: null };
  assert.ok(/5 timed captions read/.test(C.captionNote(draft).text));
  const edited = { id: 's2', status: 'edited', captions: SRT, corrected: CORRECTED, raw: 'x', editedFromRaw: 'x' };
  const note = C.captionNote(edited);
  assert.ok(/Caption files ready — 4 captions/.test(note.text) && /1 with no spoken words left out/.test(note.text) && !note.warn, note.text);
  const wrong = { id: 's3', status: 'edited', captions: SRT, corrected: 'Entirely different words appear in this other script, none of them shared.', raw: 'x', editedFromRaw: 'x' };
  assert.ok(C.captionNote(wrong).warn && /don’t match this script/.test(C.captionNote(wrong).text));
  assert.strictEqual(C.captionNote({ id: 's4', status: 'draft', captions: '', corrected: '' }).text, '');
});

console.log('\n' + passed + ' checks passed' + (process.exitCode ? ', some FAILED' : ''));
