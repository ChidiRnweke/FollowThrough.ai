type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

export type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

type TemplateId = Brand<string, 'TemplateId'>;

type DateTime = Brand<string, 'DateTime'>;

interface ProseMirrorDocument {
	readonly type: 'doc';
	readonly content?: readonly ProseMirrorNodeView[];
}
interface ProseMirrorNodeView {
	readonly type: string;
	readonly text?: string;
	readonly content?: readonly ProseMirrorNodeView[];
}

type NoteKind = 'folder' | 'note' | 'skill';

/**
 * The inbox's name when provisioning creates it.
 *
 * A display string and nothing more. It used to be an identifier — code matched
 * on it to find "the default project" — which meant renaming the project moved
 * the inbox out from under the app. `Project.role` carries that now, so the user
 * may call this whatever they like.
 */
export const INBOX_PROJECT_NAME = 'Inbox';

/** The scoping unit every other capability keys off. Archiving is one-way; there is no delete. */
/**
 * What a project is for.
 *
 * `inbox` is where a capture that names no project goes — the Today field and
 * the workspace-wide skills catalog both mean to name none. Exactly one per
 * user, guaranteed by a partial unique index rather than by convention.
 *
 * It is a role and not a name because the name used to do this job:
 * the name was string-matched, so renaming the project relocated
 * the inbox and a user creating their own "General" quietly inherited it.
 */
export type ProjectRole = 'inbox' | 'workspace';

export interface Project {
	readonly id: ProjectId;
	readonly userId: UserId;
	readonly name: string;
	readonly role: ProjectRole;
	readonly description?: string;
	/** Project-level default for H1–H4 section numbering; absent inherits the app default. */
	readonly sectionNumberingDefault?: boolean;
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

export const projectTemplateStylesSchema = z
	.object({
		fonts: z.object({
			heading: z.record(
				z.string(),
				z.object({
					name: z.string(),
					size: z.number(),
					bold: z.boolean(),
					italic: z.boolean(),
					color: z.string().optional()
				})
			),
			body: z.object({ name: z.string(), size: z.number(), color: z.string().optional() })
		}),
		pageMargins: z.object({
			top: z.number(),
			bottom: z.number(),
			left: z.number(),
			right: z.number()
		}),
		headerImages: z.array(z.string()).optional(),
		footerContent: z.string().optional(),
		themeColors: z.record(z.string(), z.string())
	})
	.strict();

export type ProjectTemplateStyles = z.infer<typeof projectTemplateStylesSchema>;

export interface ProjectTemplate {
	readonly id: TemplateId;
	readonly userId: UserId;
	readonly projectId: ProjectId;
	readonly name: string;
	readonly objectKey: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly extractedStyles?: ProjectTemplateStyles;
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
	/** Omitted means `workspace`; only provisioning creates the single `inbox`. */
	readonly role?: ProjectRole;
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

/**
 * The report, read rather than asserted.
 *
 * The import dialog reaches the importer through a multipart route rather than a
 * remote function, so nothing between the two ends checks this shape. The report
 * is the whole feature — a partial import that renders as a clean one is exactly
 * what {@link ImportMarkdownArchiveOutput} exists to prevent — so the boundary
 * that carries it has to be one that can fail out loud.
 */
export const importMarkdownArchiveOutputSchema = z.object({
	importedNoteIds: z.array(z.uuid().transform((value) => value as NoteId)),
	createdFolderIds: z.array(z.uuid().transform((value) => value as NoteId)),
	skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
	failed: z.array(z.object({ path: z.string(), message: z.string() })),
	unmappedFrontmatterKeys: z.array(z.string())
});

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

export interface SetProjectSectionNumberingInput {
	readonly projectId: ProjectId;
	/** `undefined` clears the project default so it inherits the app default again. */
	readonly enabled?: boolean;
}

export interface SetProjectSectionNumberingOutput {
	readonly project: Project;
}

export interface ArchiveProjectOutput {
	readonly project: Project;
}

export * from './export-entries';
import { z } from 'zod';
