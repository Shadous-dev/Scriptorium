# Changelog

## 1.7.0 — everything for a book into one Google Drive folder (2026-11-25)

`SOURCE-OF-TRUTH.md` was amended first, in its own commit: 4.11 now lets the tool add new files to a Drive folder the reader names. It still never edits, moves or deletes a file it did not just create. None of this calls Claude (4.6). The artifact's connector list does not change.

Not yet published.

- **Send it all to one Google Drive folder**, at the foot of a book. Tick the kinds wanted: the **Google Doc**, **.srt** captions, **.vtt** captions, **PDF**, **web page**. Paste the link to a Drive folder, or leave it empty and a folder is made for the book. One button sends everything there, with a progress line and a Stop.
- The Google Doc is made straight into the folder, in whichever way is chosen above (tabs, pages, or one Doc per guide). The PDF and web page follow the choice above too (one file or one per guide).
- Caption files and web pages are kept as files, not turned into Google Docs.
- The Google Doc, PDF and web page hold Final Transcripts only. Caption files do not wait for approval. The message afterwards says what went, what could not, and what was left out, with a link to the folder.
- One file that cannot be sent is named and the rest still go. A folder that takes nothing, or a Drive that is not connected or not allowed, stops at once with the fix.
- Every file is added as new. Sending twice leaves two copies; nothing is replaced.
- 224 checks across twelve test files. New: `drive-folder.test.js`.

## 1.6.1 — the Glossary's waiting list in two parts (2026-11-25)

Published 2026-11-25. No rule changes: this is how the list is shown, not what a term does.

- **Waiting for approval** now holds only words a guide showed being misheard. Its count is of those.
- **Names seen in written scripts** are folded away beneath it, with their own "select all". They were the bulk of the old list, and approving them is optional: a term that is not approved has no effect, and a guide with its written script attached already shows the edit pass those names. The same Approve and Not a term buttons work on them.
- A search that finds only names opens the folded list. Left open, it stays open while you work.
- 214 checks across eleven test files.

## 1.6.0 — the Final Transcripts as a PDF or a web page, and whether a written script was used, at a glance (2026-11-25)

`SOURCE-OF-TRUTH.md` was amended first, each time in its own commit. None of this calls Claude (4.6) or touches Google Drive. The artifact's connector list does not change.

Published 2026-11-25.

- **Download the Final Transcripts**, at the foot of a book: as a **PDF** or a **web page (.html)**, and as **one file for the whole book** or **one file for each guide** in a `.zip`. Only Final Transcripts go in. The message after a download says how many were saved and how many guides not yet approved were left out.
- **The PDF is written by the page itself**, with no library to fetch: the guide's name as a heading, its paragraphs, each quoted verse bold and set in with its reference, the guide's name and a page number at the foot. US Letter, Helvetica. A whole book's PDF starts each guide on a new page and carries an outline to jump by.
- **A letter Helvetica does not have** (Hebrew, Greek, a macron) is drawn as its plain letter, or as "?", and the message says how many were. The web page keeps every character.
- "Download a copy instead" is replaced by this. If Google Drive is not connected, **Create Google Doc** still falls back to saving a web page, as before.

Was a written script used? (4.9)
- **A badge on every guide's card**, beside its stage and visible when the card is folded: **Script used: <title>**, **Script not used yet** (one is matched, but the Edited Transcript was made without it, or with another: Redo uses it), **Script ready: <title>** (matched, and the edit pass has not run), or **No script**. Resting the pointer on it says the rest, including how the script was matched (by title, by wording, or chosen by hand), which is what tells you whether it is the right one.
- **A count for the book**, above the guides: how many were edited against a written script, how many are matched but not used yet, how many wait for the edit pass, and how many have none. With no written scripts in the library at all, it says that.
- Nothing is claimed until the library has been read: if the list of written scripts cannot be read, no card says "No script" on a guess.
- This changes nothing about what a written script may do. It only shows what happened.

