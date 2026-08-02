import type { ActorContext } from '$lib/models/identity';
import type {
	CreateFolderInput,
	CreateProjectInput,
	Project,
	ProjectId,
	RenameProjectInput
} from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';

/** Owns the project record itself; the document tree is `ProjectTreeRepository`'s. */
export interface ProjectRepository {
	insert(actor: ActorContext, input: CreateProjectInput): Promise<Project>;
	findById(actor: ActorContext, projectId: ProjectId): Promise<Project | undefined>;
	listActive(actor: ActorContext): Promise<readonly Project[]>;
	findFirstActive(actor: ActorContext): Promise<Project | undefined>;
	update(actor: ActorContext, input: RenameProjectInput): Promise<Project>;
	archive(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}

/** The folder/note tree built on top of the notes table. `persistOrder` is the only multi-row write, used by the `move` transaction to renumber two sibling lists at once. */
export interface ProjectTreeRepository {
	list(actor: ActorContext, projectId: ProjectId): Promise<readonly Note[]>;
	insertFolder(actor: ActorContext, input: CreateFolderInput, position: number): Promise<Note>;
	persistOrder(
		actor: ActorContext,
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void>;
}
