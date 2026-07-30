import { generateText } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import type { ProseMirrorDocument } from '$lib/models';
import { findProseMirrorDocumentIssue } from '$lib/models';
import { ValidationError } from '$lib/errors';
import { noteMarkdownExtensions } from './markdown-extensions.js';

/**
 * Markdown ↔ note conversion.
 *
 * Isomorphic on purpose: the agent's `edit_note` tool applies a patch on the server, and
 * the approval card previews the same patch in the browser before the user accepts it.
 * If the two sides converted differently, the preview would be a plausible lie.
 */

const extensions = noteMarkdownExtensions;

const markdown = new MarkdownManager({ extensions });

export interface NoteMarkdownContent {
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
}

/** Convert a compact Markdown payload into the editor's persisted note content. */
export const noteContentFromMarkdown = (source: string): NoteMarkdownContent => {
	const parsed = markdown.parse(source);
	const document = parsed as ProseMirrorDocument;
	const issue = findProseMirrorDocumentIssue(document);
	if (issue)
		throw new ValidationError(
			`Markdown produced an invalid note document at ${issue.path}: ${issue.message}`
		);
	return {
		document,
		plainText: generateText(parsed, extensions, { blockSeparator: '\n\n' })
			.replace(/\n{3,}/g, '\n\n')
			.trim()
	};
};

/**
 * Render a persisted note back to Markdown.
 *
 * The inverse of {@link noteContentFromMarkdown}, and the text a targeted edit anchors
 * against — so it has to round-trip every node the editor can produce, not just the ones
 * Markdown has native syntax for.
 */
export const noteMarkdownFromContent = (document: ProseMirrorDocument): string =>
	markdown.serialize(document as Parameters<typeof markdown.serialize>[0]);
