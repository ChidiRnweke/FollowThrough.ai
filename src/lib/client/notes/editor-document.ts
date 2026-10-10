import type { JSONContent } from '@tiptap/core';
import type { ProseMirrorDocument } from '$lib/models/notes';
import type { EditorDocumentCopy } from '$lib/models/browser-workspace';

/** Tiptap mutates its input. A JSON copy also reads Svelte proxies, unlike structuredClone. */
export class TiptapDocumentCopy implements EditorDocumentCopy {
	copy(document: ProseMirrorDocument): JSONContent {
		// audit-allow: no-json-parse-cast — the input is a parsed domain document; this JSON round trip copies Svelte proxies into mutable Tiptap content because structuredClone rejects proxies.
		return JSON.parse(JSON.stringify(document));
	}
}
