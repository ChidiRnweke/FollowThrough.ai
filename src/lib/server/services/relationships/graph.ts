import type { ActorContext } from '$lib/models/identity';
import type {
	BacklinkView,
	CreateRelationshipInput,
	RelationshipId
} from '$lib/models/relationships';
import type { DateTime } from '$lib/models/workspace';
import type { Note, NoteId, NoteRelationship } from '$lib/models/notes';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { NoteRepository } from '$lib/server/repositories/notes/notes';
import type { NoteRelationshipRepository } from '$lib/server/repositories/relationships/relationships';
import type {
	ProvenanceRepository,
	SourceAnchorRepository
} from '$lib/server/repositories/provenance';
const now = (): DateTime => new Date().toISOString() as DateTime;

export class RelationshipGraph {
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

	/**
	 * Make the note's `mentions` rows match the links in its document.
	 *
	 * Only `mentions` is touched. `prior_decision`, `contradicts` and `elaborates` come from
	 * the AI suggestion pipeline and have no representation in the document, so treating an
	 * absent link as a reason to delete them would quietly wipe inferred relationships on
	 * the next save.
	 *
	 * A target outside the note's project is skipped rather than thrown: the picker already
	 * scopes to the project, so reaching this means the document outlived a note that moved,
	 * and losing one link is better than making the note unsaveable.
	 */
	async reconcile(actor: ActorContext, note: Note, targets: readonly NoteId[]): Promise<void> {
		const existing = (await this.relationships.listForNote(actor, note.id)).filter(
			(relationship) => relationship.kind === 'mentions' && relationship.sourceNoteId === note.id
		);
		const wanted = new Set(targets.filter((target) => target !== note.id));
		const current = new Set(existing.map((relationship) => relationship.targetNoteId));

		for (const relationship of existing)
			if (!wanted.has(relationship.targetNoteId))
				await this.relationships.delete(actor, relationship.id);

		for (const target of wanted) {
			if (current.has(target)) continue;
			const targetNote = await this.notes.findById(actor, target);
			if (!targetNote || targetNote.projectId !== note.projectId) continue;
			const timestamp = now();
			await this.relationships.insert(actor, {
				id: crypto.randomUUID() as RelationshipId,
				userId: actor.userId,
				sourceNoteId: note.id,
				targetNoteId: target,
				kind: 'mentions',
				createdAt: timestamp,
				updatedAt: timestamp
			});
		}
	}
	async findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]> {
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

export type RelationshipCreator = Pick<RelationshipGraph, 'create'>;
export type RelationshipDeleter = Pick<RelationshipGraph, 'delete'>;
export type RelationshipFinder = Pick<RelationshipGraph, 'findForNote'>;
export type NoteLinkReconciler = Pick<RelationshipGraph, 'reconcile'>;
export type BacklinkViewAssembler = Pick<RelationshipGraph, 'assemble'>;
