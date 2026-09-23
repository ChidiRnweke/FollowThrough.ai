/** Read draw.io label attributes in document order without applying display/search policy. */
export const drawioLabelValues = (document: Document): readonly string[] =>
	Array.from(document.querySelectorAll('mxCell, object, UserObject'))
		.flatMap((element) => [element.getAttribute('label'), element.getAttribute('value')])
		.filter((value): value is string => value !== null);

/** What an edit does to a diagram's labels, as the approval card reports it. */
export interface DrawioLabelDiff {
	readonly added: readonly string[];
	readonly removed: readonly string[];
	/** How many labels neither side touched, so the card can say the change is small. */
	readonly kept: number;
}
