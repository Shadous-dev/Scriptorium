/* 09-prompts.js — THE EDITING INSTRUCTIONS. The heart of the tool — see SOURCE-OF-TRUTH.md. */
  /* ------------------------------------------------------------------
     One prompt, sent once per script. Every character here is paid for on
     every call, so it says each rule once and nothing the page already
     does itself: cues, spacing, quote marks, ellipses, missing full stops,
     sentence-start capitals, "I", God/Lord, Bible books and listed names
     are all fixed locally before the text is sent (see mechanics,
     fixNames and fixCapitals).
     ------------------------------------------------------------------ */

  // `gloss` is what the glossary adds for this guide (glossaryFor): names from its book of the Bible, and the
  // approved mishearings whose words occur in this transcript. A guide neither bears on adds nothing (4.6, 4.12).
  function promptHeader(section, hasWritten, gloss) {
    var names = [String(state.wordsToSearchFor || '').trim()].concat((gloss && gloss.names) || []).filter(Boolean).join(', ');
    var hints = ((gloss && gloss.hints) || []).map(function (h) { return '"' + h.heard + '" = ' + h.term; }).join('; ');
    return 'Proofread this Descript AI transcript of a spoken audio guide. Descript captures the SOUND of words, not always the right words — unfamiliar names often come through as an ordinary phrase that sounds similar.\n\n' +
      'Book or plan: ' + (state.bookTitle || '(untitled)') + '\n' +
      'Script name: ' + (section.name || '(untitled section)') + '\n' +
      'Names or terms the speaker uses that may be misheard: ' + (names || '(none listed)') + '\n' +
      (hints ? 'Mishearings found in earlier guides (apply one only where this sentence means that term): ' + hints + '\n' : '') + '\n' +
      'Fix the following WITHOUT changing the speaker’s wording, meaning, tone, or intent:\n' +
      '1. GRAMMAR AND PUNCTUATION — the main job.\n' +
      '- Every question ends with a question mark, including rhetorical ones mid-flow ("Or was it a Big Bang?"); transcription flattens these to periods.\n' +
      '- Commas for direct address ("Welcome back, my friends"), introductory and interrupting phrases, and lists (serial comma).\n' +
      '- Statements end with periods; a full sentence in parentheses keeps its period inside. "?!" is fine for an exclaimed question.\n' +
      '- Hyphenate compound modifiers before a noun ("so-called", "well-meaning").\n' +
      '- CAPITALIZATION: names, places, and titles, consistently; ordinary nouns stay lowercase ("my dad", "the church").\n' +
      '- Keep deliberate fragments and the casual voice ("No soapbox." "Then, 1964."). Never merge or complete them.\n' +
      '- RUN-ONS: where a sentence chains past two or three clauses on "and", "so", "but", "because", break it with punctuation and capitalization only — never new words: end at a natural boundary and start the next sentence with the conjunction, use a semicolon between closely linked statements, or set off an aside with an em dash (—). Keep the words in their order.\n' +
      '- Keep the dashes already there; add one only where it does grammatical work, never just for a pause.\n' +
      '- Remove a line that is only a section label in capitals (e.g. BEARINGS). Words spoken in capitals for emphasis stay.\n' +
      '- Bible references in digits, never number words or a mix ("Isaiah 35:1", "chapter 12", "verse 3"); keep the words "chapter" and "verse" where spoken. Other numbers stay as spoken.\n' +
      '2. MISHEARD WORDS: plausible mishearings of a listed name or term ("Eli who" for Elihu, "so far" for Zophar), and other names where the sentence only makes sense with a different word. A correction must SOUND like what was transcribed — never swap in a different word that means the same.\n' +
      '3. SCRIPTURE: the speaker quotes Bible verses, usually after a reference ("Verse one", "Job 2:4", "Isaiah 3 verses two through four"). Inside a quoted verse fix ONLY misheard words ("the land of us" to "the land of Uz"); change nothing else — not wording, order, capitalization, or punctuation, even where it looks wrong. Translations read oddly on purpose. The speaker quotes the NIV, sometimes the ESV: never change a quotation to match a verse. If one matches neither translation in meaning or a key word, leave it and report it under "misquotes".\n' +
      '4. Flag any sentence that still makes no sense after your edits, with your best guess at what is wrong.\n' +
      // SOURCE-OF-TRUTH 4.9. Sent only for a guide that has a written script, so no other call pays for it (4.6).
      (hasWritten ? '5. WRITTEN SCRIPT: what the teacher wrote before recording is given below as a reference. The teacher did not read it out word for word, so NEVER change the transcript to match it. ' +
        'Use it only as evidence for a fix rules 1 to 3 already allow: a misheard word or name, a question mark where a question was meant, a comma, where a sentence or a quotation ends. Add "source":"script" to an edit it supports. ' +
        'Where the transcript looks wrong against it in another way — a word dropped or misheard as a different-sounding word, NOT the speaker rewording — still give the edit, with "source":"script"; the page lists it as a suggestion and leaves the transcript as spoken.\n' : '') +
      '\n';
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

  var WRITTEN_PROMPT_MAX = 60000;      // characters of a written script sent with its guide
  function buildEditsPrompt(section, text, written, gloss) {
    written = String(written || '').trim().slice(0, WRITTEN_PROMPT_MAX);
    return promptHeader(section, !!written, gloss) +
      'Return your corrections as a list of EDITS, not a rewrite. Each: "find" — a run of text copied CHARACTER FOR CHARACTER from the transcript below (same quotes, apostrophes, spacing), long enough to be unambiguous, usually 3 to 15 words, never crossing a blank line; "replace" — the corrected version of exactly that run. In order, one per occurrence. ' +
      'Add "kind": "misheard" for a misheard word or name, or "verse-fix" for one inside a quoted verse, each with a "note" of a few words; grammar edits need neither.\n' +
      versesSpec() +
      joinsSpec() +
      '"misquotes": quotations that match neither the NIV nor the ESV. Each: "said" — the speaker’s words, copied; "verse" — how the verse reads; "reference".\n' +
      '"nonsensical": sentences that still make no sense after your edits. "summary": one or two plain sentences on what you corrected.\n\n' +
      'Return ONLY this JSON object:\n' +
      '{"edits":[{"find":"","replace":""}],"verses":[{"reference":"","startsWith":"","endsWith":"","canonical":"","confidence":"high","note":""}],' + (repairParagraphs ? '"joins":[{"endsWith":"","startsWith":""}],' : '') + '"misquotes":[{"said":"","verse":"","reference":""}],"nonsensical":[{"original":"","issue":""}],"summary":""}\n' +
      'Use empty arrays when there is nothing to report. No text outside the JSON.\n\n' +
      (written ? 'WRITTEN SCRIPT (reference only — never copy its wording into the transcript):\n"""\n' + written + '\n"""\n\n' : '') +
      'TRANSCRIPT:\n"""\n' + text + '\n"""';
  }
