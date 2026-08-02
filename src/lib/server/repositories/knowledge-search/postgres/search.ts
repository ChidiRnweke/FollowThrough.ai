import {
	and,
	asc,
	cosineDistance,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	isNull,
	lte,
	sql
} from 'drizzle-orm';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type { DateTime } from '$lib/models/workspace';
import type { DiagramId } from '$lib/models/diagrams';
import type { MemoryEntryId } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchMatch } from '$lib/models/knowledge-search';
import type {
	CreatedRange,
	SearchFilter
} from '$lib/server/repositories/knowledge-search/retrieval-index';
import type {
	EmbeddedChunk,
	IndexSource,
	PendingIndexSource,
	RetrievalIndexRepository
} from '$lib/server/repositories/knowledge-search';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/knowledge-search';

/**
 * Narrows a query to exactly the chunks belonging to one source. Note chunks
 * exclude diagram chunks, which carry a note id of their own.
 */
const scopeOf = (actor: ActorContext, source: IndexSource) => {
	const owned = eq(schema.searchChunks.userId, actor.userId);
	switch (source.kind) {
		case 'note':
			return and(
				owned,
				eq(schema.searchChunks.noteId, source.noteId),
				isNull(schema.searchChunks.diagramId)
			);
		case 'diagram':
			return and(owned, eq(schema.searchChunks.diagramId, source.diagramId));
		case 'memory':
			return and(owned, eq(schema.searchChunks.memoryEntryId, source.memoryEntryId));
		case 'attachment':
			return and(owned, eq(schema.searchChunks.attachmentId, source.attachmentId));
	}
};

/** The source columns a staged document must inherit, given the source it belongs to. */
const ownershipOf = (source: IndexSource) => {
	switch (source.kind) {
		case 'note':
			return { noteId: source.noteId };
		case 'diagram':
			return { diagramId: source.diagramId };
		case 'memory':
			return { memoryEntryId: source.memoryEntryId };
		case 'attachment':
			return { attachmentId: source.attachmentId };
	}
};

const toDocument = (row: typeof schema.searchChunks.$inferSelect): SearchDocument => ({
	id: row.id as SearchDocument['id'],
	projectId: row.projectId as SearchDocument['projectId'],
	...(row.noteId ? { noteId: row.noteId as NoteId } : {}),
	...(row.memoryEntryId ? { memoryEntryId: row.memoryEntryId as MemoryEntryId } : {}),
	...(row.attachmentId ? { attachmentId: row.attachmentId as AttachmentId } : {}),
	...(row.attachmentPath ? { attachmentPath: row.attachmentPath } : {}),
	...(row.sourceTitle ? { sourceTitle: row.sourceTitle } : {}),
	...(row.sectionPath ? { sectionPath: row.sectionPath } : {}),
	content: row.content,
	contentHash: row.contentHash,
	sourceRevision: row.sourceRevision,
	sourceCreatedAt: row.sourceCreatedAt.toISOString() as DateTime,
	chunkIndex: row.chunkIndex,
	...(row.diagramId ? { diagramId: row.diagramId as SearchDocument['diagramId'] } : {}),
	...(row.sourceAnchorId
		? { sourceAnchorId: row.sourceAnchorId as SearchDocument['sourceAnchorId'] }
		: {}),
	...(row.embedding ? { embedding: row.embedding } : {}),
	...(row.embeddingModel ? { embeddingModel: row.embeddingModel } : {}),
	...(row.supersededAt ? { supersededAt: row.supersededAt.toISOString() as DateTime } : {})
});

export class KnowledgeIndexRecords implements RetrievalIndexRepository {
	constructor(private readonly database: Database) {}

