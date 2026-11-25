# Single Source of Truth — The Scriptorium

This document exists so the tool does not stray from its purpose. When a
proposed change and this document disagree, this document wins, or this
document gets changed first and deliberately.

---

## 1. Purpose

> **TTW transcript editor for TTW. For active transcripts from Descript.**
>
> Observes, edits, and corrects any grammatical or capitalization errors.
> Resets and prepares format to be ready for third-party platforms.
> Analyzes and fact-checks Bible and research info from the source for
> legitimacy.

One sentence version: **the Scriptorium turns a raw Descript transcript of a
Through the Word audio guide into clean, publishable text — without changing
what the speaker said.**

### The words this document uses

Each audio guide moves through these stages, and each has one name.

| Name | What it is |
|---|---|
| **Audio guide** (guide) | One recording: an intro, a chapter, a conclusion. Each has its own card in a book. |
| **Written script** | What the teacher wrote before recording. A reference. The tool never edits it (4.9). |
| **1st Draft Transcript** | What Descript heard, exactly as it arrived. |
| **Edited Transcript** | The 1st Draft after the edit pass and any corrections by hand. Not yet signed off. |
| **Final Transcript** | An Edited Transcript that a person has reviewed and approved. |

The **glossary** is the team's shared list of Bible names and terms, each with
the ways Descript has misheard it. It holds only what a person has approved
(4.12).

"Script" on its own always means the written script. "The corrected
transcript" means the Edited or Final Transcript, whichever the guide has
reached. Changing a Final Transcript, by hand or by running the edit pass
again, makes it an Edited Transcript until it is approved again: the approval
is of that text, not of the guide. A reference is part of that text. And while
a guide's 1st Draft has changed since it was edited, its transcript does not
count as Final: what was approved is no longer what Descript has.

## 2. What it is for

- Through the Word audio guides, book by book or plan by plan.
- The whole team at once: a shared library of books, each one its own
  workbench, so work on one book never disturbs another.
- A set of guides at a time: an intro, each chapter, a conclusion. Roughly
  6,000–15,000 characters each.
- Output that goes straight into YouVersion for an audience to read, with as
  little hand-editing afterward as possible.
- Collecting a book's Final Transcripts into Google Docs, each guide named to
  match: one Doc with a tab for each guide, one Doc with each guide starting
  on its own page, or a folder with one Doc per guide. Only a Final Transcript
  goes in. Copying a transcript out and building its caption files do not
  wait for approval.
- Downloading a book's Final Transcripts as files: a PDF or a web page
  (`.html`), as one file for the whole book or one file for each guide. Only
  a Final Transcript goes in, laid out as section 6 describes. The files are
  made by the page: nothing here calls Claude (4.6) or touches Google Drive.
- Timed caption files (`.srt` and `.vtt`) for each audio guide: the corrected
  transcript carried on Descript's own timings, so every word of every guide can
  be found by search. A whole book's caption files come down in one download,
  as `.srt`, as `.vtt`, or as both.
- Reading a guide's transcript and timed captions from the TTW Drive in
  Descript, so nobody has to export and paste them by hand.
- Small corrections by hand to an Edited Transcript, for what the edit pass
  missed. Each one is recorded like any other change (4.4).
- Keeping the teachers' written scripts in a library of their own, as a
  permanent reference for checking that what was corrected is accurate and
  is what the teacher meant (4.9). Many can be brought in at once from Google
  Drive: every file in a folder, or one Doc that holds several written
  scripts, each becoming a written script of its own. Many can be brought in
  at once from the computer too: any number of Word, PDF, OpenDocument,
  rich-text and plain-text files, each read in the page and kept under its
  own title.
- Learning from its own use, so the same problem is not fixed twice. When a
  guide is approved as a Final Transcript, the misheard words that were put
  right in it are written down. So are the names in each written script. A
  person approves what is worth keeping, and the approved terms become the
  glossary every later guide is edited with (4.12).
- Checking every scripture reference against the Bible, and suggesting the
  likelier ones when a reference looks wrong (4.10).
- A sign-off for each guide: a person reviews the Edited Transcript and
  approves it as the Final Transcript.

## 3. What it is not for

- Writing, rewriting, improving, shortening, or summarising the speaker's
  content.
- Generating scripts, devotionals, or ad copy from scratch.
- Being a general-purpose transcript cleaner for anyone's audio.
- Being a Bible study tool, a commentary, or a translation comparison.
- Replacing the review step. Every change is shown so a human can check it.

If a proposed feature only makes sense for one of the above, it does not
belong here.

## 4. The rules that must not be broken

These are the reason the tool is trusted. A change that weakens any of them is
a defect, however useful it looks.

