import type {
	ActorContext,
	Note,
	NoteId,
	NoteRevision,
	SourceAnchor,
	TextSelection
} from '$lib/models';
import {
	ExternalServiceError,
	NotFoundError,
	OwnershipError,
	StaleRevisionError,
	ValidationError
} from '$lib/models';
import type {
	NoteEditor,
	NoteIndexer,
	NotePublisher,
	NoteReader,
	NoteTreeReader,
	NoteRevisionReader,
	NoteRevisionRecorder,
	SelectionAnchorCreator,
	SourceAnchorRepairer
} from '$lib/services';
import type { SnapshotParticipant } from './in-memory-transaction';
import { anchorBuilder, testAnchorId } from '../fixtures/domain-builders';

interface ContentSnapshot {
	notes: Note[];
	revisions: Note[];
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
		SelectionAnchorCreator,
		SourceAnchorRepairer,
		NoteIndexer,
		SnapshotParticipant
{
	notes: Note[] = [];
	revisions: Note[] = [];
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
			!this.revisions.some(
				(revision) => revision.id === note.id && revision.currentRevision === note.currentRevision
			)
		)
			this.revisions.push(structuredClone(note));
	}

	async latestRevision(_actor: ActorContext, noteId: NoteId): Promise<NoteRevision | undefined> {
		void _actor;
		const matching = this.revisions.filter((r) => r.id === noteId);
		if (matching.length === 0) return undefined;
		const latest = matching[matching.length - 1]!;
		return {
			id: latest.id as unknown as NoteRevision['id'],
			noteId: latest.id,
			revision: latest.currentRevision,
			title: latest.title,
			document: latest.document,
			plainText: latest.plainText,
			createdAt: latest.updatedAt
		};
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
			revisions: this.revisions,
			anchors: this.anchors,
			indexedNoteIds: this.indexedNoteIds
		} satisfies ContentSnapshot);
	}

	restore(snapshot: unknown): void {
		const state = snapshot as ContentSnapshot;
		this.notes = state.notes;
		this.revisions = state.revisions;
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
