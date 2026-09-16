import type {
	Provenance,
	ProvenanceOrigin,
	SourceAnchor,
	SelectionOrigin
} from '$lib/models/provenance';
import { storedMemoryChangePayloadSchema, type MemoryChangePayload } from '$lib/models/memory';
import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type ProjectId = Brand<string, 'ProjectId'>;

type NoteId = Brand<string, 'NoteId'>;

export type SuggestionId = Brand<string, 'SuggestionId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

type LocalDate = Brand<string, 'LocalDate'>;

type Url = Brand<string, 'Url'>;

type Confidence = Brand<number, 'Confidence'>;

type TodoResponsibility = 'mine' | 'waiting_on';

type PromiseStrength = 'explicit' | 'implied' | 'tentative';

type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

type DiagramKind = 'mermaid' | 'drawio';

type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

export type SuggestionStatus = 'proposed' | 'accepted' | 'rejected' | 'expired' | 'reverted';

export type SuggestionKind = 'todo' | 'backlink' | 'reference' | 'diagram' | 'memory';

export type SuggestionLifecycle =
	| { readonly status: 'proposed'; readonly decidedAt?: never; readonly appliedArtifactId?: never }
	| {
			readonly status: 'accepted' | 'reverted';
			readonly decidedAt: DateTime;
			readonly appliedArtifactId: string;
	  }
	| {
			readonly status: 'rejected' | 'expired';
			readonly decidedAt: DateTime;
			readonly appliedArtifactId?: never;
	  };

type SuggestionBase<Kind extends SuggestionKind, Payload> = SuggestionLifecycle & {
	readonly id: SuggestionId;
	readonly userId: UserId;
	readonly noteId?: NoteId;
	readonly kind: Kind;
	readonly payload: Payload;
	readonly confidence?: Confidence;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly expiresAt?: DateTime;
	readonly isAutoAccepted: boolean;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
};

export type TodoSuggestion = SuggestionBase<'todo', CreateTodoInput>;

export type BacklinkSuggestion = SuggestionBase<'backlink', CreateRelationshipInput>;

export type ReferenceSuggestion = SuggestionBase<'reference', CreateReferenceInput>;

export type DiagramSuggestion = SuggestionBase<
	'diagram',
	{
		readonly noteId: NoteId;
		readonly kind: DiagramKind;
		readonly title?: string;
		readonly source: string;
	}
>;

export type MemorySuggestion = SuggestionBase<'memory', MemoryChangePayload>;

export interface MemorySuggestionView extends Omit<SuggestionView, 'suggestion'> {
	readonly suggestion: MemorySuggestion;
}
export interface ListPendingMemoryOutput {
	readonly suggestions: readonly MemorySuggestionView[];
}

export type Suggestion =
	TodoSuggestion | BacklinkSuggestion | ReferenceSuggestion | DiagramSuggestion | MemorySuggestion;

const persistedId = <T extends string>() => z.uuid().transform((value) => value as T);
const optionalSuggestionProvenance = {
	sourceAnchorId: persistedId<SourceAnchorId>().optional(),
	provenanceId: persistedId<ProvenanceId>().optional()
};
export const suggestionPayloadSchemas = {
	todo: z
		.object({
			projectId: persistedId<ProjectId>(),
			title: z.string(),
			description: z.string().optional(),
			responsibility: z.enum(['mine', 'waiting_on']),
			waitingOn: z.string().optional(),
			dueDate: z
				.string()
				.transform((value) => value as LocalDate)
				.optional(),
			dueDateVerbatim: z.string().optional(),
			promiseStrength: z.enum(['explicit', 'implied', 'tentative']).optional(),
			...optionalSuggestionProvenance
		})
		.strict(),
	backlink: z
		.object({
			sourceNoteId: persistedId<NoteId>(),
			targetNoteId: persistedId<NoteId>(),
			kind: z.enum(['prior_decision', 'contradicts', 'elaborates', 'mentions']),
			justification: z.string().optional(),
			...optionalSuggestionProvenance
		})
		.strict(),
	reference: z
		.object({
			noteId: persistedId<NoteId>(),
			url: z.url().transform((value) => value as Url),
			title: z.string(),
			tier: z.enum(['official', 'standard', 'vendor', 'community']),
			relevanceNote: z.string(),
			...optionalSuggestionProvenance
		})
		.strict(),
	diagram: z
		.object({
			noteId: persistedId<NoteId>(),
			kind: z.enum(['mermaid', 'drawio']),
			title: z.string().optional(),
			source: z.string()
		})
		.strict(),
	memory: storedMemoryChangePayloadSchema
} satisfies {
	readonly [K in SuggestionKind]: z.ZodType<Extract<Suggestion, { kind: K }>['payload']>;
};

