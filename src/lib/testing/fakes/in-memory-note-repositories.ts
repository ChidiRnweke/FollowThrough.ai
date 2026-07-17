import type {
	ActorContext,
	Note,
	NoteId,
	NoteRevision,
	ProjectId,
	SourceAnchor,
	SourceAnchorId,
	UserId
} from '$lib/models';
import type { NoteRepository, SourceAnchorRepository } from '$lib/repositories';

export class InMemoryNoteRepository implements NoteRepository {
	notes: Note[] = [];
	revisions: NoteRevision[] = [];
	restoredAttachmentSnapshots: NoteRevision['id'][] = [];
	failNextConditionalUpdate = false;

	async findById(actor: ActorContext, id: NoteId): Promise<Note | undefined> {
		return this.notes.find((note) => note.id === id && note.userId === actor.userId);
	}

	async findByBuiltInKey(actor: ActorContext, key: string): Promise<Note | undefined> {
		return this.notes.find((note) => note.userId === actor.userId && note.builtInKey === key);
	}

	async listActive(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]> {
		return this.notes.filter(
			(note) =>
				note.userId === actor.userId &&
				!note.archivedAt &&
				(projectId === undefined || note.projectId === projectId)
		);
	}

	async countSiblings(
		actor: ActorContext,
		projectId: ProjectId,
		parentId?: NoteId
	): Promise<number> {
		return this.notes.filter(
			(note) =>
				note.userId === actor.userId && note.projectId === projectId && note.parentId === parentId
		).length;
	}

	async insert(_actor: ActorContext, note: Note): Promise<Note> {
		void _actor;
		this.notes.push(note);
		return note;
	}

	async update(_actor: ActorContext, note: Note): Promise<Note> {
		void _actor;
		this.notes = this.notes.map((candidate) => (candidate.id === note.id ? note : candidate));
		return note;
	}

	async updateIfRevision(
		actor: ActorContext,
		note: Note,
		expectedRevision: number
	): Promise<Note | undefined> {
		if (this.failNextConditionalUpdate) {
			this.failNextConditionalUpdate = false;
			return undefined;
		}
		const current = this.notes.find(
			(candidate) =>
				candidate.id === note.id &&
				candidate.userId === actor.userId &&
				!candidate.archivedAt &&
				candidate.currentRevision === expectedRevision
		);
		if (!current) return undefined;
		this.notes = this.notes.map((candidate) => (candidate.id === note.id ? note : candidate));
		return note;
	}

	async delete(_actor: ActorContext, id: NoteId): Promise<void> {
		void _actor;
		this.notes = this.notes.filter((note) => note.id !== id);
	}

	async insertRevision(_actor: ActorContext, revision: NoteRevision): Promise<NoteRevision> {
		void _actor;
		if (
			!this.revisions.some(
				(candidate) =>
					candidate.noteId === revision.noteId && candidate.revision === revision.revision
			)
		)
			this.revisions.push(revision);
		return revision;
	}

	async listRevisions(_actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]> {
		void _actor;
		return this.revisions.filter((revision) => revision.noteId === noteId);
	}

	async restoreAttachmentSnapshot(
		_actor: ActorContext,
		_revisionId: NoteRevision['id'],
		_noteId: NoteId
	): Promise<void> {
		void _actor;
		void _noteId;
		this.restoredAttachmentSnapshots.push(_revisionId);
	}
}

export class InMemoryAnchorRepository implements SourceAnchorRepository {
	anchors: SourceAnchor[] = [];
	ownerIds = new Map<SourceAnchorId, UserId>();

	async findById(actor: ActorContext, id: SourceAnchorId): Promise<SourceAnchor | undefined> {
		const ownerId = this.ownerIds.get(id);
		if (ownerId && ownerId !== actor.userId) return undefined;
		return this.anchors.find((anchor) => anchor.id === id);
	}

	async listForNote(_actor: ActorContext, noteId: NoteId): Promise<readonly SourceAnchor[]> {
		void _actor;
		return this.anchors.filter((anchor) => anchor.noteId === noteId);
	}

	async insert(_actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor> {
		void _actor;
		this.anchors.push(anchor);
		return anchor;
	}

	async update(_actor: ActorContext, anchor: SourceAnchor): Promise<SourceAnchor> {
		void _actor;
		this.anchors = this.anchors.map((candidate) =>
			candidate.id === anchor.id ? anchor : candidate
		);
		return anchor;
	}
}
