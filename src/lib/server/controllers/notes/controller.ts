import type { ActorContext } from '$lib/models/identity';
import type {
	ArchiveNoteInput,
	ArchiveNoteOutput,
	CreateNoteInput,
	CreateNoteOutput,
	DiscardNoteDraftInput,
	DiscardNoteDraftOutput,
	GetNoteViewInput,
	NoteView,
	NoteSyncInventoryEntry,
	PublishNoteInput,
	PublishNoteOutput,
	RenameNoteInput,
	RenameNoteOutput,
	SaveNoteInput,
	SaveNoteOutput,
	SyncNoteInput,
	SyncNoteOutput,
	ListNoteSyncInventoryInput,
	ListNoteSyncInventoryOutput
} from '$lib/models/notes';
import {
	collectNoteLinkTargets,
	noteEtag,
	noteMatchesEtag,
	noteSyncContentEquals
} from '$lib/models/notes';
import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { AtomicOperation as TransactionRunner } from '$lib/models/workspace';
import type {
	BacklinkViewAssembler,
	NoteLinkReconciler,
	RelationshipFinder
} from '$lib/server/services/relationships/contracts';
import type { DiagramLister } from '$lib/server/services/diagrams/contracts';
import type { NoteCreator, NoteReader, NoteTreeReader } from '$lib/server/services/notes/contracts';
import type {
	ReferenceLister,
	ReferenceViewAssembler
} from '$lib/server/services/references/contracts';
import type {
	SuggestionLister,
	SuggestionViewAssembler
} from '$lib/server/services/suggestions/contracts';
import type { TodoLister, TodoViewAssembler } from '$lib/server/services/todos/contracts';
import type {
	NoteArchiver,
	NoteEditor,
	NoteIndexer,
	NotePublisher,
	NoteRevisionRecorder,
	NoteRevisionReader,
	SourceAnchorRepairer
} from '$lib/server/services/notes/contracts';

/**
 * Application boundary for notes: the read model, editing and publishing, offline sync,
 * and archival.
 *
 * Reads are assembled in parallel from many sources; writes go through the transaction
 * runner so a save and its link/index side effects commit atomically.
 */
