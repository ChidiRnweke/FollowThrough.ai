import { and, asc, eq, inArray, lte } from 'drizzle-orm';
import type {
	ActorContext,
	PipelineKind,
	Provenance,
	Suggestion,
	SuggestionId,
	SuggestionStatus,
	SuggestionView,
	TrustPolicy,
	UpdateTrustPolicyInput
} from '$lib/models';
import { ExpiredSuggestionError, InvalidTransitionError, NotFoundError } from '$lib/models';
import type {
	ProvenanceRecorder,
	SuggestionAccepter,
	SuggestionCreator,
	SuggestionFinder,
	SuggestionLister,
	SuggestionProposal,
	SuggestionRejecter,
	SuggestionReverter,
	SuggestionViewAssembler,
	TrustPolicyEvaluator,
	TrustPolicyStore
} from '$lib/services';
import type { Database } from '$lib/server/db';
import type { SuggestionExpiryStore } from '$lib/repositories';
import * as schema from '$lib/server/db/schema';
import { toAnchor, toNote, toProvenance, toSuggestion, toTrustPolicy } from './mappers';

export class PostgresProvenanceRecorder implements ProvenanceRecorder {
	constructor(private readonly database: Database) {}

	async record(
		actor: ActorContext,
		input: Omit<Provenance, 'id' | 'userId' | 'createdAt'>
	): Promise<Provenance> {
		if (input.sourceAnchorId) {
			const [ownedAnchor] = await this.database
				.select({ id: schema.sourceAnchors.id })
				.from(schema.sourceAnchors)
				.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
				.where(
					and(
						eq(schema.sourceAnchors.id, input.sourceAnchorId),
						eq(schema.notes.userId, actor.userId)
					)
				);
			if (!ownedAnchor) throw new NotFoundError('Provenance source anchor was not found');
		}
		const [row] = await this.database
			.insert(schema.provenance)
			.values({
				userId: actor.userId,
				producerKind: input.producerKind,
				producerName: input.producerName,
				pipeline: input.pipeline,
				sourceAnchorId: input.sourceAnchorId,
				runId: input.runId,
				model: input.model,
				metadata: input.metadata as Record<string, unknown>
			})
			.returning();
		return toProvenance(row!);
	}
}

