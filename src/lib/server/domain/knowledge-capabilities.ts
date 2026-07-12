import { and, eq, inArray, or } from 'drizzle-orm';
import type {
	ActorContext,
	BacklinkView,
	CreateReferenceInput,
	CreateRelationshipInput,
	ExternalReference,
	LinkCandidate,
	NoteId,
	NoteRelationship,
	PromiseCandidate,
	ReferenceCandidate,
	TextSelection,
	Url
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type {
	BacklinkViewAssembler,
	LinkFinder,
	PromiseExtractor,
	ReferenceCreator,
	ReferenceDeleter,
	ReferenceFinder,
	ReferenceLister,
	ReferenceRanker,
	RelationshipCreator,
	RelationshipDeleter,
	RelationshipFinder
} from '$lib/services';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toNote, toReference, toRelationship } from './mappers';
import { parsePromises } from './promise-parser';

export class DeterministicPromiseExtractor implements PromiseExtractor {
	async extract(
		_actor: ActorContext,
		selection: TextSelection
	): Promise<readonly PromiseCandidate[]> {
		return parsePromises(selection);
	}
}

export class PostgresKnowledgeCapabilities
	implements
		RelationshipCreator,
		RelationshipDeleter,
		RelationshipFinder,
		BacklinkViewAssembler,
		LinkFinder,
		ReferenceCreator,
		ReferenceDeleter,
		ReferenceRanker
{
	constructor(private readonly database: Database) {}

	async create(actor: ActorContext, input: CreateRelationshipInput): Promise<NoteRelationship>;
	async create(actor: ActorContext, input: CreateReferenceInput): Promise<ExternalReference>;
	async create(
		actor: ActorContext,
		input: CreateRelationshipInput | CreateReferenceInput
	): Promise<NoteRelationship | ExternalReference> {
		if ('sourceNoteId' in input) {
			if (input.sourceNoteId === input.targetNoteId)
				throw new ValidationError('A note cannot relate to itself');
			const ownedNotes = await this.database
				.select({ id: schema.notes.id, projectId: schema.notes.projectId })
				.from(schema.notes)
				.where(
					and(
						eq(schema.notes.userId, actor.userId),
						inArray(schema.notes.id, [input.sourceNoteId, input.targetNoteId])
					)
				);
			if (ownedNotes.length !== 2) throw new NotFoundError('Related note was not found');
			if (ownedNotes[0]!.projectId !== ownedNotes[1]!.projectId)
				throw new ValidationError('Related notes must belong to the same project');
			const [row] = await this.database
				.insert(schema.noteRelationships)
				.values({ userId: actor.userId, ...input })
				.onConflictDoUpdate({
					target: [
						schema.noteRelationships.sourceNoteId,
						schema.noteRelationships.targetNoteId,
						schema.noteRelationships.kind
					],
					set: { justification: input.justification }
				})
				.returning();
			return toRelationship(row!);
		}
		const [note] = await this.database
			.select({ projectId: schema.notes.projectId })
			.from(schema.notes)
			.where(and(eq(schema.notes.id, input.noteId), eq(schema.notes.userId, actor.userId)));
		if (!note) throw new NotFoundError('Reference note was not found');
		const [row] = await this.database
			.insert(schema.references)
			.values({ userId: actor.userId, projectId: note.projectId, ...input })
			.returning();
		return toReference(row!);
	}

	async delete(actor: ActorContext, id: import('$lib/models').RelationshipId): Promise<void>;
	async delete(actor: ActorContext, id: import('$lib/models').ReferenceId): Promise<void>;
	async delete(
		actor: ActorContext,
		id: import('$lib/models').RelationshipId | import('$lib/models').ReferenceId
	): Promise<void> {
		const [relationship] = await this.database
			.delete(schema.noteRelationships)
			.where(
				and(eq(schema.noteRelationships.id, id), eq(schema.noteRelationships.userId, actor.userId))
			)
			.returning({ id: schema.noteRelationships.id });
		if (relationship) return;
		const [reference] = await this.database
			.delete(schema.references)
			.where(and(eq(schema.references.id, id), eq(schema.references.userId, actor.userId)))
			.returning({ id: schema.references.id });
		if (!reference) throw new NotFoundError('Artifact was not found');
	}

	async findForNote(actor: ActorContext, noteId: NoteId): Promise<readonly NoteRelationship[]> {
		return (
			await this.database
				.select()
				.from(schema.noteRelationships)
				.where(
					and(
						eq(schema.noteRelationships.userId, actor.userId),
						or(
							eq(schema.noteRelationships.sourceNoteId, noteId),
							eq(schema.noteRelationships.targetNoteId, noteId)
						)
					)
				)
		).map(toRelationship);
	}

	async assemble(
		actor: ActorContext,
		relationships: readonly NoteRelationship[]
	): Promise<readonly BacklinkView[]> {
		return Promise.all(
			relationships.map(async (relationship) => {
				const rows = await this.database
					.select()
					.from(schema.notes)
					.where(
						and(
							inArray(schema.notes.id, [relationship.sourceNoteId, relationship.targetNoteId]),
							eq(schema.notes.userId, actor.userId)
						)
					);
				const source = rows.find((row) => row.id === relationship.sourceNoteId);
				const target = rows.find((row) => row.id === relationship.targetNoteId);
				if (!source || !target) throw new NotFoundError('Related note was not found');
				return {
					relationship,
					sourceNote: { id: toNote(source).id, title: source.title },
					targetNote: { id: toNote(target).id, title: target.title }
				};
			})
		);
	}

	find(actor: ActorContext, selection: TextSelection): Promise<readonly LinkCandidate[]>;
	async find(actor: ActorContext, input: TextSelection): Promise<readonly LinkCandidate[]> {
		const noteRows = await this.database
			.select()
			.from(schema.notes)
			.where(eq(schema.notes.userId, actor.userId));
		const contradicts = /\b(?:not|never|instead|opposite)\b/i.test(input.text);
		return noteRows
			.filter((note) => note.id !== input.noteId)
			.filter((note) =>
				input.text
					.toLowerCase()
					.split(/\W+/)
					.some((word) => word.length > 3 && note.plainText.toLowerCase().includes(word))
			)
			.slice(0, 5)
			.map((note, index) => ({
				targetNoteId: toNote(note).id,
				kind: contradicts && index === 0 ? 'contradicts' : 'mentions',
				justification: contradicts
					? 'Conflicts with a prior note that discusses the same subject.'
					: 'Discusses the same subject.',
				confidence: Math.max(60, 90 - index * 5)
			}));
	}

	async listReferencesForNote(
		actor: ActorContext,
		noteId: NoteId
	): Promise<readonly ExternalReference[]> {
		return (
			await this.database
				.select()
				.from(schema.references)
				.where(
					and(eq(schema.references.userId, actor.userId), eq(schema.references.noteId, noteId))
				)
		).map(toReference);
	}

	async findReferences(
		_actor: ActorContext,
		selection: TextSelection
	): Promise<readonly ReferenceCandidate[]> {
		if (!/oauth|api|http|security|architecture/i.test(selection.text)) return [];
		return [
			{
				url: 'https://www.rfc-editor.org/rfc/rfc6749' as Url,
				title: 'RFC 6749: OAuth 2.0',
				tier: 'standard',
				relevanceNote: 'Defines the OAuth authorization framework used by this design.',
				confidence: 95
			}
		];
	}

	async rank(
		_actor: ActorContext,
		_selection: TextSelection,
		candidates: readonly ReferenceCandidate[]
	): Promise<readonly ReferenceCandidate[]> {
		const weight = { official: 0, standard: 1, vendor: 2, community: 3 };
		return [...new Map(candidates.map((candidate) => [candidate.url, candidate])).values()].sort(
			(a, b) => weight[a.tier] - weight[b.tier] || b.confidence - a.confidence
		);
	}
}

export class DeterministicReferenceFinder implements ReferenceFinder {
	constructor(private readonly knowledge: PostgresKnowledgeCapabilities) {}
	find(actor: ActorContext, selection: TextSelection): Promise<readonly ReferenceCandidate[]> {
		return this.knowledge.findReferences(actor, selection);
	}
}

export class PostgresReferenceLister implements ReferenceLister {
	constructor(private readonly knowledge: PostgresKnowledgeCapabilities) {}
	listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly ExternalReference[]> {
		return this.knowledge.listReferencesForNote(actor, noteId);
	}
}
