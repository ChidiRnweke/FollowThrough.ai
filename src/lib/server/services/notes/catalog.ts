import type { ActorContext } from '$lib/models/identity';
import type {
	CreateNoteInput,
	NoteCreationFacts,
	NoteSaveWrite,
	NotePublicationWrite,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteSearchTarget,
	NoteSummary,
	SetNoteSectionNumberingInput
} from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type { Project, ProjectId } from '$lib/models/projects';
import type { Provenance, SourceAnchor } from '$lib/models/provenance';
import type { TrashedNote } from '$lib/models/notes';

import { NOTE_REVISION_HISTORY_LIMIT } from '$lib/models/notes';
import { NotFoundError, OwnershipError, StaleRevisionError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { SourceAnchorRepository } from '$lib/server/repositories/provenance';

const now = (): DateTime => new Date().toISOString() as DateTime;

export interface NoteReader {
	get(noteId: NoteId): Promise<Note>;
}
export interface NoteTreeReader {
	list(projectId?: ProjectId): Promise<readonly NoteSummary[]>;
}
export interface NoteTextSearcher {
	listSearchable(projectId?: ProjectId): Promise<readonly NoteSearchTarget[]>;
}
export interface NoteTrashReader {
	listTrashed(projectId?: ProjectId): Promise<readonly TrashedNote[]>;
}
export interface NoteEditor {
	getForEdit(candidate: Pick<Note, 'id' | 'userId'>): Promise<Note>;
	persistEdit(write: NoteSaveWrite): Promise<Note>;
}
export interface NoteSectionNumberingEditor {
	setSectionNumbering(input: SetNoteSectionNumberingInput): Promise<Note>;
}
export interface NoteRevisionReader {
	latestRevision(noteId: NoteId): Promise<NoteRevision | undefined>;
	/** Every kept snapshot of a note, newest first. */
	revisions(noteId: NoteId): Promise<readonly NoteRevision[]>;
	revisionById(noteId: NoteId, revisionId: NoteRevisionId): Promise<NoteRevision | undefined>;
}
export interface NoteRevisionRecorder {
	record(note: Note, provenance?: Provenance): Promise<void>;
}
export interface NoteAttachmentRestorer {
	restoreAttachments(noteId: NoteId, revisionId: NoteRevisionId): Promise<void>;
}
export interface NotePublisher {
	getForPublication(noteId: NoteId): Promise<Note>;
	persistPublication(write: NotePublicationWrite): Promise<Note>;
}
export interface SourceAnchorRepairer {
	repairForNote(note: Note): Promise<readonly SourceAnchor[]>;
}
export interface NoteCreator {
	creationFacts(input: Pick<CreateNoteInput, 'projectId' | 'parentId'>): Promise<NoteCreationFacts>;
	insert(note: Note): Promise<Note>;
}
export interface NoteTrashOperations {
	archiveFacts(noteId: NoteId): Promise<{ note: Note; hasActiveChildren: boolean }>;
	restoreFacts(
		noteId: NoteId
	): Promise<{ note: Note; parent: Note | null; rootSiblingCount: number }>;
	persistTrash(note: Note): Promise<Note>;
}
export interface NoteDeletion {
	deletionFacts(noteId: NoteId): Promise<{ note: Note; trashed: readonly Note[] }>;
	trashForDeletion(projectId?: Note['projectId']): Promise<readonly Note[]>;
	persistDeletion(
		notes: readonly Pick<Note, 'id' | 'title'>[]
	): Promise<readonly Pick<Note, 'id' | 'title'>[]>;
}

async function requireNote(
	notes: NoteRepository,
	actor: ActorContext,
	noteId: NoteId
): Promise<Note> {
	const note = await notes.findById(noteId);
	if (!note) throw new NotFoundError('Note was not found', { noteId });
	return note;
}
async function lockedNote(
	notes: NoteRepository,
	actor: ActorContext,
	noteId: NoteId
): Promise<Note> {
	const note = await notes.findForWrite(noteId);
	if (!note) throw new NotFoundError('Note was not found', { noteId });
	return note;
}
async function resolveProject(
	projects: ProjectRepository,
	actor: ActorContext,
	projectId: Note['projectId']
): Promise<Project> {
	const project = await projects.findForWrite(projectId);
	if (!project) throw new NotFoundError('Project was not found', { projectId });
	return project;
}
async function lockTreeForNote(
	notes: NoteRepository,
	projects: ProjectRepository,
	actor: ActorContext,
	noteId: NoteId
): Promise<Note> {
	const candidate = await requireNote(notes, actor, noteId);
	await resolveProject(projects, actor, candidate.projectId);
	return lockedNote(notes, actor, noteId);
}

export class NoteReadingService
	implements NoteReader, NoteTreeReader, NoteTextSearcher, NoteTrashReader
{
	constructor(
		private readonly notes: NoteRepository,
		private readonly projects: ProjectRepository
	) {}
	async get(noteId: NoteId): Promise<Note> {
		const note = await this.notes.findById(noteId);
		if (!note) throw new NotFoundError('Note was not found', { noteId });
		return note;
	}
	async list(projectId?: Note['projectId']): Promise<readonly NoteSummary[]> {
		const notes = await this.notes.listActive(projectId);
		return notes.filter((note) => note.kind !== 'skill');
	}
	listSearchable(projectId?: Note['projectId']): Promise<readonly NoteSearchTarget[]> {
		return this.notes.listSearchable(projectId);
	}
	async listTrashed(projectId?: Note['projectId']): Promise<readonly TrashedNote[]> {
		const [trashed, projects] = await Promise.all([
			this.notes.listTrashed(projectId),
			this.projects.listActive()
		]);
		const names = new Map(projects.map((project) => [project.id, project.name]));
		// Projected field by field rather than spread: a trash row needs none of the
		// document, and a list of them would otherwise carry every note's full body.
		return trashed
			.filter((note) => note.kind !== 'skill')
			.map((note) => ({
				id: note.id,
				projectId: note.projectId,
				parentId: note.parentId,
				kind: note.kind,
				position: note.position,
				title: note.title,
				isPinned: note.isPinned,
				currentRevision: note.currentRevision,
				createdAt: note.createdAt,
				updatedAt: note.updatedAt,
				archivedAt: note.archivedAt as DateTime,
				projectName: names.get(note.projectId) ?? 'Unknown project'
			}));
	}
}

export class NoteEditingService implements NoteEditor, NoteSectionNumberingEditor {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository
	) {}
	async getForEdit(candidate: Pick<Note, 'id' | 'userId'>): Promise<Note> {
		if (candidate.userId !== this.actor.userId)
			throw new OwnershipError('Cannot save another user’s note');
		return lockedNote(this.notes, this.actor, candidate.id);
	}
	async persistEdit(write: NoteSaveWrite): Promise<Note> {
		const updated = await this.notes.updateIfRevision(write.note, write.expectedRevision);
		if (!updated) throw new StaleRevisionError('The note changed while it was being saved');
		return updated;
	}
	async setSectionNumbering(input: SetNoteSectionNumberingInput): Promise<Note> {
		await requireNote(this.notes, this.actor, input.noteId);
		return this.notes.setSectionNumbering(input.noteId, input.enabled ?? null);
	}
}