export class PostgresSuggestionCapabilities
	implements
		SuggestionCreator,
		SuggestionFinder,
		SuggestionLister,
		SuggestionViewAssembler,
		SuggestionAccepter,
		SuggestionRejecter,
		SuggestionReverter,
		SuggestionExpiryStore
{
	constructor(private readonly database: Database) {}

	async create(actor: ActorContext, proposal: SuggestionProposal): Promise<Suggestion> {
		const [note, provenance, anchor] = await Promise.all([
			proposal.noteId
				? this.database
						.select({ id: schema.notes.id })
						.from(schema.notes)
						.where(and(eq(schema.notes.id, proposal.noteId), eq(schema.notes.userId, actor.userId)))
						.then((rows) => rows[0])
				: undefined,
			this.database
				.select({ id: schema.provenance.id })
				.from(schema.provenance)
				.where(
					and(
						eq(schema.provenance.id, proposal.provenanceId),
						eq(schema.provenance.userId, actor.userId)
					)
				)
				.then((rows) => rows[0]),
			proposal.sourceAnchorId
				? this.database
						.select({ id: schema.sourceAnchors.id, noteId: schema.sourceAnchors.noteId })
						.from(schema.sourceAnchors)
						.innerJoin(schema.notes, eq(schema.notes.id, schema.sourceAnchors.noteId))
						.where(
							and(
								eq(schema.sourceAnchors.id, proposal.sourceAnchorId),
								eq(schema.notes.userId, actor.userId)
							)
						)
						.then((rows) => rows[0])
				: undefined
		]);
		if (proposal.noteId && !note) throw new NotFoundError('Suggestion note was not found');
		if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
		if (proposal.sourceAnchorId && !anchor)
			throw new NotFoundError('Suggestion source anchor was not found');
		if (proposal.noteId && anchor && anchor.noteId !== proposal.noteId)
			throw new InvalidTransitionError('Suggestion anchor must belong to its note');
		const [row] = await this.database
			.insert(schema.suggestions)
			.values({
				userId: actor.userId,
				noteId: proposal.noteId,
				kind: proposal.kind,
				payload: proposal.payload as unknown as Record<string, unknown>,
				confidence: proposal.confidence,
				provenanceId: proposal.provenanceId,
				sourceAnchorId: proposal.sourceAnchorId
			})
			.returning();
		return toSuggestion(row!);
	}

	async get(actor: ActorContext, id: SuggestionId): Promise<Suggestion> {
		const [row] = await this.database
			.select()
			.from(schema.suggestions)
			.where(and(eq(schema.suggestions.id, id), eq(schema.suggestions.userId, actor.userId)));
		if (!row) throw new NotFoundError('Suggestion was not found', { suggestionId: id });
		return toSuggestion(row);
	}

	async listByStatus(
		actor: ActorContext,
		status: SuggestionStatus,
		noteId?: Suggestion['noteId']
	): Promise<readonly Suggestion[]> {
		const conditions = [
			eq(schema.suggestions.userId, actor.userId),
			eq(schema.suggestions.status, status)
		];
		if (noteId) conditions.push(eq(schema.suggestions.noteId, noteId));
		const rows = await this.database
			.select()
			.from(schema.suggestions)
			.where(and(...conditions))
			.orderBy(asc(schema.suggestions.createdAt));
		return rows.map(toSuggestion);
	}

	async countByStatus(actor: ActorContext, status: SuggestionStatus): Promise<number> {
		return (await this.listByStatus(actor, status)).length;
	}

	async listExpiredProposed(actor: ActorContext, through: string): Promise<readonly Suggestion[]> {
		const rows = await this.database
			.select()
			.from(schema.suggestions)
			.where(
				and(
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'proposed'),
					lte(schema.suggestions.expiresAt, new Date(through))
				)
			);
		return rows.map(toSuggestion);
	}

	async markExpired(actor: ActorContext, ids: readonly SuggestionId[]): Promise<void> {
		if (!ids.length) return;
		await this.database
			.update(schema.suggestions)
			.set({ status: 'expired', decidedAt: new Date() })
			.where(
				and(
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'proposed'),
					inArray(schema.suggestions.id, [...ids])
				)
			);
	}

	async assemble(
		actor: ActorContext,
		suggestions: readonly Suggestion[]
	): Promise<readonly SuggestionView[]> {
		return Promise.all(
			suggestions.map(async (suggestion) => {
				const [provenance] = await this.database
					.select()
					.from(schema.provenance)
					.where(
						and(
							eq(schema.provenance.id, suggestion.provenanceId),
							eq(schema.provenance.userId, actor.userId)
						)
					);
				if (!provenance) throw new NotFoundError('Suggestion provenance was not found');
				const [note] = suggestion.noteId
					? await this.database
							.select()
							.from(schema.notes)
							.where(
								and(eq(schema.notes.id, suggestion.noteId), eq(schema.notes.userId, actor.userId))
							)
					: [];
				const [anchor] = suggestion.sourceAnchorId
					? await this.database
							.select()
							.from(schema.sourceAnchors)
							.where(eq(schema.sourceAnchors.id, suggestion.sourceAnchorId))
					: [];
				return {
					suggestion,
					...(note ? { note: { id: toNote(note).id, title: note.title } } : {}),
					...(anchor ? { anchor: toAnchor(anchor) } : {}),
					provenance: toProvenance(provenance)
				};
			})
		);
	}

	async accept(
		actor: ActorContext,
		suggestion: Suggestion,
		appliedArtifactId: string,
		autoAccepted: boolean
	): Promise<Suggestion> {
		this.assertPending(suggestion);
		const [row] = await this.database
			.update(schema.suggestions)
			.set({
				status: 'accepted',
				decidedAt: new Date(),
				appliedArtifactType: suggestion.kind,
				appliedArtifactId,
				isAutoAccepted: autoAccepted
			})
			.where(
				and(
					eq(schema.suggestions.id, suggestion.id),
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'proposed')
				)
			)
			.returning();
		if (!row) throw new InvalidTransitionError('Suggestion is no longer pending');
		return toSuggestion(row);
	}

	async reject(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		this.assertPending(suggestion);
		const [row] = await this.database
			.update(schema.suggestions)
			.set({ status: 'rejected', decidedAt: new Date() })
			.where(
				and(
					eq(schema.suggestions.id, suggestion.id),
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'proposed')
				)
			)
			.returning();
		if (!row) throw new InvalidTransitionError('Suggestion is no longer pending');
		return toSuggestion(row);
	}

	async revert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		if (suggestion.status !== 'accepted' || !suggestion.appliedArtifactId)
			throw new InvalidTransitionError('Only an applied suggestion can be reverted');
		const [row] = await this.database
			.update(schema.suggestions)
			.set({ status: 'reverted', decidedAt: new Date() })
			.where(
				and(
					eq(schema.suggestions.id, suggestion.id),
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'accepted')
				)
			)
			.returning();
		if (!row) throw new InvalidTransitionError('Suggestion cannot be reverted');
		return toSuggestion(row);
	}

	private assertPending(suggestion: Suggestion): void {
		if (suggestion.expiresAt && suggestion.expiresAt < new Date().toISOString())
			throw new ExpiredSuggestionError('Suggestion has expired');
		if (suggestion.status !== 'proposed')
			throw new InvalidTransitionError('Suggestion is not pending');
	}
}

