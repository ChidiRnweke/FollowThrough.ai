import { and, asc, cosineDistance, desc, eq, isNull, sql } from 'drizzle-orm';
import type {
	ActorContext,
	DiagramId,
	MemoryEntryId,
	NoteId,
	ProjectId,
	SearchDocument,
	SearchMatch
} from '$lib/models';
import type { RetrievalIndexRepository } from '$lib/repositories';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';

const toDocument = (row: typeof schema.searchChunks.$inferSelect): SearchDocument => ({
	id: row.id as SearchDocument['id'],
	projectId: row.projectId as SearchDocument['projectId'],
	...(row.noteId ? { noteId: row.noteId as NoteId } : {}),
	...(row.memoryEntryId ? { memoryEntryId: row.memoryEntryId as MemoryEntryId } : {}),
	content: row.content,
	contentHash: row.contentHash,
	sourceRevision: row.sourceRevision,
	chunkIndex: row.chunkIndex,
	...(row.diagramId ? { diagramId: row.diagramId as SearchDocument['diagramId'] } : {}),
	...(row.sourceAnchorId
		? { sourceAnchorId: row.sourceAnchorId as SearchDocument['sourceAnchorId'] }
		: {}),
	...(row.embedding ? { embedding: row.embedding } : {}),
	...(row.embeddingModel ? { embeddingModel: row.embeddingModel } : {})
});

export class PostgresRetrievalIndexRepository implements RetrievalIndexRepository {
	constructor(private readonly database: Database) {}

	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SearchDocument[]> {
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(
					and(
						eq(schema.searchChunks.userId, actor.userId),
						eq(schema.searchChunks.noteId, noteId),
						isNull(schema.searchChunks.diagramId)
					)
				)
				.orderBy(asc(schema.searchChunks.chunkIndex))
		).map(toDocument);
	}

	async listForDiagram(
		actor: ActorContext,
		diagramId: DiagramId
	): Promise<readonly SearchDocument[]> {
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(
					and(
						eq(schema.searchChunks.userId, actor.userId),
						eq(schema.searchChunks.diagramId, diagramId)
					)
				)
				.orderBy(asc(schema.searchChunks.chunkIndex))
		).map(toDocument);
	}

	async listForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId
	): Promise<readonly SearchDocument[]> {
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(
					and(
						eq(schema.searchChunks.userId, actor.userId),
						eq(schema.searchChunks.memoryEntryId, memoryEntryId)
					)
				)
				.orderBy(asc(schema.searchChunks.chunkIndex))
		).map(toDocument);
	}

	async replaceForNote(
		actor: ActorContext,
		noteId: NoteId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		await this.database
			.delete(schema.searchChunks)
			.where(
				and(
					eq(schema.searchChunks.userId, actor.userId),
					eq(schema.searchChunks.noteId, noteId),
					isNull(schema.searchChunks.diagramId)
				)
			);
		if (!documents.length) return;
		await this.database.insert(schema.searchChunks).values(documents.map(this.toRow(actor)));
	}

	async replaceForDiagram(
		actor: ActorContext,
		diagramId: DiagramId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		await this.deleteForDiagram(actor, diagramId);
		if (!documents.length) return;
		await this.database
			.insert(schema.searchChunks)
			.values(documents.map((document) => ({ ...this.toRow(actor)(document), diagramId })));
	}

	async replaceForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		await this.deleteForMemoryEntry(actor, memoryEntryId);
		if (!documents.length) return;
		await this.database
			.insert(schema.searchChunks)
			.values(documents.map((document) => ({ ...this.toRow(actor)(document), memoryEntryId })));
	}

	private toRow(actor: ActorContext) {
		return (document: SearchDocument) => ({
			id: document.id,
			userId: actor.userId,
			projectId: document.projectId,
			noteId: document.noteId,
			memoryEntryId: document.memoryEntryId,
			diagramId: document.diagramId,
			sourceAnchorId: document.sourceAnchorId,
			content: document.content,
			contentHash: document.contentHash,
			sourceRevision: document.sourceRevision,
			chunkIndex: document.chunkIndex,
			embedding: document.embedding ? [...document.embedding] : undefined,
			embeddingModel: document.embeddingModel
		});
	}

	async search(
		actor: ActorContext,
		query: string,
		limit: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		const conditions = [
			eq(schema.searchChunks.userId, actor.userId),
			sql`${schema.searchChunks.content} ilike ${`%${query}%`}`
		];
		if (projectId) conditions.push(eq(schema.searchChunks.projectId, projectId));
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(and(...conditions))
				.orderBy(desc(schema.searchChunks.updatedAt))
				.limit(limit)
		).map((row) => ({ document: toDocument(row), score: 1 }));
	}

	async searchByEmbedding(
		actor: ActorContext,
		embedding: readonly number[],
		limit: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		const distance = cosineDistance(schema.searchChunks.embedding, [...embedding]);
		const conditions = [eq(schema.searchChunks.userId, actor.userId)];
		if (projectId) conditions.push(eq(schema.searchChunks.projectId, projectId));
		const rows = await this.database
			.select({ chunk: schema.searchChunks, distance })
			.from(schema.searchChunks)
			.where(and(...conditions))
			.orderBy(asc(distance))
			.limit(limit);
		return rows.map(({ chunk, distance: value }) => ({
			document: toDocument(chunk),
			score: Math.max(0, 1 - Number(value))
		}));
	}

	async deleteForNote(actor: ActorContext, noteId: NoteId): Promise<void> {
		await this.database
			.delete(schema.searchChunks)
			.where(
				and(
					eq(schema.searchChunks.userId, actor.userId),
					eq(schema.searchChunks.noteId, noteId),
					isNull(schema.searchChunks.diagramId)
				)
			);
	}

	async deleteForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<void> {
		await this.database
			.delete(schema.searchChunks)
			.where(
				and(
					eq(schema.searchChunks.userId, actor.userId),
					eq(schema.searchChunks.diagramId, diagramId)
				)
			);
	}

	async deleteForMemoryEntry(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<void> {
		await this.database
			.delete(schema.searchChunks)
			.where(
				and(
					eq(schema.searchChunks.userId, actor.userId),
					eq(schema.searchChunks.memoryEntryId, memoryEntryId)
				)
			);
	}
}
