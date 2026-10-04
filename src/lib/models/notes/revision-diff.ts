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
}
