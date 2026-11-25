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
version 1.6.1, published 2026-11-25. Version 1.7.0 is in this repository and not yet published. It opens for members of the Through the Word organization on
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
   **Add files from this computer** takes any number of files at once: Word
   (.docx), PDF, OpenDocument (.odt), rich text (.rtf) and plain text. Each
   becomes its own written script. Its title starts as the file's name and
   can be changed in the list before anything is saved. Files can also be
   dropped anywhere on the Written Scripts page.
2. **Pull the audio guides from Descript.** Click **Pull from Descript**, open
   the book's folder in the TTW Drive, tick the audio guides you want, and
   pull them. Each gets a card with its 1st Draft Transcript and its timed
   captions. Nothing in Descript is changed. You can also paste a transcript
   into a card by hand. Then name the book and list the names the speaker
   uses that Descript is likely to mangle.
3. **Check the match.** Each card says which written script it is matched to,
   and how: by title, by wording, or both. **Change** picks another, or none.
   A badge beside each guide's stage says the same at a glance, even when the
   card is folded: **Script used** (the edit pass compared the transcript with
   that written script), **Script not used yet** (one is matched, but the edit
   pass ran without it: **Redo this one** uses it), **Script ready** (matched,
   not edited yet), or **No script**. Rest the pointer on a badge for the
   detail. A line above the guides counts how many stand in each.
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
   **Download**, under it, saves the same Final Transcripts to your
   computer as a PDF or as a web page (`.html`), as one file for the whole
   book or one file for each guide in a `.zip`. The PDF is for reading,
   printing and sending. The web page opens in any browser, and in Word or
   Google Docs to keep editing. Neither needs Google Drive.
   **Send it all to one Google Drive folder**, at the very bottom, puts
   everything for the book in one place in one go. Tick the kinds wanted (the
   Google Doc, `.srt`, `.vtt`, PDF, web page), paste the link to a Drive
   folder or leave it empty to have one made, and click **Send to Google
   Drive**. The Google Doc, PDF and web page are made the way chosen in the
   sections above.
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

### The glossary

The Scriptorium learns from its own use, so the same mishearing is not put
right twice. It does not retrain anything: the page writes down what it
notices, a person approves what is worth keeping, and the approved terms are
handed to the edit pass with each later guide. None of it calls Claude.

- **What is written down.** When a guide is approved as a Final Transcript,
  the misheard words that were put right in it are recorded: by the edit
  pass, by hand, or by hand after the page had refused the change. A fix a
  person undid is recorded against the pair. When a written script is saved,
  the names in it are recorded too.
- **What a person does.** The **Glossary** page, beside Written Scripts on the
  front page, lists what is waiting with where it came from. Tick and
  **Approve**, or **Not a term**. A term turned down is not offered again.
  The list is in two parts. **Waiting for approval** holds words a guide
  showed being misheard: few, and the ones worth approving. **Names seen in
  written scripts** is folded away beneath it: many, with no sign Descript
  got them wrong, and optional. A term that is not approved has no effect at
  all, so leaving those alone costs nothing.
  A term can also be typed in, and the approved list can be copied out for
  Descript's own vocabulary list.
- **What an approved term does.** The edit pass is told the names from the
  same book of the Bible as the guide, and is told a known mishearing when
  its words appear in the transcript. The wording check accepts a fix to an
  approved name, and the row for that change says "known from the glossary".
- **What it never does.** The page does not replace a word because the
  glossary lists it. "Us" is nearly always "us". The edit pass decides in
  the sentence, as before (rule 4.12).

### What a caption file is, and is not

- Every word of the corrected transcript appears once, in order.
- The timings are Descript's. The Scriptorium never moves or invents one.
- The `.srt` and the `.vtt` hold the same words and times; only the file format
  differs. Making them costs nothing — no call to Claude.
- Timings are per caption (a few seconds), not per word, because that is what
  Descript exports. A search lands on the caption a word is in.
- If the captions pasted in belong to a different guide, the tool says so and
  builds nothing.

### How much it can hold

- **One saved item holds about 250 KB.** Each guide is one item, its timed
  captions another, each written script's text another. A guide keeps three
  copies of its transcript (the 1st Draft, the Edited Transcript, and the 1st
  Draft the edit was made from), so one guide can hold about 75,000
  characters of transcript. A typical guide is 6,000–15,000. The page
  measures in bytes before it saves, and says which item is too large and by
  how much, rather than leaving it to the store to refuse.
