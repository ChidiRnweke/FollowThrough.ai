import type {
	ActorContext,
	ArchiveNoteInput,
	ArchiveNoteOutput,
	CreateNoteInput,
	CreateNoteOutput,
	GetNoteViewInput,
	NoteView,
	RenameNoteInput,
	RenameNoteOutput,
	SaveNoteInput,
	SaveNoteOutput
} from '$lib/models';
import type { TransactionRunner } from '$lib/repositories';
import type {
	BacklinkViewAssembler,
	DiagramLister,
	NoteCreator,
	NoteReader,
	ReferenceLister,
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
	rename(actor: ActorContext, input: RenameNoteInput): Promise<RenameNoteOutput>;
	archive(actor: ActorContext, input: ArchiveNoteInput): Promise<ArchiveNoteOutput>;
}
export interface NotesDependencies {
	noteReader: NoteReader;
	noteCreator: NoteCreator;
	relationshipFinder: RelationshipFinder;
	backlinkViewAssembler: BacklinkViewAssembler;
	referenceLister: ReferenceLister;
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
		const [backlinks, todoViews, pendingSuggestions] = await Promise.all([
			this.dependencies.backlinkViewAssembler.assemble(actor, relationships),
			this.dependencies.todoViewAssembler.assemble(actor, todos),
			this.dependencies.suggestionViewAssembler.assemble(actor, pending)
		]);
		return {
			note,
			backlinks,
			references,
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
			return { note, repairedAnchorIds: anchors.map((anchor) => anchor.id) };
		});
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
