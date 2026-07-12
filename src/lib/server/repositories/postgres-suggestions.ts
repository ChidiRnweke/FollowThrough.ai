import { and, asc, eq, isNull, lte } from 'drizzle-orm';
import type {
	ActorContext,
	DateTime,
	Suggestion,
	SuggestionId,
	SuggestionStatus
} from '$lib/models';
import type { SuggestionRepository, SuggestionTransition } from '$lib/repositories/suggestions';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { toSuggestion } from '../domain/mappers';

export class PostgresSuggestionRepository implements SuggestionRepository {
	constructor(private readonly database: Database) {}
	async findById(actor: ActorContext, id: SuggestionId): Promise<Suggestion | undefined> {
		const [row] = await this.database
			.select()
			.from(schema.suggestions)
			.where(and(eq(schema.suggestions.id, id), eq(schema.suggestions.userId, actor.userId)));
		return row ? toSuggestion(row) : undefined;
	}
	async list(
		actor: ActorContext,
		filter: { noteId?: Suggestion['noteId']; status?: SuggestionStatus }
	): Promise<readonly Suggestion[]> {
		const conditions = [eq(schema.suggestions.userId, actor.userId)];
		if (filter.noteId) conditions.push(eq(schema.suggestions.noteId, filter.noteId));
		if (filter.status) conditions.push(eq(schema.suggestions.status, filter.status));
		return (
			await this.database
				.select({ suggestion: schema.suggestions })
				.from(schema.suggestions)
				.leftJoin(schema.notes, eq(schema.notes.id, schema.suggestions.noteId))
				.leftJoin(schema.projects, eq(schema.projects.id, schema.notes.projectId))
				.where(and(...conditions, isNull(schema.projects.archivedAt)))
				.orderBy(asc(schema.suggestions.createdAt))
		).map((row) => toSuggestion(row.suggestion));
	}
	async insert(actor: ActorContext, suggestion: Suggestion): Promise<Suggestion> {
		const [row] = await this.database
			.insert(schema.suggestions)
			.values({
				id: suggestion.id,
				userId: actor.userId,
				noteId: suggestion.noteId,
				kind: suggestion.kind,
				status: suggestion.status,
				payload: suggestion.payload as unknown as Record<string, unknown>,
				confidence: suggestion.confidence,
				provenanceId: suggestion.provenanceId,
				sourceAnchorId: suggestion.sourceAnchorId,
				decidedAt: suggestion.decidedAt ? new Date(suggestion.decidedAt) : undefined,
				expiresAt: suggestion.expiresAt ? new Date(suggestion.expiresAt) : undefined,
				appliedArtifactType: suggestion.appliedArtifactId ? suggestion.kind : undefined,
				appliedArtifactId: suggestion.appliedArtifactId,
				isAutoAccepted: suggestion.isAutoAccepted,
				createdAt: new Date(suggestion.createdAt),
				updatedAt: new Date(suggestion.updatedAt)
			})
			.returning();
		return toSuggestion(row!);
	}
	async transition(
		actor: ActorContext,
		id: SuggestionId,
		expectedStatus: SuggestionStatus,
		patch: SuggestionTransition
	): Promise<Suggestion | undefined> {
		const [row] = await this.database
			.update(schema.suggestions)
			.set({
				status: patch.status,
				decidedAt: patch.decidedAt ? new Date(patch.decidedAt) : undefined,
				appliedArtifactType: patch.appliedArtifactType,
				appliedArtifactId: patch.appliedArtifactId,
				isAutoAccepted: patch.isAutoAccepted,
				updatedAt: patch.updatedAt ? new Date(patch.updatedAt) : undefined
			})
			.where(
				and(
					eq(schema.suggestions.id, id),
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, expectedStatus)
				)
			)
			.returning();
		return row ? toSuggestion(row) : undefined;
	}
	async expireProposedThrough(actor: ActorContext, through: DateTime): Promise<number> {
		const rows = await this.database
			.update(schema.suggestions)
			.set({ status: 'expired', decidedAt: new Date(through), updatedAt: new Date(through) })
			.where(
				and(
					eq(schema.suggestions.userId, actor.userId),
					eq(schema.suggestions.status, 'proposed'),
					lte(schema.suggestions.expiresAt, new Date(through))
				)
			)
			.returning({ id: schema.suggestions.id });
		return rows.length;
	}
}
