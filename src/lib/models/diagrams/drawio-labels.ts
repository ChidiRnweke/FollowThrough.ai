/** What an edit does to a diagram's labels, as the approval card reports it. */
export interface DrawioLabelDiff {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** How many labels neither side touched, so the card can say the change is small. */
	readonly kept: number;
}
