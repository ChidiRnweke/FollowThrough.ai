import type { InlineGroundingSnapshot } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';

/** One section of one note: where a caret rests and what its grounding describes. */
export interface InlineGroundingKey {
	readonly noteId: NoteId;
	readonly sectionKey: string;
}

/**
 * What the grounding was built from, as fingerprints: the project's indexed
 * knowledge outside the note being written, and the user's own memory. Each is
 * the newest change time and the row count joined, so an edit, an addition and
 * a deletion all move it. Equal fingerprints mean the retrieval would see the
 * same corpus again.
 */
export interface InlineGroundingMarkers {
	readonly knowledge: string;
	readonly memory: string;
}

export interface InlineGroundingLookup {
	readonly stored: InlineGroundingSnapshot | undefined;
	/** The fingerprints the corpus carries now, to compare with the stored ones. */
	readonly current: InlineGroundingMarkers;
}

export interface InlineGroundingRepository {
	find(key: InlineGroundingKey, projectId: ProjectId): Promise<InlineGroundingLookup>;
	/** Replaces the section's grounding; there is one row per section. */
	put(key: InlineGroundingKey, snapshot: InlineGroundingSnapshot): Promise<void>;
}
