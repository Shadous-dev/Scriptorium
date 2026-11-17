/* 09-prompts.js — THE EDITING INSTRUCTIONS. The heart of the tool — see SOURCE-OF-TRUTH.md. */

  function promptHeader(section) {
    return 'You are proofreading an AI-generated transcript of a spoken audio guide. The transcript was produced by Descript listening to a real recording, so it captures the SOUND of the words, not necessarily the correct words — especially unfamiliar names, which often get replaced with an ordinary word or phrase that sounds similar.\n\n' +
      'Book or plan: ' + (state.bookTitle || '(untitled)') + '\n' +
      'Script name: ' + (section.name || '(untitled section)') + '\n' +
      'Names or terms likely to have been misheard (the speaker uses these; the transcript may not): ' + (state.wordsToSearchFor || '(none listed)') + '\n\n' +
      'What to fix:\n' +
      '1. GRAMMAR AND PUNCTUATION — the main job. WITHOUT changing the speaker’s wording, meaning, tone, or intent, make every sentence correctly punctuated:\n' +
      '   - Every question ends with a question mark, including rhetorical questions in mid-flow ("Or was it a Big Bang?"). Transcription usually flattens these to periods; fix them.\n' +
      '   - Commas where grammar needs them: direct address ("Welcome back, my friends"), introductory phrases, interrupting phrases ("And that, my friends, is how"), and items in a list, with the serial comma ("a, b, and c").\n' +
      '   - Periods end statements; a full sentence inside parentheses keeps its period inside the parentheses. "?!" is fine where the speaker is clearly exclaiming a question.\n' +
      '   - Hyphenate compound modifiers before a noun ("so-called", "science-minded", "well-meaning").\n' +
      '   - CAPITALIZATION must be flawless: the first word of every sentence and of every paragraph is capitalized (transcripts often leave a sentence starting lowercase after a period or a pause — fix every one); "I" is always capital; names, places, books of the Bible, and titles are capitalized consistently (God, Jesus, the Bible, Genesis 1, Big Bang, Young Earth Creationism); ordinary nouns mid-sentence stay lowercase ("my dad", "the church"). Before you finish, scan the whole script once more for any sentence that still begins with a lowercase letter.\n' +
      '   - Keep deliberate sentence fragments and the speaker’s casual voice ("No soapbox." "Then, 1964."). Do not merge or complete them.\n' +
      '   - RUN-ON SENTENCES: speech chains clauses together with "and", "so", "but", "because". Where a sentence runs on past two or three clauses, break it up using only punctuation and capitalization, not new words: end a sentence at a natural boundary and start the next with the conjunction ("…tell anyone. But the angel…"), use a semicolon between two closely linked statements, or set off an aside or a sharp turn with an em dash (—). Keep the speaker’s words in their order.\n' +
      '   - Keep dashes the transcript already has. Add a dash only where it does grammatical work (an aside, a break in thought, a run-on repair), never just to mark a pause.\n' +
      '   - Use straight double quotes (") for quotations and the single … character for a trailing-off pause, consistently throughout.\n' +
      '   - Remove anything that is not spoken: bracketed delivery cues such as [HOOK] or [lively], stray pause marks such as a lone underscore, and a standalone section label in capital letters (for example a line reading only BEARINGS). Words spoken in capitals for emphasis stay.\n' +
      '2. Words or short phrases that are plausible mishearings of a listed name or term (for example "Elihu" heard as "Eli who", or "Zophar" heard as "so far"), and mishearings of other names where the sentence only makes sense with a different word.\n' +
      '3. SCRIPTURE: the speaker quotes Bible verses, usually introduced by a reference such as "Verse one", "Job 2:4", "Proverbs twenty" or "Isaiah 3 verses two through four". Inside a quoted verse, fix ONLY misheard words (for example "the land of us" to "the land of Uz", "the sabians" to "the Sabeans"). Change nothing else inside a verse — not wording, word order, capitalization, or punctuation, not even a comma you think should be a question mark. Bible translations read oddly on purpose; leave them.\n' +
      '4. Flag any sentence that still doesn’t make sense after your changes, with your best guess at what is wrong.\n\n';
  }

  function versesSpec() {
    return '"verses": every Bible quotation in the script, in order, each with:\n' +
      ' - "reference": the reference phrase exactly as the speaker says it, copied from the text (for example "Verse one", "Job 2:4", "Proverbs twenty"), or "" if none is spoken nearby. Read it carefully — "In verse four" means verse four.\n' +
      ' - "quote": the quoted verse text, copied exactly as it reads AFTER your corrections, from its first word to its last, WITHOUT the surrounding quotation marks. If the Bible verse itself contains narration (for example: "How will this be," Mary asked the angel, "since I am a virgin?"), include that narration — the quote is the whole verse as it appears in the Bible. Never include the speaker’s own commentary. In the corrected text itself, every quoted verse is wrapped in double quotation marks, and any speech inside a verse uses single quotation marks (\'Do not be afraid, Zechariah; your prayer has been heard.\').\n' +
      ' - "canonical": the standard reference — Book Chapter:Verse, or Chapter:Verse-Verse for a span (for example "Luke 1:30-33") — worked out from the book or chapter this script covers (see the script name), the spoken reference, and the quoted words themselves: count how many verses the quotation actually runs through.\n' +
      ' - "confidence": "high" only when you are sure of the canonical reference; otherwise "low".\n' +
      ' - "note": "" when confident; otherwise a few words on the doubt (the spoken reference and the quoted words disagree, the book is unclear, the span is uncertain).\n';
  }
  function joinsSpec() {
    if (!repairParagraphs) return '';
    return '"joins": places where the transcript breaks a paragraph in the middle of a continuous thought (a pause for breath, not a real change of paragraph). Give each as {"endsWith": "the last five or so words before the break", "startsWith": "the first five or so words after it"}, copied exactly as the text reads after your corrections. Join only breaks that split one flowing thought; leave genuine paragraph changes alone, and never join across the start or end of a quoted verse.\n';
  }

  // Preferred: ask only for the changes. Far less text comes back, so each script finishes much sooner.
  function buildEditsPrompt(section) {
    return promptHeader(section) +
      'Return your corrections as a list of EDITS — do not rewrite the script.\n' +
      'Each edit has "find": a run of text copied CHARACTER FOR CHARACTER from the transcript below (same quotes, apostrophes and spacing), long enough to be unambiguous — usually 3 to 15 words, never crossing a blank line — and "replace": the corrected version of exactly that run. List edits in the order they occur. If the same mistake appears several times, give one edit per occurrence. "kind" is "misheard" for a misheard word or name, "verse-fix" for a misheard word inside a quoted verse, otherwise "grammar". Keep "note" to a few words.\n' +
      versesSpec() +
      joinsSpec() +
      '"nonsensical": sentences that still don’t make sense after your edits. "summary": one or two plain-language sentences on what kind of corrections you made.\n\n' +
      'Return ONLY this JSON object:\n' +
      '{"edits":[{"find":"","replace":"","kind":"grammar","note":""}],"verses":[{"reference":"","quote":"","canonical":"","confidence":"high","note":""}],' + (repairParagraphs ? '"joins":[{"endsWith":"","startsWith":""}],' : '') + '"nonsensical":[{"original":"","issue":""}],"summary":""}\n' +
      'Use empty arrays when there is nothing to report. No text outside the JSON.\n\n' +
      'TRANSCRIPT:\n"""\n' + textForEdit(section) + '\n"""';
  }

  // Fallback: the whole corrected script, used when the edit list could not be placed cleanly.
  function buildFullPrompt(section) {
    return promptHeader(section) +
      'Return ONLY this JSON object:\n' +
      '{"correctedText": "the full corrected script, as continuous text, keeping the original paragraph breaks", "changeCount": 0, "summary": "one or two sentences describing what kind of corrections you made, in plain language", "misheard": [{"heard": "what the transcript said", "likely": "what it was probably supposed to be", "note": "why, in a few words"}], "verses": [{"reference": "", "quote": "", "canonical": "", "confidence": "high", "note": ""}], ' + (repairParagraphs ? '"joins": [{"endsWith": "", "startsWith": ""}], ' : '') + '"nonsensical": [{"original": "the confusing sentence or phrase, quoted", "issue": "what does not add up and your best guess at the fix"}]}\n' +
      versesSpec() + joinsSpec() +
      'Use empty arrays when there is nothing to report. Do not include any text outside the JSON object.\n\n' +
      'TRANSCRIPT:\n"""\n' + textForEdit(section) + '\n"""';
  }

