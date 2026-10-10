import { expect, it } from 'vitest';
import { NotePresentationService } from './presentation';
import { testNow } from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteRevisionId, NoteRevisionSummary } from '$lib/models/notes';
const revision = (value: number, isPublished: boolean): NoteRevisionSummary => ({
	id: `70000000-0000-4000-8000-${String(value).padStart(12, '0')}` as NoteRevisionId,
	title: `Version ${value}`,
	revision: value,
	createdAt: testNow,
	isPublished
});
const presentation = new NotePresentationService();
it('opens the published revision before a newer unpublished snapshot', () => {
	expect(presentation.preferredRevision([revision(2, false), revision(1, true)])?.revision).toBe(1);
});
it('uses the newest snapshot when none is published', () => {
	expect(presentation.preferredRevision([revision(2, false), revision(1, false)])?.revision).toBe(
		2
	);
});
it('keeps a successful empty history empty', () => {
	expect(presentation.preferredRevision([])).toBeUndefined();
});
