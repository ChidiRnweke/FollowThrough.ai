import type { ActorContext } from '$lib/models/identity';
import type { SearchDocument } from '$lib/models/knowledge-search';
import type {
	EmbeddedChunk,
	IndexSource,
	RetrievalIndexRepository
} from '$lib/server/repositories/knowledge-search';

/** Stored pending chunks are the durable embedding queue. */
export class IndexBacklog {
	constructor(private readonly repository: RetrievalIndexRepository) {}

	listSources(limit: number, after?: string) {
		return this.repository.listPendingSources(limit, after);
	}

	async read(actor: ActorContext, source: IndexSource) {
		const documents = await this.repository.listPending(actor, source);
		return documents.map((document) => ({ id: document.id, input: embeddingInput(document) }));
	}

	complete(
		actor: ActorContext,
		source: IndexSource,
		chunks: readonly EmbeddedChunk[],
		model: string
	) {
		return this.repository.completePending(actor, source, chunks, model);
	}
}

const embeddingInput = (document: SearchDocument): string => {
	const prefix = document.attachmentId ? document.attachmentPath : document.sourceTitle;
	return prefix ? `${prefix}\n${document.content}` : document.content;
};
