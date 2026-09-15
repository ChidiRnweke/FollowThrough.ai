import type { ActorContext } from '$lib/models/identity';
import type { Note, TextSelection } from '$lib/models/notes';
import type { SelectionSource, SelectionOrigin, SelectionProducer } from '$lib/models/provenance';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { InMemoryNoteContent } from './in-memory-content';
import type { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';

/** Uses the same snapshot participants as the controller's other in-memory collaborators. */
export class InMemorySelectionOrigins implements SelectionOriginService {
	constructor(
		private readonly notes: InMemoryNoteContent,
		private readonly provenance: InMemoryProvenanceRecorder
	) {}
	async resolve(actor: ActorContext, selection: TextSelection): Promise<SelectionSource<Note>> {
		const note = await this.notes.get(actor, selection.noteId);
		const anchor = await this.notes.create(actor, selection);
		return { note, anchor };
	}
	async record(
		actor: ActorContext,
		source: SelectionSource<Note>,
		producer: SelectionProducer
	): Promise<SelectionOrigin<Note>> {
		const provenance = await this.provenance.record(actor, {
			...producer,
			sourceAnchorId: source.anchor.id
		});
		return { ...source, provenance };
	}
}
