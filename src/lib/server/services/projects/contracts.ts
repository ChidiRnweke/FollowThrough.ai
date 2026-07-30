import type {
	ActorContext,
	CreateFolderInput,
	CreateProjectInput,
	MoveProjectEntryInput,
	Note,
	Project,
	ProjectId,
	ProjectTreeNode,
	RenameProjectInput
} from '$lib/models';

export interface ProjectCreator {
	create(actor: ActorContext, input: CreateProjectInput): Promise<Project>;
}

export interface ProjectReader {
	get(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}

export interface ProjectLister {
	list(actor: ActorContext): Promise<readonly Project[]>;
}

export interface ProjectEditor {
	rename(actor: ActorContext, input: RenameProjectInput): Promise<Project>;
	archive(actor: ActorContext, projectId: ProjectId): Promise<Project>;
}

export interface ProjectTreeReader {
	read(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTreeNode[]>;
}

export interface FolderCreator {
	createFolder(actor: ActorContext, input: CreateFolderInput): Promise<Note>;
}

export interface ProjectEntryMover {
	move(actor: ActorContext, input: MoveProjectEntryInput): Promise<Note>;
}
