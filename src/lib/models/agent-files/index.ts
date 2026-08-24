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

export interface AgentFileNextAction {
	readonly reason: string;
	readonly tool: AgentFileToolName;
	readonly arguments: Readonly<Record<string, unknown>>;
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
