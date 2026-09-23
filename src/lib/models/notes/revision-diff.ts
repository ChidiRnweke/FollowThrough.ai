/** How many patch lines a revision diff may run to before it is cut off. */
export const REVISION_DIFF_LINE_LIMIT = 200;

/** The textual content of one revision, the only input a text diff needs. */
export interface RevisionText {
	readonly revision: number;
	readonly title: string;
	readonly plainText: string;
	readonly createdAt: string;
}

export interface NoteRevisionDiff {
	readonly patch: string;
	readonly addedLines: number;
	readonly removedLines: number;
	/** True when the patch hit {@link REVISION_DIFF_LINE_LIMIT} and was cut short. */
	readonly truncated: boolean;
}
