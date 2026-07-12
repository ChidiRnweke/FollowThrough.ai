import type {
	ActorContext,
	CreateNoteInput,
	CreateNoteOutput,
	GetNoteViewInput,
	NoteView,
	SaveNoteInput,
	SaveNoteOutput
} from '../models';
import type { TransactionRunner } from '../repositories';
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
} from '../services';
import type {
	NoteEditor,
	NoteIndexer,
	NoteRevisionRecorder,
	SourceAnchorRepairer
} from '../services';

export interface NotesController {
	get(actor: ActorContext, input: GetNoteViewInput): Promise<NoteView>;
	create(actor: ActorContext, input: CreateNoteInput): Promise<CreateNoteOutput>;
	save(actor: ActorContext, input: SaveNoteInput): Promise<SaveNoteOutput>;
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
}
