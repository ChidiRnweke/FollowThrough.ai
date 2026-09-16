import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type NoteId = Brand<string, 'NoteId'>;

export type ReferenceId = Brand<string, 'ReferenceId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

export type Url = Brand<string, 'Url'>;

export interface ReferenceSource {
	readonly url: Url;
	readonly hostname: string;
	readonly title?: string;
	readonly content?: string;
}

const openRouterCitationSchema = z.looseObject({
	type: z.string().optional(),
	url: z.string().optional(),
	title: z.string().optional(),
	content: z.string().optional()
});

export const openRouterReferenceOutputSchema = z.array(
	z.looseObject({
		type: z.string().optional(),
		action: z.looseObject({ sources: z.array(openRouterCitationSchema).optional() }).optional(),
		content: z
			.array(z.looseObject({ annotations: z.array(openRouterCitationSchema).optional() }))
			.optional()
	})
);

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

export type ReferenceTier = 'official' | 'standard' | 'vendor' | 'community';

interface SourceAnchor {
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

/** A ranked external link attached to a note, always tied back to the selection that proposed it. */
export interface ExternalReference {
	readonly id: ReferenceId;
	readonly userId: UserId;
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
}

export interface CreateReferenceInput {
	readonly noteId: NoteId;
	readonly url: Url;
	readonly title: string;
	readonly tier: ReferenceTier;
	readonly relevanceNote: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

export interface ReferenceCandidate {
	readonly url: Url;
	readonly title: string;
	readonly tier: 'official' | 'standard' | 'vendor' | 'community';
	readonly relevanceNote: string;
	readonly confidence: number;
}

export interface FindReferencesInput {
	readonly selection: TextSelection;
}

export interface StartFindReferencesInput extends FindReferencesInput {
	readonly requestId: string;
}

export const startFindReferencesSchema = z
	.object({
		requestId: z.string().uuid(),
		selection: z
			.object({
				noteId: z
					.string()
					.uuid()
					.transform((value) => value as NoteId),
				revision: z.number().int().positive(),
				from: z.number().int().nonnegative(),
				to: z.number().int().nonnegative(),
				text: z.string()
			})
			.strict()
	})
	.strict() satisfies z.ZodType<StartFindReferencesInput>;

/** `nothing_relevant` is a real outcome, not an empty list: the anchor is still recorded so the search is auditable even when it found nothing worth suggesting. */
export type FindReferencesOutput<Proposal> =
	| {
			readonly outcome: 'found';
			readonly anchorId: SourceAnchorId;
			readonly suggestions: readonly Proposal[];
	  }
	| { readonly outcome: 'nothing_relevant'; readonly anchorId: SourceAnchorId };

export interface ReferenceView {
	readonly reference: ExternalReference;
	readonly anchor?: SourceAnchor;
}

export function assembleReferenceView(
	reference: ExternalReference,
	facts: Pick<ReferenceView, 'anchor'>
): ReferenceView {
	return { reference, ...(facts.anchor ? { anchor: facts.anchor } : {}) };
}