const suggestionFields = {
	id: persistedId<SuggestionId>(),
	userId: persistedId<UserId>(),
	noteId: persistedId<NoteId>().optional(),
	status: z.enum(['proposed', 'accepted', 'rejected', 'expired', 'reverted']),
	confidence: z
		.number()
		.transform((value) => value as Confidence)
		.optional(),
	provenanceId: persistedId<ProvenanceId>(),
	sourceAnchorId: persistedId<SourceAnchorId>().optional(),
	decidedAt: z
		.string()
		.datetime({ offset: true })
		.transform((value) => value as DateTime)
		.optional(),
	expiresAt: z
		.string()
		.datetime({ offset: true })
		.transform((value) => value as DateTime)
		.optional(),
	appliedArtifactId: z.string().optional(),
	isAutoAccepted: z.boolean(),
	createdAt: z
		.string()
		.datetime({ offset: true })
		.transform((value) => value as DateTime),
	updatedAt: z
		.string()
		.datetime({ offset: true })
		.transform((value) => value as DateTime)
};

/** The cached representation uses the same payload contract as the existing database reader. */
const suggestionKindSchema = z.discriminatedUnion('kind', [
	z.object({
		...suggestionFields,
		kind: z.literal('todo'),
		payload: suggestionPayloadSchemas.todo
	}),
	z.object({
		...suggestionFields,
		kind: z.literal('backlink'),
		payload: suggestionPayloadSchemas.backlink
	}),
	z.object({
		...suggestionFields,
		kind: z.literal('reference'),
		payload: suggestionPayloadSchemas.reference
	}),
	z.object({
		...suggestionFields,
		kind: z.literal('diagram'),
		payload: suggestionPayloadSchemas.diagram
	}),
	z.object({
		...suggestionFields,
		kind: z.literal('memory'),
		payload: suggestionPayloadSchemas.memory
	})
]);
export const suggestionRecordKeys = Object.keys(suggestionFields).concat('kind', 'payload');
const decidedAtSchema = z
	.string()
	.datetime({ offset: true })
	.transform((value) => value as DateTime);
const suggestionLifecycleSchema = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('proposed'),
		decidedAt: z.never().optional(),
		appliedArtifactId: z.never().optional()
	}),
	z.object({
		status: z.literal('accepted'),
		decidedAt: decidedAtSchema,
		appliedArtifactId: z.string().min(1)
	}),
	z.object({
		status: z.literal('reverted'),
		decidedAt: decidedAtSchema,
		appliedArtifactId: z.string().min(1)
	}),
	z.object({
		status: z.literal('rejected'),
		decidedAt: decidedAtSchema,
		appliedArtifactId: z.never().optional()
	}),
	z.object({
		status: z.literal('expired'),
		decidedAt: decidedAtSchema,
		appliedArtifactId: z.never().optional()
	})
]);
export const suggestionSchema = z.intersection(
	suggestionKindSchema,
	suggestionLifecycleSchema
) satisfies z.ZodType<Suggestion>;

/**
 * A stored suggestion, which may have a payload that no longer matches its kind.
 *
 * The domain `Suggestion` union stays closed: its arms are product states a
 * suggestion can genuinely be in, and "the column did not parse" is not one of
 * them. Adding a sixth `kind` for it would hand every consumer that switches on
 * `kind` a case it cannot render, decide, or accept.
 *
 * So the failure lives at the read boundary instead, as its own type. The
 * repository returns these; the service decides what to do with the unreadable
 * ones. That keeps the decision with the caller that can actually make it, and
 * keeps a single bad row from throwing out of a list read the way a note
 * document once did.
 */
export type StoredSuggestion =
	| { readonly status: 'readable'; readonly suggestion: Suggestion }
	| {
			readonly status: 'unreadable';
			readonly id: SuggestionId;
			readonly kind: SuggestionKind;
			readonly reason: string;
	  };

/**
 * A durable remembered fact. Entries with a project hold project memory; entries
 * without one form the user's profile memory — who they are across all projects.
 */