	async listForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId
	): Promise<readonly SearchDocument[]> {
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(
					and(
						eq(schema.searchChunks.userId, actor.userId),
						eq(schema.searchChunks.attachmentId, attachmentId)
					)
				)
				.orderBy(asc(schema.searchChunks.chunkIndex))
		).map(toDocument);
	}

	async replaceForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		await this.deleteForAttachment(actor, attachmentId);
		if (documents.length)
			await this.database
				.insert(schema.searchChunks)
				.values(documents.map((document) => ({ ...this.toRow(actor)(document), attachmentId })));
	}

	async deleteForAttachment(actor: ActorContext, attachmentId: AttachmentId): Promise<void> {
		await this.database
			.delete(schema.searchChunks)
			.where(
				and(
					eq(schema.searchChunks.userId, actor.userId),
					eq(schema.searchChunks.attachmentId, attachmentId)
				)
			);
	}

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
			attachmentId: document.attachmentId,
			attachmentPath: document.attachmentPath,
			sourceTitle: document.sourceTitle,
			sectionPath: document.sectionPath,
			diagramId: document.diagramId,
			sourceAnchorId: document.sourceAnchorId,
			content: document.content,
			contentHash: document.contentHash,
			sourceRevision: document.sourceRevision,
			sourceCreatedAt: document.sourceCreatedAt ? new Date(document.sourceCreatedAt) : new Date(0),
			chunkIndex: document.chunkIndex,
			embedding: document.embedding ? [...document.embedding] : undefined,
			embeddingModel: document.embeddingModel,
			supersededAt: document.supersededAt ? new Date(document.supersededAt) : null
		});
	}

	async search(
		actor: ActorContext,
		query: string,
		limit: number,
		projectId?: ProjectId,
		created: CreatedRange = {}
	): Promise<readonly SearchMatch[]> {
		// Superseded chunks hold text the user has already edited away: correct to keep
		// for semantic recall, wrong to surface as a literal match.
		const conditions = [
			eq(schema.searchChunks.userId, actor.userId),
			isNull(schema.searchChunks.supersededAt),
			sql`${schema.searchChunks.content} ilike ${`%${query}%`}`
		];
		if (projectId) conditions.push(eq(schema.searchChunks.projectId, projectId));
		if (created.createdAfter)
			conditions.push(gte(schema.searchChunks.sourceCreatedAt, new Date(created.createdAfter)));
		if (created.createdBefore)
			conditions.push(lte(schema.searchChunks.sourceCreatedAt, new Date(created.createdBefore)));
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
		projectId?: ProjectId,
		filter: SearchFilter = {}
	): Promise<readonly SearchMatch[]> {
		const distance = cosineDistance(schema.searchChunks.embedding, [...embedding]);
		// Pending chunks have no vector, and a NULL distance sorts ahead of every real
		// one — without this they would crowd out the matches they are meant to replace.
		const conditions = [
			eq(schema.searchChunks.userId, actor.userId),
			isNotNull(schema.searchChunks.embedding)
		];
		if (projectId) conditions.push(eq(schema.searchChunks.projectId, projectId));
		// Diagram chunks carry their note's id, so a note filter includes them:
		// searching a note should see its diagrams too.
		if (filter.noteId) conditions.push(eq(schema.searchChunks.noteId, filter.noteId));
		if (filter.createdAfter)
			conditions.push(gte(schema.searchChunks.sourceCreatedAt, new Date(filter.createdAfter)));
		if (filter.createdBefore)
			conditions.push(lte(schema.searchChunks.sourceCreatedAt, new Date(filter.createdBefore)));
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

	async stage(
		actor: ActorContext,
		source: IndexSource,
		documents: readonly SearchDocument[]
	): Promise<void> {
		const scope = scopeOf(actor, source);
		const ownership = ownershipOf(source);
		const existing = await this.database
			.select({
				id: schema.searchChunks.id,
				embedded: isNotNull(schema.searchChunks.embedding)
			})
			.from(schema.searchChunks)
			.where(scope);

		const known = new Map(existing.map((row) => [row.id, row.embedded]));
		const desired = new Set(documents.map((document) => document.id as string));
		const toRow = this.toRow(actor);

		for (const document of documents) {
			const row = { ...toRow(document), ...ownership };
			if (known.has(document.id))
				await this.database
					.update(schema.searchChunks)
					.set({ ...row, supersededAt: null, updatedAt: new Date() })
					.where(eq(schema.searchChunks.id, document.id));
			else await this.database.insert(schema.searchChunks).values(row);
		}

		// Rows the new revision dropped. Hold the embedded ones back only while some
		// incoming chunk is still waiting for a vector — that is the whole point of
		// superseding. If the caller embedded inline, nothing is pending and the old
		// rows go immediately.
		const awaitingVectors = documents.some((document) => !document.embedding);
		const retired = existing.filter((row) => !desired.has(row.id));
		const supersede = awaitingVectors
			? retired.filter((row) => row.embedded).map((row) => row.id)
			: [];
		const held = new Set(supersede);
		const discard = retired.filter((row) => !held.has(row.id)).map((row) => row.id);
		if (supersede.length)
			await this.database
				.update(schema.searchChunks)
				.set({ supersededAt: new Date() })
				.where(inArray(schema.searchChunks.id, supersede));
		if (discard.length)
			await this.database
				.delete(schema.searchChunks)
				.where(inArray(schema.searchChunks.id, discard));
	}

	async listPendingSources(limit: number): Promise<readonly PendingIndexSource[]> {
		const rows = await this.database
			.selectDistinct({
				userId: schema.searchChunks.userId,
				noteId: schema.searchChunks.noteId,
				diagramId: schema.searchChunks.diagramId,
				memoryEntryId: schema.searchChunks.memoryEntryId,
				attachmentId: schema.searchChunks.attachmentId
			})
			.from(schema.searchChunks)
			.where(isNull(schema.searchChunks.embedding))
			.limit(limit);

		return rows.map((row) => ({
			userId: row.userId as UserId,
			source: (row.diagramId
				? { kind: 'diagram', diagramId: row.diagramId as DiagramId }
				: row.noteId
					? { kind: 'note', noteId: row.noteId as NoteId }
					: row.memoryEntryId
						? { kind: 'memory', memoryEntryId: row.memoryEntryId as MemoryEntryId }
						: {
								kind: 'attachment',
								attachmentId: row.attachmentId as AttachmentId
							}) satisfies IndexSource
		}));
	}

	async listPending(actor: ActorContext, source: IndexSource): Promise<readonly SearchDocument[]> {
		return (
			await this.database
				.select()
				.from(schema.searchChunks)
				.where(and(scopeOf(actor, source), isNull(schema.searchChunks.embedding)))
				.orderBy(asc(schema.searchChunks.chunkIndex))
		).map(toDocument);
	}

	async completePending(
		actor: ActorContext,
		source: IndexSource,
		embedded: readonly EmbeddedChunk[],
		embeddingModel: string
	): Promise<void> {
		const scope = scopeOf(actor, source);
		for (const chunk of embedded)
			await this.database
				.update(schema.searchChunks)
				.set({ embedding: [...chunk.embedding], embeddingModel, updatedAt: new Date() })
				// Scoped as well as keyed: a chunk that was re-staged out from under us
				// no longer belongs to this source and must not be resurrected.
				.where(and(scope, eq(schema.searchChunks.id, chunk.id)));

		// Only retire the superseded rows once nothing is pending. If the source was
		// edited again mid-tick, the rows we just superseded are the only embedded
		// ones left — dropping them here would blind semantic search until the next tick.
		const [stillPending] = await this.database
			.select({ id: schema.searchChunks.id })
			.from(schema.searchChunks)
			.where(and(scope, isNull(schema.searchChunks.embedding)))
			.limit(1);
		if (stillPending) return;

		await this.database
			.delete(schema.searchChunks)
			.where(and(scope, isNotNull(schema.searchChunks.supersededAt)));
	}
}
