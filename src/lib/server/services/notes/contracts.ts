import type { IndexingResult } from '$lib/models/knowledge-search';
import type { ActorContext } from '$lib/models/identity';
import type { Note } from '$lib/models/notes';

export interface NoteIndexer {
	index(actor: ActorContext, note: Note): Promise<IndexingResult>;
}
