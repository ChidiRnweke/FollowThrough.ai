import type { ActorContext, UserId } from '$lib/models/identity';
import type {
	Note,
	NoteId,
	NoteRevision,
	NoteSearchTarget,
	NotePublicationWrite,
	NoteBuiltInRepairWrite
} from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SourceAnchor, SourceAnchorId } from '$lib/models/provenance';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { SourceAnchorRepository } from '$lib/server/repositories/provenance';
import { NotFoundError } from '$lib/errors';

export class InMemoryNoteRepository implements NoteRepository {
	constructor(private readonly actor: ActorContext) {}
	insertFailures = new Set<string>();
	saveFailures = new Set<string>();
	deleteFailures = new Set<NoteId>();
	snapshot(): () => void {
		const notes = structuredClone(this.notes);
		const revisions = structuredClone(this.revisions);
		const restoredAttachmentSnapshots = [...this.restoredAttachmentSnapshots];
		return () => {
			this.notes = notes;
			this.revisions = revisions;
			this.restoredAttachmentSnapshots = restoredAttachmentSnapshots;
		};
	}
	notes: Note[] = [];
	revisions: NoteRevision[] = [];
	restoredAttachmentSnapshots: NoteRevision['id'][] = [];
	failNextConditionalUpdate = false;
	private nextWriteRead: { started(): void; ready: Promise<void> } | null = null;

	pauseNextWriteRead(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.nextWriteRead = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}

	async findById(id: NoteId): Promise<Note | undefined> {
		return this.notes.find((note) => note.id === id && note.userId === this.actor.userId);
	}

	async findForWrite(id: NoteId): Promise<Note | undefined> {
		const paused = this.nextWriteRead;
		this.nextWriteRead = null;
		if (paused) {
			paused.started();
			await paused.ready;
		}
		return this.findById(id);
	}

	async updateTrash(note: Note): Promise<Note> {
		const current = await this.findById(note.id);
		if (!current) throw new NotFoundError('Note was not found');
		const { archivedAt, parentId, ...rest } = current;
		void archivedAt;
		void parentId;
		const updated: Note = {
			...rest,
			...(note.archivedAt ? { archivedAt: note.archivedAt } : {}),
			...(note.parentId ? { parentId: note.parentId } : {}),
			position: note.position,
			updatedAt: note.updatedAt
		};
		this.notes = this.notes.map((candidate) => (candidate.id === note.id ? updated : candidate));
		return updated;
	}

	findBuiltInForWrite(key: string): Promise<Note | undefined> {
		return this.findByBuiltInKey(key);
	}

