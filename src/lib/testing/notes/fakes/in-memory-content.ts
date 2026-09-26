import type { IndexingResult } from '$lib/models/knowledge-search';
import type { ActorContext } from '$lib/models/identity';
import type {
	Note,
	NoteSaveWrite,
	NotePublicationWrite,
	NoteId,
	NoteRevision,
	NoteSearchTarget,
	SetNoteSectionNumberingInput
} from '$lib/models/notes';
import { NOTE_REVISION_HISTORY_LIMIT } from '$lib/models/notes';
import type { SourceAnchor } from '$lib/models/provenance';
import {
	ExternalServiceError,
	NotFoundError,
	OwnershipError,
	StaleRevisionError
} from '$lib/errors';
import type {
	NoteAttachmentRestorer,
	NoteEditor,
	NoteIndexer,
	NotePublisher,
	NoteReader,
	NoteSectionNumberingEditor,
	NoteTextSearcher,
	NoteTreeReader,
	NoteRevisionReader,
	NoteRevisionRecorder,
	SourceAnchorRepairer
} from '$lib/server/services/notes/contracts';
import type { NoteLinkReconciler } from '$lib/server/services/relationships/contracts';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

interface ContentSnapshot {
	restoredAttachmentRevisionIds: NoteRevision['id'][];
	noteLinkTargets: Map<NoteId, readonly NoteId[]>;
	notes: Note[];
	recordedRevisions: NoteRevision[];
	anchors: SourceAnchor[];
	indexedNoteIds: NoteId[];
}

