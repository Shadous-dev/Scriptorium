/* 09-prompts.js — THE EDITING INSTRUCTIONS. The heart of the tool — see SOURCE-OF-TRUTH.md. */
  /* ------------------------------------------------------------------
     One prompt, sent once per script. Every character here is paid for on
     every call, so it says each rule once and nothing the page already
     does itself (stage cues and pause marks are stripped locally before
     the text is sent — see stripCues).
     ------------------------------------------------------------------ */

  function promptHeader(section) {
    return 'Proofread this Descript AI transcript of a spoken audio guide. Descript captures the SOUND of words, not always the right words — unfamiliar names often come through as an ordinary phrase that sounds similar.\n\n' +
      'Book or plan: ' + (state.bookTitle || '(untitled)') + '\n' +
      'Script name: ' + (section.name || '(untitled section)') + '\n' +
      'Names or terms the speaker uses that may be misheard: ' + (state.wordsToSearchFor || '(none listed)') + '\n\n' +
      'Fix the following WITHOUT changing the speaker’s wording, meaning, tone, or intent:\n' +
      '1. GRAMMAR AND PUNCTUATION — the main job.\n' +
      '- Every question ends with a question mark, including rhetorical ones mid-flow ("Or was it a Big Bang?"); transcription flattens these to periods.\n' +
      '- Commas for direct address ("Welcome back, my friends"), introductory and interrupting phrases, and lists (serial comma).\n' +
      '- Statements end with periods; a full sentence in parentheses keeps its period inside. "?!" is fine for an exclaimed question.\n' +
      '- Hyphenate compound modifiers before a noun ("so-called", "well-meaning").\n' +
      '- CAPITALIZATION: the first word of every sentence and paragraph (fix every one left lowercase after a period or pause); "I"; names, places, books of the Bible, and titles, consistently (God, Jesus, the Bible, Genesis 1); ordinary nouns stay lowercase ("my dad", "the church").\n' +
      '- Keep deliberate fragments and the casual voice ("No soapbox." "Then, 1964."). Never merge or complete them.\n' +
      '- RUN-ONS: where a sentence chains past two or three clauses on "and", "so", "but", "because", break it with punctuation and capitalization only — never new words: end at a natural boundary and start the next sentence with the conjunction, use a semicolon between closely linked statements, or set off an aside with an em dash (—). Keep the words in their order.\n' +
      '- Keep the dashes already there; add one only where it does grammatical work, never just for a pause.\n' +
      '- Straight double quotes (") for quotations; the single … character for trailing off.\n' +
      '- Remove a line that is only a section label in capitals (e.g. BEARINGS). Words spoken in capitals for emphasis stay.\n' +
      '2. MISHEARD WORDS: plausible mishearings of a listed name or term ("Eli who" for Elihu, "so far" for Zophar), and other names where the sentence only makes sense with a different word.\n' +
      '3. SCRIPTURE: the speaker quotes Bible verses, usually after a reference ("Verse one", "Job 2:4", "Isaiah 3 verses two through four"). Inside a quoted verse fix ONLY misheard words ("the land of us" to "the land of Uz"); change nothing else — not wording, order, capitalization, or punctuation, even where it looks wrong. Translations read oddly on purpose.\n' +
      '4. Flag any sentence that still makes no sense after your edits, with your best guess at what is wrong.\n\n';
  }

  // Verses come back as short anchors, not the whole quotation: the page finds the span between
  // them in the corrected text itself (layoutBlocks), so Claude is never paid to re-type a verse.
  function versesSpec() {
    return '"verses": every Bible quotation, in order. Each: "reference" — the reference phrase as spoken nearby, copied from the text ("Verse one", "Job 2:4"), or "" if none; ' +
      '"startsWith" — the first 4 to 6 words of the quoted verse as it reads after your edits, copied exactly, without the opening quotation mark; "endsWith" — its last 4 to 6 words, likewise; ' +
      '"canonical" — Book Chapter:Verse, or Chapter:Verse-Verse for a span ("Luke 1:30-33"), worked out from the book this script covers, the spoken reference, and the quoted words (count the verses it runs through); ' +
      '"confidence" — "high" only when sure of the canonical reference, else "low"; "note" — "" when confident, else a few words on the doubt.\n' +
      'A quotation is the whole verse as it appears in the Bible, including narration inside it ("How will this be," Mary asked, "since I am a virgin?"), never the speaker’s commentary. In the corrected text each quoted verse is wrapped in double quotation marks; speech inside a verse uses single quotation marks.\n';
  }
  function joinsSpec() {
    if (!repairParagraphs) return '';
    return '"joins": paragraph breaks that fall in the middle of one continuous thought (a breath, not a real new paragraph). Each: {"endsWith": "the last five or so words before the break", "startsWith": "the first five or so words after it"}, copied exactly as the text reads after your edits. Leave genuine paragraph changes alone, and never join across the start or end of a quoted verse.\n';
  }

  function buildEditsPrompt(section, text) {
    return promptHeader(section) +
      'Return your corrections as a list of EDITS, not a rewrite. Each: "find" — a run of text copied CHARACTER FOR CHARACTER from the transcript below (same quotes, apostrophes, spacing), long enough to be unambiguous, usually 3 to 15 words, never crossing a blank line; "replace" — the corrected version of exactly that run. In order, one per occurrence. ' +
      'Add "kind": "misheard" for a misheard word or name, or "verse-fix" for one inside a quoted verse, each with a "note" of a few words; grammar edits need neither.\n' +
      versesSpec() +
      joinsSpec() +
      '"nonsensical": sentences that still make no sense after your edits. "summary": one or two plain sentences on what you corrected.\n\n' +
      'Return ONLY this JSON object:\n' +
      '{"edits":[{"find":"","replace":""}],"verses":[{"reference":"","startsWith":"","endsWith":"","canonical":"","confidence":"high","note":""}],' + (repairParagraphs ? '"joins":[{"endsWith":"","startsWith":""}],' : '') + '"nonsensical":[{"original":"","issue":""}],"summary":""}\n' +
      'Use empty arrays when there is nothing to report. No text outside the JSON.\n\n' +
      'TRANSCRIPT:\n"""\n' + text + '\n"""';
  }
