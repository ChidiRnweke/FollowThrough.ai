import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import type { InMemoryNoteContent } from './in-memory-content';
import type { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	SourceAnchorRepository,
	ProvenanceRepository
} from '$lib/server/repositories/provenance';

/** Real selection rules over the controller fixture's shared transaction participants. */
export class InMemorySelectionOrigins extends SelectionOrigins {
	constructor(notes: InMemoryNoteContent, provenance: InMemoryProvenanceRecorder) {
		super(
			capabilityDependencies<NoteRepository>({
				findById: (actor, noteId) => notes.get(actor, noteId)
			}),
			capabilityDependencies<SourceAnchorRepository>({
				insert: async (_actor, anchor) => {
					notes.anchors.push(anchor);
					return anchor;
				}
			}),
			capabilityDependencies<ProvenanceRepository>({
				insert: (actor, record) => provenance.record(actor, record)
			})
		);
	}
}
