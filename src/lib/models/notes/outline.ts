/** One heading, as the rail renders it. */
export interface OutlineHeading {
	readonly id: string;
	readonly level: number;
	readonly text: string;
}

/** A heading's top edge, in the scroll container's coordinate space. */
export interface OutlineOffset {
	readonly id: string;
	readonly top: number;
}

/**
 * Structurally what the table-of-contents extension emits. Declared here so the
 * model stays free of editor imports.
 */
export interface OutlineSource {
	readonly id?: string | null;
	readonly level: number;
	readonly textContent: string;
}
