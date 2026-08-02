import type { ActorContext, UserId } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type { DiagramId } from '$lib/models/diagrams';
import type { MemoryEntryId } from '$lib/models/memory';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { SearchDocument, SearchMatch } from '$lib/models/knowledge-search';
import type {
	EmbeddedChunk,
	IndexSource,
	PendingIndexSource,
	RetrievalIndexRepository,
	SearchFilter
} from '$lib/server/repositories/knowledge-search';
import type {
	EmbeddingBatch,
	EmbeddingClient
} from '$lib/server/services/knowledge-search/contracts';

interface OwnedSearchDocument {
	userId: UserId;
	document: SearchDocument;
}

const inScope = (actor: ActorContext, source: IndexSource) => (item: OwnedSearchDocument) => {
	if (item.userId !== actor.userId) return false;
	switch (source.kind) {
		case 'note':
			return item.document.noteId === source.noteId && item.document.diagramId === undefined;
		case 'diagram':
			return item.document.diagramId === source.diagramId;
		case 'memory':
			return item.document.memoryEntryId === source.memoryEntryId;
		case 'attachment':
			return item.document.attachmentId === source.attachmentId;
	}
};

const sourceOf = (document: SearchDocument): IndexSource =>
	document.diagramId
		? { kind: 'diagram', diagramId: document.diagramId }
		: document.noteId
			? { kind: 'note', noteId: document.noteId }
			: document.memoryEntryId
				? { kind: 'memory', memoryEntryId: document.memoryEntryId }
				: { kind: 'attachment', attachmentId: document.attachmentId! };

/** Fixed so tests can assert on it without a clock. */
const SUPERSEDED_AT = '2000-01-01T00:00:00.000Z' as SearchDocument['supersededAt'];

const sourceKey = (source: IndexSource): string =>
	`${source.kind}:${
		source.kind === 'note'
			? source.noteId
			: source.kind === 'diagram'
				? source.diagramId
				: source.kind === 'memory'
					? source.memoryEntryId
					: source.attachmentId
	}`;

export class InMemorySearchRepository implements RetrievalIndexRepository {
	documents: OwnedSearchDocument[] = [];

