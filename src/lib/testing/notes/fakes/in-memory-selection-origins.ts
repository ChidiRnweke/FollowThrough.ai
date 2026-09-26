import { anchorBuilder, testAnchorId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { ActorContext } from '$lib/models/identity';
import { decideSelection } from '$lib/server/services/notes/selection-origin';
import { StaleRevisionError, ValidationError } from '$lib/errors';
import type { Note, TextSelection } from '$lib/models/notes';
import type { SelectionSource, SelectionOrigin, SelectionProducer } from '$lib/models/provenance';
import type { SelectionOriginService } from '$lib/server/services/notes/contracts';
import type { InMemoryNoteContent } from './in-memory-content';
import type { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';

/** Uses the same snapshot participants as the controller's other in-memory collaborators. */
export class InMemorySelectionOrigins implements SelectionOriginService {
	private nextAnchor = 100;
	constructor(
		private readonly notes: InMemoryNoteContent,
		private readonly provenance: InMemoryProvenanceRecorder
	) {}
	async validate(actor: ActorContext, selection: TextSelection): Promise<Note> {
		const note = await this.notes.get(actor, selection.noteId);
		const decision = decideSelection(selection, note);
		if (decision.kind === 'invalid') {
			if (decision.code === 'STALE_REVISION') throw new StaleRevisionError(decision.message);
			throw new ValidationError(decision.message);
		}
		return note;
	}
	async resolve(actor: ActorContext, selection: TextSelection): Promise<SelectionSource<Note>> {
		const note = await this.validate(actor, selection);
		const anchor = anchorBuilder({
			id: testAnchorId(this.nextAnchor++),
			noteId: note.id,
			from: selection.from,
			to: selection.to,
			quote: selection.text,
			revision: selection.revision
		});
		this.notes.anchors.push(anchor);
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