Checked before publishing
- 213 checks across eleven test files. New: `script-status.test.js`, and `export.test.js`, which reads each PDF back: its own table of where everything is, every line drawn, and that the words match the transcript in order.
- The PDF opened in macOS's own viewer and was looked at: margins, wrapping, the bold verse, quotes, dashes and accents.
- In a browser, with made-up data: all four choices downloaded from the page, and the PDF read back with pdf.js (pages, outline, title, text).
- A guide's name or words cannot put drawing commands of their own into the PDF: the test strips the words out and checks every remaining command is one the page writes.

## 1.5.0 — a glossary that learns, and many written-script files at once (2026-11-24)

`SOURCE-OF-TRUTH.md` was amended first, in its own commit: rule 4.12 is new. None of this calls Claude, so none of it adds to what a guide costs (4.6). The artifact's connector list does not change.

Published 2026-11-24.

The glossary
- **The page writes down what it could learn from.** When a guide is approved as a Final Transcript, the misheard words put right in it are recorded: by the edit pass, by hand, and by hand after the page had refused the change. A fix a person undid is recorded against the pair. When a written script is saved, the names in it are recorded.
- **Nothing takes effect until a person approves it.** The new **Glossary** page lists what is waiting, with how it was heard, in how many guides and written scripts, and in which books. **Approve**, or **Not a term**; a term turned down is not offered again. A term can be typed in, a single mishearing can be taken out, and the approved list can be copied as plain text for Descript's own vocabulary list.
- **An approved term is told to the edit pass**, only with a guide it bears on: names from the same book of the Bible (forty at most), and a known mishearing only when its words are in that transcript. A guide neither bears on is sent the same prompt as before, to the character.
- **The wording check accepts an approved term**, and an approved pair outright. The row for the change says "known from the glossary".
- **The page never replaces a word because the glossary lists it.** The edit pass decides in the sentence, as before.
- Counts are added up from the record each time, never stored, so two people approving guides at the same moment cannot lose one. Each ruling is read again before it is changed.
- **Scan written scripts for terms** on the Glossary page catches up the written scripts saved before this version.

Written scripts
- **Add files from this computer**: any number of files in one go, by the button or by dropping them on the page. Each is read in the page and listed with an editable title, the book and chapter the title will match, and its size. A file already in the library is marked and left unticked; ticking it renews its text and keeps its place and title. One file that cannot be saved does not stop the rest.
- **New kinds of file**: PDF, OpenDocument (.odt) and rich text (.rtf), beside Word (.docx) and plain text. The single Add form reads them too.
- A scanned PDF, an older .doc and a Pages file are each named with what to do. Nothing is guessed.
- Reading a PDF uses pdf.js 3.11.174, fetched from cdnjs only when a PDF is first chosen. Its worker half runs inside the page, because the viewer does not let a page start a worker from another site.

Checked before publishing
- 197 checks across nine test files. New: `glossary.test.js` (4.12) and `many-files.test.js`.
- The Word, OpenDocument and rich-text readers were run on files written by macOS itself, and each gave the same words as the plain-text original. A hand-made PDF and one printed by macOS were read with the real pdf.js in a browser.
- In a browser, with made-up data: a guide approved, its terms approved on the Glossary page, and the next edit pass given the hint, the fix applied and its row marked.
- In a browser, the Word, PDF and other readers through the real file box and by dropping files on the page.
- **pdf.js under the live viewer's own rules.** A private test page that loads the same pinned library the same way, and reads a small PDF, was opened in the viewer by Noah on 2026-11-24 and passed.
- **Found by that browser run: the built page did not parse**, though every test passed. A module's first line is dropped by the build, and the new module's opening comment ran on to a second line. The tests load the modules' own text, so none of them saw it. `build.js` now parses every script in the assembled page, on a build and on `--check`, and refuses a module whose first line is not a one-line comment.

Not yet checked
- The edit pass with real glossary hints. The prompt is unchanged where the glossary does not bear on a guide; where it does, one or two short lines are added, and the first real guide edited that way is the check.

## 1.4.0 — a tab for each guide, caption files by kind, written scripts in bulk (2026-11-24)

`SOURCE-OF-TRUTH.md` was amended first, in its own commit: rule 4.11 is new. None of this calls Claude, so none of it adds to what a guide costs (4.6).

Published 2026-11-24. The artifact's connector list gained two entries with it: Google Drive `search_files`, and Google Docs `update_doc`. Each person is asked once to allow them.

