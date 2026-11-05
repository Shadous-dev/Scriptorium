# Single Source of Truth — The Scriptorium

This document exists so the tool does not stray from its purpose. When a
proposed change and this document disagree, this document wins, or this
document gets changed first and deliberately.

---

## 1. Purpose

> **TTW transcript editor for TTW. For active scripts from Descript.**
>
> Observes, edits, and corrects any grammatical or capitalization errors.
> Resets and prepares format to be ready for third-party platforms.
> Analyzes and fact-checks Bible and research info from the source for
> legitimacy.

One sentence version: **the Scriptorium turns a raw Descript transcript of a
Through the Word audio guide into clean, publishable text — without changing
what the speaker said.**

## 2. What it is for

- Through the Word audio guide scripts, book by book or plan by plan.
- A set of scripts at a time: an intro, each chapter, a conclusion. Roughly
  6,000–15,000 characters each.
- Output that goes straight into YouVersion for an audience to read, with as
  little hand-editing afterward as possible.
- Collecting a finished book into one Google Doc, one section per script,
  named to match.

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

**4.2 A quoted verse is corrected only where it was misheard.**
Inside a Bible quotation, the only permitted change is a word Descript got
wrong by sound — "the land of us" to "the land of Uz", "the sabians" to "the
Sabeans". Wording, word order, capitalization, and punctuation inside a verse
are left exactly as they are, including punctuation that looks wrong. Bible
translations read oddly on purpose.

**4.3 Nothing is invented.**
The tool reports what it found and what it could not resolve. A reference it
is not sure of is flagged `low` confidence rather than guessed at
confidently. A sentence that still does not make sense is flagged, not
smoothed over.

**4.4 Every change is visible.**
Misheard words, verse fixes, and grammar changes are shown as before/after
rows. A change the reviewer cannot see is a change they cannot catch.

**4.5 The edit must be re-runnable and reversible.**
Editing a script again must be safe. Previous work is never silently thrown
away, and an interrupted run costs at most the scripts in flight.

**4.6 Nothing is paid for twice.**
The only thing in this tool that spends usage is the edit call. One script is
one call. The page never asks Claude to do what it can do itself (stripping
stage cues, capitalizing sentence starts, finding a verse in the text), never
asks for text it already has (a verse is returned as two short anchors, not
re-typed), and never makes a second call for a script except a single retry
when the answer could not be read. A full-rewrite fallback is not allowed: it
costs a whole script's worth of output and hides the edit table.

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
   with a different word.
3. **Scripture** — each quotation identified, the spoken reference captured as
   spoken, the canonical reference worked out and confidence-rated, and only
   misheard words corrected inside the quote.
4. **Flagging** — anything that still does not make sense, with a best guess
   at what is wrong.

The page does three things locally so the prompt never has to ask for them:
stage cues and pause marks are stripped before the text is sent, sentence
starts are capitalized as a safety net after the answer comes back, and each
verse is located in the corrected text from the short anchors Claude returns.

Changing this file changes what the tool produces. Treat it as the highest-risk
change in the repository: make one adjustment at a time, run it against a
script with a known-good result, and keep the old version reachable.

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

The point of the bolding is so it is obvious at a glance where scripture is
used. That is a review feature as much as a publishing one.

## 7. Scope boundaries

Things that are deliberately *not* in the tool, and why:

| Not here | Why |
|---|---|
| Automatic publishing to YouVersion | The human copy-paste step is the last review gate. |
| Editing without showing changes | See 4.4. |
| Rewriting or improving prose | See 4.1 — that is a different tool. |
| Audio or Descript integration | The transcript is the input; keep the surface small. |
| Metadata, summaries, plan ads | Those live in the per-book metadata Google Doc, not here. |
| A second "full rewrite" call when edits don't place | See 4.6. Unplaced edits are shown for a hand check instead; Redo is the user's call. |
| Instructions for things the page does locally | Every character of the prompt is paid for on every script. |

## 8. Before you change anything

- [ ] Does this serve the purpose in section 1?
- [ ] Does it break any rule in section 4?
- [ ] Does it fall on the wrong side of section 7?
- [ ] If it touches `09-prompts.js`, has it been run against a script whose
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
