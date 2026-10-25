---
title: 'ADR 0048: Offer inline suggestions as anchored edits that fail closed'
description: Let the inline model fix the text around the caret as well as continue it, verify its anchors twice, and refuse any edit whose anchors do not match rather than degrade it to an append.
---

## Status

Accepted.

## Context

Inline suggestions (ghost text in the note editor) could only append text at the caret. The model
returned one string, the server trimmed it, and the editor inserted it on Tab. A writer who had
just mistyped a word saw a continuation glued to the typo, and a sentence that needed tightening
could not be offered at all. Code editors show an inline edit for this: the characters to replace
are struck through, the new text follows as ghost text, and one key applies the whole edit.

A replacement is only safe when it lands on exactly the characters the model meant. The model sees
the text around the caret as plain strings; the editor holds a document of positions. Two things
can go wrong between them: the model names characters that are not at the caret, and the document
changes between the request and the answer.

## Decision

- The model answers with a JSON object of three strings: `replaceBefore`, `replaceAfter` and
  `text`. Both anchors empty is a plain continuation, and the prompt asks the model to prefer it.
  `replaceBefore` must be exactly the characters at the end of the text before the caret that the
  text replaces; `replaceAfter` the characters at the start of the text after it. The request
  carries a JSON schema for this shape.
- The completion service parses the answer itself and anchors it against the request's window. An
  answer that is not the JSON asked for is `unparseable`; anchors that are not the characters
  around the caret, or that cross a line break, are `unanchored`. Both are reported as a declined
  suggestion with that reason, never degraded to an append: a replacement placed on the wrong
  characters destroys the writer's text, and an append that was meant as a fix repeats the typo.
- The suggestion carries an `edit` union: `insert` with text, or `replace` with the two anchors
  and the text. The editor maps the anchors to document positions inside the caret's block,
  compares the document text with the anchors again, and offers nothing when they differ.
- A replacement is rendered as the anchored characters struck through, with the new text as ghost
  text after them. Tab or a click replaces the range with the text. Typing drops the offer; only
  an appended offer can be typed into, and only an appended offer is remembered for Backspace.
- The ghost-text sanitiser runs on the replacement text against the prefix with the anchored
  characters removed, so a corrected word that restates the anchor is kept. A replacement whose
  text equals its anchors is treated as no suggestion.

## Consequences

- The writer can accept a fix and a continuation in one Tab. The anchored characters remain the
  writer's own text until then.
- A suggestion can now be declined for two new reasons, `unparseable_model` and `unanchored_edit`,
  which the `inline.generate` span records. Their rate is the model's reliability on the contract
  and is measured by the `inline-suggestion-edit` eval case before anything depends on it.
- Replacements cannot cross a block boundary or an inline atom; such offers are dropped by the
  position check rather than placed approximately.
- The wire shape of a suggestion changed from `text` to `edit`; the browser bundle's schema
  changed with it.

## Evidence

- `src/lib/server/services/inline-suggestions/completion.spec.ts`: anchored replacement, a
  replacement reaching past the caret, refusal on either anchor, refusal across a line break, a
  no-op treated as empty, a restated anchor kept, non-JSON and missing keys reported as
  unparseable, and the schema sent with the request.
- `src/lib/server/controllers/inline-suggestions/completion.spec.ts`: a replacement published as
  anchored, and the two declines mapped to their reasons.
- `src/lib/components/edra/commands/InlineSuggestion.svelte.spec.ts`: the struck range and ghost
  text, Tab applying the whole replacement, no offer when the anchor is not the text before the
  caret or would reach into the previous block, and the offer dropped on the next keystroke.
- A direct provider probe with the JSON schema and reasoning off: the misspelt prefix "should
  acount for the read-replica cutover" answered `{"replaceBefore":"acount","replaceAfter":"",
"text":"account"}`; a clean prefix answered a plain continuation with both anchors empty.