	async repairBuiltIn(write: NoteBuiltInRepairWrite): Promise<Note | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === write.noteId &&
				note.userId === this.actor.userId &&
				note.builtInKey === write.builtInKey
		);
		if (!current) return undefined;
		const repaired: Note = {
			...current,
			projectId: write.projectId,
			parentId: write.parentId,
			position: write.position,
			kind: write.kind,
			archivedAt: undefined,
			updatedAt: write.updatedAt
		};
		this.notes = this.notes.map((note) => (note.id === current.id ? repaired : note));
		return repaired;
	}

	async findByBuiltInKey(key: string): Promise<Note | undefined> {
		return this.notes.find((note) => note.userId === this.actor.userId && note.builtInKey === key);
	}

	async listActive(projectId?: ProjectId): Promise<readonly Note[]> {
		return this.notes.filter(
			(note) =>
				note.userId === this.actor.userId &&
				!note.archivedAt &&
				(projectId === undefined || note.projectId === projectId)
		);
	}

	async listSearchable(projectId?: ProjectId): Promise<readonly NoteSearchTarget[]> {
		return this.notes
			.filter(
				(note) =>
					note.userId === this.actor.userId &&
					!note.archivedAt &&
					(projectId === undefined || note.projectId === projectId)
			)
			.map((note) => ({
				id: note.id,
				projectId: note.projectId,
				title: note.title,
				plainText: note.plainText
			}));
	}

	async listTrashed(projectId?: ProjectId): Promise<readonly Note[]> {
		return this.notes
			.filter(
				(note) =>
					note.userId === this.actor.userId &&
					note.archivedAt &&
					(projectId === undefined || note.projectId === projectId)
			)
			.sort((left, right) => (right.archivedAt ?? '').localeCompare(left.archivedAt ?? ''));
	}

	async countSiblings(projectId: ProjectId, parentId?: NoteId): Promise<number> {
		return this.notes.filter(
			(note) =>
				note.userId === this.actor.userId &&
				note.projectId === projectId &&
				note.parentId === parentId
		).length;
	}

	async insert(note: Note): Promise<Note> {
		if (this.insertFailures.has(note.title)) throw new Error('Note could not be stored');
		this.notes.push(note);
		return note;
	}

	async updatePublication(write: NotePublicationWrite): Promise<Note | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === write.noteId &&
				note.userId === this.actor.userId &&
				note.currentRevision === write.expectedRevision &&
				!note.archivedAt
		);
		if (!current) return undefined;
		const published = {
			...current,
			publishedRevision: write.publishedRevision,
			publishedAt: write.publishedAt,
			updatedAt: write.updatedAt
		};
		this.notes = this.notes.map((note) => (note.id === write.noteId ? published : note));
		return published;
	}

	async updateIfRevision(note: Note, expectedRevision: number): Promise<Note | undefined> {
		if (this.saveFailures.has(note.title)) throw new Error('Note body could not be stored');
		if (this.failNextConditionalUpdate) {
			this.failNextConditionalUpdate = false;
			return undefined;
		}
		const current = this.notes.find(
			(candidate) =>
				candidate.id === note.id &&
				candidate.userId === this.actor.userId &&
				!candidate.archivedAt &&
				candidate.currentRevision === expectedRevision
		);
		if (!current) return undefined;
		this.notes = this.notes.map((candidate) => (candidate.id === note.id ? note : candidate));
		return note;
	}

	async deleteTrashed(id: NoteId): Promise<Pick<Note, 'id' | 'title'> | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === id &&
				note.userId === this.actor.userId &&
				note.archivedAt &&
				note.kind !== 'skill'
		);
		if (!current) return undefined;
		if (this.deleteFailures.has(id)) throw new Error('Note could not be deleted');
		this.notes = this.notes
			.filter((note) => note.id !== id)
			.map((note) => {
				if (note.parentId !== id) return note;
				const { parentId, ...detached } = note;
				void parentId;
				return detached;
			});
		this.revisions = this.revisions.filter((revision) => revision.noteId !== id);
		return { id: current.id, title: current.title };
	}

	async setSectionNumbering(id: NoteId, enabled: boolean | null): Promise<Note> {
		const current = this.notes.find((note) => note.id === id && note.userId === this.actor.userId);
		if (!current) throw new NotFoundError('Note was not found');
		const updated: Note = { ...current, sectionNumbering: enabled ?? undefined };
		this.notes = this.notes.map((note) => (note.id === id ? updated : note));
		return updated;
	}

	async insertRevision(revision: NoteRevision): Promise<NoteRevision> {
		if (
			!this.revisions.some(
				(candidate) =>
					candidate.noteId === revision.noteId && candidate.revision === revision.revision
			)
		)
			this.revisions.push(revision);
		return revision;
	}

	async listRevisions(noteId: NoteId): Promise<readonly NoteRevision[]> {
		return this.revisions.filter((revision) => revision.noteId === noteId);
	}

	async pruneRevisions(noteId: NoteId, keepNewest: number): Promise<void> {
		const kept = new Set(
			this.revisions
				.filter((revision) => revision.noteId === noteId)
				.sort((left, right) => right.revision - left.revision)
				.slice(0, keepNewest)
				.map((revision) => revision.id)
		);
		this.revisions = this.revisions.filter(
			(revision) => revision.noteId !== noteId || kept.has(revision.id)
		);
	}

	async restoreAttachmentSnapshot(_revisionId: NoteRevision['id'], _noteId: NoteId): Promise<void> {
		void _noteId;
		this.restoredAttachmentSnapshots.push(_revisionId);
	}
}

export class InMemoryAnchorRepository implements SourceAnchorRepository {
	constructor(private readonly actor: ActorContext) {}
	snapshot(): () => void {
		const anchors = [...this.anchors];
		const ownerIds = new Map(this.ownerIds);
		return () => {
			this.anchors = anchors;
			this.ownerIds = ownerIds;
		};
	}

	anchors: SourceAnchor[] = [];
	ownerIds = new Map<SourceAnchorId, UserId>();

	async findById(id: SourceAnchorId): Promise<SourceAnchor | undefined> {
		const ownerId = this.ownerIds.get(id);
		if (ownerId && ownerId !== this.actor.userId) return undefined;
		return this.anchors.find((anchor) => anchor.id === id);
	}

	async listForNote(noteId: NoteId): Promise<readonly SourceAnchor[]> {
		return this.anchors.filter((anchor) => anchor.noteId === noteId);
	}

	async insert(anchor: SourceAnchor): Promise<SourceAnchor> {
		this.anchors.push(anchor);
		return anchor;
	}

	async update(anchor: SourceAnchor): Promise<SourceAnchor> {
		this.anchors = this.anchors.map((candidate) =>
			candidate.id === anchor.id ? anchor : candidate
		);
		return anchor;
	}
}
