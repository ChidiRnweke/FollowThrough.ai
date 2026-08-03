import { describe, expect, it } from 'vitest';
import {
	FOLDER_NOTE_LIMIT,
	folderNoteIds,
	liveChips,
	mentionCandidatesFor,
	mentionQueryOf,
	withMention,
	withoutMention
} from './mentions';
import type { NoteId, NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import type { ContextChip } from '$lib/stores/agent/chat.svelte';

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

const folderChip: ContextChip = { kind: 'folder', id: id(1), name: 'Research', noteCount: 2 };
const noteChip: ContextChip = { kind: 'note', id: id(2), name: 'Q3 Planning' };

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

describe('writing a mention into the prompt', () => {
	it('leaves the chosen name in the sentence', () => {
		expect(withMention('summarise @rese', folderChip)).toBe('summarise @Research ');
	});

	it('keeps a multi-word title whole', () => {
		expect(withMention('compare @q3', noteChip)).toBe('compare @Q3 Planning ');
	});

	it('preserves the text before the tag', () => {
		expect(withMention('@rese', folderChip)).toBe('@Research ');
	});
});

describe('removing a mention from the prompt', () => {
	it('deletes the tag', () => {
		expect(withoutMention('summarise @Research now', folderChip)).toBe('summarise now');
	});

	it('removes every occurrence of the tag', () => {
		expect(withoutMention('@Research versus @Research', folderChip)).toBe(' versus ');
	});
});

describe('chips the prompt still speaks for', () => {
	it('keeps a chip whose tag is present', () => {
		expect(liveChips('summarise @Research', [folderChip])).toEqual([folderChip]);
	});

	it('drops a chip whose tag was typed away', () => {
		expect(liveChips('summarise @Resear', [folderChip])).toEqual([]);
	});

	it('judges each chip on its own tag', () => {
		expect(liveChips('@Q3 Planning only', [folderChip, noteChip])).toEqual([noteChip]);
	});
});

describe('mention candidates', () => {
	const tree = [
		entry({ id: id(1), title: 'Research', kind: 'folder' }),
		entry({ id: id(2), title: 'Research notes' }),
		entry({ id: id(3), title: 'Archived research', archivedAt: at })
	] as NoteSummary[];

	it('offers folders alongside notes', () => {
		expect(mentionCandidatesFor('resea', tree, []).map((chip) => chip.kind)).toEqual([
			'note',
			'folder'
		]);
	});

	it('counts the notes a folder stands for', () => {
		const tree = [
			entry({ id: id(1), title: 'Research', kind: 'folder' }),
			entry({ id: id(2), title: 'Findings', parentId: id(1) })
		] as NoteSummary[];
		expect(mentionCandidatesFor('research', tree, [])[0]?.noteCount).toBe(1);
	});

	it('leaves archived entries out', () => {
		expect(mentionCandidatesFor('research', tree, []).map((chip) => chip.name)).not.toContain(
			'Archived research'
		);
	});

	it('offers matching skills', () => {
		expect(mentionCandidatesFor('analy', [], [skill('Note analyzer', id(9))])[0]?.kind).toBe(
			'skill'
		);
	});
});

describe('expanding a tagged folder', () => {
	const tree = [
		entry({ id: id(1), title: 'Research', kind: 'folder' }),
		entry({ id: id(2), title: 'Findings', parentId: id(1) }),
		entry({ id: id(3), title: 'Interviews', kind: 'folder', parentId: id(1) }),
		entry({ id: id(4), title: 'Session one', parentId: id(3) }),
		entry({ id: id(5), title: 'Retired', parentId: id(1), archivedAt: at }),
		entry({ id: id(6), title: 'Elsewhere' })
	] as NoteSummary[];

	it('collects notes from nested folders too', () => {
		expect(folderNoteIds(tree, id(1))).toEqual([id(2), id(4)]);
	});

	it('leaves archived notes out', () => {
		expect(folderNoteIds(tree, id(1))).not.toContain(id(5));
	});

	it('leaves notes outside the folder out', () => {
		expect(folderNoteIds(tree, id(3))).toEqual([id(4)]);
	});

	it('caps a large folder', () => {
		const crowded = [
			entry({ id: id(1), title: 'Research', kind: 'folder' }),
			...Array.from({ length: FOLDER_NOTE_LIMIT + 5 }, (_, index) =>
				entry({ id: id(index + 2), title: `Note ${index}`, parentId: id(1) })
			)
		] as NoteSummary[];
		expect(folderNoteIds(crowded, id(1))).toHaveLength(FOLDER_NOTE_LIMIT);
	});
});
