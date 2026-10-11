import type { ActorContext } from '$lib/models/identity';
import type {
	CreateReferenceInput,
	ExternalReference,
	ReferenceId,
	ReferenceView
} from '$lib/models/references';
import type { DateTime } from '$lib/models/workspace';
import type { NoteId } from '$lib/models/notes';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
import type { ReferenceRepository } from '$lib/server/repositories/references/references';
const now = (): DateTime => new Date().toISOString() as DateTime;

export interface ReferenceCreator {
	create(input: CreateReferenceInput): Promise<ExternalReference>;
}
export interface ReferenceLister {
	listForNote(noteId: NoteId): Promise<readonly ExternalReference[]>;
}
export interface ReferenceContextReader {
	readContexts(references: readonly ExternalReference[]): Promise<readonly ReferenceView[]>;
}
/** What a consumer needs to show a note's references with their source anchors. */
export interface ReferenceReader extends ReferenceLister, ReferenceContextReader {}

export class ReferenceLibrary implements ReferenceCreator, ReferenceReader {
	constructor(
		private readonly actor: ActorContext,
		private readonly references: ReferenceRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(input: CreateReferenceInput): Promise<ExternalReference> {
		const note = await this.notes.findById(input.noteId);
		if (!note) throw new NotFoundError('Reference note was not found');
		if (input.sourceAnchorId) {
			const anchor = await this.anchors.findById(input.sourceAnchorId);
			if (!anchor || anchor.noteId !== note.id)
				throw new ValidationError('Reference anchor must belong to its note');
		}
		if (input.provenanceId && !(await this.provenance.findById(input.provenanceId)))
			throw new NotFoundError('Reference provenance was not found');
		return this.references.insert({
			id: crypto.randomUUID() as ReferenceId,
			userId: this.actor.userId,
			...input,
			createdAt: now()
		});
	}
	async listForNote(noteId: NoteId): Promise<readonly ExternalReference[]> {
		if (!(await this.notes.findById(noteId))) throw new NotFoundError('Note was not found');
		return this.references.listForNote(noteId);
	}
	async readContexts(references: readonly ExternalReference[]): Promise<readonly ReferenceView[]> {
		return Promise.all(
			references.map(async (reference) => {
				const anchor = reference.sourceAnchorId
					? await this.anchors.findById(reference.sourceAnchorId)
					: undefined;
				return { reference, ...(anchor ? { anchor } : {}) };
			})
		);
	}
}
