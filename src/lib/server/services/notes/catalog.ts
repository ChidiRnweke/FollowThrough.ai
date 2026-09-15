import { decideRevisionWrite } from '$lib/models/revisions';
import {
	sameNoteDraft,
	decideSelection,
	decideNoteCreation,
	decideNoteArchive,
	decideNoteRestore
} from '$lib/models/notes';
import type { ActorContext } from '$lib/models/identity';
import type {
	CreateNoteInput,
	Note,
	NoteId,
	NoteRevision,
	NoteRevisionId,
	NoteSearchTarget,
	NoteSummary,
	SetNoteSectionNumberingInput,
	TextSelection
} from '$lib/models/notes';
import type { DateTime } from '$lib/models/workspace';
import type { Project } from '$lib/models/projects';
import type { Provenance, SourceAnchor, SourceAnchorId } from '$lib/models/provenance';
import type { TrashedNote } from '$lib/models/notes';

import { NOTE_REVISION_HISTORY_LIMIT, findProseMirrorDocumentIssue } from '$lib/models/notes';
import { NotFoundError, OwnershipError, StaleRevisionError, ValidationError } from '$lib/errors';
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

	async create(
		actor: ActorContext,
		input: CreateNoteInput & { documentKind?: 'note' | 'skill' }
	): Promise<Note>;
	async create(actor: ActorContext, input: TextSelection): Promise<SourceAnchor>;
	async create(
		actor: ActorContext,
		input: (CreateNoteInput & { documentKind?: 'note' | 'skill' }) | TextSelection
	): Promise<Note | SourceAnchor> {
		return 'text' in input ? this.createAnchor(actor, input) : this.createNote(actor, input);
	}

	async save(actor: ActorContext, candidate: Note): Promise<Note> {
		if (candidate.userId !== actor.userId)
			throw new OwnershipError('Cannot save another user’s note');
		const current = await this.get(actor, candidate.id);
		if (!candidate.title.trim()) throw new ValidationError('Note title is required');
		const documentIssue = findProseMirrorDocumentIssue(candidate.document);
		if (documentIssue)
			throw new ValidationError(
				`Invalid note document at ${documentIssue.path}: ${documentIssue.message}`
			);
		if (current.archivedAt) throw new ValidationError('Archived notes cannot be edited');
		if (candidate.projectId !== current.projectId || candidate.kind !== current.kind)
			throw new ValidationError('A save cannot move a note between projects or change its kind');
		if (
			candidate.kind === 'folder' &&
			(candidate.plainText.trim() || candidate.document.content?.length)
		)
			throw new ValidationError('Folders cannot contain authored document content');
		const decision = decideRevisionWrite(
			{
				kind: 'save',
				baseMatches: candidate.currentRevision === current.currentRevision,
				contentChanged: !sameNoteDraft(current, candidate)
			},
			current,
			{ acceptUnchangedRetry: false }
		);
		if (decision.kind === 'conflict')
			throw new StaleRevisionError('The note has changed since it was loaded');
		if (decision.kind === 'unchanged') return current;
		const updated = await this.notes.updateIfRevision(
			actor,
			{
				...candidate,
				title: candidate.title.trim(),
				currentRevision: decision.currentRevision,
				updatedAt: now()
			},
			current.currentRevision
		);
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

	async archive(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		const active = note.kind === 'folder' ? await this.notes.listActive(actor, note.projectId) : [];
		const decision = decideNoteArchive(
			note,
			active.some((entry) => entry.parentId === noteId)
		);
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		return this.notes.update(actor, { ...note, archivedAt: now(), updatedAt: now() });
	}

	async restore(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		const parent = note.parentId ? await this.notes.findById(actor, note.parentId) : undefined;
		const decision = decideNoteRestore(note, parent ?? null);
		if (decision.kind === 'invalid') throw new ValidationError(decision.message);
		const { archivedAt, ...rest } = note;
		void archivedAt;
		if (decision.placement === 'keep')
			return this.notes.update(actor, { ...rest, updatedAt: now() });
		const { parentId, ...detached } = rest;
		void parentId;
		return this.notes.update(actor, {
			...detached,
			position: await this.notes.countSiblings(actor, note.projectId, undefined),
			updatedAt: now()
		});
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

	async deleteForever(
		actor: ActorContext,
		noteId: NoteId
	): Promise<readonly Pick<Note, 'id' | 'title'>[]> {
		const note = await this.get(actor, noteId);
		if (!note.archivedAt)
			throw new ValidationError('Only notes in the trash can be deleted permanently');
		if (note.kind === 'skill')
			throw new ValidationError('Skill notes are not deleted from the trash');
		const trashed = await this.notes.listTrashed(actor, note.projectId);
		const deleted = await this.purge(actor, this.descendants(trashed, [noteId]));
		return this.inDeletionOrder(trashed, deleted);
	}

	async emptyTrash(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<readonly Pick<Note, 'id' | 'title'>[]> {
		const trashed = await this.notes.listTrashed(actor, projectId);
		// Skills are filtered out of the trash listing, so they are not something the user
		// can see they are about to destroy. Emptying the trash empties what is on screen.
		const visible = trashed.filter((note) => note.kind !== 'skill');
		const deleted = await this.purge(
			actor,
			this.descendants(
				trashed,
				visible.map((note) => note.id)
			)
		);
		return this.inDeletionOrder(trashed, deleted);
	}

	/**
	 * The trashed notes reachable from `roots` through `parentId`, deepest first. A trashed
	 * folder is deleted with its contents: `notes.parent_id` is `set null` on delete, so
	 * leaving them behind would silently move them to the project root instead.
	 */
	private descendants(trashed: readonly Note[], roots: readonly NoteId[]): readonly NoteId[] {
		const visible = trashed.filter((note) => note.kind !== 'skill');
		const ordered: NoteId[] = [];
		const seen = new Set<NoteId>();
		const walk = (id: NoteId): void => {
			if (seen.has(id)) return;
			seen.add(id);
			for (const child of visible.filter((note) => note.parentId === id)) walk(child.id);
			ordered.push(id);
		};
		for (const root of roots) walk(root);
		return ordered;
	}

	private async purge(actor: ActorContext, ids: readonly NoteId[]): Promise<readonly NoteId[]> {
		// Sequential rather than concurrent: the ids arrive children-first so that a folder
		// is never removed while something still points at it.
		for (const id of ids) await this.notes.delete(actor, id);
		return ids;
	}

	/**
	 * Report the deleted rows in the order they were purged — children before the folder
	 * that holds them — not in trash-listing order.
	 */
	private inDeletionOrder(
		trashed: readonly Note[],
		deleted: readonly NoteId[]
	): readonly Pick<Note, 'id' | 'title'>[] {
		const byId = new Map(trashed.map((row) => [row.id, row]));
		return deleted.flatMap((id) => {
			const row = byId.get(id);
			return row === undefined ? [] : [{ id, title: row.title }];
		});
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

	async markPublished(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		const ts = now();
		return this.notes.update(actor, {
			...note,
			publishedRevision: note.currentRevision,
			publishedAt: ts,
			updatedAt: ts
		});
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

	private async createNote(
		actor: ActorContext,
		input: CreateNoteInput & { documentKind?: 'note' | 'skill' }
	): Promise<Note> {
		const project = await this.resolveProject(actor, input.projectId);
		const parent = input.parentId ? await this.notes.findById(actor, input.parentId) : undefined;
		const decision = decideNoteCreation(
			{
				...input,
				id: input.id ?? (crypto.randomUUID() as NoteId),
				kind: input.documentKind ?? 'note'
			},
			{
				project,
				parent: parent ?? null,
				siblingCount: await this.notes.countSiblings(actor, project.id, input.parentId)
			},
			now()
		);
		if (decision.kind === 'invalid') {
			if (decision.code === 'NOT_FOUND') throw new NotFoundError(decision.message);
			throw new ValidationError(decision.message);
		}
		return this.notes.insert(actor, decision.note);
	}

	private async createAnchor(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor> {
		const note = await this.get(actor, selection.noteId);
		const decision = decideSelection(selection, note);
		if (decision.kind === 'invalid') {
			if (decision.code === 'STALE_REVISION') throw new StaleRevisionError(decision.message);
			throw new ValidationError(decision.message);
		}
		return this.anchors.insert(actor, {
			id: crypto.randomUUID() as SourceAnchorId,
			noteId: note.id,
			from: selection.from,
			to: selection.to,
			quote: selection.text,
			revision: selection.revision,
			createdAt: now()
		});
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
		const project = await this.projects.findById(actor, projectId);
		if (!project) throw new NotFoundError('Project was not found', { projectId });
		return project;
	}
}