export interface NotesController {
	/**
	 * Load the full read model for one note: the document, its ETag, backlinks,
	 * references, diagrams, todos, and pending suggestions.
	 *
	 * The pieces are fetched in parallel because nothing depends on another's result.
	 */
	get(actor: ActorContext, input: GetNoteViewInput): Promise<NoteView>;
	/** Create a new, empty note. */
	create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput>;
	/**
	 * Persist a note body and, in the same transaction, repair its anchors, reconcile its
	 * links, and re-index it.
	 *
	 * Link reconciliation is deliberately in the transaction: the note's links are
	 * derived from the document that just landed, so committing the body without the
	 * derived `mentions` rows would show backlinks the note no longer has.
	 */
	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
	/**
	 * Submit a note revision with an ETag for optimistic concurrency, returning either a
	 * saved outcome or, when the base ETag is stale and the remote diverged, a conflict
	 * carrying the remote revision so the client can reconcile.
	 *
	 * A stale ETag whose remote content happens to be identical still resolves to
	 * 'saved', so retrying a save that actually landed is never reported as a conflict.
	 *
	 * @throws ValidationError if the base ETag does not describe the submitted revision.
	 */
	sync(actor: ActorContext, input: SyncNoteInput): Promise<SyncNoteOutput>;
	/**
	 * Publish the current state of a note, recording a revision so `discardDraft` can
	 * restore it later. Guards on the ETag so a concurrent edit cannot be silently
	 * published over.
	 *
	 * @throws StaleRevisionError if the note changed since it was loaded.
	 */
	publish(actor: ActorContext, input: PublishNoteInput): Promise<PublishNoteOutput>;
	/**
	 * Discard the unpublished draft by restoring the latest published revision.
	 *
	 * @throws NotFoundError if no published revision exists yet — there is nothing to
	 * fall back to.
	 */
	discardDraft(actor: ActorContext, input: DiscardNoteDraftInput): Promise<DiscardNoteDraftOutput>;
	/**
	 * List every note in a project with the ETag each was last written under, so an
	 * offline client can diff its local state against the server on the next sync.
	 */
	listSyncInventory(
		actor: ActorContext,
		input: ListNoteSyncInventoryInput
	): Promise<ListNoteSyncInventoryOutput>;
	/** Change a note's title, recording a revision and re-indexing in the same transaction. */
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput>;
	/** Archive a note and re-index it so archived notes drop out of search results. */
	archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput>;
}
/** Everything the {@link NotesController} needs, injected so it can be built and tested without real stores. */
export interface NotesDependencies {
	noteReader: NoteReader;
	noteTreeReader: NoteTreeReader;
	noteCreator: NoteCreator;
	relationshipFinder: RelationshipFinder;
	backlinkViewAssembler: BacklinkViewAssembler;
	referenceLister: ReferenceLister;
	referenceViewAssembler: ReferenceViewAssembler;
	diagramLister: DiagramLister;
	todoLister: TodoLister;
	todoViewAssembler: TodoViewAssembler;
	suggestionLister: SuggestionLister;
	suggestionViewAssembler: SuggestionViewAssembler;
	noteEditor: NoteEditor;
	noteLinkReconciler: NoteLinkReconciler;
	noteArchiver: NoteArchiver;
	notePublisher: NotePublisher;
	revisionRecorder: NoteRevisionRecorder;
	revisionReader: NoteRevisionReader;
	anchorRepairer: SourceAnchorRepairer;
	noteIndexer: NoteIndexer;
	transactionRunner: TransactionRunner;
}
export class Notes implements NotesController {
	constructor(private readonly dependencies: NotesDependencies) {}
	async get(actor: ActorContext, input: GetNoteViewInput): Promise<NoteView> {
		const [note, relationships, references, diagrams, todos, pending] = await Promise.all([
			this.dependencies.noteReader.get(actor, input.noteId),
			this.dependencies.relationshipFinder.findForNote(actor, input.noteId),
			this.dependencies.referenceLister.listForNote(actor, input.noteId),
			this.dependencies.diagramLister.listForNote(actor, input.noteId),
			this.dependencies.todoLister.list(actor, { noteId: input.noteId }),
			this.dependencies.suggestionLister.listByStatus(actor, 'proposed', input.noteId)
		]);
		const [backlinks, referenceViews, todoViews, pendingSuggestions] = await Promise.all([
			this.dependencies.backlinkViewAssembler.assemble(actor, relationships),
			this.dependencies.referenceViewAssembler.assemble(actor, references),
			this.dependencies.todoViewAssembler.assemble(actor, todos),
			this.dependencies.suggestionViewAssembler.assemble(actor, pending)
		]);
		return {
			note,
			etag: noteEtag(note),
			backlinks,
			references: referenceViews,
			diagrams,
			todos: todoViews,
			pendingSuggestions
		};
	}
	async create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput> {
		return { note: await this.dependencies.noteCreator.create(actor, input) };
	}
	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteEditor.save(actor, input.note);
			const anchors = await this.dependencies.anchorRepairer.repairForNote(actor, note);
			// In the same transaction as the save, beside anchor repair: the note's links are
			// derived from the document that just landed, so a committed body with stale
			// `mentions` rows would show backlinks the note no longer has.
			await this.dependencies.noteLinkReconciler.reconcile(
				actor,
				note,
				collectNoteLinkTargets(note.document)
			);
			await this.dependencies.noteIndexer.index(actor, note);
			return { note, etag: noteEtag(note), repairedAnchorIds: anchors.map((anchor) => anchor.id) };
		});
	}
	async sync(actor: ActorContext, input: SyncNoteInput): Promise<SyncNoteOutput> {
		if (!noteMatchesEtag(input.note, input.baseEtag))
			throw new ValidationError('The base ETag does not describe the submitted note revision');
		try {
			const saved = await this.save(actor, { note: input.note });
			return {
				outcome: 'saved',
				version: { note: saved.note, etag: saved.etag },
				repairedAnchorIds: saved.repairedAnchorIds
			};
		} catch (error) {
			if (!(error instanceof StaleRevisionError)) throw error;
			const remote = await this.dependencies.noteReader.get(actor, input.note.id);
			if (noteSyncContentEquals(remote, input.note))
				return {
					outcome: 'saved',
					version: { note: remote, etag: noteEtag(remote) },
					repairedAnchorIds: []
				};
			return {
				outcome: 'conflict',
				baseEtag: input.baseEtag,
				remote: { note: remote, etag: noteEtag(remote) }
			};
		}
	}
	publish(actor: ActorContext, input: PublishNoteInput): Promise<PublishNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteReader.get(actor, input.noteId);
			if (!noteMatchesEtag(note, input.baseEtag))
				throw new StaleRevisionError('The note has changed since it was loaded');
			await this.dependencies.revisionRecorder.record(actor, note);
			const published = await this.dependencies.notePublisher.markPublished(actor, note.id);
			return { note: published, etag: noteEtag(published) };
		});
	}
	async discardDraft(
		actor: ActorContext,
		input: DiscardNoteDraftInput
	): Promise<DiscardNoteDraftOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteReader.get(actor, input.noteId);
			const revision = await this.dependencies.revisionReader.latestRevision(actor, input.noteId);
			if (!revision)
				throw new NotFoundError('No published version exists for this note', {
					noteId: input.noteId
				});
			const restored = await this.dependencies.noteEditor.save(actor, {
				...note,
				title: revision.title,
				document: revision.document,
				plainText: revision.plainText
			});
			return { note: restored, etag: noteEtag(restored) };
		});
	}
	async listSyncInventory(
		actor: ActorContext,
		input: ListNoteSyncInventoryInput
	): Promise<ListNoteSyncInventoryOutput> {
		const notes = await this.dependencies.noteTreeReader.list(actor, input.projectId);
		const entries: NoteSyncInventoryEntry[] = notes
			.filter((note) => note.kind === 'note')
			.map((note) => ({
				noteId: note.id,
				projectId: note.projectId,
				etag: noteEtag(note),
				updatedAt: note.updatedAt
			}));
		return { entries };
	}
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const current = await this.dependencies.noteReader.get(actor, input.noteId);
			const note = await this.dependencies.noteEditor.save(actor, {
				...current,
				title: input.title
			});
			await this.dependencies.revisionRecorder.record(actor, note);
			await this.dependencies.noteIndexer.index(actor, note);
			return { note };
		});
	}
	async archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput> {
		return this.dependencies.transactionRunner.run(async () => {
			const note = await this.dependencies.noteArchiver.archive(actor, input.noteId);
			await this.dependencies.noteIndexer.index(actor, note);
			return { note };
		});
	}
}
