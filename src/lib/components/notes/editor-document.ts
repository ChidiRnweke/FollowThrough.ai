import type { JSONContent } from '@tiptap/core';
import { editableProseMirrorDocument, type ProseMirrorDocument } from '$lib/models/notes';

/**
 * A domain document, ready to hand to Tiptap.
 *
 * This used to go through `editorContent` in `components/edra/commands/document.ts`,
 * which re-parsed the document against a second, permissive schema
 * (`attrs: z.record(z.string(), z.json())`, `type: z.string()`). Two schemas for
 * one shape is how they drift, and this pair did: the model schema rejected
 * `textAlign: null` while the Edra one accepted anything, so the editor layer
 * never noticed the model layer disagreeing with it.
 *
 * The Edra copy is not deleted, and should not be — the topology audit forbids
 * `components/edra/` from importing `$lib/models/`, because Edra is a vendored,
 * product-agnostic editor. Its schema is its own protocol and it still uses it
 * internally. What was wrong was *product* code borrowing that protocol to
 * convert its own domain type. The conversion belongs here, where the domain
 * type is in scope.
 *
 * Nothing is re-validated: the document arrived through `toNote`, which already
 * parsed it. What is left is the copy Tiptap needs — `setContent` normalises the
 * document it is given, so it must not be handed the value the rest of the app
 * is holding — and the widening from our closed union to Tiptap's open
 * `JSONContent`. That widening is the one assertion, and it is sound in the
 * direction it is made: every arm of `ProseMirrorNode` was derived from what the
 * editor serializes.
 *
 * The copy goes through JSON rather than `structuredClone`, and that is not a
 * style choice. The document reaching this function is usually a Svelte `$state`
 * proxy, and `structuredClone` throws `DataCloneError` on a proxy — opening any
 * note died on it. The previous `editorContent` never hit this because zod's
 * `parse` rebuilds plain objects as it reads, so the copy came free with the
 * validation; removing the validation removed the copy with it. A document is
 * JSON by definition, so a JSON round trip is a total deep copy here, and it
 * reads through a proxy the way `JSON.stringify` reads through anything.
 */
export const toEditorContent = (document: ProseMirrorDocument): JSONContent =>
	JSON.parse(JSON.stringify(editableProseMirrorDocument(document)));