	async listForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId
	): Promise<readonly SearchDocument[]> {
		return this.documents
			.filter((item) => item.userId === actor.userId && item.document.attachmentId === attachmentId)
			.map((item) => item.document)
			.sort((a, b) => a.chunkIndex - b.chunkIndex);
	}

	async replaceForAttachment(
		actor: ActorContext,
		attachmentId: AttachmentId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		this.documents = [
			...this.documents.filter(
				(item) => item.userId !== actor.userId || item.document.attachmentId !== attachmentId
			),
			...documents.map((document) => ({ userId: actor.userId, document }))
		];
	}

	async deleteForAttachment(actor: ActorContext, attachmentId: AttachmentId): Promise<void> {
		this.documents = this.documents.filter(
			(item) => item.userId !== actor.userId || item.document.attachmentId !== attachmentId
		);
	}

	async listForNote(actor: ActorContext, noteId: NoteId): Promise<readonly SearchDocument[]> {
		return this.documents
			.filter(
				(item) =>
					item.userId === actor.userId &&
					item.document.noteId === noteId &&
					item.document.diagramId === undefined
			)
			.map((item) => item.document)
			.sort((a, b) => a.chunkIndex - b.chunkIndex);
	}

	async listForDiagram(
		actor: ActorContext,
		diagramId: DiagramId
	): Promise<readonly SearchDocument[]> {
		return this.documents
			.filter((item) => item.userId === actor.userId && item.document.diagramId === diagramId)
			.map((item) => item.document)
			.sort((a, b) => a.chunkIndex - b.chunkIndex);
	}

	async listForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId
	): Promise<readonly SearchDocument[]> {
		return this.documents
			.filter(
				(item) => item.userId === actor.userId && item.document.memoryEntryId === memoryEntryId
			)
			.map((item) => item.document)
			.sort((a, b) => a.chunkIndex - b.chunkIndex);
	}

	async replaceForNote(
		actor: ActorContext,
		noteId: NoteId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		this.documents = [
			...this.documents.filter(
				(item) =>
					item.userId !== actor.userId ||
					item.document.noteId !== noteId ||
					item.document.diagramId !== undefined
			),
			...documents.map((document) => ({ userId: actor.userId, document }))
		];
	}

	async replaceForDiagram(
		actor: ActorContext,
		diagramId: DiagramId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		this.documents = [
			...this.documents.filter(
				(item) => item.userId !== actor.userId || item.document.diagramId !== diagramId
			),
			...documents.map((document) => ({ userId: actor.userId, document }))
		];
	}

	async replaceForMemoryEntry(
		actor: ActorContext,
		memoryEntryId: MemoryEntryId,
		documents: readonly SearchDocument[]
	): Promise<void> {
		this.documents = [
			...this.documents.filter(
				(item) => item.userId !== actor.userId || item.document.memoryEntryId !== memoryEntryId
			),
			...documents.map((document) => ({ userId: actor.userId, document }))
		];
	}

	async search(
		actor: ActorContext,
		query: string,
		limit: number,
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		return this.documents
			.filter(
				(item) =>
					item.userId === actor.userId &&
					!item.document.supersededAt &&
					(projectId === undefined || item.document.projectId === projectId) &&
					item.document.content.toLowerCase().includes(query.toLowerCase())
			)
			.slice(0, limit)
			.map(({ document }) => ({ document, score: 1 }));
	}

	async searchByEmbedding(
		actor: ActorContext,
		_embedding: readonly number[],
		limit: number,
		projectId?: ProjectId,
		filter?: SearchFilter
	): Promise<readonly SearchMatch[]> {
		return this.documents
			.filter(
				(item) =>
					item.userId === actor.userId &&
					item.document.embedding !== undefined &&
					(projectId === undefined || item.document.projectId === projectId) &&
					(filter?.noteId === undefined || item.document.noteId === filter.noteId)
			)
			.slice(0, limit)
			.map(({ document }) => ({ document, score: 1 }));
	}

	async deleteForNote(actor: ActorContext, noteId: NoteId): Promise<void> {
		this.documents = this.documents.filter(
			(item) =>
				item.userId !== actor.userId ||
				item.document.noteId !== noteId ||
				item.document.diagramId !== undefined
		);
	}

	async deleteForDiagram(actor: ActorContext, diagramId: DiagramId): Promise<void> {
		this.documents = this.documents.filter(
			(item) => item.userId !== actor.userId || item.document.diagramId !== diagramId
		);
	}

	async deleteForMemoryEntry(actor: ActorContext, memoryEntryId: MemoryEntryId): Promise<void> {
		this.documents = this.documents.filter(
			(item) => item.userId !== actor.userId || item.document.memoryEntryId !== memoryEntryId
		);
	}

	async stage(
		actor: ActorContext,
		source: IndexSource,
		documents: readonly SearchDocument[]
	): Promise<void> {
		const scoped = inScope(actor, source);
		const existing = this.documents.filter(scoped);
		const desired = new Set(documents.map((document) => document.id));
		const awaitingVectors = documents.some((document) => !document.embedding);
		const held = awaitingVectors
			? existing.filter((item) => !desired.has(item.document.id) && item.document.embedding)
			: [];

		this.documents = [
			...this.documents.filter((item) => !scoped(item)),
			...held.map((item) => ({
				userId: item.userId,
				document: { ...item.document, supersededAt: SUPERSEDED_AT }
			})),
			...documents.map((document) => {
				const { supersededAt, ...live } = document;
				void supersededAt;
				return { userId: actor.userId, document: live };
			})
		];
	}

	async listPendingSources(limit: number): Promise<readonly PendingIndexSource[]> {
		const seen = new Map<string, PendingIndexSource>();
		for (const item of this.documents) {
			if (item.document.embedding) continue;
			const source = sourceOf(item.document);
			const key = `${item.userId}/${sourceKey(source)}`;
			if (!seen.has(key)) seen.set(key, { userId: item.userId, source });
		}
		return [...seen.values()].slice(0, limit);
	}

	async listPending(actor: ActorContext, source: IndexSource): Promise<readonly SearchDocument[]> {
		return this.documents
			.filter(inScope(actor, source))
			.filter((item) => !item.document.embedding)
			.map((item) => item.document)
			.sort((a, b) => a.chunkIndex - b.chunkIndex);
	}

	async completePending(
		actor: ActorContext,
		source: IndexSource,
		embedded: readonly EmbeddedChunk[],
		embeddingModel: string
	): Promise<void> {
		const scoped = inScope(actor, source);
		const vectors = new Map(embedded.map((chunk) => [chunk.id, chunk.embedding]));
		this.documents = this.documents.map((item) => {
			const vector = scoped(item) ? vectors.get(item.document.id) : undefined;
			return vector
				? { ...item, document: { ...item.document, embedding: vector, embeddingModel } }
				: item;
		});

		const stillPending = this.documents.some((item) => scoped(item) && !item.document.embedding);
		if (stillPending) return;
		this.documents = this.documents.filter((item) => !(scoped(item) && item.document.supersededAt));
	}
}

export class InMemoryEmbeddingClient implements EmbeddingClient {
	model = 'fake-embedding-v1';
	generation = 1;
	returnWrongCount = false;

	async embed(contents: readonly string[]): Promise<EmbeddingBatch> {
		const vectors = contents.map((content, index) => [this.generation, index, content.length]);
		this.generation += 1;
		return {
			model: this.model,
			vectors: this.returnWrongCount ? vectors.slice(1) : vectors
		};
	}
}