- **The whole store holds at most 25,000 items.** A chapter uses four (the
  guide, its captions, its written script and that script's listing), so the
  whole Bible, 1,321 guides with introductions and conclusions, is about
  5,350.
- **By size, the whole Bible is about 120 MB**, at roughly 93 KB a chapter.
  The store also has a limit on total size. Its figure is not published, so
  it is not known whether 120 MB fits. When the store is full the page says
  so, keeps the work on screen, and saves again once something is deleted.
- **Written scripts are listed past the first thousand**, a thousand at a
  read, up to 6,000.
- **The glossary adds one small item for each approved guide** (what it
  showed) and one for each term a person has ruled on. For the whole Bible
  that is about 1,300 and a few thousand, still well inside the 25,000.

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
- **A book holds up to 1,000 guides** and a Descript folder lists up to 1,000
  projects. Past that the page says so rather than showing part.
- **Caption files download as a `.zip`.** The Claude viewer does not allow a
  page to save `.srt` or `.vtt` directly.
- **Sending to a Drive folder always adds, never replaces.** The page may
  not change or delete a file already in Drive (rule 4.11), so sending a book
  twice leaves two copies of each file. Send to a fresh folder, or delete the
  old copies yourself.
- **A folder on your computer cannot be chosen.** A web page cannot pick
  where a download lands; your browser decides. Only a Google Drive folder
  can be named.
- **The Drive folder's link is remembered in your browser only**, for each
  book. A teammate pastes their own.
- **Files go to Drive one at a time.** A 40-guide book with both caption
  kinds is about 80 files, so allow a minute or two. Stop is safe: what was
  sent stays.
- **A PDF is drawn in Helvetica, on US Letter pages.** The page writes the
  PDF itself, with the fonts every PDF reader carries. Those cover English
  and Western European letters, curly quotes and dashes. A letter they lack
  (Hebrew, Greek, a letter with a macron) is drawn as its plain letter, or
  as "?" when it has none, and the message after the download says how many
  were. The web page keeps every character as written, so use it for a
  guide like that.
- **The PDF is plain on purpose.** The guide's name, its paragraphs, each
  quoted verse bold and set in with its reference, and a page number. No
  logo, no table of contents page. A PDF of a whole book carries an outline,
  so a reader can jump to a guide from the sidebar of a PDF viewer.
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
- **Written scripts come in as text.** Paste, a Google Doc or Sheet link, or
  a file: Word (.docx), PDF, OpenDocument (.odt), rich text (.rtf) or plain
  text. A Pages file or an older .doc cannot be read in the page: export it
  as Word or PDF first. Reading a Google Doc uses your own Google Drive
  connector in Claude.
- **A scanned PDF has no text to read.** It is a picture of each page. The
  file is named and nothing is guessed. Reading it would take a model call,
  which the tool does not spend on this (rule 4.6).
- **A PDF holds lines, not paragraphs.** Lines that follow closely are run
  together and a wider gap starts a new paragraph, so paragraph breaks can
  differ from the original. The words do not. Up to 400 pages are read.
- **Reading a PDF fetches a library the first time.** pdf.js 3.11.174 is
  loaded from cdnjs only when a PDF is chosen. If the viewer refuses it, the
  file is named with that reason and every other kind still works. PDFs in
  Google Drive do not need it.
- **One file is one written script.** A file from the computer is not cut at
  chapter headings. A Doc in Google Drive is.
- **The glossary proposes; it does not know.** The names found in a written
  script are words with a capital in the middle of a sentence, so the list
  waiting for approval will hold some that are not Bible terms. Turn those
  down once and they are not offered again.
- **A glossary name under four letters is told to the edit pass but does not
  loosen the wording check.** With "On" listed, "in" could otherwise become
  "on". Such a fix still goes through where the sounds match, or where that
  exact mishearing was approved.
- **The glossary is read when a book is opened and before an edit pass.** A
  term a teammate approves while you are mid-pass counts from the next read,
  at most a minute later.
- **An emoji in a Google Doc costs the end of its text.** Google Drive hands
  a Doc over with each emoji garbled and three characters missing from the
  very end for each one. Accents, dashes and quotation marks are fine. A
  written script is only a reference, so this matters little; if the last
  word matters, paste the text instead.
- **A tab's label is at most 50 characters**, which is Google's limit. A
  longer guide name is cut for the label; the heading inside the tab keeps
  it whole.
- **The Google connectors were run from the repository, not from the page.**
  On 2026-11-24 the page's own requests were sent to a real Doc and read
  back, and a folder was listed and a Doc read. The page on claude.ai has
  not yet made a tabbed Doc itself. If one comes out wrong, report it.
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
    15-written-scripts.js  the written scripts: their page, matching to guides, reading Word, PDF, OpenDocument, rich-text and Google files, bringing in many from Drive or the computer (4.9, 4.11)
    16-references.js  checking each scripture reference, and changing one by hand (4.10)
    18-glossary.js    the glossary: what each approved guide showed, what a person approved, and what the edit pass is given (4.12)
    19-export.js      downloading the Final Transcripts as a PDF or a web page; the PDF is written here, with no library
    20-drive-folder.js  sending the Google Doc, caption files, PDF and web page to one Drive folder the reader names (4.11)
    17-events.js      event delegation, shortcuts, start-up — last in the manifest
test/
  captions.test.js         checks the caption rules (SOURCE-OF-TRUTH 4.7)
  descript.test.js         checks the Descript pull against a stand-in connector (4.8)
  edit-rules.test.js       checks the wording guard, references in digits, verse layout, and hand corrections (4.1, 4.2, 4.4, 6)
  written-scripts.test.js  checks written scripts, matching, the sign-off, and what reaches the Google Doc (4.9)
  google-export-import.test.js  checks the tabbed Google Doc, caption files by kind, and written scripts in bulk from Drive (4.11)
  store-safety.test.js     loads the whole page against a stand-in store: stored data is shown as text and never run, saves go one at a time and in order, sizes are measured in bytes
  references.test.js       checks the reference checks (4.10)
  glossary.test.js         checks the glossary: nothing takes effect before a person approves it, and no word is swapped in by the page (4.12)
  many-files.test.js       checks each kind of file and bringing in many at once
  export.test.js           checks the PDF and web-page downloads: every word in order, and a well-formed PDF
  script-status.test.js    checks the badge and count that say whether a written script was used (4.9)
  drive-folder.test.js     checks sending a book's files to one Google Drive folder (4.11)
  whole-page.js            not a test: loads the whole page against a stand-in store, for the two files above
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
node test/store-safety.test.js  # check security, save order and storage limits, with the whole page loaded
node test/glossary.test.js    # check the glossary (4.12)
node test/many-files.test.js  # check each kind of file, and many at once
node test/export.test.js      # check the PDF and web-page downloads
node test/script-status.test.js  # check the written-script badge and count
node test/drive-folder.test.js   # check sending to one Google Drive folder
```

No dependencies. Node is only used to copy text around and run the checks.
The build also parses every script in the assembled page and refuses to
write one that does not parse: the tests load the modules' own text, so they
would not notice. The page itself fetches one library at run time, pdf.js,
and only when someone chooses a PDF.

## Publishing

`dist/index.html` is the whole artifact: one self-contained file, no external
assets beyond Google Fonts. To publish, hand `dist/index.html` from `main` to
Claude and ask for it to be published to the existing Scriptorium artifact.

The page asks the Claude viewer for four things, and works without any one of
them (with that feature switched off):

| Capability | Used for |
|---|---|
| `sample` | the edit pass — the one thing that spends usage |
| `db` | saving the library (`books/<book>`, and under it `scripts/<guide>` and `captions/<guide>`) the written scripts (`written/<id>`, `writtenText/<id>`), and the glossary (`glossary/<term>`, `learned/<book>_<guide>`) |
| `mcp` → Google Drive, a "create file" tool | building the Google Doc or folder of Docs |
| `mcp` → Google Drive: `read_file_content` | bringing a written script in from a Google Doc or Sheet. It only reads. Added to the artifact's connector list in 1.3.0. |
| `mcp` → Google Drive: `search_files` | listing the files in a folder for **Bring in many from Google Drive**. It only reads. Added to the artifact's connector list in 1.4.0. |
| `mcp` → Google Docs: `update_doc` | adding a tab for each guide to the Doc the page has just made, and writing each transcript into its tab (4.11). Added to the artifact's connector list in 1.4.0. |
| `mcp` → Descript: `list_folders`, `list_projects`, `export_transcript` | Pull from Descript. All three only read. |
| `downloads` | the Final Transcripts as a PDF, a web page or a `.zip` of either, and the caption `.zip` |

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
| `v1.6.1` | The Glossary's waiting list in two parts: misheard words to approve, and names from written scripts folded away. Published 2026-11-25. |
| `v1.6.0` | The Final Transcripts as a PDF or a web page, for the book or for each guide, and a badge on every guide saying whether a written script was used. Published 2026-11-25. |
| `v1.5.0` | A glossary that learns only what a person approves, written scripts from many files at once (Word, PDF, OpenDocument, rich text, plain text), and a build that refuses a page that does not parse. Published 2026-11-24. |
| `v1.4.0` | A tab for each guide in one Google Doc, caption files by kind, written scripts in bulk from Google Drive, and the fixes from a security, consistency and storage review. Published 2026-11-24. |
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
