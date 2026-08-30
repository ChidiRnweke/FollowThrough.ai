import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

export type ProvenanceId = Brand<string, 'ProvenanceId'>;

type AgentRunId = Brand<string, 'AgentRunId'>;

type ConversationId = Brand<string, 'ConversationId'>;

type DiagramId = Brand<string, 'DiagramId'>;

type DateTime = Brand<string, 'DateTime'>;

export type Confidence = Brand<number, 'Confidence'>;

export type PipelineKind = 'extract_promises' | 'relate' | 'reference' | 'agent' | 'memory';

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
interface ProvenanceBase {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly createdAt: DateTime;
}

type EmptyMetadata = { readonly [key: string]: never };

interface UserProvenance extends ProvenanceBase {
	readonly producerKind: 'user';
	readonly producerName: 'Create Skill From Selection' | 'document-export';
	readonly metadata: EmptyMetadata;
}

interface ReferenceProvenance extends ProvenanceBase {
	readonly producerKind: 'pipeline';
	readonly producerName: 'Reference';
	readonly pipeline: 'reference';
	readonly sourceAnchorId: SourceAnchorId;
	readonly metadata: EmptyMetadata;
}

interface PromiseExtractionProvenance extends ProvenanceBase {
	readonly producerKind: 'pipeline';
	readonly producerName: 'Extract Promises';
	readonly pipeline: 'extract_promises';
	readonly sourceAnchorId: SourceAnchorId;
	readonly metadata: EmptyMetadata;
}

interface RelationshipProvenance extends ProvenanceBase {
	readonly producerKind: 'pipeline';
	readonly producerName: 'Relate';
	readonly pipeline: 'relate';
	readonly sourceAnchorId: SourceAnchorId;
	readonly metadata: EmptyMetadata;
}

interface MemoryProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'Agent memory';
	readonly pipeline: 'memory';
	readonly metadata: EmptyMetadata;
}

/**
 * A write that arrived over MCP rather than through the app.
 *
 * `scope` is the token's own authority, recorded because it is the only thing
 * that says how much the caller was allowed to do — the request has no user
 * sitting behind it to ask afterwards.
 */
interface McpClientProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'MCP client';
	readonly pipeline: 'agent';
	readonly metadata: { readonly scope: 'read' | 'full' };
}

interface WorkbenchAgentProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'FollowThrough Workbench Agent';
	readonly pipeline: 'agent';
	readonly runId: AgentRunId;
	readonly model: string;
	readonly metadata: EmptyMetadata;
}

interface MermaidAgentProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'Mermaid Diagram Creator';
	readonly pipeline: 'agent';
	readonly sourceAnchorId: SourceAnchorId;
	readonly metadata: EmptyMetadata;
}

interface InlineDiagramAgentProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'Diagram Agent';
	readonly pipeline: 'agent';
	readonly metadata:
		| { readonly operation: 'convert' }
		| { readonly operation: 'convert'; readonly sourceDiagramId: DiagramId };
}

interface WorkflowDiagramAgentProvenance extends ProvenanceBase {
	readonly producerKind: 'agent';
	readonly producerName: 'Diagram Agent';
	readonly pipeline: 'agent';
	readonly runId: AgentRunId;
	readonly model: string;
	readonly metadata: {
		readonly conversationId: ConversationId;
		readonly operation: 'generate' | 'revise' | 'convert';
	};
}

export type Provenance =
	| UserProvenance
	| ReferenceProvenance
	| PromiseExtractionProvenance
	| RelationshipProvenance
	| MemoryProvenance
	| McpClientProvenance
	| WorkbenchAgentProvenance
	| MermaidAgentProvenance
	| InlineDiagramAgentProvenance
	| WorkflowDiagramAgentProvenance;

/** Every producer this application has. Closed, so a surface cannot invent one. */
export type ProducerName = Provenance['producerName'];

/**
 * Where something came from, as a surface states it, and when.
 *
 * A caption wants two facts, and a client that just ran a pipeline has exactly
 * those two. It does not have a run id, a model, or a source anchor, so it
 * cannot build a {@link Provenance} — and while it was asked for one it invented
 * the missing fields, which put producer names on screen that no producer has
 * ever used. Asking for what the caller can actually answer removes the
 * fabrication rather than checking it.
 */
export type ProvenanceOrigin = { readonly createdAt: DateTime } & (
	{ readonly pipeline: PipelineKind } | { readonly producerName: ProducerName }
);

