import type { ActorContext } from '$lib/models/identity';
import type { Note, TextSelection } from '$lib/models/notes';
import type {
	SelectionSource,
	SelectionOrigin,
	SelectionProducer,
	SourceAnchorId,
	ProvenanceId
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
		const provenance = await this.provenance.insert(actor, {
			...producer,
			sourceAnchorId: source.anchor.id,
			id: crypto.randomUUID() as ProvenanceId,
			userId: actor.userId,
			createdAt: new Date().toISOString() as DateTime
		});
		return { ...source, provenance };
	}
}

/** Selection offsets describe one observed revision of the source document. */
export function decideSelection(
	selection: TextSelection,
	note: Pick<Note, 'id' | 'currentRevision' | 'plainText'>
): { kind: 'valid' } | { kind: 'invalid'; code: 'VALIDATION' | 'STALE_REVISION'; message: string } {
	if (!selection.text.trim())
		return { kind: 'invalid', code: 'VALIDATION', message: 'A non-empty selection is required' };
	if (selection.revision !== note.currentRevision)
		return {
			kind: 'invalid',
			code: 'STALE_REVISION',
			message: 'The selected note revision is stale'
		};
	if (
		!Number.isInteger(selection.from) ||
		!Number.isInteger(selection.to) ||
		selection.from < 0 ||
		selection.from > selection.to ||
		selection.to > note.plainText.length
	)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: 'Selection offsets are outside the note'
		};
	if (
		selection.noteId !== note.id ||
		note.plainText.slice(selection.from, selection.to) !== selection.text
	)
		return {
			kind: 'invalid',
			code: 'VALIDATION',
			message: 'Selection text does not match the note at those offsets'
		};
	return { kind: 'valid' };
}
