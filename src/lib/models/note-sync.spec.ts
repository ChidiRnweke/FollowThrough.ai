import { describe, expect, it } from 'vitest';
import { noteEtag, noteMatchesEtag, noteSyncContentEquals } from '$lib/models';
import { noteBuilder } from '$lib/testing/fixtures/domain-builders';

describe('Note synchronization token invariants', () => {
	it('derives the same ETag from the same persistent identity and revision', () => {
		expect(noteEtag(noteBuilder())).toBe(noteEtag(noteBuilder()));
	});

	it('changes the ETag when the authoritative revision changes', () => {
		expect(noteEtag(noteBuilder({ currentRevision: 2 }))).not.toBe(noteEtag(noteBuilder()));
	});

	it('matches only the ETag for the note revision it describes', () => {
		expect(noteMatchesEtag(noteBuilder(), noteEtag(noteBuilder()))).toBe(true);
	});

	it('compares synchronization content without relying on timestamps', () => {
		expect(
			noteSyncContentEquals(
				noteBuilder(),
				noteBuilder({ updatedAt: '2026-07-18T00:00:00.000Z' as never })
			)
		).toBe(true);
	});
});
