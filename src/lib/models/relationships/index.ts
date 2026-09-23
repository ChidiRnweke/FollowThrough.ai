import { z } from 'zod';

type Brand<T, Name extends string> = T & { readonly __brand: Name };

type UserId = Brand<string, 'UserId'>;

type NoteId = Brand<string, 'NoteId'>;

export type RelationshipId = Brand<string, 'RelationshipId'>;

type SourceAnchorId = Brand<string, 'SourceAnchorId'>;

type ProvenanceId = Brand<string, 'ProvenanceId'>;

type DateTime = Brand<string, 'DateTime'>;

interface TextSelection {
	readonly noteId: NoteId;
	readonly revision: number;
	readonly from: number;
	readonly to: number;
	readonly text: string;
}

export type RelationshipKind = 'prior_decision' | 'contradicts' | 'elaborates' | 'mentions';

export const relationshipClassificationSchema = z.object({
	kind: z.enum(['prior_decision', 'contradicts', 'elaborates', 'mentions']),
	justification: z.string().min(1),
	confidence: z.number().int().min(0).max(100)
});

export type RelationshipClassification = z.infer<typeof relationshipClassificationSchema>;

interface NoteRelationship {
	readonly id: RelationshipId;
	readonly userId: UserId;
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
	readonly createdAt: DateTime;
	readonly updatedAt: DateTime;
}

export interface CreateRelationshipInput {
	readonly sourceNoteId: NoteId;
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification?: string;
	readonly sourceAnchorId?: SourceAnchorId;
	readonly provenanceId?: ProvenanceId;
}

/** A proposed backlink before it becomes a suggestion, scored by the relate pipeline's confidence. */
export interface LinkCandidate {
	readonly targetNoteId: NoteId;
	readonly kind: RelationshipKind;
	readonly justification: string;
	readonly confidence: number;
}

export interface RelatedNoteMatch {
	readonly noteId: NoteId;
	readonly content: string;
	readonly score: number;
}

export interface RelateSelectionInput {
	readonly selection: TextSelection;
}

export interface StartRelateSelectionInput extends RelateSelectionInput {
	readonly requestId: string;
}

export const startRelateSelectionSchema = z
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
	.strict() satisfies z.ZodType<StartRelateSelectionInput>;

export interface RelateSelectionOutput<Proposal> {
	readonly anchorId: SourceAnchorId;
	readonly suggestions: readonly Proposal[];
}

/** The identity and label needed to navigate to a note. */
interface NoteRef {
	readonly id: NoteId;
	readonly title: string;
}

/** A relationship plus both endpoint notes, resolved for display without a second round trip. */
export interface BacklinkView {
	readonly relationship: NoteRelationship;
	readonly sourceNote: NoteRef;
	readonly targetNote: NoteRef;
}

export interface BacklinkContext {
	readonly relationship: NoteRelationship;
	readonly source: NoteRef;
	readonly target: NoteRef;
}