export class NoteLifecycleService implements NoteTrashOperations, NoteDeletion {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository,
		private readonly projects: ProjectRepository
	) {}
	async archiveFacts(noteId: NoteId): Promise<{ note: Note; hasActiveChildren: boolean }> {
		const note = await lockTreeForNote(this.notes, this.projects, this.actor, noteId);
		const active = note.kind === 'folder' ? await this.notes.listActive(note.projectId) : [];
		return { note, hasActiveChildren: active.some((entry) => entry.parentId === noteId) };
	}
	async restoreFacts(
		noteId: NoteId
	): Promise<{ note: Note; parent: Note | null; rootSiblingCount: number }> {
		const note = await lockTreeForNote(this.notes, this.projects, this.actor, noteId);
		const parent = note.parentId ? await this.notes.findForWrite(note.parentId) : undefined;
		return {
			note,
			parent: parent ?? null,
			rootSiblingCount: await this.notes.countSiblings(note.projectId)
		};
	}
	persistTrash(note: Note): Promise<Note> {
		return this.notes.updateTrash(note);
	}
	async deletionFacts(noteId: NoteId): Promise<{ note: Note; trashed: readonly Note[] }> {
		const note = await lockTreeForNote(this.notes, this.projects, this.actor, noteId);
		return { note, trashed: await this.notes.listTrashed(note.projectId) };
	}
	async trashForDeletion(projectId?: Note['projectId']): Promise<readonly Note[]> {
		const projectIds = projectId
			? [projectId]
			: (await this.projects.listActive()).map((project) => project.id).sort();
		const locked = new Set<Note['projectId']>();
		for (const id of projectIds) {
			const project = await this.projects.findForWrite(id);
			if (project) locked.add(project.id);
		}
		if (locked.size === 0) return [];
		// Preserve trash ordering while excluding projects created after the locked inventory.
		return (await this.notes.listTrashed(projectId)).filter((note) => locked.has(note.projectId));
	}
	async persistDeletion(
		notes: readonly Pick<Note, 'id' | 'title'>[]
	): Promise<readonly Pick<Note, 'id' | 'title'>[]> {
		const deleted: Pick<Note, 'id' | 'title'>[] = [];
		// The resolved order is children first; an unexpected missing/restored row aborts the batch.
		for (const note of notes) {
			const result = await this.notes.deleteTrashed(note.id);
			if (!result) throw new StaleRevisionError('The note left the trash before deletion');
			deleted.push(result);
		}
		return deleted;
	}
}

