import type { FolderContextResolution, NoteId, NoteSummary } from '$lib/models/notes';
import type { SkillSummary } from '$lib/models/skills';
import { MENTION_PATTERN, type ResourceChip, type MentionableResources } from '$lib/models/chat';
import type { Diagram } from '$lib/models/diagrams';

/** All live content below a folder. Provider token budgets do not change this selection. */
function folderNoteIds(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[] {
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
	for (let index = 0; index < pending.length; index++) {
		for (const child of childrenOf.get(pending[index]!) ?? []) {
			if (seen.has(child.id)) continue;
			seen.add(child.id);
			if (child.kind === 'folder') pending.push(child.id);
			else found.push(child.id);
		}
	}
	return found;
}

function resolveFolderContext(
	noteTree: readonly NoteSummary[],
	folderIds: readonly NoteId[],
	availability: 'unknown' | 'complete'
): FolderContextResolution {
	if (folderIds.length === 0) return { kind: 'ready', noteIds: [] };
	if (availability !== 'complete') return { kind: 'incomplete' };
	const folders = new Set(
		noteTree
			.filter((entry) => entry.kind === 'folder' && !entry.archivedAt)
			.map((entry) => entry.id)
	);
	const noteIds = new Set<NoteId>();
	for (const folderId of folderIds) {
		if (!folders.has(folderId)) return { kind: 'missing', folderId };
		for (const noteId of folderNoteIds(noteTree, folderId)) noteIds.add(noteId);
	}
	return { kind: 'ready', noteIds: [...noteIds] };
}

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
const mentionQueryOf = (prompt: string): string | undefined => MENTION_PATTERN.exec(prompt)?.[2];

/** Per-kind candidate budgets, so one crowded kind cannot fill the popup. */
const NOTE_CANDIDATES = 6;
const FOLDER_CANDIDATES = 4;
const SKILL_CANDIDATES = 4;
const WIDGET_CANDIDATES = 4;
const DIAGRAM_CANDIDATES = 4;
const ATTACHMENT_CANDIDATES = 4;

/** The non-note resources a mention can reach, already matched and scoped by the views. */

const diagramNameOf = (diagram: Pick<Diagram, 'title'>): string =>
	diagram.title || 'Untitled diagram';

const matches = (title: string, query: string): boolean => title.toLowerCase().includes(query);

const mentionCandidatesFor = (
	query: string,
	noteTree: readonly NoteSummary[],
	skills: readonly SkillSummary[],
	availability: 'unknown' | 'complete',
	resources: MentionableResources
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
	const widgets = resources.widgets
		.slice(0, WIDGET_CANDIDATES)
		.map((widget): ResourceChip => ({ kind: 'widget', id: widget.id, name: widget.title }));
	const diagrams = resources.diagrams.slice(0, DIAGRAM_CANDIDATES).map((diagram): ResourceChip => ({
		kind: 'diagram',
		id: diagram.id,
		name: diagramNameOf(diagram)
	}));
	const attachments = resources.attachments
		.slice(0, ATTACHMENT_CANDIDATES)
		.map((view): ResourceChip => ({
			kind: 'attachment',
			id: view.attachment.id,
			name: view.attachment.path
		}));
	return [...notes, ...folders, ...matched, ...widgets, ...diagrams, ...attachments];
};

export interface AgentContextSelection {
	folderNotes(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[];
	folders(
		noteTree: readonly NoteSummary[],
		folderIds: readonly NoteId[],
		availability: 'unknown' | 'complete'
	): FolderContextResolution;
	query(prompt: string): string | undefined;
	diagramName(diagram: Pick<Diagram, 'title'>): string;
	candidates(
		query: string,
		noteTree: readonly NoteSummary[],
		skills: readonly SkillSummary[],
		availability: 'unknown' | 'complete',
		resources: MentionableResources
	): ResourceChip[];
}
export class AgentContextSelectionService implements AgentContextSelection {
	folderNotes(noteTree: readonly NoteSummary[], folderId: NoteId): NoteId[] {
		return folderNoteIds(noteTree, folderId);
	}
	folders(
		noteTree: readonly NoteSummary[],
		folderIds: readonly NoteId[],
		availability: 'unknown' | 'complete'
	): FolderContextResolution {
		return resolveFolderContext(noteTree, folderIds, availability);
	}
	query(prompt: string): string | undefined {
		return mentionQueryOf(prompt);
	}
	diagramName(diagram: Pick<Diagram, 'title'>): string {
		return diagramNameOf(diagram);
	}
	candidates(
		query: string,
		noteTree: readonly NoteSummary[],
		skills: readonly SkillSummary[],
		availability: 'unknown' | 'complete',
		resources: MentionableResources
	): ResourceChip[] {
		return mentionCandidatesFor(query, noteTree, skills, availability, resources);
	}
}
