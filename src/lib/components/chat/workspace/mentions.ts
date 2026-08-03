import type { NoteId, NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import type { ContextChip } from '$lib/stores/agent/chat.svelte';

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
export const MENTION_PATTERN = /(^|\s)@([^\s@]*)$/;

export const mentionQueryOf = (prompt: string): string | undefined =>
	MENTION_PATTERN.exec(prompt)?.[2];

/** Per-kind candidate budgets, so one crowded kind cannot fill the popup. */
const NOTE_CANDIDATES = 6;
const FOLDER_CANDIDATES = 4;
const SKILL_CANDIDATES = 4;

/**
 * A tagged folder attaches the notes inside it, exactly as tagging each note would.
 * The cap guards against a large folder fanning out into hundreds of note reads;
 * the server's per-note token budget handles the size of what does come back.
 */
export const FOLDER_NOTE_LIMIT = 25;

const matches = (title: string, query: string): boolean => title.toLowerCase().includes(query);

export const mentionCandidatesFor = (
	query: string,
	noteTree: readonly NoteSummary[],
	skills: readonly SkillSummary[]
): ContextChip[] => {
	const needle = query.toLowerCase();
	const live = noteTree.filter((entry) => !entry.archivedAt && matches(entry.title, needle));
	const notes = live
		.filter((entry) => entry.kind !== 'folder')
		.slice(0, NOTE_CANDIDATES)
		.map((note): ContextChip => ({ kind: 'note', id: note.id, name: note.title }));
	const folders = live
		.filter((entry) => entry.kind === 'folder')
		.slice(0, FOLDER_CANDIDATES)
		.map((folder): ContextChip => ({
			kind: 'folder',
			id: folder.id,
			name: folder.title,
			noteCount: folderNoteIds(noteTree, folder.id).length
		}));
	const matched = skills
		.filter((skill) => matches(skill.name, needle))
		.slice(0, SKILL_CANDIDATES)
		.map((skill): ContextChip => ({ kind: 'skill', id: skill.noteId, name: skill.name }));
	return [...notes, ...folders, ...matched];
};

const tokenOf = (chip: ContextChip): string => `@${chip.name}`;

/** Replaces the `@query` being typed with the chosen name, left in the sentence. */
export const withMention = (prompt: string, chip: ContextChip): string =>
	prompt.replace(MENTION_PATTERN, `$1${tokenOf(chip)} `);

/** Drops every occurrence of a chip's token, closing the gap it leaves behind. */
export const withoutMention = (prompt: string, chip: ContextChip): string =>
	prompt.split(tokenOf(chip)).join('').replace(/ {2,}/g, ' ');

/** The chips still spoken for by the prompt text. */
export const liveChips = (prompt: string, chips: readonly ContextChip[]): ContextChip[] =>
	chips.filter((chip) => prompt.includes(tokenOf(chip)));

/**
 * Every note under a folder, however deep. Folders themselves carry no content, so
 * only their leaves are attachable; archived entries are left out the same way they
 * are left out of the picker.
 */
export function folderNoteIds(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[] {
	const childrenOf = new Map<NoteId, NoteSummary[]>();
	for (const entry of noteTree) {
		if (entry.archivedAt || !entry.parentId) continue;
		const siblings = childrenOf.get(entry.parentId);
		if (siblings) siblings.push(entry);
		else childrenOf.set(entry.parentId, [entry]);
	}
	const found: NoteId[] = [];
	const pending: NoteId[] = [folderId];
	const seen = new Set<NoteId>([folderId]);
	while (pending.length > 0 && found.length < FOLDER_NOTE_LIMIT) {
		for (const child of childrenOf.get(pending.shift()!) ?? []) {
			if (seen.has(child.id)) continue;
			seen.add(child.id);
			if (child.kind === 'folder') pending.push(child.id);
			else if (found.length < FOLDER_NOTE_LIMIT) found.push(child.id);
		}
	}
	return found;
}