export class NoteRevisionReadingService implements NoteRevisionReader {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository
	) {}
	async latestRevision(noteId: NoteId): Promise<NoteRevision | undefined> {
		await requireNote(this.notes, this.actor, noteId);
		const revisions = await this.notes.listRevisions(noteId);
		return revisions.length > 0 ? revisions[revisions.length - 1] : undefined;
	}
	async revisions(noteId: NoteId): Promise<readonly NoteRevision[]> {
		await requireNote(this.notes, this.actor, noteId);
		// The repository orders ascending; history reads newest first.
		return [...(await this.notes.listRevisions(noteId))].reverse();
	}
	async revisionById(
		noteId: NoteId,
		revisionId: NoteRevisionId
	): Promise<NoteRevision | undefined> {
		await requireNote(this.notes, this.actor, noteId);
		const revisions = await this.notes.listRevisions(noteId);
		return revisions.find((revision) => revision.id === revisionId);
	}
}

export class NoteRevisionWritingService implements NoteRevisionRecorder, NoteAttachmentRestorer {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository
	) {}
	async record(note: Note, provenance?: Provenance): Promise<void> {
		await requireNote(this.notes, this.actor, note.id);
		const revision: NoteRevision = {
			id: crypto.randomUUID() as NoteRevisionId,
			noteId: note.id,
			revision: note.currentRevision,
			title: note.title,
			document: note.document,
			plainText: note.plainText,
			...(provenance ? { provenanceId: provenance.id } : {}),
			createdAt: now()
		};
		await this.notes.insertRevision(revision);
		await this.notes.pruneRevisions(note.id, NOTE_REVISION_HISTORY_LIMIT);
	}
	async restoreAttachments(noteId: NoteId, revisionId: NoteRevisionId): Promise<void> {
		await requireNote(this.notes, this.actor, noteId);
		await this.notes.restoreAttachmentSnapshot(revisionId, noteId);
	}
}

export class NotePublicationService implements NotePublisher {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository
	) {}
	getForPublication(noteId: NoteId): Promise<Note> {
		return lockedNote(this.notes, this.actor, noteId);
	}
	async persistPublication(write: NotePublicationWrite): Promise<Note> {
		const note = await this.notes.updatePublication(write);
		if (!note) throw new StaleRevisionError('The note changed while it was being published');
		return note;
	}
}

export class NoteAnchorRepairService implements SourceAnchorRepairer {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository
	) {}
	async repairForNote(note: Note): Promise<readonly SourceAnchor[]> {
		await requireNote(this.notes, this.actor, note.id);
		const existing = await this.anchors.listForNote(note.id);
		const repaired: SourceAnchor[] = [];
		for (const anchor of existing) {
			const first = note.plainText.indexOf(anchor.quote);
			if (first < 0 || first !== note.plainText.lastIndexOf(anchor.quote)) continue;
			repaired.push(
				await this.anchors.update({
					...anchor,
					from: first,
					to: first + anchor.quote.length,
					revision: note.currentRevision
				})
			);
		}
		return repaired;
	}
}

export class NoteCreationService implements NoteCreator {
	constructor(
		private readonly actor: ActorContext,
		private readonly notes: NoteRepository,
		private readonly projects: ProjectRepository
	) {}
	async creationFacts(
		input: Pick<CreateNoteInput, 'projectId' | 'parentId'>
	): Promise<NoteCreationFacts> {
		const project = await resolveProject(this.projects, this.actor, input.projectId);
		return {
			project,
			parent: input.parentId ? ((await this.notes.findById(input.parentId)) ?? null) : null,
			siblingCount: await this.notes.countSiblings(project.id, input.parentId)
		};
	}
	async insert(note: Note): Promise<Note> {
		if (note.userId !== this.actor.userId)
			throw new OwnershipError('Cannot create another user’s note');
		return this.notes.insert(note);
	}
}
