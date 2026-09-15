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

export interface RelateSelectionInput {
	readonly selection: TextSelection;
}

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

/** Existing links keep their identity and origin when another proposal changes the explanation. */
export function decideRelationshipWrite<
	Record extends { readonly justification?: string; readonly updatedAt: string }
>(incoming: Record, current: Record | null) {
	if (!current) return { kind: 'created' as const, after: incoming };
	if (current.justification === incoming.justification)
		return { kind: 'unchanged' as const, after: current };
	return {
		kind: 'modified' as const,
		before: current,
		after: { ...current, justification: incoming.justification, updatedAt: incoming.updatedAt }
	};
}
