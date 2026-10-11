import { SelectionOrigins } from '$lib/server/services/notes/selection-origin';
import type { InMemoryNoteContent } from './in-memory-content';
import type { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor } from '$lib/testing/workspace/fixtures/domain-builders';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	SourceAnchorRepository,
	ProvenanceRepository
} from '$lib/server/repositories/provenance';

/** Real selection rules over the controller fixture's shared transaction participants. */
export class InMemorySelectionOrigins extends SelectionOrigins {
	constructor(notes: InMemoryNoteContent, provenance: InMemoryProvenanceRecorder) {
		super(
			testActor(),
			capabilityDependencies<NoteRepository>({
				findById: (noteId) => notes.get(noteId)
			}),
			capabilityDependencies<SourceAnchorRepository>({
				insert: async (anchor) => {
					notes.anchors.push(anchor);
					return anchor;
				}
			}),
			capabilityDependencies<ProvenanceRepository>({
				insert: (record) => provenance.record(record)
			})
		);
	}
}
