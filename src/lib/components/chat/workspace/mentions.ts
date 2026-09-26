import type { NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import type { ResourceChip } from '$lib/models/chat';
import { MENTION_PATTERN } from '$lib/models/chat';
export { MENTION_PATTERN } from '$lib/models/chat';
import { folderNoteIds } from '$lib/services/notes/folder-context';

/**
 * The composer's `@` mentions. The prompt text is the source of truth: picking a
 * candidate writes `@Name` into the sentence and leaves it there, and a chip counts
 * as attached only while its token is still in the text. Deleting the token
 * detaches it; removing the chip deletes the token. The two views cannot drift.
 *
 * Anchored to the end of the string, so the picker only opens on the token being
 * typed, and `[^\s@]*` keeps the query to a single word — which is also what closes
 * the picker once `withMention` writes a (possibly multi-word) title plus a space.
 */
export const mentionQueryOf = (prompt: string): string | undefined =>
	MENTION_PATTERN.exec(prompt)?.[2];

/** Per-kind candidate budgets, so one crowded kind cannot fill the popup. */
const NOTE_CANDIDATES = 6;
const FOLDER_CANDIDATES = 4;
const SKILL_CANDIDATES = 4;

const matches = (title: string, query: string): boolean => title.toLowerCase().includes(query);

export const mentionCandidatesFor = (
	query: string,
	noteTree: readonly NoteSummary[],
	skills: readonly SkillSummary[],
	availability: 'unknown' | 'complete'
): ResourceChip[] => {
	const needle = query.toLowerCase();
	const live = noteTree.filter((entry) => !entry.archivedAt && matches(entry.title, needle));
	const notes = live
		.filter((entry) => entry.kind !== 'folder')
		.slice(0, NOTE_CANDIDATES)
		.map((note): ResourceChip => ({ kind: 'note', id: note.id, name: note.title }));
	const folders = live
		.filter((entry) => entry.kind === 'folder' && availability === 'complete')
		.slice(0, FOLDER_CANDIDATES)
		.map((folder): ResourceChip => ({
			kind: 'folder',
			id: folder.id,
			name: folder.title,
			noteCount: folderNoteIds(noteTree, folder.id).length
		}));
	const matched = skills
		.filter((skill) => matches(skill.name, needle))
		.slice(0, SKILL_CANDIDATES)
		.map((skill): ResourceChip => ({ kind: 'skill', id: skill.noteId, name: skill.name }));
	return [...notes, ...folders, ...matched];
};
