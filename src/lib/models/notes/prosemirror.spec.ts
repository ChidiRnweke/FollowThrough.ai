import { describe, expect, it } from 'vitest';
import { findProseMirrorDocumentIssue } from './index';

describe('ProseMirror document invariants', () => {
	it('accepts a structurally valid nested document', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [
					{
						type: 'bulletList',
						content: [
							{
								type: 'listItem',
								content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Valid' }] }]
							}
						]
					}
				]
			})
		).toBeUndefined();
	});

	it('reports the path of a text node without a type', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ text: 'Broken' }] }]
			})?.path
		).toBe('$.content[0].content[0].type');
	});

	it('rejects strong wrappers because bold formatting belongs on text marks', () => {
		expect(
			findProseMirrorDocumentIssue({
				type: 'doc',
				content: [
					{
						type: 'paragraph',
						content: [{ type: 'strong', content: [{ type: 'text', text: 'Broken' }] }]
					}
				]
			})?.message
		).toBe('strong is inline formatting and cannot be used as a node');
	});
});
