# Changelog

## 1.0.0 — the first team release (unreleased)

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
