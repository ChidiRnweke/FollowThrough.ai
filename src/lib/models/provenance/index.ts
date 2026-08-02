type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

export type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

type DateTime = Brand<string, 'DateTime'>;

export type Confidence = Brand<number, 'Confidence'>;

type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

export type ProducerKind = 'user' | 'pipeline' | 'agent';

/**
 * A quoted passage a suggestion or todo was extracted from. Anchors are repaired
 * (re-pointed), not recomputed from scratch, when a note is edited, so a still-unique
 * quote keeps its anchor even as surrounding text changes.
 */
export interface SourceAnchor {
	readonly id: SourceAnchorId;
	readonly noteId: NoteId;
	readonly nodeId?: string;
	readonly from?: number;
	readonly to?: number;
	readonly quote: string;
	readonly prefix?: string;
	readonly suffix?: string;
	readonly revision: number;
	readonly createdAt: DateTime;
}

/**
 * Who or what produced something, and how. Every suggestion, memory change, and
 * agent-generated artifact carries a `provenanceId` pointing here, which is what
 * makes "what did the agent see and do" answerable after the fact.
 */
export interface Provenance {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly producerKind: ProducerKind;
	readonly producerName: string;
	readonly pipeline?: PipelineKind;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly runId?: AgentRunId;
	readonly model?: string;
	readonly metadata: Readonly<Record<string, unknown>>;
	readonly createdAt: DateTime;
}
