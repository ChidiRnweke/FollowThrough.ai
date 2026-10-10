/** What an edit does to a diagram's labels, as the approval card reports it. */
export interface DrawioLabelDiff {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** How many labels neither side touched, so the card can say the change is small. */
	readonly kept: number;
}

export type DrawioLabelRead =
	{ readonly kind: 'labels'; readonly labels: readonly string[] } | { readonly kind: 'unreadable' };
export interface DrawioLabelSourceReader {
	read(source: string): DrawioLabelRead;
}
export type DiagramReviewBaseline =
	| { readonly kind: 'none' }
	| { readonly kind: 'diagram'; readonly labels: readonly string[]; readonly title: string };
export type DiagramChange =
	| { readonly kind: 'created'; readonly title: string; readonly labels: readonly string[] }
	| {
			readonly kind: 'edited';
			readonly title: string;
			readonly added: readonly string[];
			readonly removed: readonly string[];
			readonly kept: number;
	  }
	| { readonly kind: 'unreadable'; readonly title: string };