const PIPELINES: readonly PipelineKind[] = ['extract_promises', 'relate', 'reference', 'agent'];

export class PostgresTrustPolicyCapabilities implements TrustPolicyStore, TrustPolicyEvaluator {
	constructor(private readonly database: Database) {}

	async list(actor: ActorContext): Promise<readonly TrustPolicy[]> {
		const rows = await this.database
			.select()
			.from(schema.trustPolicies)
			.where(eq(schema.trustPolicies.userId, actor.userId));
		const found = new Map(rows.map((row) => [row.pipeline, toTrustPolicy(row)]));
		return PIPELINES.map(
			(pipeline) =>
				found.get(pipeline) ?? {
					userId: actor.userId,
					pipeline,
					autoAcceptEnabled: false,
					conditions: {},
					createdAt: new Date().toISOString() as TrustPolicy['createdAt'],
					updatedAt: new Date().toISOString() as TrustPolicy['updatedAt']
				}
		);
	}

	async upsert(actor: ActorContext, input: UpdateTrustPolicyInput): Promise<TrustPolicy> {
		const [row] = await this.database
			.insert(schema.trustPolicies)
			.values({ userId: actor.userId, ...input })
			.onConflictDoUpdate({
				target: [schema.trustPolicies.userId, schema.trustPolicies.pipeline],
				set: {
					autoAcceptEnabled: input.autoAcceptEnabled,
					minimumConfidence: input.minimumConfidence
				}
			})
			.returning();
		return toTrustPolicy(row!);
	}

	async shouldAutoAccept(
		actor: ActorContext,
		pipeline: PipelineKind,
		suggestion: Suggestion
	): Promise<boolean> {
		if (pipeline === 'reference') return false;
		const policy = (await this.list(actor)).find((item) => item.pipeline === pipeline);
		if (!policy?.autoAcceptEnabled) return false;
		if (policy.minimumConfidence === undefined) return true;
		return (suggestion.confidence ?? 0) >= policy.minimumConfidence;
	}
}
