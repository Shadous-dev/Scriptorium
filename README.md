# The Scriptorium

**Through the Word's transcript editor for audio guide scripts from Descript.**

It turns Descript's raw transcript of an audio guide into clean, publishable
text and searchable caption files, without changing what the speaker said. It
runs as a Claude artifact: one web page, opened inside Claude.

> **This repository is the only copy of the Scriptorium.** The `main` branch
> is the tool. If something is not here, it is not part of the tool. See
> [One source of truth](#one-source-of-truth).

**Live tool:** [The Scriptorium](https://claude.ai/artifact/FraE4AkPkEJNUrsuoABCRp),
version 1.1.0. It opens for members of the Through the Word organization on
Claude. This is the one published copy; see [Publishing](#publishing).

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
YouVersion, plus caption files that make every word of the guide searchable.

## Using it

0. **Pick a book, or start one.** The front page lists every book the team
   has. Each is its own workbench, shared with everyone: open one to pick up
   where anyone left off, or use **+ New Book**.
1. **Pull the audio guides from Descript.** Click **Pull from Descript**, open
   the book's folder in the TTW Drive, tick the audio guides you want, and
   pull them. Each becomes a script with its transcript and its timed
   captions. Nothing in Descript is changed. You can also paste a transcript
   into a script by hand. Then name the book and list the names the speaker
   uses that Descript is likely to mangle.
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
6. **Download caption files.** A script pulled from Descript already has its
   timed captions. For one pasted by hand, open **Timed captions for search**
   and paste in the `.srt` file Descript exports for that audio guide (in
   Descript: Export › Subtitles › .srt). After the edit pass, download an
   `.srt` and a `.vtt`. Both carry the *corrected* words on Descript's own
   timings, so a search for "Uz" finds it even though Descript heard "us".
   **Download all caption files** at the bottom gives the whole book in one
   `.zip`.

### What a caption file is, and is not

- Every word of the corrected script appears once, in order.
- The timings are Descript's. The Scriptorium never moves or invents one.
- The `.srt` and the `.vtt` hold the same words and times; only the file format
  differs. Making them costs nothing — no call to Claude.
- Timings are per caption (a few seconds), not per word, because that is what
  Descript exports. A search lands on the caption a word is in.
- If the captions pasted in belong to a different script, the tool says so and
  builds nothing.

### Known limits

- **Books are shared, not live.** Everyone sees the same books, but a book is
  read when you open it. If two people type in the same script at the same
  time, the last save wins. Different scripts in the same book are safe.
- **Saving needs Contributor access.** Someone who can only view the artifact
  can read the books but not change them.
- **Pulling from Descript is paced.** Descript allows a page about five audio
  guides a minute, so a 44-chapter book takes around ten minutes. Keep the
  page open; each guide is saved as it arrives, and Stop is safe.
- **Each person connects Descript once.** The pull uses your own Descript
  connector in Claude (Settings › Connectors), and Claude asks you to allow
  it the first time.
- **One composition per project.** If a Descript project holds more than one
  composition, the first is pulled.
- **Caption files download as a `.zip`.** The Claude viewer does not allow a
  page to save `.srt` or `.vtt` directly.
- **Verse references are worked out, not looked up.** The edit pass infers each
  reference from the text and flags the ones it is unsure of. It does not check
  the quoted words against a Bible.

## One source of truth

There has been more than one copy of this tool: archives inside the repo, loose
files beside them, and folders on people's machines. From here on there is one.

- **`main` on GitHub is the Scriptorium.** Not a zip, not a folder on a laptop,
  not a file sent in a message.
- **`SOURCE-OF-TRUTH.md` says what the tool is for.** When a change and that
  document disagree, the document wins or is changed first, on purpose.
- **The published artifact is always built from `main`.** Publish
  `dist/index.html` from a commit that is on `main`, and nothing else.
- **Nothing is uploaded through the GitHub website.** Clone the repo, change
  files, commit, push. Uploading files or archives by hand is how the copies
  drifted apart.
- **No archives, no "final", "v2", or "copy" files.** An older version is a
  git tag (see [Versions](#versions)), never a second file.
- **`src/` and `dist/` are committed together.** `node build.js --check` must
  pass. GitHub runs it on every push.
- **Every change gets a line in `CHANGELOG.md`.**

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
    06-store.js       persistence — the shared library of books; per book, a document per script and per script's captions
    07-fields.js      reading form fields back out of the DOM
    08-actions.js     add, remove, collapse, copy
    09-prompts.js     THE EDITING INSTRUCTIONS — see SOURCE-OF-TRUTH.md
    10-edit-pipeline.js  the edit run: cues, capitals, joins, concurrency
    11-clear.js       clearing the workbench for the next book
    12-google-doc.js  building the Google Doc, with an HTML fallback
    13-captions.js    timed captions: reading .srt/.vtt, building .srt, .vtt and .zip
    14-descript.js    pulling transcripts and captions from Descript (reading only)
    15-events.js      event delegation, shortcuts, start-up
test/
  captions.test.js    checks the caption rules (SOURCE-OF-TRUTH 4.7)
  descript.test.js    checks the Descript pull against a stand-in connector (4.8)
build.js              reassembles src/ into dist/index.html
dist/index.html       the built artifact — what actually gets published
SOURCE-OF-TRUTH.md    what this tool is for, and the lines not to cross
CHANGELOG.md          what changed in each version
.github/workflows/    the checks GitHub runs on every push
```

**The split is for reviewing, not for modules.** `build.js` pastes every file in
`src/app` into one shared function scope, in manifest order. A function defined
in one file is visible in all of them. There is no bundler, no imports, and no
build step beyond concatenation.

## Building and checking

```sh
node build.js                 # write dist/index.html from src/
node build.js --check         # verify dist/index.html matches src/ — exits 1 if not
node test/captions.test.js    # check the caption rules
node test/descript.test.js    # check the Descript pull, against a stand-in connector
```

No dependencies. Node is only used to copy text around and run the checks.

## Publishing

`dist/index.html` is the whole artifact: one self-contained file, no external
assets beyond Google Fonts. To publish, hand `dist/index.html` from `main` to
Claude and ask for it to be published to the existing Scriptorium artifact.

The page asks the Claude viewer for four things, and works without any one of
them (with that feature switched off):

| Capability | Used for |
|---|---|
| `sample` | the edit pass — the one thing that spends usage |
| `db` | saving the library (`books/<book>`, and under it `scripts/<script>` and `captions/<script>`) |
| `mcp` → Google Drive, a "create file" tool | building the Google Doc or folder of Docs |
| `mcp` → Descript: `list_folders`, `list_projects`, `export_transcript` | Pull from Descript. All three only read. |
| `downloads` | the HTML copy of the book, and the caption `.zip` |

The artifact must run on a runtime contract that lets a page save a `.zip`
(0.2.96 or newer). On the older contract it started on, the caption download
is refused.

There should be exactly one published Scriptorium artifact, shared with the
team, and its link belongs at the top of this file.

## Reverting

Every commit contains a complete, publishable `dist/index.html`. To go back to
any earlier version of the tool:

```sh
git log --oneline -- dist/index.html        # find the version you want
git show <commit>:dist/index.html > index.html
```

Then publish that file. Nothing needs to be rebuilt and nothing else needs to
be rolled back — the built file at any commit is a working Scriptorium.

## Versions

Version numbers start at 1.0.0, the first release meant for the whole team.
The page shows its version at the foot, and that number matches the git tag it
was published from. `git show v1.0.0:dist/index.html` gets you back to it.

| Tag | What it is |
|---|---|
| `v1.1.0` | Pull from Descript: transcripts and timed captions straight from the TTW Drive. Published 2026-11-18. |
| `v1.0.0` | The first team release: a shared library of books, caption files (`.srt`, `.vtt`), and this repository as the one source of truth. Published 2026-11-16. |
| `prototype-3` | The last prototype: mechanical fixes moved into free local code. |
| `prototype-1` | The first prototype, as first published. Still has the full-rewrite fallback. |

Prototype 2 (the cost-reduction pass) was never committed as a complete tree,
so it cannot be restored. What it changed is in `CHANGELOG.md`.

To release a new version: change `VERSION` in `src/app/01-state.js`, add a
section to `CHANGELOG.md`, run `node build.js`, commit, publish
`dist/index.html`, then tag that commit.

## Before changing anything

Read `SOURCE-OF-TRUTH.md`. It states what this tool is for and which behaviours
are not up for redesign. Changes to `src/app/09-prompts.js` change the editing
itself and deserve the most care.