export class InMemoryNoteContent
	implements
		NoteReader,
		NoteTreeReader,
		NoteTextSearcher,
		NoteEditor,
		NotePublisher,
		NoteRevisionRecorder,
		NoteRevisionReader,
		NoteAttachmentRestorer,
		NoteSectionNumberingEditor,
		SourceAnchorRepairer,
		NoteIndexer,
		NoteLinkReconciler,
		SnapshotParticipant
{
	/** Targets recorded per note, so a spec can assert what a save reconciled to. */
	noteLinkTargets = new Map<NoteId, readonly NoteId[]>();

	async reconcile(_actor: ActorContext, note: Note, targets: readonly NoteId[]): Promise<void> {
		this.noteLinkTargets.set(note.id, targets);
	}

	notes: Note[] = [];
	saveFailure: Error | undefined;
	/** Snapshots taken by `record`, oldest first — named apart from the `revisions` reader. */
	recordedRevisions: NoteRevision[] = [];
	anchors: SourceAnchor[] = [];
	indexedNoteIds: NoteId[] = [];
	failIndex = false;
	readFailure: Error | undefined;
	failIndexFor = new Set<NoteId>();

	async get(actor: ActorContext, noteId: NoteId): Promise<Note> {
		if (this.readFailure) throw this.readFailure;
		const note = this.notes.find(
			(candidate) => candidate.id === noteId && candidate.userId === actor.userId
		);
		if (!note) throw new NotFoundError('Note was not found');
		return note;
	}

	async setSectionNumbering(
		actor: ActorContext,
		input: SetNoteSectionNumberingInput
	): Promise<Note> {
		const current = await this.get(actor, input.noteId);
		const updated: Note = { ...current, sectionNumbering: input.enabled };
		this.notes = this.notes.map((candidate) => (candidate.id === updated.id ? updated : candidate));
		return updated;
	}

	async list(actor: ActorContext, projectId?: Note['projectId']): Promise<readonly Note[]> {
		return this.notes.filter(
			(note) =>
				note.userId === actor.userId &&
				!note.archivedAt &&
				(projectId === undefined || note.projectId === projectId)
		);
	}

	async listSearchable(
		actor: ActorContext,
		projectId?: Note['projectId']
	): Promise<readonly NoteSearchTarget[]> {
		return (await this.list(actor, projectId)).map((note) => ({
			id: note.id,
			projectId: note.projectId,
			title: note.title,
			plainText: note.plainText
		}));
	}

	async getForEdit(actor: ActorContext, candidate: Pick<Note, 'id' | 'userId'>): Promise<Note> {
		if (candidate.userId !== actor.userId)
			throw new OwnershipError('Cannot save another user’s note');
		return this.get(actor, candidate.id);
	}

	async persistEdit(actor: ActorContext, write: NoteSaveWrite): Promise<Note> {
		if (this.saveFailure) throw this.saveFailure;
		const current = await this.get(actor, write.note.id);
		if (current.currentRevision !== write.expectedRevision || current.archivedAt)
			throw new StaleRevisionError('The note changed while it was being saved');
		const updated = {
			...current,
			title: write.note.title,
			document: write.note.document,
			plainText: write.note.plainText,
			isPinned: write.note.isPinned,
			currentRevision: write.note.currentRevision,
			updatedAt: write.note.updatedAt
		};
		this.notes = this.notes.map((candidate) => (candidate.id === updated.id ? updated : candidate));
		return updated;
	}

	async record(_actor: ActorContext, note: Note): Promise<void> {
		void _actor;
		if (
			this.recordedRevisions.some(
				(revision) => revision.noteId === note.id && revision.revision === note.currentRevision
			)
		)
			return;
		this.recordedRevisions.push(
			structuredClone({
				id: `${note.id}:r${note.currentRevision}` as NoteRevision['id'],
				noteId: note.id,
				revision: note.currentRevision,
				title: note.title,
				document: note.document,
				plainText: note.plainText,
				createdAt: note.updatedAt
			})
		);
		// Mirrors the real catalog: history is bounded, so a spec that publishes past the
		// limit sees the same eviction production would.
		const kept = this.recordedRevisions
			.filter((revision) => revision.noteId === note.id)
			.sort((left, right) => right.revision - left.revision)
			.slice(0, NOTE_REVISION_HISTORY_LIMIT);
		this.recordedRevisions = this.recordedRevisions.filter(
			(revision) => revision.noteId !== note.id || kept.includes(revision)
		);
	}

	async latestRevision(_actor: ActorContext, noteId: NoteId): Promise<NoteRevision | undefined> {
		void _actor;
		const matching = this.recordedRevisions.filter((revision) => revision.noteId === noteId);
		return matching[matching.length - 1];
	}

	async revisions(_actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]> {
		void _actor;
		return this.recordedRevisions.filter((revision) => revision.noteId === noteId).reverse();
	}

	async revisionById(
		_actor: ActorContext,
		noteId: NoteId,
		revisionId: NoteRevision['id']
	): Promise<NoteRevision | undefined> {
		void _actor;
		return this.recordedRevisions.find(
			(revision) => revision.noteId === noteId && revision.id === revisionId
		);
	}

	/** Records what a rollback restored, so a spec can assert the snapshot's files came back. */
	restoredAttachmentRevisionIds: NoteRevision['id'][] = [];

	async restoreAttachments(
		_actor: ActorContext,
		_noteId: NoteId,
		revisionId: NoteRevision['id']
	): Promise<void> {
		void _actor;
		void _noteId;
		this.restoredAttachmentRevisionIds.push(revisionId);
	}

	getForPublication(actor: ActorContext, noteId: NoteId): Promise<Note> {
		return this.get(actor, noteId);
	}

	publicationFailure: Error | undefined;
	async persistPublication(actor: ActorContext, write: NotePublicationWrite): Promise<Note> {
		if (this.publicationFailure) throw this.publicationFailure;
		const current = await this.get(actor, write.noteId);
		if (current.currentRevision !== write.expectedRevision || current.archivedAt)
			throw new StaleRevisionError('The note changed while it was being published');
		const published = {
			...current,
			publishedRevision: write.publishedRevision,
			publishedAt: write.publishedAt,
			updatedAt: write.updatedAt
		};
		this.notes = this.notes.map((note) => (note.id === write.noteId ? published : note));
		return published;
	}

	async repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]> {
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot repair another user’s note');
		return this.anchors.filter((anchor) => anchor.noteId === note.id);
	}

	async index(actor: ActorContext, note: Note): Promise<IndexingResult> {
		if (this.failIndex || this.failIndexFor.has(note.id))
			throw new ExternalServiceError('Indexing failed');
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot index another user’s note');
		this.indexedNoteIds = [...this.indexedNoteIds.filter((noteId) => noteId !== note.id), note.id];
		return { kind: 'stored' };
	}

	snapshot(): RestoreSnapshot {
		const state = structuredClone({
			notes: this.notes,
			restoredAttachmentRevisionIds: this.restoredAttachmentRevisionIds,
			noteLinkTargets: this.noteLinkTargets,
			recordedRevisions: this.recordedRevisions,
			anchors: this.anchors,
			indexedNoteIds: this.indexedNoteIds
		} satisfies ContentSnapshot);
		return () => {
			this.notes = state.notes;
			this.restoredAttachmentRevisionIds = state.restoredAttachmentRevisionIds;
			this.noteLinkTargets = state.noteLinkTargets;
			this.recordedRevisions = state.recordedRevisions;
			this.anchors = state.anchors;
			this.indexedNoteIds = state.indexedNoteIds;
		};
	}
}