Run against Google on 2026-11-24, before publishing: the requests the page builds for a three-guide book were sent through the Google Drive and Google Docs connectors to a new test Doc, and the Doc was read back. Three tabs, each named for its guide, each heading and each bold verse exactly where it was meant to be, with an emoji and accented letters in the text. A folder listing and a Doc read were run the same way. The page itself has not yet made a Doc from claude.ai; the first one made there is the last check.

Found by that run (each has a test)
- **Google's connector hands back the new tabs' ids one level further down than the page was reading.** Every book would have fallen back to a page for each guide and left an empty Doc behind. Both shapes are now read.
- **Google refuses a tab label over 50 characters**, and one refusal stops every tab in the request. Labels were cut at 100. They are now cut at 50, and never through the middle of a character.
- Reading a Google Doc that has an emoji in it garbles the emoji and drops three characters from the very end of the text for each one. This is in how Drive hands the text over, and is not fixed here; it is listed under Known limits.

Found in review, before publishing (each has a test that fails on the code as it was)

Security
- **A stored value could be run as markup.** A guide's status was written straight into the page. Anyone able to save to the Scriptorium could have stored a status that ran script in a teammate's page, with that teammate's access to Google Drive and Descript. This was in 1.3.0 as published. The status is now read against a fixed list and the page never builds a class from it.
- Everything else that comes from the store, a connector or the model was checked and is shown as text. An attribute now also escapes the single quote.
- A stored list holding the wrong kind of thing could stop a book opening for everyone. Lists are now read as flat rows, a document named like part of the page's own machinery ("constructor") is ignored, and one guide that cannot be drawn shows a notice in its place.
- Text padded with tens of thousands of spaces froze the page for a minute or more (bringing in a written script, saving a hand correction, laying out a transcript). Fixed.

Consistency
- **Two saves of one guide could arrive out of order**, leaving the store with the older words while the page showed the newer. Saves to one document now go one at a time, and of those waiting only the newest is sent. Closing the page still sends at once.
- A guide a teammate added is kept if it has anything in it. Before, one with a name but no transcript yet could drop out of the book.
- A book cannot be left while it is being cleared.
- Bringing in many from Drive re-reads the library first, so a teammate's import made since the page was opened is renewed, not doubled.

Storage
- Sizes are measured in bytes before saving. The limits were counted in characters, and a character can be up to four bytes. The message names the item and its size.
- More than 1,000 written scripts are now listed. A whole Bible is more than a thousand.
- A written script whose listing fails to save no longer leaves its text behind in storage.
- The store-is-full message says the work is still on screen and what to do.

Google Doc and written scripts
- Characters Google drops from text (control characters, the private-use range) are taken out before positions are counted. One of them would have put the bold on the wrong words.
- A very long guide name is cut for the tab's label only. The heading inside keeps it whole.
- A heading that quotes a verse ("John 3:16") no longer cuts a written script in two.

The Google Doc
- **One Doc, a tab for each guide** is new, and is the choice a reader starts with. Drive makes an empty Doc; the Google Docs connector adds a tab named for each guide and writes each Final Transcript into its own, with the guide's name as a heading and each quoted verse bold and set in.
- **One Doc, a page for each guide** is the old "one Doc for the whole book", with every guide after the first starting on a new page.
- **One Doc per guide, in a folder** is unchanged.
- If the Google Docs connector is not connected, or Google will not add tabs, the page makes the one Doc with a page per guide instead and says why. A tab that could not be written is counted and named.
- The page writes only into the Doc it has just made. It never reads, edits, moves or deletes a file already in Drive (4.11).

Caption files
- **Download all caption files** already gave a whole book's `.srt` and `.vtt` files in one `.zip`, on Descript's timings. It now has a choice beside it: both kinds, `.srt` only, or `.vtt` only.
- The section has its own heading at the bottom of the book, and says how many guides have caption files ready. The message after a download says how many guides were left out.

