import type {
	ActorContext,
	CreateReferenceInput,
	DateTime,
	ExternalReference,
	NoteId,
	ReferenceCandidate,
	ReferenceId,
	ReferenceView,
	TextSelection
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/errors';
import type {
	NoteRepository,
	ProvenanceRepository,
	ReferenceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories';
const now = (): DateTime => new Date().toISOString() as DateTime;

export class ReferenceLibrary {
	constructor(
		private readonly references: ReferenceRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(actor: ActorContext, input: CreateReferenceInput): Promise<ExternalReference> {
		const note = await this.notes.findById(actor, input.noteId);
		if (!note) throw new NotFoundError('Reference note was not found');
		if (input.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, input.sourceAnchorId);
			if (!anchor || anchor.noteId !== note.id)
				throw new ValidationError('Reference anchor must belong to its note');
		}
		if (input.provenanceId && !(await this.provenance.findById(actor, input.provenanceId)))
			throw new NotFoundError('Reference provenance was not found');
		return this.references.insert(actor, {
			id: crypto.randomUUID() as ReferenceId,
			userId: actor.userId,
			...input,
			createdAt: now()
		});
	}
	delete(actor: ActorContext, referenceId: ReferenceId): Promise<void> {
		return this.references.delete(actor, referenceId);
	}
	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]> {
		if (!(await this.notes.findById(actor, noteId))) throw new NotFoundError('Note was not found');
		return this.references.listForNote(actor, noteId);
	}
	async assemble(
		actor: ActorContext,
		references: readonly ExternalReference[]
	): Promise<readonly ReferenceView[]> {
		return Promise.all(
			references.map(async (reference) => {
				const anchor = reference.sourceAnchorId
					? await this.anchors.findById(actor, reference.sourceAnchorId)
					: undefined;
				return { reference, ...(anchor ? { anchor } : {}) };
			})
		);
	}
	async rank(
		_actor: ActorContext,
		_selection: TextSelection,
		candidates: readonly ReferenceCandidate[]
	): Promise<readonly ReferenceCandidate[]> {
		const weight = { official: 0, standard: 1, vendor: 2, community: 3 };
		return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(
			(left, right) => weight[left.tier] - weight[right.tier] || right.confidence - left.confidence
		);
	}
}

export type ReferenceCreator = Pick<ReferenceLibrary, 'create'>;
export type ReferenceDeleter = Pick<ReferenceLibrary, 'delete'>;
export type ReferenceLister = Pick<ReferenceLibrary, 'listForNote'>;
export type ReferenceViewAssembler = Pick<ReferenceLibrary, 'assemble'>;