/** The origin of a stored record. A pipeline names itself; anything else is its producer. */
export const provenanceOrigin = (provenance: Provenance): ProvenanceOrigin =>
	'pipeline' in provenance
		? { pipeline: provenance.pipeline, createdAt: provenance.createdAt }
		: { producerName: provenance.producerName, createdAt: provenance.createdAt };

/**
 * The three facts only storage can supply.
 *
 * They are absent from a request and required on a record, which is why the two
 * are different types rather than one type with three optional fields.
 */
export interface StoredIdentity {
	readonly id: ProvenanceId;
	readonly userId: UserId;
	readonly createdAt: DateTime;
}

/** Distributes, so each arm keeps the fields that belong to it. */
type Requested<T> = T extends Provenance ? Omit<T, keyof StoredIdentity> : never;

/**
 * A provenance record as its producer states it, before anything is stored.
 *
 * Written as `Omit<Provenance, …>` by hand at six call sites, which does not
 * distribute over a union: `Omit` of a union keeps only the keys every arm
 * shares, so `pipeline`, `runId` and `model` all vanished and every caller that
 * set one was a type error.
 */
export type ProvenanceRequest = Requested<Provenance>;

const provenanceIdentitySchema = {
	id: z.uuid().transform((value) => value as ProvenanceId),
	userId: z.uuid().transform((value) => value as UserId),
	createdAt: z.iso.datetime().transform((value) => value as DateTime)
};

const sourceAnchorIdSchema = z.uuid().transform((value) => value as SourceAnchorId);
const runIdSchema = z.uuid().transform((value) => value as AgentRunId);
const emptyMetadataSchema = z.object({}).strict();

const provenanceSchemas = [
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('user'),
			producerName: z.enum(['Create Skill From Selection', 'document-export']),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('pipeline'),
			producerName: z.literal('Reference'),
			pipeline: z.literal('reference'),
			sourceAnchorId: sourceAnchorIdSchema,
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('pipeline'),
			producerName: z.literal('Extract Promises'),
			pipeline: z.literal('extract_promises'),
			sourceAnchorId: sourceAnchorIdSchema,
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('pipeline'),
			producerName: z.literal('Relate'),
			pipeline: z.literal('relate'),
			sourceAnchorId: sourceAnchorIdSchema,
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('Agent memory'),
			pipeline: z.literal('memory'),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('MCP client'),
			pipeline: z.literal('agent'),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			metadata: z.object({ scope: z.enum(['read', 'full']) }).strict()
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('FollowThrough Workbench Agent'),
			pipeline: z.literal('agent'),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			runId: runIdSchema,
			model: z.string().min(1),
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('Mermaid Diagram Creator'),
			pipeline: z.literal('agent'),
			sourceAnchorId: sourceAnchorIdSchema,
			metadata: emptyMetadataSchema
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('Diagram Agent'),
			pipeline: z.literal('agent'),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			metadata: z.union([
				z.object({ operation: z.literal('convert') }).strict(),
				z
					.object({
						operation: z.literal('convert'),
						sourceDiagramId: z.uuid().transform((value) => value as DiagramId)
					})
					.strict()
			])
		})
		.strict(),
	z
		.object({
			...provenanceIdentitySchema,
			producerKind: z.literal('agent'),
			producerName: z.literal('Diagram Agent'),
			pipeline: z.literal('agent'),
			sourceAnchorId: sourceAnchorIdSchema.optional(),
			runId: runIdSchema,
			model: z.string().min(1),
			metadata: z
				.object({
					conversationId: z.uuid().transform((value) => value as ConversationId),
					operation: z.enum(['generate', 'revise', 'convert'])
				})
				.strict()
		})
		.strict()
] as const;

export const provenanceSchema: z.ZodType<Provenance> = z.union(provenanceSchemas);

/** Parse a stored provenance row before its producer-specific facts enter domain logic. */
export const parseProvenance = (value: unknown): Provenance => provenanceSchema.parse(value);

/**
 * A request plus the identity storage gave it, as one record.
 *
 * Parsed rather than spread into a literal. Spreading a union member widens it —
 * the result is one object carrying every arm's fields, which no longer matches
 * any arm — and the four call sites that did it each answered the resulting
 * error differently. Parsing keeps the arm and refuses a request that could
 * never be a valid record, at the point it is built rather than at the database.
 */
export const asProvenance = (request: ProvenanceRequest, identity: StoredIdentity): Provenance =>
	parseProvenance({ ...request, ...identity });
