# Changelog

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
