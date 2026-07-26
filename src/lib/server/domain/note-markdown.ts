import { generateText, type Extensions } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { ProseMirrorDocument } from '$lib/models';
import { findProseMirrorDocumentIssue, ValidationError } from '$lib/models';

const extensions: Extensions = [
	StarterKit.configure({
		heading: { levels: [1, 2, 3, 4] }
	})
];

const markdown = new MarkdownManager({ extensions });

export interface NoteMarkdownContent {
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
}

/** Convert the agent's compact Markdown payload into the editor's persisted note content. */
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