Written scripts
- **Bring in many from Google Drive**, on the Written Scripts page. Paste the link to a folder and every Doc, Sheet, Word file, PDF and text file directly inside it is listed. Tick the ones to bring in. Each is read once and kept as its own written script, named for its file.
- A Doc that holds several written scripts is cut into one for each, at the headings that name a place in the Bible: "Luke 24", or "Chapter 3" in a file named for its book. Only when two or more headings name different places, and never inside a file whose own name already says which chapter it is. Every word of the file is kept. The report says which files were cut.
- A written script now remembers the Drive file it came from. One already in the library is marked and left unticked; ticking it renews the kept text and keeps its place and its title.
- A file that cannot be read is named with the reason and the rest still come in. If Drive is not connected or not allowed, the run stops at once with the fix.
- Drive is only listed and read (4.11).

## 1.3.0 — written scripts, checked references, and a sign-off for each guide (2026-11-23)

Published before the edit instructions were run against a transcript whose correct result is already known, which `SOURCE-OF-TRUTH.md` section 8 asks for when `09-prompts.js` changes. The first real edit pass on a guide that has a written script is that check: look at what it changed, and at what it listed under "Suggested but not applied".

`SOURCE-OF-TRUTH.md` was amended first, in its own commits: rules 4.9 and 4.10 are new, and each stage of a guide now has one name.

The words
- **Written script**: what the teacher wrote before recording. **1st Draft Transcript**: what Descript heard. **Edited Transcript**: that, after the edit pass and any corrections by hand. **Final Transcript**: an Edited Transcript a person has approved.
- "Script" on its own now always means the written script. A card in a book is an **audio guide**, so the page says "+ Add Guide" and "Edit All Guides".

Written scripts (4.9)
- A **Written Scripts** page, reached from the front page. Add one with a title and its text: pasted in, from a Google Doc or Sheet link, or from a Word (.docx) or text file on the computer. Search by title, book or chapter. Read one, rename it, delete it.
- Each guide is matched to its written script by title ("Luke 24") and by wording, and its card says which one and how. A person can change the match or use none.
- The written script travels in the guide's one edit call, and only for a guide that has one. It is evidence for a change the wording rule already allows; the row says "supported by the written script".
- The transcript is never made to match it. Where the two differ in wording, the transcript stays as spoken and the difference is listed under "Suggested but not applied", naming the written script as its source.
- Written scripts belong to no book. Clearing or deleting a book never touches them.

References (4.10)
- Luke 24:1 came back as Luke 1:1 with nothing to catch it. Every reference is now checked by the page, for free: that the chapter exists; that it agrees with the chapter the guide is on and with what was said aloud ("verse one" in the guide on Luke 24 is Luke 24:1); and against the reference written beside the same quotation in the written script.
- When a check disagrees the reference is marked, the reason is given in a sentence, and the likelier references are listed. Click one to use it, or **Change** to type your own. Either way it is listed under "Changed by hand".
- Nothing replaces a reference on its own. A guide edited before this version is checked too.
- Not built yet: matching a quotation's wording against a Bible carried in the page.

The sign-off
- **Approve as Final** on each guide replaces the one tick for the whole book. Changing a Final Transcript by hand, running the edit pass again, or changing a reference takes it back to Edited.
- Approving a guide that still has a reference marked to check asks first.
- **Only Final Transcripts go into the Google Doc** and the downloaded copy. Copy for YouVersion and caption files work on an Edited Transcript too.
- A book approved under the old tick keeps that approval for the guides it covered.

Found in a QA pass of 1.2.1. Each has a test that fails on the old code, except the double edit, which is guarded in code and was checked by reading.
- **A floating `'"` after a verse.** When speech inside a verse closed just before the verse did, the closing marks were left at the head of the next paragraph and the verse lost its own. Every variation (`""`, `" "`, `".`) is now kept with the verse.
- **Numbers could be regrouped.** The wording guard read "John 3:16" and "John 31:6" as the same words. Where one number ends and the next begins is now part of what was said.
- **"th" counted as "t".** "then" → "ten", "three" → "tree" and "wrath" → "rat" were allowed as sound-alikes. "th" is now its own sound, and may stand in for "t" only inside a long name ("Timoty" / "Timothy").
- **A word in another alphabet could be deleted.** The guard only counted Latin letters.
- **Leaving a field saved the guide.** Clicking into a name or transcript box and out again wrote the whole guide back, which could put an older copy over a teammate's newer one. Nothing is saved now unless something changed.
- **Typing during the edit pass hid the change.** A transcript edited while its pass was running was marked up to date. It is now marked as changed since.
- **A capital stranded mid-sentence.** A paragraph start was capitalised before the edit pass, then left that way when the break before it was closed up ("the spices Went to the tomb").
- **Two verses with the same opening words.** The second was not set in bold.
- **Words in capitals were lowered.** "LORD" and "JESUS" became "Lord" and "Jesus". A word already in capitals is now left alone.
- **"about .5" lost its space**, and a lone "i" before a comma was not capitalised.
- **"Song of Songs" projects were not named.** A book of several words was never recognised in a Descript project name.
- **A guide could be edited twice at once**, by clicking "Redo this one" while it waited its turn in Edit All.
- **The Google Doc included empty and unedited cards.** It now takes Final Transcripts only.

