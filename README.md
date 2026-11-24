# The Scriptorium

**Through the Word's transcript editor for audio guide transcripts from Descript.**

It turns Descript's raw transcript of an audio guide into clean, publishable
text and searchable caption files, without changing what the speaker said. The
teacher's own written script stands beside it as a reference. It runs as a
Claude artifact: one web page, opened inside Claude.

> **This repository is the only copy of the Scriptorium.** The `main` branch
> is the tool. If something is not here, it is not part of the tool. See
> [One source of truth](#one-source-of-truth).

**Live tool:** [The Scriptorium](https://claude.ai/artifact/FraE4AkPkEJNUrsuoABCRp),
version 1.3.0. Version 1.4.0 is in this repository and not yet published. It opens for members of the Through the Word organization on
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

Cleaning one transcript by hand is a slow afternoon. A book like Job is 44 of them,
each 6,000–15,000 characters. The Scriptorium does the pass in one go, shows
exactly what it changed, and hands back text that can be pasted straight into
YouVersion, plus caption files that make every word of the guide searchable.

## Using it

Each audio guide moves through four stages, and each has one name:

| Stage | What it is |
|---|---|
| **Written script** | What the teacher wrote before recording. A reference. Never edited here. |
| **1st Draft Transcript** | What Descript heard, exactly as it arrived. |
| **Edited Transcript** | The 1st Draft after the edit pass and any corrections by hand. |
| **Final Transcript** | An Edited Transcript a person has reviewed and approved. |

"Script" on its own always means the written script.

0. **Pick a book, or start one.** The front page lists every book the team
   has. Each is its own workbench, shared with everyone: open one to pick up
   where anyone left off, or use **+ New Book**.
1. **Add the written scripts.** On the front page, **Written Scripts** holds
   what each teacher wrote before recording. Give one a title that starts
   with its book and chapter ("Luke 24 — Jones") and bring in its text: paste
   it, give the link to a Google Doc or Sheet, or choose a Word (.docx) or
   text file. This can be done at any time, before or after the edit pass.
   **Bring in many from Google Drive** takes the link to a Drive folder and
   brings in every file in it, each as its own written script, named for its
   file. It also takes the link to one Doc that holds a whole book: that Doc
   is cut at the headings that name a chapter ("Luke 24", or "Chapter 3" in a
   file named for its book). A file is read once and kept; bringing it in
   again renews the kept copy and keeps its title.
2. **Pull the audio guides from Descript.** Click **Pull from Descript**, open
   the book's folder in the TTW Drive, tick the audio guides you want, and
   pull them. Each gets a card with its 1st Draft Transcript and its timed
   captions. Nothing in Descript is changed. You can also paste a transcript
   into a card by hand. Then name the book and list the names the speaker
   uses that Descript is likely to mangle.
3. **Check the match.** Each card says which written script it is matched to,
   and how: by title, by wording, or both. **Change** picks another, or none.
4. **Run the edit pass.** Each transcript is corrected for punctuation,
   capitalization, run-on sentences, and misheard names — *without* changing
   the speaker's wording, meaning, tone, or intent. Stage cues and pause marks
   are stripped. Paragraph breaks that fall mid-thought are closed up. The
   written script is evidence for a fix (a misheard name, a question mark,
   where a sentence ends). The transcript is never changed to match it.
5. **Review what changed.** Every card shows a before/after table of misheard
   words, verse fixes, and grammar changes, plus any sentence that still does
   not make sense. Two lists need a person:
   - **Suggested but not applied.** The edit pass wanted a change that would
     alter the speaker's words. The page refused it; the transcript still
     reads as spoken. One that came from the written script says so.
   - **For the teacher.** A quotation that may match neither the NIV nor the
     ESV. It is left as spoken; raise it with the teacher if it matters.
   For a small fix of your own, click **Edit by hand**. Each change you save
   is listed under "Changed by hand".
6. **Check the scripture.** Every quoted verse is listed with the reference
   the speaker spoke aloud, the reference in the written script, and the
   reference the edit pass worked out. The page checks that one against the
   others and against the chapter the guide is on. Where they disagree it says
   why and lists the likelier references: click one to use it, or **Change**
   to type your own.
7. **Approve it.** When a guide has been reviewed, click **Approve as Final**.
   Changing it afterwards, by hand or by running the edit pass again, takes
   it back to an Edited Transcript until it is approved again.
8. **Copy or publish.** Copy a single transcript with its verses already bold
   and block-quoted, or build the book's Final Transcripts into Google Docs:
   one Doc with a tab for each guide, one Doc with each guide starting on its
   own page, or a folder with one Doc per guide. Only Final Transcripts go
   into a Google Doc. Tabs need the Google Docs connector as well as Google
   Drive; without it the page makes the one Doc with a page per guide and
   says so.
9. **Download caption files.** A guide pulled from Descript already has its
   timed captions. For one pasted by hand, open **Timed captions for search**
   and paste in the `.srt` file Descript exports for that audio guide (in
   Descript: Export › Subtitles › .srt). After the edit pass, download an
   `.srt` and a `.vtt`. Both carry the *corrected* words on Descript's own
   timings, so a search for "Uz" finds it even though Descript heard "us".
   **Download all caption files** at the bottom gives the whole book in one
   `.zip`: both kinds, `.srt` only, or `.vtt` only. The line above the button
   says how many guides have caption files ready. Caption files do not wait
   for approval.

### What a caption file is, and is not

- Every word of the corrected transcript appears once, in order.
- The timings are Descript's. The Scriptorium never moves or invents one.
- The `.srt` and the `.vtt` hold the same words and times; only the file format
  differs. Making them costs nothing — no call to Claude.
- Timings are per caption (a few seconds), not per word, because that is what
  Descript exports. A search lands on the caption a word is in.
- If the captions pasted in belong to a different guide, the tool says so and
  builds nothing.

### Known limits

- **Books are shared, not live.** Everyone sees the same books, but a book is
  read when you open it. If two people type in the same guide at the same
  time, the last save wins. Different guides in the same book are safe.
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
- **A written script is a kept copy.** It is read from Google Drive once. If
  the teacher changes the Doc afterwards, bring it in again to renew it.
- **A folder is listed one level deep**, up to 300 files at a time.
  Sub-folders are counted and left alone; paste a sub-folder's own link to
  bring in what it holds.
- **A Doc is cut only at headings.** A Doc that holds a whole book is cut
  where a heading (a Heading style in Google Docs) names a chapter. A Doc
  with no such headings comes in as one written script.
- **A book holds up to 1,000 guides**, a Descript folder lists up to 1,000
  projects, and the Written Scripts page lists up to 1,000 written scripts.
  Past that the page says so rather than showing part.
- **Caption files download as a `.zip`.** The Claude viewer does not allow a
  page to save `.srt` or `.vtt` directly.
- **A reference is checked, not looked up.** The edit pass works out each
  reference from what the model knows, and judges from memory whether a
  quotation matches the NIV or ESV. The page then checks the reference
  against the chapter the guide is on, what was said aloud, and the written
  script. It does not yet carry a Bible, so it cannot tell that a quotation's
  *words* belong to a different verse, and it does not check verse numbers
  against how long a chapter is. Treat "For the teacher" as a prompt to
  check, not a finding.
- **A reference with nothing said beside it is hard to check.** With no spoken
  reference and no written script, only the chapter's existence is checked.
- **A written script is matched, not understood.** The match is by the book
  and chapter in its title and by runs of words it shares with the
  transcript. A title with no book and chapter is matched by wording alone.
  The card shows the match so a person can correct it.
- **A guide edited before its written script was added is not re-edited.** Its
  card says so; **Redo this one** uses it. The reference checks apply either
  way.
- **Written scripts come in as text.** Paste, a Google Doc or Sheet link, a
  Word file (.docx) or a text file. For a PDF, Pages or an older .doc, open it
  and paste the text. Reading a Google Doc uses your own Google Drive
  connector in Claude.
- **The Google Drive read has not been run against the live connector.** It
  was built and tested against a stand-in. If a Doc link brings in nothing,
  paste the text and report it.
- **The wording guard is strict on purpose.** It allows known homophones, the
  same sound spelled differently, and names you list under Words to Search
  For. A real mishearing outside those can land under "Suggested but not
  applied". Make it with Edit by hand, or list the name and Redo. The same
  goes for a short name spelled without its "h" ("Ester" for Esther).
- **Spoken references are turned into digits by the edit pass**, except a
  number beside a reference colon, which the page fixes itself. "Verse one"
  can occasionally stay as words.

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
    02-helpers.js     escaping, relative times, the stages of a guide, stored per-viewer prefs
    03-text.js        locating and applying edits; verse quoting and layout
    04-render.js      all HTML rendering, plus focus-preserving repaints
    05-capabilities.js runtime capability lookup
    06-store.js       persistence — the shared library of books; per book, a document per guide and per guide's captions
    07-fields.js      reading form fields back out of the DOM
    08-actions.js     add, remove, collapse, copy, correct by hand, approve as Final
    09-prompts.js     THE EDITING INSTRUCTIONS — see SOURCE-OF-TRUTH.md
    10-edit-pipeline.js  the edit run: cues, capitals, the wording guard, joins, concurrency
    11-clear.js       clearing the workbench for the next book
    12-google-doc.js  building the Google Doc from Final Transcripts (tabs, pages, or a folder), with an HTML fallback (4.11)
    13-captions.js    timed captions: reading .srt/.vtt, building .srt, .vtt and .zip
    14-descript.js    pulling transcripts and captions from Descript (reading only)
    15-written-scripts.js  the written scripts: their page, matching to guides, reading .docx and Google Docs, bringing in many from Drive (4.9, 4.11)
    16-references.js  checking each scripture reference, and changing one by hand (4.10)
    17-events.js      event delegation, shortcuts, start-up — last in the manifest
test/
  captions.test.js         checks the caption rules (SOURCE-OF-TRUTH 4.7)
  descript.test.js         checks the Descript pull against a stand-in connector (4.8)
  edit-rules.test.js       checks the wording guard, references in digits, verse layout, and hand corrections (4.1, 4.2, 4.4, 6)
  written-scripts.test.js  checks written scripts, matching, the sign-off, and what reaches the Google Doc (4.9)
  google-export-import.test.js  checks the tabbed Google Doc, caption files by kind, and written scripts in bulk from Drive (4.11)
  references.test.js       checks the reference checks (4.10)
build.js              reassembles src/ into dist/index.html
dist/index.html       the built artifact — what actually gets published
SOURCE-OF-TRUTH.md    what this tool is for, and the lines not to cross
CHANGELOG.md          what changed in each version
.github/workflows/    the checks GitHub runs on every push
```

The store still keeps each guide under `books/<book>/scripts/<guide>`, the
name it had when the store was laid out. Renaming it would strand every saved
book.

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
node test/edit-rules.test.js  # check the wording guard, references in digits, verse layout, and hand corrections
node test/written-scripts.test.js  # check written scripts, matching, the sign-off, and the Google Doc
node test/references.test.js  # check the reference checks
node test/google-export-import.test.js  # check the tabbed Google Doc, caption files by kind, and the bulk import from Drive
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
| `db` | saving the library (`books/<book>`, and under it `scripts/<guide>` and `captions/<guide>`) and the written scripts (`written/<id>`, `writtenText/<id>`) |
| `mcp` → Google Drive, a "create file" tool | building the Google Doc or folder of Docs |
| `mcp` → Google Drive: `read_file_content` | bringing a written script in from a Google Doc or Sheet. It only reads. Added to the artifact's connector list in 1.3.0. |
| `mcp` → Google Drive: `search_files` | listing the files in a folder for **Bring in many from Google Drive**. It only reads. Needed from 1.4.0. |
| `mcp` → Google Docs: `update_doc` | adding a tab for each guide to the Doc the page has just made, and writing each transcript into its tab (4.11). Needed from 1.4.0. |
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
| `v1.3.0` | Written scripts as a reference, checked references, a sign-off for each guide, and thirteen fixes from a QA pass. Published 2026-11-23. |
| `v1.2.1` | Ten fixes from a review of 1.2.0, three of them in the wording guard. Published 2026-11-19. |
| `v1.2.0` | The page enforces the speaker's words (wording guard), notes for the teacher, references in digits, names from Descript, hand corrections. Published 2026-11-19. |
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
