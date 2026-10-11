import { z } from 'zod';
type Brand<T, Name extends string> = T & { readonly __brand: Name };

type ConversationId = Brand<string, 'ConversationId'>;

export type AgentFileId = Brand<string, 'AgentFileId'>;

export interface AgentFileMetadata {
	readonly kind: 'file';
	readonly id: AgentFileId;
	readonly path: string;
	readonly mediaType: string;
	readonly byteSize: number;
	readonly tokenCount: number;
	readonly lineCount: number;
	readonly checksumSha256: string;
}

export interface AgentDirectoryMetadata {
	readonly kind: 'directory';
	readonly path: string;
	readonly childCount: number;
}

export type AgentPathMetadata = AgentFileMetadata | AgentDirectoryMetadata;

export interface AgentFile {
	readonly metadata: AgentFileMetadata;
	readonly content: string;
}

/** Persisted text removed from replay, scoped to the conversation that produced it. */
export interface StoredAgentFile extends AgentFile {
	readonly conversationId: ConversationId;
}

export interface StoreAgentFileInput {
	readonly conversationId: ConversationId;
	readonly path: string;
	readonly mediaType: string;
	readonly content: string;
}

export type AgentFileToolName = 'ls' | 'grep' | 'sed';

/** The next tool's arguments, as JSON: strings, numbers, booleans, and their containers. */
export type AgentFileToolArguments =
	| string
	| number
	| boolean
	| null
	| readonly AgentFileToolArguments[]
	| { readonly [key: string]: AgentFileToolArguments };

export interface AgentFileNextAction {
	readonly reason: string;
	readonly tool: AgentFileToolName;
	readonly arguments: AgentFileToolArguments;
}

export type AgentFileError =
	| {
			readonly kind: 'error';
			readonly code: 'path_not_found';
			readonly message: string;
			readonly requestedPath: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| {
			readonly kind: 'error';
			readonly code: 'path_is_directory';
			readonly message: string;
			readonly requestedPath: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| {
			readonly kind: 'error';
			readonly code: 'empty_file';
			readonly message: string;
			readonly requestedPath: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| {
			readonly kind: 'error';
			readonly code: 'range_starts_after_eof';
			readonly message: string;
			readonly requestedPath: string;
			readonly lineCount: number;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| {
			readonly kind: 'error';
			readonly code: 'range_ends_before_start';
			readonly message: string;
			readonly requestedPath: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| {
			readonly kind: 'error';
			readonly code: 'invalid_pattern';
			readonly message: string;
			readonly pattern: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  };

export type AgentLsResult =
	| {
			readonly kind: 'listed';
			readonly path: string;
			readonly entries: readonly AgentPathMetadata[];
	  }
	| AgentFileError;

export interface AgentGrepMatch {
	readonly path: string;
	readonly lineNumber: number;
	readonly line: string;
}

export type AgentGrepResult =
	| {
			readonly kind: 'matches';
			readonly exitCode: 0;
			readonly pattern: string;
			readonly path: string;
			readonly matches: readonly AgentGrepMatch[];
	  }
	| {
			readonly kind: 'no_matches';
			readonly exitCode: 1;
			readonly pattern: string;
			readonly path: string;
			readonly searchedFileCount: number;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| AgentFileError;

export type AgentSedRange =
	| { readonly kind: 'lines'; readonly startLine: number; readonly endLine: number }
	| { readonly kind: 'to_end'; readonly startLine: number };

export type AgentSedResult =
	| {
			readonly kind: 'content';
			readonly path: string;
			readonly startLine: number;
			readonly endLine: number;
			readonly lineCount: number;
			readonly content: string;
			readonly nextActions: readonly AgentFileNextAction[];
	  }
	| AgentFileError;

/** Canonical resource paths are decoded by the virtual filesystem's input adapter. */
const projectIdSchema = z.uuid().transform((value) => value as Brand<string, 'ProjectId'>);
const noteIdSchema = z.uuid().transform((value) => value as Brand<string, 'NoteId'>);
const pathSegmentsSchema = z.string().transform((path) => path.split('/'));
export const agentResourcePathSchema = pathSegmentsSchema.pipe(
	z.union([
		z
			.tuple([
				z.literal(''),
				z.literal('projects'),
				projectIdSchema,
				z.literal('notes'),
				z
					.string()
					.endsWith('.md')
					.transform((value) => value.slice(0, -3))
					.pipe(noteIdSchema)
			])
			.transform(([, , projectId, , noteId]) => ({ kind: 'note' as const, projectId, noteId })),
		z
			.tuple([
				z.literal(''),
				z.literal('projects'),
				projectIdSchema,
				z.literal('notes'),
				noteIdSchema,
				z.literal('versions'),
				z
					.string()
					.regex(/^\d+\.md$/)
					.transform((value) => Number(value.slice(0, -3)))
			])
			.transform(([, , projectId, , noteId, , revision]) => ({
				kind: 'version' as const,
				projectId,
				noteId,
				revision
			})),
		z
			.tuple([
				z.literal(''),
				z.literal('projects'),
				projectIdSchema,
				z.literal('attachments'),
				z
					.string()
					.endsWith('.txt')
					.transform((value) => value.slice(0, -4))
					.pipe(z.uuid().transform((value) => value as Brand<string, 'AttachmentId'>))
			])
			.transform(([, , projectId, , attachmentId]) => ({
				kind: 'attachment' as const,
				projectId,
				attachmentId
			})),
		z
			.tuple([
				z.literal(''),
				z.literal('projects'),
				projectIdSchema,
				z.literal('diagrams'),
				z
					.string()
					.transform((value) => value.split('.'))
					.pipe(
						z.tuple([
							z.uuid().transform((value) => value as Brand<string, 'DiagramId'>),
							z.enum(['mmd', 'drawio'])
						])
					)
			])
			.transform(([, , projectId, , [diagramId, extension]]) => ({
				kind: 'diagram' as const,
				projectId,
				diagramId,
				extension
			}))
	])
);
export type AgentResourcePath = z.infer<typeof agentResourcePathSchema>;
