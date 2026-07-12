import type {
	ActorContext,
	DiagramId,
	ProjectId,
	SearchDocument,
	SearchMatch,
	UserId
} from '$lib/models';
import type { RetrievalIndexRepository } from '$lib/repositories';
import type { EmbeddingBatch, EmbeddingClient } from '$lib/services';

interface OwnedSearchDocument {
	userId: UserId;
	document: SearchDocument;
}

export class InMemorySearchRepository implements RetrievalIndexRepository {
	documents: OwnedSearchDocument[] = [];

	async listForNote(
		actor: ActorContext,
		noteId: SearchDocument['noteId']
	): Promise<readonly SearchDocument[]> {
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

	async replaceForNote(
		actor: ActorContext,
		noteId: SearchDocument['noteId'],
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
		projectId?: ProjectId
	): Promise<readonly SearchMatch[]> {
		return this.documents
			.filter(
				(item) =>
					item.userId === actor.userId &&
					(projectId === undefined || item.document.projectId === projectId)
			)
			.slice(0, limit)
			.map(({ document }) => ({ document, score: 1 }));
	}

	async deleteForNote(actor: ActorContext, noteId: SearchDocument['noteId']): Promise<void> {
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
