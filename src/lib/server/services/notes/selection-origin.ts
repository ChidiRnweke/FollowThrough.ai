import type { ActorContext } from '$lib/models/identity';
import { decideSelection, type Note, type TextSelection } from '$lib/models/notes';
import {
	asProvenance,
	type SelectionSource,
	type SelectionOrigin,
	type SelectionProducer,
	type SourceAnchorId,
	type ProvenanceId
} from '$lib/models/provenance';
import type { DateTime } from '$lib/models/workspace';
import { NotFoundError, StaleRevisionError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes';
import type {
	SourceAnchorRepository,
	ProvenanceRepository
} from '$lib/server/repositories/provenance';
export class SelectionOrigins {
	constructor(
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async validate(actor: ActorContext, selection: TextSelection): Promise<Note> {
		return this.selectedNote(actor, selection);
	}
	private async selectedNote(actor: ActorContext, selection: TextSelection): Promise<Note> {
		const note = await this.notes.findById(actor, selection.noteId);
		if (!note) throw new NotFoundError('Selection note was not found');
		const decision = decideSelection(selection, note);
		if (decision.kind === 'invalid') {
			if (decision.code === 'STALE_REVISION') throw new StaleRevisionError(decision.message);
			throw new ValidationError(decision.message);
		}
		return note;
	}
	async resolve(actor: ActorContext, selection: TextSelection): Promise<SelectionSource<Note>> {
		const note = await this.selectedNote(actor, selection);
		const anchor = await this.anchors.insert(actor, {
			id: crypto.randomUUID() as SourceAnchorId,
			noteId: note.id,
			from: selection.from,
			to: selection.to,
			quote: selection.text,
			revision: selection.revision,
			createdAt: new Date().toISOString() as DateTime
		});
		return { note, anchor };
	}
	async record(
		actor: ActorContext,
		source: SelectionSource<Note>,
		producer: SelectionProducer
	): Promise<SelectionOrigin<Note>> {
		const provenance = await this.provenance.insert(
			actor,
			asProvenance(
				{ ...producer, sourceAnchorId: source.anchor.id },
				{
					id: crypto.randomUUID() as ProvenanceId,
					userId: actor.userId,
					createdAt: new Date().toISOString() as DateTime
				}
			)
		);
		return { ...source, provenance };
	}
}
