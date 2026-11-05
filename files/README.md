# The Scriptorium

**TTW transcript editor — for active audio guide scripts from Descript.**

Observes, edits, and corrects grammatical and capitalization errors. Resets and
prepares the format to be ready for third-party platforms. Analyzes and
fact-checks the Bible references and research info carried in the source, and
flags anything that does not hold up.

This repository holds the source of the Scriptorium, which runs as a Claude
artifact. `dist/index.html` is the exact file that gets published.

---

## Why it exists

Through the Word audio guides start life as Descript transcripts. Descript's AI
listens to the recording, so it captures the *sound* of the words rather than
the words themselves. Unfamiliar names come through as ordinary phrases that
sound similar — Elihu becomes "Eli who", Zophar becomes "so far", the land of
Uz becomes "the land of us". Speech also arrives as one long run of flat
punctuation: questions ending in periods, sentences starting lowercase, clauses
chained together with "and" and "so" until a paragraph is a single breathless
sentence.

Cleaning one script by hand is a slow afternoon. A book like Job is 44 of them,
each 6,000–15,000 characters. The Scriptorium does the pass in one go, shows
exactly what it changed, and hands back text that can be pasted straight into
YouVersion with as little hand-editing as possible.

## What it does

1. **Paste in the transcripts.** One card per script — an intro, each chapter, a
   conclusion. Name the book and list the names the speaker uses that Descript
   is likely to mangle.
2. **Run the edit pass.** Each script is corrected for punctuation,
   capitalization, run-on sentences, and misheard names — *without* changing the
   speaker's wording, meaning, tone, or intent. Stage cues and pause marks are
   stripped. Paragraph breaks that fall mid-thought are closed up.
3. **Review what changed.** Every card shows a before/after table of misheard
   words, verse fixes, and grammar changes, plus any sentence that still does
   not make sense.
4. **Check the scripture.** Every quoted verse is pulled out with the reference
   the speaker spoke aloud, the canonical reference worked out from the text,
   and a confidence flag so uncertain references are easy to spot.
5. **Copy or publish.** Copy a single script with its verses already bold and
   block-quoted, or build the whole book into one Google Doc.

## Repository layout

```
src/
  shell.html          the HTML wrapper, with {{STYLES}} {{SEED}} {{APP}} slots
  styles.css          all styling
  seed-state.json     the empty starting state
  app/
    manifest.json     the concatenation order — the only place order is defined
    01-state.js       app root element and the state shape
    02-helpers.js     escaping, relative times, stored per-viewer prefs
    03-text.js        locating and applying edits; verse quoting and layout
    04-render.js      all HTML rendering, plus focus-preserving repaints
    05-capabilities.js runtime capability lookup
    06-store.js       persistence — one small document per script
    07-fields.js      reading form fields back out of the DOM
    08-actions.js     add, remove, collapse, copy
    09-prompts.js     THE EDITING INSTRUCTIONS — see SOURCE-OF-TRUTH.md
    10-edit-pipeline.js  the edit run: cues, capitals, joins, concurrency
    11-clear.js       clearing the workbench for the next book
    12-google-doc.js  building the Google Doc, with an HTML fallback
    13-events.js      event delegation, shortcuts, start-up
build.js              reassembles src/ into dist/index.html
dist/index.html       the built artifact — what actually gets published
SOURCE-OF-TRUTH.md    what this tool is for, and the lines not to cross
```

**The split is for reviewing, not for modules.** `build.js` pastes every file in
`src/app` into one shared function scope, in manifest order. A function defined
in one file is visible in all of them. There is no bundler, no imports, and no
build step beyond concatenation.

## Building

```sh
node build.js            # write dist/index.html from src/
node build.js --check    # verify dist/index.html matches src/ — exits 1 if not
```

No dependencies. Node is only used to copy text around.

## Publishing

`dist/index.html` is the whole artifact: one self-contained file, no external
assets beyond Google Fonts. To publish, hand `dist/index.html` to Claude and
ask for it to be published to the existing Scriptorium artifact.

## Reverting

Every commit contains a complete, publishable `dist/index.html`. To go back to
any earlier version of the tool:

```sh
git log --oneline -- dist/index.html        # find the version you want
git show <commit>:dist/index.html > index.html
```

Then publish that file. Nothing needs to be rebuilt and nothing else needs to
be rolled back — the built file at any commit is a working Scriptorium.

**Always commit `src/` and `dist/` together.** Run `node build.js --check`
before committing; if it fails, the two have drifted and the revert path is no
longer trustworthy.

## Before changing anything

Read `SOURCE-OF-TRUTH.md`. It states what this tool is for and which behaviours
are not up for redesign. Changes to `src/app/09-prompts.js` change the editing
itself and deserve the most care.
