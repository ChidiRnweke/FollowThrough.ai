import { describe, expect, it } from 'vitest';
import { mentionCandidatesFor, mentionQueryOf } from './mentions';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as unknown as NoteId;

const at = '2026-07-12T08:00:00.000Z' as unknown as NoteSummary['createdAt'];

const entry = (overrides: Partial<NoteSummary> & Pick<NoteSummary, 'id' | 'title'>): NoteSummary =>
	({
		kind: 'note',
		position: 0,
		isPinned: false,
		currentRevision: 1,
		createdAt: at,
		updatedAt: at,
		...overrides
	}) as NoteSummary;

const skill = (name: string, noteId: NoteId): SkillSummary =>
	({ name, noteId, description: '', triggerHints: [], isEnabled: true }) as SkillSummary;

describe('mention query detection', () => {
	it('reads the word being typed after an @', () => {
		expect(mentionQueryOf('summarise @rese')).toBe('rese');
	});

	it('offers everything on a bare @', () => {
		expect(mentionQueryOf('summarise @')).toBe('');
	});

	it('closes once the tag is followed by a space', () => {
		expect(mentionQueryOf('summarise @Research ')).toBeUndefined();
	});

	it('ignores an @ in the middle of a word', () => {
		expect(mentionQueryOf('mail tester@local')).toBeUndefined();
	});
});

describe('mention candidates', () => {
	it('does not offer a partial folder as complete context', () => {
		expect(
			mentionCandidatesFor(
				'Research',
				[entry({ id: id(1), title: 'Research', kind: 'folder' })],
				[],
				'unknown'
			)
		).toEqual([]);
	});
	const tree = [
		entry({ id: id(1), title: 'Research', kind: 'folder' }),
		entry({ id: id(2), title: 'Research notes' }),
		entry({ id: id(3), title: 'Archived research', archivedAt: at })
	] as NoteSummary[];

	it('offers folders alongside notes', () => {
		expect(mentionCandidatesFor('resea', tree, [], 'complete').map((chip) => chip.kind)).toEqual([
			'note',
			'folder'
		]);
	});

	it('counts the notes a folder stands for', () => {
		const tree = [
			entry({ id: id(1), title: 'Research', kind: 'folder' }),
			entry({ id: id(2), title: 'Findings', parentId: id(1) })
		] as NoteSummary[];
		expect(
			mentionCandidatesFor('research', tree, [], 'complete').find((chip) => chip.kind === 'folder')
				?.noteCount
		).toBe(1);
	});

	it('leaves archived entries out', () => {
		expect(
			mentionCandidatesFor('research', tree, [], 'complete').map((chip) => chip.name)
		).not.toContain('Archived research');
	});

	it('offers matching skills', () => {
		expect(
			mentionCandidatesFor('analy', [], [skill('Note analyzer', id(9))], 'complete')[0]?.kind
		).toBe('skill');
	});
});
