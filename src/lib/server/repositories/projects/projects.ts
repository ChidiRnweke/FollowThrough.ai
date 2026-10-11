import type { CreateProjectInput, Project, ProjectId, ProjectRename } from '$lib/models/projects';
import type { Note, NoteId } from '$lib/models/notes';

/** Owns the project record itself; the document tree is `ProjectTreeRepository`'s. */
export interface ProjectRepository {
	insert(input: CreateProjectInput): Promise<Project>;
	/** Lock the active project before reading or changing its tree. */
	findForWrite(projectId: ProjectId): Promise<Project | undefined>;
	findById(projectId: ProjectId): Promise<Project | undefined>;
	listActive(): Promise<readonly Project[]>;
	update(input: ProjectRename): Promise<Project>;
	/** `null` clears the project default so its notes inherit the app default again. */
	setSectionNumberingDefault(projectId: ProjectId, enabled: boolean | null): Promise<Project>;
	archive(projectId: ProjectId): Promise<Project>;
}

/** The folder/note tree built on top of the notes table. `persistOrder` is the only multi-row write, used by the `move` transaction to renumber two sibling lists at once. */
export interface ProjectTreeRepository {
	list(projectId: ProjectId): Promise<readonly Note[]>;
	persistOrder(
		entries: readonly { id: NoteId; parentId?: NoteId; position: number }[]
	): Promise<void>;
}
