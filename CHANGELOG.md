# Changelog

## v2 — cost-reduction pass (2026-11-05)

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

## v1 — snapshot (2026-11-03 artifact)

The tool exactly as published, split into `src/` for review. Rebuilds byte-identical.
