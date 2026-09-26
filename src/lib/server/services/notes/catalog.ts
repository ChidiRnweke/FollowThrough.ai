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
import type { Project } from '$lib/models/projects';
import type { Provenance, SourceAnchor } from '$lib/models/provenance';
import type { TrashedNote } from '$lib/models/notes';

import { NOTE_REVISION_HISTORY_LIMIT } from '$lib/models/notes';
import { NotFoundError, OwnershipError, StaleRevisionError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { ProjectRepository } from '$lib/server/repositories/projects/projects';
import type { SourceAnchorRepository } from '$lib/server/repositories/provenance';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class NoteCatalog {
	constructor(
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly projects: ProjectRepository
	) {}

	async get(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.notes.findById(actor, noteId);
		if (!note) throw new NotFoundError('Note was not found', { noteId });
		return note;
	}

	async list(actor: ActorContext, projectId?: Note['projectId']): Promise<readonly NoteSummary[]> {
		const notes = await this.notes.listActive(actor, projectId);
		return notes.filter((note) => note.kind !== 'skill');
	}

	/**
	 * The searchable projection of the active notes, skills included: global text search
	 * covers everything the user can open, unlike the tree listing above.
	 */
	listSearchable(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<readonly NoteSearchTarget[]> {
		return this.notes.listSearchable(actor, projectId);
	}

	async getForEdit(actor: ActorContext, candidate: Pick<Note, 'id' | 'userId'>): Promise<Note> {
		if (candidate.userId !== actor.userId)
			throw new OwnershipError('Cannot save another user’s note');
		return this.lockedNote(actor, candidate.id);
	}

	async persistEdit(actor: ActorContext, write: NoteSaveWrite): Promise<Note> {
		const updated = await this.notes.updateIfRevision(actor, write.note, write.expectedRevision);
		if (!updated) throw new StaleRevisionError('The note changed while it was being saved');
		return updated;
	}

	async setSectionNumbering(
		actor: ActorContext,
		input: SetNoteSectionNumberingInput
	): Promise<Note> {
		await this.get(actor, input.noteId);
		return this.notes.setSectionNumbering(actor, input.noteId, input.enabled ?? null);
	}

	private async lockedNote(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.notes.findForWrite(actor, noteId);
		if (!note) throw new NotFoundError('Note was not found', { noteId });
		return note;
	}

	private async lockTreeForNote(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const candidate = await this.get(actor, noteId);
		await this.resolveProject(actor, candidate.projectId);
		return this.lockedNote(actor, noteId);
	}

	async archiveFacts(
		actor: ActorContext,
		noteId: NoteId
	): Promise<{ note: Note; hasActiveChildren: boolean }> {
		const note = await this.lockTreeForNote(actor, noteId);
		const active = note.kind === 'folder' ? await this.notes.listActive(actor, note.projectId) : [];
		return { note, hasActiveChildren: active.some((entry) => entry.parentId === noteId) };
	}

	async restoreFacts(
		actor: ActorContext,
		noteId: NoteId
	): Promise<{ note: Note; parent: Note | null; rootSiblingCount: number }> {
		const note = await this.lockTreeForNote(actor, noteId);
		const parent = note.parentId ? await this.notes.findForWrite(actor, note.parentId) : undefined;
		return {
			note,
			parent: parent ?? null,
			rootSiblingCount: await this.notes.countSiblings(actor, note.projectId)
		};
	}

	persistTrash(actor: ActorContext, note: Note): Promise<Note> {
		return this.notes.updateTrash(actor, note);
	}

	async listTrashed(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<readonly TrashedNote[]> {
		const [trashed, projects] = await Promise.all([
			this.notes.listTrashed(actor, projectId),
			this.projects.listActive(actor)
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

	async deletionFacts(
		actor: ActorContext,
		noteId: NoteId
	): Promise<{ note: Note; trashed: readonly Note[] }> {
		const note = await this.lockTreeForNote(actor, noteId);
		return { note, trashed: await this.notes.listTrashed(actor, note.projectId) };
	}

	async trashForDeletion(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<readonly Note[]> {
		const projectIds = projectId
			? [projectId]
			: (await this.projects.listActive(actor)).map((project) => project.id).sort();
		const locked = new Set<Note['projectId']>();
		for (const id of projectIds) {
			const project = await this.projects.findForWrite(actor, id);
			if (project) locked.add(project.id);
		}
		if (locked.size === 0) return [];
		// Preserve trash ordering while excluding projects created after the locked inventory.
		return (await this.notes.listTrashed(actor, projectId)).filter((note) =>
			locked.has(note.projectId)
		);
	}

	async persistDeletion(
		actor: ActorContext,
		notes: readonly Pick<Note, 'id' | 'title'>[]
	): Promise<readonly Pick<Note, 'id' | 'title'>[]> {
		const deleted: Pick<Note, 'id' | 'title'>[] = [];
		// The resolved order is children first; an unexpected missing/restored row aborts the batch.
		for (const note of notes) {
			const result = await this.notes.deleteTrashed(actor, note.id);
			if (!result) throw new StaleRevisionError('The note left the trash before deletion');
			deleted.push(result);
		}
		return deleted;
	}

	async record(actor: ActorContext, note: Note, provenance?: Provenance): Promise<void> {
		await this.get(actor, note.id);
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
		await this.notes.insertRevision(actor, revision);
		await this.notes.pruneRevisions(actor, note.id, NOTE_REVISION_HISTORY_LIMIT);
	}

	async latestRevision(actor: ActorContext, noteId: NoteId): Promise<NoteRevision | undefined> {
		await this.get(actor, noteId);
		const revisions = await this.notes.listRevisions(actor, noteId);
		return revisions.length > 0 ? revisions[revisions.length - 1] : undefined;
	}

	async revisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]> {
		await this.get(actor, noteId);
		// The repository orders ascending; history reads newest first.
		return [...(await this.notes.listRevisions(actor, noteId))].reverse();
	}

	async revisionById(
		actor: ActorContext,
		noteId: NoteId,
		revisionId: NoteRevisionId
	): Promise<NoteRevision | undefined> {
		await this.get(actor, noteId);
		const revisions = await this.notes.listRevisions(actor, noteId);
		return revisions.find((revision) => revision.id === revisionId);
	}

	/**
	 * Point the note's attachments back at the versions a snapshot was taken with, so a
	 * rolled-back document does not render against files that moved on without it.
	 */
	async restoreAttachments(
		actor: ActorContext,
		noteId: NoteId,
		revisionId: NoteRevisionId
	): Promise<void> {
		await this.get(actor, noteId);
		await this.notes.restoreAttachmentSnapshot(actor, revisionId, noteId);
	}

	getForPublication(actor: ActorContext, noteId: NoteId): Promise<Note> {
		return this.lockedNote(actor, noteId);
	}

	async persistPublication(actor: ActorContext, write: NotePublicationWrite): Promise<Note> {
		const note = await this.notes.updatePublication(actor, write);
		if (!note) throw new StaleRevisionError('The note changed while it was being published');
		return note;
	}

	async repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]> {
		await this.get(actor, note.id);
		const existing = await this.anchors.listForNote(actor, note.id);
		const repaired: SourceAnchor[] = [];
		for (const anchor of existing) {
			const first = note.plainText.indexOf(anchor.quote);
			if (first < 0 || first !== note.plainText.lastIndexOf(anchor.quote)) continue;
			repaired.push(
				await this.anchors.update(actor, {
					...anchor,
					from: first,
					to: first + anchor.quote.length,
					revision: note.currentRevision
				})
			);
		}
		return repaired;
	}

	async creationFacts(
		actor: ActorContext,
		input: Pick<CreateNoteInput, 'projectId' | 'parentId'>
	): Promise<NoteCreationFacts> {
		const project = await this.resolveProject(actor, input.projectId);
		return {
			project,
			parent: input.parentId ? ((await this.notes.findById(actor, input.parentId)) ?? null) : null,
			siblingCount: await this.notes.countSiblings(actor, project.id, input.parentId)
		};
	}

	async insert(actor: ActorContext, note: Note): Promise<Note> {
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot create another user’s note');
		return this.notes.insert(actor, note);
	}

	/**
	 * The project a note is created in, which the caller must have decided.
	 *
	 * It used to answer a missing `projectId` by taking the first active project
	 * and, failing that, creating one called "General". Neither is a decision
	 * anyone made: the first active project is an accident of sort order, and
	 * writing a note is no reason to bring a project into existence. A caller that
	 * does not know where the note goes has a missing fact, and a default turns
	 * that into a note filed somewhere nobody chose.
	 *
	 * So it fails rather than choosing. Giving the caller what it needs to choose
	 * is a separate job and belongs at the boundary that knows who is asking:
	 * `requireProject` in `agent-tool-factory.ts` answers a missing project by
	 * naming every project the actor has. A service throwing "required" into a
	 * conversation would leave the model doing exactly the guessing this removes.
	 */
	private async resolveProject(
		actor: ActorContext,
		projectId: Note['projectId']
	): Promise<Project> {
		const project = await this.projects.findForWrite(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found', { projectId });
		return project;
	}
}