interface CreateTodoInput {
	readonly projectId: ProjectId;
	readonly title: string;
	readonly description?: string;
	readonly responsibility: TodoResponsibility;
	readonly waitingOn?: string;
	readonly dueDate?: LocalDate;
	readonly dueDateVerbatim?: string;
	readonly promiseStrength?: PromiseStrength;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

export interface SuggestionProposalBase {
	readonly noteId?: NoteId;
	readonly confidence?: number;
	readonly provenanceId: ProvenanceId;
	readonly sourceAnchorId?: SourceAnchorId;
}

export type SuggestionProposal =
	| (SuggestionProposalBase & { readonly kind: 'todo'; readonly payload: CreateTodoInput })
	| (SuggestionProposalBase & {
			readonly kind: 'backlink';
			readonly payload: CreateRelationshipInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'reference';
			readonly payload: CreateReferenceInput;
	  })
	| (SuggestionProposalBase & {
			readonly kind: 'diagram';
			readonly payload: { noteId: NoteId; kind: DiagramKind; title?: string; source: string };
	  })
	| (SuggestionProposalBase & { readonly kind: 'memory'; readonly payload: MemoryChangePayload });

type SuggestionIdentity = {
	readonly id: SuggestionId;
	readonly userId: UserId;
	readonly now: DateTime;
};
export function materializeSuggestion<P extends SuggestionProposal>(
	proposal: P,
	identity: SuggestionIdentity
): Extract<Suggestion, { kind: P['kind'] }>;
export function materializeSuggestion(
	proposal: SuggestionProposal,
	identity: SuggestionIdentity
): Suggestion {
	const common = {
		id: identity.id,
		userId: identity.userId,
		status: 'proposed' as const,
		provenanceId: proposal.provenanceId,
		isAutoAccepted: false,
		createdAt: identity.now,
		updatedAt: identity.now,
		...(proposal.noteId !== undefined ? { noteId: proposal.noteId } : {}),
		...(proposal.confidence !== undefined
			? { confidence: proposal.confidence as Suggestion['confidence'] }
			: {}),
		...(proposal.sourceAnchorId !== undefined ? { sourceAnchorId: proposal.sourceAnchorId } : {})
	};
	switch (proposal.kind) {
		case 'todo':
			return { ...common, kind: 'todo', payload: proposal.payload };
		case 'backlink':
			return { ...common, kind: 'backlink', payload: proposal.payload };
		case 'reference':
			return { ...common, kind: 'reference', payload: proposal.payload };
		case 'diagram':
			return { ...common, kind: 'diagram', payload: proposal.payload };
		case 'memory':
			return { ...common, kind: 'memory', payload: proposal.payload };
	}
}

/** `autoAccepted` distinguishes a trust-policy auto-accept from a user's manual click, so the two are never conflated in the audit trail. */
export interface AcceptSuggestionInput {
	readonly suggestionId: SuggestionId;
	readonly autoAccepted?: boolean;
}

export interface AcceptSuggestionOutput<Artifact> {
	readonly suggestion: Suggestion;
	readonly artifact: Artifact;
}

export interface RejectSuggestionInput {
	readonly suggestionId: SuggestionId;
}

export interface RevertSuggestionInput {
	readonly suggestionId: SuggestionId;
}

/** The identity and label needed to navigate to a note. */
interface NoteRef {
	readonly id: NoteId;
	readonly title: string;
}

/** A suggestion with everything a review UI needs to render a decision: the source note, the quoted anchor, and who or what proposed it. */
export interface SuggestionView {
	readonly suggestion: Suggestion;
	readonly note?: NoteRef;
	readonly anchor?: SourceAnchor;
	readonly origin: ProvenanceOrigin;
}

/** Resolved records used to present a proposal. The controller chooses its presentation. */
export interface SuggestionContext extends Pick<SuggestionView, 'suggestion' | 'note' | 'anchor'> {
	readonly provenance: Provenance;
}

export interface ListSuggestionsInput {
	readonly status: SuggestionStatus;
}

export interface SuggestionGroup {
	readonly note?: NoteRef;
	readonly suggestions: readonly SuggestionView[];
}

export interface ListSuggestionsOutput {
	readonly groups: readonly SuggestionGroup[];
}

interface SelectionPayloads {
	todo: Omit<CreateTodoInput, 'projectId' | 'sourceAnchorId' | 'provenanceId'>;
	backlink: Omit<CreateRelationshipInput, 'sourceNoteId' | 'sourceAnchorId' | 'provenanceId'>;
	reference: Omit<CreateReferenceInput, 'noteId' | 'sourceAnchorId' | 'provenanceId'>;
}
export type SelectionProposal = {
	[K in keyof SelectionPayloads]: {
		readonly kind: K;
		readonly payload: SelectionPayloads[K];
		readonly confidence?: number;
	};
}[keyof SelectionPayloads];
export type ProposalSelectionOrigin = SelectionOrigin<{
	readonly id: NoteId;
	readonly projectId: ProjectId;
}>;
export function proposalFromSelection<P extends SelectionProposal>(
	origin: ProposalSelectionOrigin,
	proposal: P
): Extract<SuggestionProposal, { kind: P['kind'] }>;
export function proposalFromSelection(
	origin: ProposalSelectionOrigin,
	proposal: SelectionProposal
): SuggestionProposal {
	const source = { sourceAnchorId: origin.anchor.id, provenanceId: origin.provenance.id };
	const common = { ...source, noteId: origin.note.id, confidence: proposal.confidence };
	switch (proposal.kind) {
		case 'todo':
			return {
				...common,
				kind: 'todo',
				payload: { ...proposal.payload, ...source, projectId: origin.note.projectId }
			};
		case 'backlink':
			return {
				...common,
				kind: 'backlink',
				payload: { ...proposal.payload, ...source, sourceNoteId: origin.note.id }
			};
		case 'reference':
			return {
				...common,
				kind: 'reference',
				payload: { ...proposal.payload, ...source, noteId: origin.note.id }
			};
	}
}
