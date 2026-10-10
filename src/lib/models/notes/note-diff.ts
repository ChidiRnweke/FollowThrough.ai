export type DiffBlockKind = 'context' | 'removed' | 'added';

/** The classification of one top-level block, by its index in its own document. */
export interface DiffSideBlock {
	readonly index: number;
	readonly kind: DiffBlockKind;
}

export interface NoteDiff {
	/** Classification of the base document's top-level blocks, in order. */
	readonly base: readonly DiffSideBlock[];
	/** Classification of the candidate document's top-level blocks, in order. */
	readonly candidate: readonly DiffSideBlock[];
}

export interface NoteDiffCounts {
	readonly added: number;
	readonly removed: number;
}

/**
 * A focused block's kind: the diff kinds, plus `elided` for the marker that stands in
 * for a run of unchanged blocks folded out of a focused side.
 */
export type FocusedBlockKind = DiffBlockKind | 'elided';

/** The classification of one top-level block of a focused side, by its index there. */
export interface FocusedSideBlock {
	readonly index: number;
	readonly kind: FocusedBlockKind;
}
