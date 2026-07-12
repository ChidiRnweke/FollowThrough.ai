import type {
	ActorContext,
	BacklinkView,
	CreateRelationshipInput,
	DateTime,
	NoteRelationship,
	RelationshipId
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type {
	NoteRepository,
	NoteRelationshipRepository,
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/repositories';
import type {
	BacklinkViewAssembler,
	RelationshipCreator,
	RelationshipDeleter,
	RelationshipFinder
} from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class RelationshipManagementService
	implements RelationshipCreator, RelationshipDeleter, RelationshipFinder, BacklinkViewAssembler
{
	constructor(
		private readonly relationships: NoteRelationshipRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async create(actor: ActorContext, input: CreateRelationshipInput): Promise<NoteRelationship> {
		if (input.sourceNoteId === input.targetNoteId)
			throw new ValidationError('A note cannot relate to itself');
		const [source, target] = await Promise.all([
			this.notes.findById(actor, input.sourceNoteId),
			this.notes.findById(actor, input.targetNoteId)
		]);
		if (!source || !target) throw new NotFoundError('Related note was not found');
		if (source.projectId !== target.projectId)
			throw new ValidationError('Related notes must belong to the same project');
		if (input.sourceAnchorId) {
			const anchor = await this.anchors.findById(actor, input.sourceAnchorId);
			if (!anchor || anchor.noteId !== source.id)
				throw new ValidationError('Relationship anchor must belong to its source note');
		}
		if (input.provenanceId && !(await this.provenance.findById(actor, input.provenanceId)))
			throw new NotFoundError('Relationship provenance was not found');
		const timestamp = now();
		return this.relationships.insert(actor, {
			id: crypto.randomUUID() as RelationshipId,
			userId: actor.userId,
			...input,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}
	delete(actor: ActorContext, relationshipId: RelationshipId): Promise<void> {
		return this.relationships.delete(actor, relationshipId);
	}
	async findForNote(
		actor: ActorContext,
		noteId: import('$lib/models').NoteId
	): Promise<readonly NoteRelationship[]> {
		if (!(await this.notes.findById(actor, noteId))) throw new NotFoundError('Note was not found');
		return this.relationships.listForNote(actor, noteId);
	}
	async assemble(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkView[]> {
		return Promise.all(
			relationships.map(async (relationship) => {
				const [source, target] = await Promise.all([
					this.notes.findById(actor, relationship.sourceNoteId),
					this.notes.findById(actor, relationship.targetNoteId)
				]);
				if (!source || !target) throw new NotFoundError('Related note was not found');
				return {
					relationship,
					sourceNote: { id: source.id, title: source.title },
					targetNote: { id: target.id, title: target.title }
				};
			})
		);
	}
}