## 1.2.1 — fixes from a review of 1.2.0 (2026-11-19)

Ten findings from a review of the whole source. Each now has a test that fails on the old code.

The wording guard had three holes
- **Small words could be swapped.** Any two words with no consonant sounds counted as a mishearing of each other, so "we" → "you" and "why" → "how" were applied.
- **Vowels were ignored.** "the Son of God" → "the sin of God" and "a good man" → "a God man" were applied.
- **Words in capitals and bare numbers could be deleted.** The exception for section labels allowed removing anything without a lowercase letter.

What counts as sounding the same is now narrower and written out in `10-edit-pipeline.js`: known homophones word for word; the same sound once spelling is folded ("Eli who" / "Elihu"); a long word whose consonants match and whose vowels differ slightly ("sabians" / "Sabeans"); or, roughly, a name listed under Words to Search For. A section label may be removed only if it stands alone on a line of the transcript, in capitals, with no sentence punctuation.

The cost of being stricter: a real mishearing that fits none of those is now a suggestion rather than a change. Listing the name under Words to Search For and redoing the script lets it through.

The other seven
- **Long books.** Scripts, captions and books were read without saying how many to return. Every read now asks for up to 1,000 outright, so a long book cannot come back partly loaded.
- **The reference fix overreached.** It allowed a space after the colon, so "verse 3: one thing stands out" became "verse 3: 1 thing". It now needs the number right against the colon.
- **Two versions of one chapter got the same name.** The later arrival now says which it is: "Isaiah – Chapter 24 (v2, KRIS UPDATE)".
- **Projects in no folder could not be pulled.** The top of the Drive now has a "Not in a folder" row.
- **Long Descript folders were cut off silently.** The page now reads up to 1,000 projects per folder and says so when there are more.
- **The library's order ignored real work.** Pulling, typing and hand corrections now count as working on a book, not only an edit pass.
- **The saved Google Doc link was not checked.** Only an ordinary `https` link is ever shown as a link.

## 1.2.0 — the speaker's words, enforced (2026-11-19)

From Jared's review of real edits. `SOURCE-OF-TRUTH.md` was amended first, in its own commit.

The wording guard (4.1, 4.2)
- The edit pass changed a teacher's "wine vinegar" to "sour wine" to match a verse. Until now the rule against that lived only in the instructions. Now the page checks every edit the editor proposes, word by word: it may change punctuation, capitals, spacing, hyphens, or how a number is written, or replace words with words that sound the same. Anything else is **not applied** and is listed under "Suggested but not applied".
- A change cannot hide inside a longer edit: each run of changed words is judged on its own.
- A sound-alike swap the editor did not label is still shown as a misheard word.
- The instructions say the same: a correction must sound like what was transcribed, and a quotation is never changed to match a verse.

For the teacher (4.2)
- TTW teachers quote the NIV and sometimes the ESV. A quotation that seems to match neither is reported under "For the teacher" and left exactly as spoken.

References in digits (6)
- A number spelled out beside a reference colon is fixed in code: `Isaiah thirty-five:1` becomes `Isaiah 35:1`.
- Elsewhere the edit pass is told to write references in digits and keep the spoken words "chapter" and "verse". Code does not guess here: "Peter three times denied him" is not a reference. The guard checks that only the notation changed.

