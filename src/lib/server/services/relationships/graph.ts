import type { AppliedChange } from '$lib/models/proposal-effects';
import type { ActorContext } from '$lib/models/identity';
import type {
	BacklinkContext,
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

export interface RelationshipCreator {
	createWithChange(
		actor: ActorContext,
		input: CreateRelationshipInput
	): Promise<AppliedChange<NoteRelationship>>;
}
export class RelationshipWritingService implements RelationshipCreator {
	constructor(
		private readonly relationships: NoteRelationshipRepository,
		private readonly notes: NoteRepository,
		private readonly anchors: SourceAnchorRepository,
		private readonly provenance: ProvenanceRepository
	) {}
	async createWithChange(
		actor: ActorContext,
		input: CreateRelationshipInput
	): Promise<AppliedChange<NoteRelationship>> {
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
		return writeRelationship(this.relationships, actor, {
			id: crypto.randomUUID() as RelationshipId,
			userId: actor.userId,
			...input,
			createdAt: timestamp,
			updatedAt: timestamp
		});
	}
}
export interface NoteLinkReconciler {
	reconcile(actor: ActorContext, note: Note, targets: readonly NoteId[]): Promise<void>;
}
export class NoteLinkReconciliationService implements NoteLinkReconciler {
	constructor(
		private readonly relationships: NoteRelationshipRepository,
		private readonly notes: NoteRepository
	) {}
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
			await writeRelationship(this.relationships, actor, {
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
}
export interface RelationshipFinder {
	findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]>;
}
export interface BacklinkContextReader {
	readContexts(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkContext[]>;
}
export class RelationshipReadingService implements RelationshipFinder, BacklinkContextReader {
	constructor(
		private readonly relationships: NoteRelationshipRepository,
		private readonly notes: NoteRepository
	) {}
	async findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]> {
		if (!(await this.notes.findById(actor, noteId))) throw new NotFoundError('Note was not found');
		return this.relationships.listForNote(actor, noteId);
	}
	async readContexts(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkContext[]> {
		const contexts = await Promise.all(
			relationships.map(async (relationship) => {
				const [source, target] = await Promise.all([
					this.notes.findById(actor, relationship.sourceNoteId),
					this.notes.findById(actor, relationship.targetNoteId)
				]);
				return source && target ? [{ relationship, source, target }] : [];
			})
		);
		return contexts.flat();
	}
}
async function writeRelationship(
	relationships: NoteRelationshipRepository,
	actor: ActorContext,
	incoming: NoteRelationship
): Promise<AppliedChange<NoteRelationship>> {
	const current = await relationships.findForWrite(actor, incoming);
	if (!current) return { kind: 'created', after: await relationships.insert(actor, incoming) };
	if (current.justification === incoming.justification)
		return { kind: 'unchanged', after: current };
	const after = await relationships.update(actor, {
		...current,
		justification: incoming.justification,
		updatedAt: incoming.updatedAt
	});
	return { kind: 'modified', before: current, after };
}
