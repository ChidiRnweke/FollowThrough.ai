export interface NoteEdit {
	readonly oldText: string;
	readonly newText: string;
	/** Replace every occurrence instead of requiring the anchor to be unique. */
	readonly replaceAll?: boolean;
}

export type NotePatchFailure =
	| {
			readonly reason: 'not_found';
			readonly editIndex: number;
			readonly oldText: string;
			/** Closest text in the note, so the model can see what it got wrong. */
			readonly nearest?: string;
	  }
	| {
			readonly reason: 'ambiguous';
			readonly editIndex: number;
			readonly oldText: string;
			readonly occurrences: number;
	  }
	| { readonly reason: 'no_op'; readonly editIndex: number }
	| { readonly reason: 'empty_anchor'; readonly editIndex: number };

export type NotePatchResult =
	| {
			readonly ok: true;
			readonly markdown: string;
			readonly appliedEdits: number;
			/** The text each edit actually replaced; a tolerant match may differ from oldText. */
			readonly matchedTexts: readonly string[];
	  }
	| { readonly ok: false; readonly failures: readonly NotePatchFailure[] };
