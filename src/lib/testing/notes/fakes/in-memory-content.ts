import type { ActorContext } from '$lib/models/identity';
import type { Note, NoteId, NoteRevision, TextSelection } from '$lib/models/notes';
import { NOTE_REVISION_HISTORY_LIMIT } from '$lib/models/notes';
import type { SourceAnchor } from '$lib/models/provenance';
import {
	ExternalServiceError,
	NotFoundError,
	OwnershipError,
	StaleRevisionError,
	ValidationError
} from '$lib/errors';
import type {
	NoteAttachmentRestorer,
	NoteEditor,
	NoteIndexer,
	NotePublisher,
	NoteReader,
	NoteTreeReader,
	NoteRevisionReader,
	NoteRevisionRecorder,
	SelectionAnchorCreator,
	SourceAnchorRepairer
} from '$lib/server/services/notes/contracts';
import type { NoteLinkReconciler } from '$lib/server/services/relationships/contracts';
import type { SnapshotParticipant } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { anchorBuilder, testAnchorId } from '$lib/testing/workspace/fixtures/domain-builders';

interface ContentSnapshot {
	notes: Note[];
	recordedRevisions: NoteRevision[];
	anchors: SourceAnchor[];
	indexedNoteIds: NoteId[];
}

export class InMemoryNoteContent
	implements
		NoteReader,
		NoteTreeReader,
		NoteEditor,
		NotePublisher,
		NoteRevisionRecorder,
		NoteRevisionReader,
		NoteAttachmentRestorer,
		SelectionAnchorCreator,
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
	/** Snapshots taken by `record`, oldest first — named apart from the `revisions` reader. */
	recordedRevisions: NoteRevision[] = [];
	anchors: SourceAnchor[] = [];
	indexedNoteIds: NoteId[] = [];
	failIndex = false;
	private nextAnchor = 100;

	async get(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = this.notes.find(
			(candidate) => candidate.id === noteId && candidate.userId === actor.userId
		);
		if (!note) throw new NotFoundError('Note was not found');
		return note;
	}

	async list(actor: ActorContext, projectId?: Note['projectId']): Promise<readonly Note[]> {
		return this.notes.filter(
			(note) =>
				note.userId === actor.userId &&
				!note.archivedAt &&
				(projectId === undefined || note.projectId === projectId)
		);
	}

	async create(actor: ActorContext, selection: TextSelection): Promise<SourceAnchor> {
		const note = await this.get(actor, selection.noteId);
		if (!selection.text.trim()) throw new ValidationError('A non-empty selection is required');
		if (selection.revision !== note.currentRevision)
			throw new StaleRevisionError('The selected note revision is stale');
		const anchor = anchorBuilder({
			id: testAnchorId(this.nextAnchor++),
			noteId: note.id,
			from: selection.from,
			to: selection.to,
			quote: selection.text,
			revision: selection.revision
		});
		this.anchors.push(anchor);
		return anchor;
	}

	async save(actor: ActorContext, note: Note): Promise<Note> {
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot save another user’s note');
		const current = this.notes.find(
			(candidate) => candidate.id === note.id && candidate.userId === actor.userId
		);
		if (!current) throw new NotFoundError('Note was not found');
		if (!note.title.trim()) throw new ValidationError('Note title is required');
		if (note.currentRevision !== current.currentRevision)
			throw new StaleRevisionError('The note has changed since it was loaded');
		if (this.isUnchanged(current, note)) return current;
		const updated = {
			...note,
			title: note.title.trim(),
			currentRevision: current.currentRevision + 1
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

	async markPublished(actor: ActorContext, noteId: NoteId): Promise<Note> {
		const note = await this.get(actor, noteId);
		const ts = new Date().toISOString() as Note['updatedAt'];
		const published = {
			...note,
			publishedRevision: note.currentRevision,
			publishedAt: ts,
			updatedAt: ts
		};
		this.notes = this.notes.map((n) => (n.id === noteId ? published : n));
		return published;
	}

	async repairForNote(actor: ActorContext, note: Note): Promise<readonly SourceAnchor[]> {
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot repair another user’s note');
		return this.anchors.filter((anchor) => anchor.noteId === note.id);
	}

	async index(actor: ActorContext, note: Note): Promise<void> {
		if (this.failIndex) throw new ExternalServiceError('Indexing failed');
		if (note.userId !== actor.userId) throw new OwnershipError('Cannot index another user’s note');
		this.indexedNoteIds = [...this.indexedNoteIds.filter((noteId) => noteId !== note.id), note.id];
	}

	snapshot(): unknown {
		return structuredClone({
			notes: this.notes,
			recordedRevisions: this.recordedRevisions,
			anchors: this.anchors,
			indexedNoteIds: this.indexedNoteIds
		} satisfies ContentSnapshot);
	}

	restore(snapshot: unknown): void {
		const state = snapshot as ContentSnapshot;
		this.notes = state.notes;
		this.recordedRevisions = state.recordedRevisions;
		this.anchors = state.anchors;
		this.indexedNoteIds = state.indexedNoteIds;
	}

	private isUnchanged(current: Note, candidate: Note): boolean {
		return (
			current.title === candidate.title &&
			current.plainText === candidate.plainText &&
			JSON.stringify(current.document) === JSON.stringify(candidate.document) &&
			current.parentId === candidate.parentId &&
			current.position === candidate.position &&
			current.isPinned === candidate.isPinned
		);
	}
}