Names from Descript (6)
- A pulled script is named from its project: `ED_Isaiah_24_Jones_v1_DS` becomes `Isaiah – Chapter 24`. A project that does not start with a Bible book keeps its name. The Descript project name is kept and shown under the captions.
- An untitled book takes the name of the folder pulled from.

Hand corrections (4.4, 4.5)
- **Edit by hand** on a corrected script. Each change saved is listed under "Changed by hand" and carries into the Google Doc, the copy for YouVersion and the caption files.
- Redoing or re-editing a script that has hand corrections asks first. A book cannot be left with an unsaved hand correction.

Credits
- Fixed instructions are now about 5,470 characters (≈1,370 tokens), up from about 4,790: three sentences and one answer field. Hand corrections, the guard, names and the colon fix are code and cost nothing.

Code
- New `test/edit-rules.test.js` — 13 checks. `test/descript.test.js` grew to 14.

Not done
- Stray quotation marks outside verses: waiting on an example.
- The archive, search and backup ideas: not started.

## 1.1.0 — Pull from Descript (2026-11-18)

Descript
- **Pull from Descript** brings audio guides straight into a book: browse the TTW Drive's folders, tick the projects, pull. Each becomes a script with its transcript (Descript's plain-text export) and its timed captions (Descript's `.srt` export). `SOURCE-OF-TRUTH.md` 4.8.
- Reading only. The page may call three Descript tools — `list_folders`, `list_projects`, `export_transcript` — and no others.
- No call to Claude, so pulling costs no usage.
- Paced to Descript's limit of ten exports a minute (two per audio guide), with one retry for a failure that waiting can fix. An access problem stops the run instead of failing every remaining guide.
- Pulling the same audio guide again updates its script rather than adding a second. Each guide is saved as it arrives.
- Audio guides are listed in number order (chapter 2 before chapter 10).
- Each kind of failure says what fixes it: connect Descript, reconnect it, allow it for the page, or wait.

Runtime
- The live artifact moves from runtime contract 0.2.35 to the newest. The older contract does not let a page save a `.zip`, so the caption download added in 1.0.0 was refused there.

Code
- New `src/app/14-descript.js`; `14-events.js` renamed `15-events.js` so start-up still runs last.
- New `test/descript.test.js` — 12 checks against a stand-in connector that answers in the shapes the real one was seen to use.

## 1.0.0 — the first team release (2026-11-16)

The first version meant for the whole team, and the point where version numbers start over. Everything before it is a prototype (below).

A shared library of books
- The front page lists every book the team has. Each book is its own workbench: opening, clearing or deleting one never touches another. Before this there was a single workbench, and Clear All emptied it for everyone.
- Storage moved to `books/<book>`, `books/<book>/scripts/<script>` and `books/<book>/captions/<script>`.
- Work saved by the prototypes (`state/meta`, `scripts/<id>`, `captions/<id>`) is copied into a first book the first time 1.0 loads. The originals are left in place.
- New scripts get an id two people cannot both mint, so teammates adding a script to the same book at the same moment do not overwrite each other.
- A save that comes due after you have moved to another book is dropped rather than written into the wrong one. You cannot leave a book while its edit pass is running.
- The page shows its version at the foot.

Captions
- Each script can hold the timed captions Descript exports (`.srt`; `.vtt` is read too). After the edit pass the tool builds an `.srt` and a `.vtt` that carry the corrected script on Descript's timings. `SOURCE-OF-TRUTH.md` 4.7.
- Built in code, free: no call to Claude. Words are lined up with a standard diff; a corrected word takes the caption of the words it replaced. Timings are copied, never computed.
- Captions that belong to a different script are refused (under 70% of words lining up) rather than forced to fit.
- Downloads are a `.zip` holding both formats — per script, or the whole book — because the Claude viewer does not let a page save `.srt` or `.vtt` directly.
- Captions are saved beside each script, in a document of their own, so a script's own document stays well under the store's size cap. Removing a script or Clear All removes its captions.

Source of truth
- `SOURCE-OF-TRUTH.md` amended first, in its own commits: reading from Descript, caption files and the shared library are in scope; rules 4.7 and 4.8 added.
- The live artifact was carrying a redesign that was never committed: the page published on 2026-11-13 had the same code as prototype 3 but a different stylesheet and fonts (IBM Plex Sans, a neutral palette, a teal accent for scripture). That design is now `src/styles.css`, with the caption and library styles written to match it, so publishing from the repo no longer undoes it.
- The repository is now a real working tree. The two archives, `files/`, and the loose module copies at the root are gone; the two prototypes that could be recovered are git tags (`prototype-1`, `prototype-3`) instead.
- `.gitattributes` keeps every text file LF so `node build.js --check` compares the same bytes on every machine.
- GitHub runs `node build.js --check` and the caption tests on every push.

Code
- New `src/app/13-captions.js`; `13-events.js` renamed `14-events.js` so start-up still runs last.
- New `test/captions.test.js` — 19 checks, no dependencies.

Not done yet
- Pulling transcripts and captions from Descript. In scope, not built: the Descript connector's tool names and arguments are not published, and the artifact runtime forbids guessing them.
- Seeing a teammate's changes live. A book is read when you open it; two people typing in the same script at once means the last save wins.

---

# Before 1.0 — prototypes

## Prototype 3 — local mechanics pass (2026-11-13)

Credits
- Mechanical fixes now happen in code, free, BEFORE the text is sent: spacing before/after punctuation, curly→straight quotes, `...`→`…`, `--`→`—`, sentence-start capitals, "I", God / Lord / Holy Spirit, 25 names that are never ordinary words, Bible books before a chapter number (`job 2:4` → `Job 2:4`, but `his job` stays), and every name in Words to Search For. Claude sees cleaner text, so it returns fewer edits (fewer output tokens) and its `find` strings match more often.
- Prompt dropped the sentence-capitalization and quote-mark lines. Fixed overhead ≈ 4,790 chars (≈1,200 tokens); was 7,037 (≈1,760) in prototype 1.
- A paragraph that just stops gets its period locally — after joins, so a mid-thought break is closed up rather than ended.

Code
- One `MECH` table of regex rules replaces scattered string handling; `stripCues` folded into `mechanics`. All patterns compiled once.
- Every local change is still a visible row (grouped where there are many).

Not done, on purpose
- Run-ons and comma splices stay with the model. Deciding where a sentence breaks is a judgment about meaning, and code guessing at it would violate SSOT 4.1.

## Prototype 2 — cost-reduction pass (2026-11-05)

Credits
- Fixed prompt overhead cut from ~7,040 chars (≈1,760 tokens) to ~5,040 (≈1,260) per script, every rule kept. Removed the instruction to strip `[cues]` and `_` marks — the page already does that before sending.
- Verses now return as two short anchors (`startsWith` / `endsWith`) instead of the whole quotation; the page finds the span in the corrected text. Saves ~30–40 output tokens per verse.
- Grammar edits no longer carry `"kind"` or `"note"` (both defaulted locally anyway). Only misheard and verse-fix edits do.
- **Removed the full-rewrite fallback** (`buildFullPrompt` / `runFullEdit`). It cost a whole script's worth of output and showed no edit table. Unplaceable edits now stay listed under "check by hand" and the summary says how many; `Redo` is the user's choice. An unreadable answer gets exactly one retry on the same route.

Code
- `stripCues` runs once per script, not twice; `cueEdits` and `textForEdit` folded in. `finishSection` inlined.
- `isUncertain(v)` replaces six copies of `v.confidence === 'low' || !v.canonical`.
- `layoutBlocks` computed once per card instead of twice; `verseSpan` handles both anchor-style and legacy whole-quote verses.
- `wrapDoc` replaces three near-identical document wrappers.
- Change tables show the "Why" column only when a row has a note.

Unchanged on purpose
- `modelTier: 'quick'` — already the cheapest tier.
- Concurrency, saving, Google Doc build, copy-for-YouVersion, all rules in the prompt.

Flagged, not changed
- `fixCapitals` also capitalizes sentence starts inside a quoted verse. SSOT 4.2 says verse capitalization is untouched; in practice Descript lowercases what the Bible capitalizes, so this restores rather than changes. Left as is — raise it if you'd rather it skip verse spans.

## Prototype 1 — snapshot (2026-11-03 artifact)

The tool exactly as published, split into `src/` for review. Rebuilds byte-identical.