**4.1 The speaker's words are not ours to change.**
Grammar and punctuation are fixed *around* the wording. Word choice, meaning,
tone, intent, and word order stay as spoken. Deliberate fragments stay
fragments. Casual voice stays casual. Nothing is merged, completed, polished,
or made more formal.

The page enforces this itself and does not rely on the edit pass behaving. A
change the edit pass proposes is applied only if it alters punctuation,
capitals, spacing, hyphens, or the way a number is written, or if it replaces
words with words that sound the same. Anything else would change what the
speaker said: it is listed as a suggestion, and the transcript is left as spoken.

**4.2 A quoted verse is corrected only where it was misheard.**
Inside a Bible quotation, the only permitted change is a word Descript got
wrong by sound — "the land of us" to "the land of Uz", "the sabians" to "the
Sabeans". Wording, word order, capitalization, and punctuation inside a verse
are left exactly as they are, including punctuation that looks wrong. Bible
translations read oddly on purpose.

A different word that means the same thing is not a mishearing. A teacher who
said "wine vinegar" is not corrected to "sour wine" because another
translation reads that way. TTW teachers quote the NIV and sometimes the ESV,
and the two differ. Where a quotation seems to match neither, the tool does
not correct it: it flags it for the teacher and changes nothing. The purpose
is what the teacher said, exactly, not what the verse says.

**4.3 Nothing is invented.**
The tool reports what it found and what it could not resolve. A reference it
is not sure of is flagged `low` confidence rather than guessed at
confidently. A sentence that still does not make sense is flagged, not
smoothed over.

**4.4 Every change is visible.**
Misheard words, verse fixes, and grammar changes are shown as before/after
rows. A change the reviewer cannot see is a change they cannot catch.

**4.5 The edit must be re-runnable and reversible.**
Editing a guide again must be safe. Previous work is never silently thrown
away, and an interrupted run costs at most the guides in flight.

**4.6 Nothing is paid for twice.**
The only thing in this tool that spends usage is the edit call. One guide is
one call. The page never asks Claude to do what it can do itself (stripping
stage cues, capitalizing sentence starts, finding a verse in the text), never
asks for text it already has (a verse is returned as two short anchors, not
re-typed), and never makes a second call for a guide except a single retry
when the answer could not be read. A guide's written script, when it has one,
travels in that same one call: only the written script matched to that guide
is sent, never the library. A full-rewrite fallback is not allowed: it
costs a whole transcript's worth of output and hides the edit table.

**4.7 A caption file is the corrected transcript on Descript's timings, and
nothing else.**
Every word of the corrected transcript appears in the caption file once, in
order. Timings are Descript's and are never moved, stretched, or invented:
code decides only which timed caption each word belongs to. Building captions
and converting `.srt` to `.vtt` is done in code and costs nothing (4.6). If
the timed captions do not match the transcript, the tool says so and builds
nothing rather than guessing.

**4.8 Descript is read, never written.**
The tool may list projects and read transcripts and captions from Descript.
It never edits, imports into, publishes from, or deletes anything in Descript.

**4.9 The written script is a witness, not the master.**
A teacher's written script is kept as a reference for the guide it belongs
to. The teacher did not read it out word for word, so the transcript is never
made to match it.

The written script may:

- support a change that 4.1 already allows: a misheard word, a question mark
  where a question was meant, a comma, where a sentence ends, quotation marks;
- show that a verse was quoted as the teacher intended, or raise it for the
  teacher when it was not (4.2);
- give the reference the teacher wrote down (4.10).

It may not put a word into the transcript, take one out, or change their
order. Where the written script and the transcript differ in a way 4.1 does
not allow, the transcript stays as spoken, and the difference is listed as a
suggestion that names the written script as its source. Inside a quoted verse,
4.2 stands unchanged.

The tool never edits a written script. Written scripts are shared with the
whole team and are not removed when a book is cleared or deleted. A guide is
matched to its written script by title and wording; the page shows the match,
and a person can change or remove it. A change the written script supported
says so in its row (4.4).

Whether a transcript was compared with a written script, and with which one,
is never left to be assumed. Every guide's card says so at a glance, open or
folded: the written script the edit pass used, one that is matched but that
the edit pass has not used yet, or none at all. The book says how many of its
guides stand in each of the three.

**4.10 A reference is checked, and never silently changed.**
The edit pass works out each reference from memory, and it can be wrong: Luke
24:1 has come back as Luke 1:1. The page checks every reference itself, at no
cost (4.6):

- that the chapter exists (and the verse, once the page carries a Bible);
- that it agrees with the guide's own chapter and with the reference as
  spoken;
