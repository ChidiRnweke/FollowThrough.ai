type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

export type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type TemplateId = Brand<string, 'TemplateId'>;

type DateTime = Brand<string, 'DateTime'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly Record<string, unknown>[];
}

type NoteKind = 'folder' | 'note' | 'skill';

/** Name of the auto-created project that holds unsorted notes and todos. */
export const DEFAULT_PROJECT_NAME = 'General';

/** The scoping unit every other capability keys off. Archiving is one-way; there is no delete. */
export interface Project {
	readonly id: ProjectId;
	readonly userId: UserId;
	readonly name: string;
	readonly description?: string;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

interface Note {
	readonly id: NoteId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly parentId?: NoteId;
	readonly kind: NoteKind;
	readonly position: number;
	readonly title: string;
	readonly builtInKey?: string;
	readonly document: ProseMirrorDocument;
	readonly plainText: string;
	readonly currentRevision: number;
	readonly publishedRevision: number;
	readonly isPinned: boolean;
	readonly publishedAt?: DateTime;
	readonly archivedAt?: DateTime;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

type NoteSummary = Pick<
	Note,
	| 'id'
	| 'projectId'
	| 'parentId'
	| 'kind'
	| 'position'
	| 'title'
	| 'isPinned'
	| 'archivedAt'
	| 'createdAt'
	| 'updatedAt'
	| 'currentRevision'
>;

export interface ProjectTemplate {
	readonly id: TemplateId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly name: string;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly extractedStyles?: Record<string, unknown>;
	readonly isDefault: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

/** One entry in the project's document tree; folders nest children, notes never do. */
export interface ProjectTreeNode {
	readonly entry: NoteSummary;
	readonly children: readonly ProjectTreeNode[];
}

export interface ProjectView {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface CreateProjectInput {
	readonly name: string;
	readonly description?: string;
}

export interface CreateProjectOutput {
	readonly project: Project;
}

export interface ListProjectsOutput {
	readonly projects: readonly Project[];
}

export interface GetProjectInput {
	readonly projectId: ProjectId;
}

export interface GetProjectOutput {
	readonly project: Project;
	readonly tree: readonly ProjectTreeNode[];
}

export interface ImportMarkdownArchiveInput {
	readonly projectId: ProjectId;
	/** Import under an existing folder rather than at the project root. */
	readonly parentId?: NoteId;
	readonly archive: Uint8Array;
	readonly fileName: string;
}

/**
 * What an import actually did.
 *
 * Import is not all-or-nothing, so the report is not optional polish: without it a
 * partial import is invisible, and a file that was skipped looks identical to one that
 * was never in the archive.
 */
export interface ImportMarkdownArchiveOutput {
	readonly importedNoteIds: readonly NoteId[];
	readonly createdFolderIds: readonly NoteId[];
	/** Present in the archive, deliberately not imported. */
	readonly skipped: readonly { readonly path: string; readonly reason: string }[];
	/** Meant to be imported, but could not be. */
	readonly failed: readonly { readonly path: string; readonly message: string }[];
	/** Frontmatter the importer had nowhere to put, so it is named rather than dropped. */
	readonly unmappedFrontmatterKeys: readonly string[];
}

export interface CreateFolderInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly parentId?: NoteId;
}

export interface CreateFolderOutput {
	readonly folder: Note;
}

export interface MoveProjectEntryInput {
	readonly projectId: ProjectId;
	readonly entryId: NoteId;
	readonly parentId?: NoteId;
	readonly position: number;
}

export interface MoveProjectEntryOutput {
	readonly entry: Note;
}

export interface RenameProjectInput {
	readonly projectId: ProjectId;
	readonly name: string;
	readonly description?: string;
}

export interface RenameProjectOutput {
	readonly project: Project;
}

export interface ArchiveProjectInput {
	readonly projectId: ProjectId;
}

export interface ArchiveProjectOutput {
	readonly project: Project;
}

export * from './export-entries';
