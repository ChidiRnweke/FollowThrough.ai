import type {
	ActorContext,
	ContentHash,
	Diagram,
	MemoryEntry,
	Note,
	SearchDocument,
	SearchDocumentId
} from '$lib/models';
import { InvalidGeneratedContentError } from '$lib/models';
import type { RetrievalIndexRepository } from '$lib/repositories';
import type { ContentChunker, EmbeddingClient } from './contracts';
import type { DiagramIndexer } from '$lib/services/diagrams/contracts';
import type { MemoryIndexer } from '$lib/services/memory/contracts';
import type { NoteIndexer } from '$lib/services/notes/contracts';

export class ParagraphChunker implements ContentChunker {
	constructor(private readonly maximumCharacters = 1200) {}

	chunk(content: string): readonly string[] {
		const normalized = content.replace(/\r\n/g, '\n').trim();
		if (!normalized) return [];
		const chunks: string[] = [];
		let current = '';
		for (const paragraph of normalized.split(/\n\s*\n/)) {
			for (const segment of this.splitLongParagraph(paragraph.trim())) {
				const combined = current ? `${current}\n\n${segment}` : segment;
				if (combined.length <= this.maximumCharacters) current = combined;
				else {
					if (current) chunks.push(current);
					current = segment;
				}
			}
		}
		if (current) chunks.push(current);
		return chunks;
	}

	private splitLongParagraph(paragraph: string): readonly string[] {
		if (paragraph.length <= this.maximumCharacters) return [paragraph];
		const segments: string[] = [];
		let current = '';
		for (const word of paragraph.split(/\s+/)) {
			const combined = current ? `${current} ${word}` : word;
			if (combined.length <= this.maximumCharacters) current = combined;
			else {
				if (current) segments.push(current);
				current = word;
			}
		}
		if (current) segments.push(current);
		return segments;
	}
}

const contentHash = async (content: string): Promise<ContentHash> => {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('') as ContentHash;
};

export class EmbeddedNoteIndexer implements NoteIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new ParagraphChunker()
	) {}

	async index(actor: ActorContext, note: Note): Promise<void> {
		const contents = this.chunker.chunk(note.plainText);
		if (!contents.length) {
			await this.repository.deleteForNote(actor, note.id);
			return;
		}
		const hashes = await Promise.all(contents.map(contentHash));
		const existing = await this.repository.listForNote(actor, note.id);
		const reusable = new Map(
			existing
				.filter((document) => document.embeddingModel === this.embeddingClient.model)
				.map((document) => [document.contentHash, document])
		);
		const missingIndexes = hashes
			.map((hash, index) => ({ hash, index }))
			.filter(({ hash }) => !reusable.get(hash)?.embedding);
		const embedded = missingIndexes.length
			? await this.embeddingClient.embed(missingIndexes.map(({ index }) => contents[index]!))
			: undefined;
		if (embedded && embedded.vectors.length !== missingIndexes.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		const generated = new Map(
			missingIndexes.map(({ hash }, index) => [hash, embedded!.vectors[index]!])
		);
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId: note.projectId,
				noteId: note.id,
				content,
				contentHash: hash,
				sourceRevision: note.currentRevision,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? embedded?.model)
					? { embeddingModel: prior?.embeddingModel ?? embedded!.model }
					: {})
			};
		});
		await this.repository.replaceForNote(actor, note.id, documents);
	}
}

export class EmbeddedMemoryIndexer implements MemoryIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new ParagraphChunker()
	) {}

	async index(actor: ActorContext, entry: MemoryEntry): Promise<void> {
		// User-profile entries (no project) are injected into agent context directly and
		// never enter the retrieval index.
		const projectId = entry.projectId;
		const contents =
			!projectId || entry.deletedAt || !entry.shareWithAgents
				? []
				: this.chunker.chunk(entry.content);
		if (!contents.length || !projectId) {
			await this.repository.deleteForMemoryEntry(actor, entry.id);
			return;
		}
		const hashes = await Promise.all(contents.map(contentHash));
		const existing = await this.repository.listForMemoryEntry(actor, entry.id);
		const reusable = new Map(
			existing
				.filter((document) => document.embeddingModel === this.embeddingClient.model)
				.map((document) => [document.contentHash, document])
		);
		const missingIndexes = hashes
			.map((hash, index) => ({ hash, index }))
			.filter(({ hash }) => !reusable.get(hash)?.embedding);
		const embedded = missingIndexes.length
			? await this.embeddingClient.embed(missingIndexes.map(({ index }) => contents[index]!))
			: undefined;
		if (embedded && embedded.vectors.length !== missingIndexes.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		const generated = new Map(
			missingIndexes.map(({ hash }, index) => [hash, embedded!.vectors[index]!])
		);
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId,
				memoryEntryId: entry.id,
				content,
				contentHash: hash,
				sourceRevision: 1,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? embedded?.model)
					? { embeddingModel: prior?.embeddingModel ?? embedded!.model }
					: {})
			};
		});
		await this.repository.replaceForMemoryEntry(actor, entry.id, documents);
	}
}

export class EmbeddedDiagramIndexer implements DiagramIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly noteReader: import('$lib/services/notes/contracts').NoteReader,
		private readonly chunker: ContentChunker = new ParagraphChunker()
	) {}

	async index(actor: ActorContext, diagram: Diagram): Promise<void> {
		const contents = this.chunker.chunk(diagram.searchableText);
		if (!contents.length) {
			await this.repository.deleteForDiagram(actor, diagram.id);
			return;
		}
		const note = await this.noteReader.get(actor, diagram.noteId);
		const hashes = await Promise.all(contents.map(contentHash));
		const existing = await this.repository.listForDiagram(actor, diagram.id);
		const reusable = new Map(
			existing
				.filter((document) => document.embeddingModel === this.embeddingClient.model)
				.map((document) => [document.contentHash, document])
		);
		const missingIndexes = hashes
			.map((hash, index) => ({ hash, index }))
			.filter(({ hash }) => !reusable.get(hash)?.embedding);
		const embedded = missingIndexes.length
			? await this.embeddingClient.embed(missingIndexes.map(({ index }) => contents[index]!))
			: undefined;
		if (embedded && embedded.vectors.length !== missingIndexes.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		const generated = new Map(
			missingIndexes.map(({ hash }, index) => [hash, embedded!.vectors[index]!])
		);
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId: note.projectId,
				noteId: diagram.noteId,
				diagramId: diagram.id,
				content,
				contentHash: hash,
				sourceRevision: 0,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? embedded?.model)
					? { embeddingModel: prior?.embeddingModel ?? embedded!.model }
					: {})
			};
		});
		await this.repository.replaceForDiagram(actor, diagram.id, documents);
	}
}
