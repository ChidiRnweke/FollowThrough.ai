import type {
	ActorContext,
	Diagram,
	DiagramId,
	ExternalReference,
	Note,
	NoteId,
	NoteRevision,
	Page,
	PageRequest,
	ReferenceId,
	Todo,
	TodoId,
	TodoResponsibility,
	TodoStatus,
	EntityId
} from '../models';

export interface NoteRepository {
	findById(actor: ActorContext, id: NoteId): Promise<Note | undefined>;
	list(actor: ActorContext, request: PageRequest): Promise<Page<Note>>;
	listRecent(actor: ActorContext, limit: number): Promise<readonly Note[]>;
	listPinned(actor: ActorContext): Promise<readonly Note[]>;
	insert(actor: ActorContext, note: Note): Promise<Note>;
	update(actor: ActorContext, note: Note): Promise<Note>;
	delete(actor: ActorContext, id: NoteId): Promise<void>;
	insertRevision(actor: ActorContext, revision: NoteRevision): Promise<NoteRevision>;
	listRevisions(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRevision[]>;
}
export interface TodoRepository {
	findById(actor: ActorContext, id: TodoId): Promise<Todo | undefined>;
	list(
		actor: ActorContext,
		filter: {
			statuses?: readonly TodoStatus[];
			responsibility?: TodoResponsibility;
			entityId?: EntityId;
		}
	): Promise<readonly Todo[]>;
	insert(actor: ActorContext, todo: Todo): Promise<Todo>;
	update(actor: ActorContext, todo: Todo): Promise<Todo>;
}
export interface ReferenceRepository {
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]>;
	insert(actor: ActorContext, reference: ExternalReference): Promise<ExternalReference>;
	delete(actor: ActorContext, id: ReferenceId): Promise<void>;
}
export interface DiagramRepository {
	findById(actor: ActorContext, id: DiagramId): Promise<Diagram | undefined>;
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly Diagram[]>;
	insert(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	update(actor: ActorContext, diagram: Diagram): Promise<Diagram>;
	delete(actor: ActorContext, id: DiagramId): Promise<void>;
}
