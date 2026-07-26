import { describe, expect, it } from 'vitest';
import { findProseMirrorDocumentIssue } from '$lib/models';
import { noteContentFromMarkdown } from './note-markdown';

const formatted = noteContentFromMarkdown(
	'# About\n\nI build **reliable systems**.\n\n- Trace failures\n- Fix root causes'
);

describe('Agent note Markdown', () => {
	it('produces a valid ProseMirror document', () => {
		expect(findProseMirrorDocumentIssue(formatted.document)).toBeUndefined();
	});

	it('preserves headings, bold text, and lists as readable plain text', () => {
		expect(formatted.plainText).toBe(
			'About\n\nI build reliable systems.\n\nTrace failures\n\nFix root causes'
		);
	});

	it('allows an empty Markdown body to clear a note', () => {
		expect(noteContentFromMarkdown('')).toEqual({
			document: { type: 'doc', content: [] },
			plainText: ''
		});
	});
});
