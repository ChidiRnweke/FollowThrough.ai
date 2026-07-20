import type {
	ActorContext,
	Attachment,
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
import type { Tiktoken } from 'js-tiktoken';
import { countRetrievalTokens, retrievalEncoding } from './tokenizer';

const DEFAULT_TARGET_TOKENS = 2400;
const DEFAULT_OVERLAP_TOKENS = 480;
const EMBEDDING_BATCH_TOKENS = 30_000;

export class TokenAwareChunker implements ContentChunker {
	private readonly encoding: Tiktoken;

	constructor(
		private readonly targetTokens = DEFAULT_TARGET_TOKENS,
		private readonly overlapTokens = DEFAULT_OVERLAP_TOKENS,
		encoding: Tiktoken = retrievalEncoding()
	) {
		if (!Number.isInteger(targetTokens) || targetTokens <= 0)
			throw new Error('Retrieval chunk target must be a positive integer');
		if (!Number.isInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= targetTokens)
			throw new Error('Retrieval chunk overlap must be non-negative and smaller than target');
		this.encoding = encoding;
	}

	chunk(content: string): readonly string[] {
		const normalized = content.replace(/\r\n/g, '\n').trim();
		if (!normalized) return [];
		const chunks: string[] = [];
		let current = '';
		for (const unit of this.semanticUnits(normalized)) {
			const combined = current ? `${current}\n\n${unit}` : unit;
			if (this.count(combined) <= this.targetTokens) {
				current = combined;
				continue;
			}
			if (current) chunks.push(current);
			const overlap = this.overlapTail(current);
			current = overlap ? `${overlap}\n\n${unit}` : unit;
			if (this.count(current) > this.targetTokens) {
				const tokens = this.encoding.encode(current);
				chunks.push(this.encoding.decode(tokens.slice(0, this.targetTokens)).trim());
				current = this.encoding.decode(tokens.slice(this.targetTokens - this.overlapTokens)).trim();
			}
		}
		if (current && chunks.at(-1) !== current) chunks.push(current);
		return chunks;
	}

	count(content: string): number {
		return this.encoding.encode(content).length;
	}

	private semanticUnits(content: string): readonly string[] {
		const units: string[] = [];
		for (const paragraph of content
			.split(/\n\s*\n/)
			.map((value) => value.trim())
			.filter(Boolean)) {
			if (this.count(paragraph) <= this.targetTokens) {
				units.push(paragraph);
				continue;
			}
			for (const sentence of paragraph.split(/(?<=[.!?])\s+/u).filter(Boolean)) {
				if (this.count(sentence) <= this.targetTokens) units.push(sentence);
				else {
					const tokens = this.encoding.encode(sentence);
					for (let start = 0; start < tokens.length; start += this.targetTokens)
						units.push(this.encoding.decode(tokens.slice(start, start + this.targetTokens)).trim());
				}
			}
		}
		return units;
	}

	private overlapTail(value: string): string {
		if (!value || this.overlapTokens === 0) return '';
		const tokens = this.encoding.encode(value);
		return this.encoding.decode(tokens.slice(-this.overlapTokens)).trim();
	}
}

/** Character-based compatibility seam retained for small deterministic tests. */
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

export const retrievalChunkerFromEnv = (): TokenAwareChunker => {
	const target = Number(process.env.RETRIEVAL_CHUNK_TOKENS ?? DEFAULT_TARGET_TOKENS);
	const overlap = Number(process.env.RETRIEVAL_CHUNK_OVERLAP_TOKENS ?? DEFAULT_OVERLAP_TOKENS);
	return new TokenAwareChunker(target, overlap);
};

export const retrievalContentHash = async (
	content: string,
	metadata: { readonly sourceTitle?: string; readonly sectionPath?: string } = {}
): Promise<ContentHash> => {
	const value = JSON.stringify({
		content,
		sourceTitle: metadata.sourceTitle ?? null,
		sectionPath: metadata.sectionPath ?? null
	});
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('') as ContentHash;
};

const embedInStableBatches = async (
	client: EmbeddingClient,
	contents: readonly string[]
): Promise<readonly (readonly number[])[]> => {
	const vectors: (readonly number[])[] = [];
	let batch: string[] = [];
	let tokens = 0;
	const flush = async () => {
		if (!batch.length) return;
		const result = await client.embed(batch);
		if (result.vectors.length !== batch.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		vectors.push(...result.vectors);
		batch = [];
		tokens = 0;
	};
	for (const content of contents) {
		const count = countRetrievalTokens(content);
		if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) await flush();
		batch.push(content);
		tokens += count;
	}
	await flush();
	return vectors;
};

export class EmbeddedNoteIndexer implements NoteIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker()
	) {}

	async index(actor: ActorContext, note: Note): Promise<void> {
		const contents = note.archivedAt ? [] : this.chunker.chunk(note.plainText);
		if (!contents.length) {
			await this.repository.deleteForNote(actor, note.id);
			return;
		}
		const hashes = await Promise.all(
			contents.map((content) => retrievalContentHash(content, { sourceTitle: note.title }))
		);
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
			? await embedInStableBatches(
					this.embeddingClient,
					missingIndexes.map(({ index }) => `${note.title}\n${contents[index]!}`)
				)
			: undefined;
		const generated = new Map(missingIndexes.map(({ hash }, index) => [hash, embedded![index]!]));
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId: note.projectId,
				noteId: note.id,
				sourceTitle: note.title,
				content,
				contentHash: hash,
				sourceRevision: note.currentRevision,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? (embedded ? this.embeddingClient.model : undefined))
					? { embeddingModel: prior?.embeddingModel ?? this.embeddingClient.model }
					: {})
			};
		});
		await this.repository.replaceForNote(actor, note.id, documents);
	}
}

