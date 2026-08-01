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
