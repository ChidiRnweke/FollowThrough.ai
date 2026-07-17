import type {
	ActorContext,
	ArchiveNoteInput,
	ArchiveNoteOutput,
	CreateNoteInput,
	CreateNoteOutput,
	GetNoteViewInput,
	NoteView,
	NoteSyncInventoryEntry,
	RenameNoteInput,
	RenameNoteOutput,
	SaveNoteInput,
	SaveNoteOutput,
	SyncNoteInput,
	SyncNoteOutput,
	ListNoteSyncInventoryInput,
	ListNoteSyncInventoryOutput
} from '$lib/models';
import {
	noteEtag,
	noteMatchesEtag,
	noteSyncContentEquals,
	StaleRevisionError,
	ValidationError
} from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	BacklinkViewAssembler,
	DiagramLister,
	NoteCreator,
	NoteReader,
	NoteTreeReader,
	ReferenceLister,
	ReferenceViewAssembler,
	RelationshipFinder,
	SuggestionLister,
	SuggestionViewAssembler,
	TodoLister,
	TodoViewAssembler
} from '$lib/services';
import type {
	NoteArchiver,
	NoteEditor,
	NoteIndexer,
	NoteRevisionRecorder,
	SourceAnchorRepairer
} from '$lib/services';

export interface NotesController {
	get(actor: ActorContext, input: GetNoteViewInput): Promise<NoteView>;
	create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput>;
	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
	sync(actor: ActorContext, input: SyncNoteInput): Promise<SyncNoteOutput>;
	listSyncInventory(
		actor: ActorContext,
		input: ListNoteSyncInventoryInput
	): Promise<ListNoteSyncInventoryOutput>;
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput>;
	archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput>;
}
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
	noteArchiver: NoteArchiver;
	revisionRecorder: NoteRevisionRecorder;
	anchorRepairer: SourceAnchorRepairer;
	noteIndexer: NoteIndexer;
	transactionRunner: TransactionRunner;
}
export class DefaultNotesController implements NotesController {
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
			await this.dependencies.revisionRecorder.record(actor, note);
			const anchors = await this.dependencies.anchorRepairer.repairForNote(actor, note);
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
		return { note: await this.dependencies.noteArchiver.archive(actor, input.noteId) };
	}
}