- against the reference written beside the same quotation in the written
  script, when there is one.

When a check disagrees, the reference is marked to check and the likelier
references are listed beside it. A person chooses: the page does not replace
a reference on its own, and a reference a person has set is not
second-guessed.

A fourth check is in scope and not yet built: finding the verses whose
wording is closest to the quotation, in a public-domain translation carried
in the page. The NIV and the ESV are under copyright and will not be carried,
so that check will find where a quotation comes from. It will not confirm NIV
or ESV wording.

**4.11 Google Drive is read for written scripts, and written only to make new
Docs.**
The tool may list a folder and read a file in Google Drive to bring in a
written script. It may create a new Doc or folder, and write into a Doc it
has created in that same run. It never edits, moves, renames, shares or
deletes a file it did not just create. A written script is read once and
kept in the library; bringing the same file in again replaces the kept copy.
None of this calls Claude, so none of it costs anything (4.6).

**4.12 The glossary holds only what a person approved, and never changes a
transcript by itself.**
The tool writes down what it could learn from: a misheard word put right in a
guide that a person then approved, a word a person corrected by hand, and the
names in a written script. That record is evidence, not the glossary. Nothing
in it has any effect until a person approves it on the Glossary page, and a
term a person turns down is not proposed again.

An approved term does two things and no more:

- it is one of the names the edit pass is told may have been misheard, sent
  only with a guide it bears on (4.6);
- it counts as a listed name for 4.1, and an approved pair (what was heard,
  and the term it stood for) counts as words that sound the same. This is the
  one place the test in 4.1 is widened, and only by a person's ruling.

The page never replaces a word because the glossary lists it. "Us" is nearly
always "us". Whether a word in this sentence is the misheard one is a matter
of meaning, so it stays with the edit pass (section 5), and every such change
is a row that says the glossary supported it (4.4). Inside a quoted verse 4.2
stands unchanged.

A fix a person undid is written down against the pair, not for it. The
glossary is shared with the whole team and is not removed when a book is
cleared or deleted. Writing down, adding up and approving are all done by the
page: none of it calls Claude (4.6).

## 5. The editing instructions

The editing behaviour lives in `src/app/09-prompts.js`. It is the heart of the
tool. The instructions cover, in this order of priority:

1. **Grammar and punctuation** — the main job. Question marks on rhetorical
   questions. Commas for direct address, introductory phrases, interrupting
   phrases, and lists with the serial comma. Hyphenated compound modifiers.
   Flawless capitalization, including every sentence that starts lowercase
   after a pause. Run-on sentences broken up using punctuation only, never new
   words. Dashes only where they do grammatical work. Delivery cues such as
   `[HOOK]`, stray pause marks, and standalone section labels removed.
2. **Misheard names and terms** — matched against the list of names the
   speaker actually uses, plus anything where the sentence only makes sense
   with a different word. The list is the book's own Words to Search For and
   the approved glossary terms that bear on this guide: those from the same
   book of the Bible, and any whose known mishearing appears in this
   transcript (4.12).
3. **Scripture** — each quotation identified, the spoken reference captured as
   spoken, the canonical reference worked out and confidence-rated, and only
   misheard words corrected inside the quote.
4. **Flagging** — anything that still does not make sense, with a best guess
   at what is wrong.
5. **For the teacher** — a quotation that seems to match neither the NIV nor
   the ESV. Reported, never corrected (4.2).
6. **The written script** — when the guide has one, it is given as a
   reference: evidence for a mishearing, for a question mark, and for where a
   sentence or a quotation ends. Never a text to copy (4.9).

The page does the mechanical work locally, before the text is sent, so the
prompt never has to ask for it and the answer never has to carry it:
stage cues and pause marks are stripped; spacing, quote marks, ellipses and
dashes are made regular; sentence starts, "I", God, the Lord, the Holy Spirit,
names that are never ordinary words, Bible books before a chapter number, and
the user's listed names are capitalized. After the answer comes back, joins
are applied, sentence starts are re-checked, a paragraph that just stops gets
its period, each verse is located from the short anchors Claude returns, and
each reference is checked (4.10). Every local change is a row in the change
table.

The line between local and model is judgment: anything with one right answer
(a space, a capital on "Jesus") is code; anything that depends on meaning
(where a run-on breaks, whether a comma is a splice, which word was misheard,
where a verse starts) is the model. Code never guesses at structure.

Changing this file changes what the tool produces. Treat it as the highest-risk
change in the repository: make one adjustment at a time, run it against a
transcript with a known-good result, and keep the old version reachable.

## 6. The output format