export class EmbeddedAttachmentIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker()
	) {}

	async index(
		actor: ActorContext,
		attachment: Attachment,
		text: string
	): Promise<{ truncated: boolean }> {
		const all = this.chunker.chunk(text);
		const contents = all.slice(0, 50);
		if (!contents.length) {
			await this.repository.deleteForAttachment(actor, attachment.id);
			return { truncated: false };
		}
		const hashes = await Promise.all(
			contents.map((content) =>
				retrievalContentHash(content, {
					sourceTitle: attachment.path.split('/').at(-1) ?? attachment.path,
					sectionPath: attachment.path
				})
			)
		);
		const existing = await this.repository.listForAttachment(actor, attachment.id);
		const reusable = new Map(
			existing
				.filter((item) => item.embeddingModel === this.embeddingClient.model)
				.map((item) => [item.contentHash, item])
		);
		const missing = hashes
			.map((hash, index) => ({ hash, index }))
			.filter(({ hash }) => !reusable.get(hash)?.embedding);
		const embedded = missing.length
			? await embedInStableBatches(
					this.embeddingClient,
					missing.map(({ index }) => `${attachment.path}\n${contents[index]!}`)
				)
			: undefined;
		const generated = new Map(missing.map(({ hash }, index) => [hash, embedded![index]!]));
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId: attachment.projectId,
				attachmentId: attachment.id,
				attachmentPath: attachment.path,
				sourceTitle: attachment.path.split('/').at(-1) ?? attachment.path,
				sectionPath: attachment.path,
				content,
				contentHash: hash,
				sourceRevision: 1,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? (embedded ? this.embeddingClient.model : undefined))
					? { embeddingModel: prior?.embeddingModel ?? this.embeddingClient.model }
					: {})
			};
		});
		await this.repository.replaceForAttachment(actor, attachment.id, documents);
		return { truncated: all.length > contents.length };
	}
}

export class EmbeddedMemoryIndexer implements MemoryIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker()
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
		const hashes = await Promise.all(
			contents.map((content) => retrievalContentHash(content, { sourceTitle: 'Project memory' }))
		);
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
			? await embedInStableBatches(
					this.embeddingClient,
					missingIndexes.map(({ index }) => `Project memory\n${contents[index]!}`)
				)
			: undefined;
		const generated = new Map(missingIndexes.map(({ hash }, index) => [hash, embedded![index]!]));
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId,
				memoryEntryId: entry.id,
				sourceTitle: 'Project memory',
				content,
				contentHash: hash,
				sourceRevision: 1,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? (embedded ? this.embeddingClient.model : undefined))
					? { embeddingModel: prior?.embeddingModel ?? this.embeddingClient.model }
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
		private readonly chunker: ContentChunker = new TokenAwareChunker()
	) {}

	async index(actor: ActorContext, diagram: Diagram): Promise<void> {
		const contents = this.chunker.chunk(diagram.searchableText);
		if (!contents.length) {
			await this.repository.deleteForDiagram(actor, diagram.id);
			return;
		}
		const note = await this.noteReader.get(actor, diagram.noteId);
		const hashes = await Promise.all(
			contents.map((content) =>
				retrievalContentHash(content, {
					sourceTitle: `Diagram in ${note.title}`,
					sectionPath: note.title
				})
			)
		);
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
			? await embedInStableBatches(
					this.embeddingClient,
					missingIndexes.map(({ index }) => `Diagram in ${note.title}\n${contents[index]!}`)
				)
			: undefined;
		const generated = new Map(missingIndexes.map(({ hash }, index) => [hash, embedded![index]!]));
		const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
			const hash = hashes[chunkIndex]!;
			const prior = reusable.get(hash);
			return {
				id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
				projectId: note.projectId,
				noteId: diagram.noteId,
				diagramId: diagram.id,
				sourceTitle: `Diagram in ${note.title}`,
				sectionPath: note.title,
				content,
				contentHash: hash,
				sourceRevision: 0,
				chunkIndex,
				...((prior?.embedding ?? generated.get(hash))
					? { embedding: prior?.embedding ?? generated.get(hash)! }
					: {}),
				...((prior?.embeddingModel ?? (embedded ? this.embeddingClient.model : undefined))
					? { embeddingModel: prior?.embeddingModel ?? this.embeddingClient.model }
					: {})
			};
		});
		await this.repository.replaceForDiagram(actor, diagram.id, documents);
	}
}
