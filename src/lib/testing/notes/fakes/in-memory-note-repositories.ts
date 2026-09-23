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

	async findById(actor: ActorContext, id: NoteId): Promise<Note | undefined> {
		return this.notes.find((note) => note.id === id && note.userId === actor.userId);
	}

	async findForWrite(actor: ActorContext, id: NoteId): Promise<Note | undefined> {
		return this.findById(actor, id);
	}

	async updateTrash(actor: ActorContext, note: Note): Promise<Note> {
		const current = await this.findById(actor, note.id);
		if (!current) throw new NotFoundError('Note was not found');
		const { archivedAt, parentId, ...rest } = current;
		void archivedAt;
		void parentId;
		return this.update(actor, {
			...rest,
			...(note.archivedAt ? { archivedAt: note.archivedAt } : {}),
			...(note.parentId ? { parentId: note.parentId } : {}),
			position: note.position,
			updatedAt: note.updatedAt
		});
	}

	findBuiltInForWrite(actor: ActorContext, key: string): Promise<Note | undefined> {
		return this.findByBuiltInKey(actor, key);
	}

	async repairBuiltIn(
		actor: ActorContext,
		write: NoteBuiltInRepairWrite
	): Promise<Note | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === write.noteId &&
				note.userId === actor.userId &&
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

	async listSearchable(
		actor: ActorContext,
		projectId?: ProjectId
	): Promise<readonly NoteSearchTarget[]> {
		return this.notes
			.filter(
				(note) =>
					note.userId === actor.userId &&
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

	async listTrashed(actor: ActorContext, projectId?: ProjectId): Promise<readonly Note[]> {
		return this.notes
			.filter(
				(note) =>
					note.userId === actor.userId &&
					note.archivedAt &&
					(projectId === undefined || note.projectId === projectId)
			)
			.sort((left, right) => (right.archivedAt ?? '').localeCompare(left.archivedAt ?? ''));
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
		if (this.insertFailures.has(note.title)) throw new Error('Note could not be stored');
		void _actor;
		this.notes.push(note);
		return note;
	}

	async update(_actor: ActorContext, note: Note): Promise<Note> {
		void _actor;
		this.notes = this.notes.map((candidate) => (candidate.id === note.id ? note : candidate));
		return note;
	}

	async updatePublication(
		actor: ActorContext,
		write: NotePublicationWrite
	): Promise<Note | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === write.noteId &&
				note.userId === actor.userId &&
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

	async updateIfRevision(
		actor: ActorContext,
		note: Note,
		expectedRevision: number
	): Promise<Note | undefined> {
		if (this.saveFailures.has(note.title)) throw new Error('Note body could not be stored');
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

	async deleteTrashed(
		actor: ActorContext,
		id: NoteId
	): Promise<Pick<Note, 'id' | 'title'> | undefined> {
		const current = this.notes.find(
			(note) =>
				note.id === id && note.userId === actor.userId && note.archivedAt && note.kind !== 'skill'
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

	async setSectionNumbering(
		actor: ActorContext,
		id: NoteId,
		enabled: boolean | null
	): Promise<Note> {
		const current = this.notes.find((note) => note.id === id && note.userId === actor.userId);
		if (!current) throw new NotFoundError('Note was not found');
		const updated: Note = { ...current, sectionNumbering: enabled ?? undefined };
		this.notes = this.notes.map((note) => (note.id === id ? updated : note));
		return updated;
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

	async pruneRevisions(_actor: ActorContext, noteId: NoteId, keepNewest: number): Promise<void> {
		void _actor;
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