This is the published format, taken from the Luke 1 model:

- Each quoted verse sits in its own paragraph.
- In quotation marks, **bold**, and block-quoted.
- Followed by its canonical reference in parentheses — `(Luke 1:5-7)`.
- Verses are quoted whole, including narration that is part of the verse
  itself.
- Speech inside a verse uses single quotation marks.
- Paragraph breaks that Descript put mid-thought are joined.
- Verse wording is untouched apart from misheard words.
- A Bible reference is written in digits — `Isaiah 35:1`, `chapter 12`,
  `verse 3` — never in number words or a mix such as `Isaiah thirty-five:1`.
  The words "chapter" and "verse" stay where they were spoken. This changes
  how a number is written, not what was said. Other numbers stay as spoken.
- A guide pulled from Descript is named from its project:
  `ED_Isaiah_24_Jones_v1_DS` becomes `Isaiah – Chapter 24`. A project name
  that does not start with a Bible book is kept exactly as it is.

The point of the bolding is so it is obvious at a glance where scripture is
used. That is a review feature as much as a publishing one.

Caption files are the exception to all of the above, because they follow the
audio rather than the page:

- Plain text only: no bold, no block quotes, no added references. A caption
  holds what was said, and the reference in parentheses was not said.
- One caption per Descript caption, with Descript's start and end times.
- A caption left with no words (a stage cue, for example) is dropped.
- `.srt` and `.vtt` carry identical text and timings; only the file format
  differs.

## 7. Scope boundaries

Things that are deliberately *not* in the tool, and why:

| Not here | Why |
|---|---|
| Automatic publishing to YouVersion | The human copy-paste step is the last review gate. |
| Editing without showing changes | See 4.4. |
| Rewriting or improving prose | See 4.1 — that is a different tool. |
| Audio processing, transcription, or re-timing | Descript does the listening and the timing. The tool works on Descript's text and Descript's timings (4.7). |
| Writing to Descript | See 4.8. Reading is in scope; changing a project is not. |
| Changing a file already in Google Drive | See 4.11. The tool reads what it is pointed at and writes only into a Doc it has just made. |
| Word-by-word timings | Descript's captions are timed per caption, not per word. The tool does not estimate timings it was not given (4.7). |
| Metadata, summaries, plan ads | Those live in the per-book metadata Google Doc, not here. |
| Making a transcript match the written script | See 4.9. The teacher did not read it out word for word. |
| Editing or correcting a written script | It is the teacher's reference, kept as written (4.9). |
| NIV or ESV text carried in the page | Both are under copyright. Only a public-domain translation may be carried (4.10). |
| Replacing a reference automatically | See 4.10. The page suggests; a person chooses. |
| Replacing a word because the glossary lists it | See 4.12. The glossary informs the edit pass and the wording check. It is never a find-and-replace. |
| A glossary that fills itself | See 4.12. What the tool notices is only proposed. A person approves each term. |
| Letters outside the standard fonts in a PDF | A PDF made here is drawn with the fonts every PDF reader carries, which cover English and Western European letters. A letter they lack (Hebrew, Greek, a letter with a macron) is drawn as its plain letter, or as "?" when it has none, and the page says how many were. The web-page download keeps every character as written, so it is the one to use for such a guide (4.1). |
| Reading a scanned PDF, or an old `.doc` or Pages file | A picture of a page has no text to read without a model call (4.6), and the other two cannot be read reliably in the page. The file is named and the reader is told what to do. |
| A second "full rewrite" call when edits don't place | See 4.6. Unplaced edits are shown for a hand check instead; Redo is the user's call. |
| Instructions for things the page does locally | Every character of the prompt is paid for on every guide. |

## 8. Before you change anything

- [ ] Does this serve the purpose in section 1?
- [ ] Does it break any rule in section 4?
- [ ] Does it fall on the wrong side of section 7?
- [ ] Does it let the written script change the speaker's words (4.9)?
- [ ] Does it let the glossary change a word without the edit pass, or let
      anything into the glossary that a person did not approve (4.12)?
- [ ] If it touches `09-prompts.js`, has it been run against a transcript whose
      correct output is already known?
- [ ] Does it add tokens to every call? If so, is each one earning its place
      (section 4.6)?
- [ ] Does `node build.js --check` pass, with `src/` and `dist/` committed
      together?
- [ ] Is the previous `dist/index.html` still reachable in git history, so the
      change can be reverted by publishing an earlier commit?

## 9. Changing this document

This document is allowed to change — the tool is expected to grow, and more
books are coming after Job. But it changes on purpose, in its own commit, with
the reason written in the commit message. It does not get quietly edited to
match a change that was already made.
