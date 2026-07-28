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
import type { IndexSource, RetrievalIndexRepository } from '$lib/repositories';
import type { ContentChunker, EmbeddingClient } from './contracts';
import type { DiagramIndexer } from '$lib/services/diagrams/contracts';
import type { MemoryIndexer } from '$lib/services/memory/contracts';
import type { NoteIndexer } from '$lib/services/notes/contracts';
import type { Tiktoken } from 'js-tiktoken';
import { countRetrievalTokens, retrievalEncoding } from './tokenizer';

const DEFAULT_TARGET_TOKENS = 2400;
const DEFAULT_OVERLAP_TOKENS = 480;
const EMBEDDING_BATCH_TOKENS = 30_000;
/** Long documents are indexed head-first rather than in full; the rest is reported as truncated. */
const ATTACHMENT_CHUNK_LIMIT = 50;
const MEMORY_SOURCE_TITLE = 'Project memory';

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

export const embedInStableBatches = async (
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

/** Everything a chunk inherits from its source, before its own text is filled in. */
type DocumentBase = Omit<
	SearchDocument,
	'id' | 'content' | 'contentHash' | 'chunkIndex' | 'embedding' | 'embeddingModel' | 'supersededAt'
>;

interface IndexRequest {
	readonly source: IndexSource;
	readonly contents: readonly string[];
	readonly metadata: { readonly sourceTitle?: string; readonly sectionPath?: string };
	/** Prepended to each chunk before embedding so the vector carries its context. */
	readonly embedPrefix: string;
	readonly base: DocumentBase;
}

const listFor = (
	repository: RetrievalIndexRepository,
	actor: ActorContext,
	source: IndexSource
): Promise<readonly SearchDocument[]> => {
	switch (source.kind) {
		case 'note':
			return repository.listForNote(actor, source.noteId);
		case 'diagram':
			return repository.listForDiagram(actor, source.diagramId);
		case 'memory':
			return repository.listForMemoryEntry(actor, source.memoryEntryId);
		case 'attachment':
			return repository.listForAttachment(actor, source.attachmentId);
	}
};

const deleteFor = (
	repository: RetrievalIndexRepository,
	actor: ActorContext,
	source: IndexSource
): Promise<void> => {
	switch (source.kind) {
		case 'note':
			return repository.deleteForNote(actor, source.noteId);
		case 'diagram':
			return repository.deleteForDiagram(actor, source.diagramId);
		case 'memory':
			return repository.deleteForMemoryEntry(actor, source.memoryEntryId);
		case 'attachment':
			return repository.deleteForAttachment(actor, source.attachmentId);
	}
};

/**
 * The one indexing algorithm, shared by every source type.
 *
 * Chunks are keyed by content hash, so an edit only pays for the chunks it
 * actually changed. When `defer` is set the new chunks are staged without
 * vectors and the backfill worker fills them in later; the previously embedded
 * rows are held back by `stage` so semantic search never goes blind on the
 * source in the meantime. Removal is never deferred — an emptied or archived
 * source drops out of the index immediately.
 */
const applyIndex = async (
	repository: RetrievalIndexRepository,
	embeddingClient: EmbeddingClient,
	defer: boolean,
	actor: ActorContext,
	request: IndexRequest
): Promise<void> => {
	const { source, contents, metadata, embedPrefix, base } = request;
	if (!contents.length) {
		await deleteFor(repository, actor, source);
		return;
	}

	const hashes = await Promise.all(
		contents.map((content) => retrievalContentHash(content, metadata))
	);
	const existing = await listFor(repository, actor, source);
	const reusable = new Map(
		existing
			.filter((document) => document.embeddingModel === embeddingClient.model)
			.map((document) => [document.contentHash, document])
	);
	const missingIndexes = hashes
		.map((hash, index) => ({ hash, index }))
		.filter(({ hash }) => !reusable.get(hash)?.embedding);

	const embedded =
		!defer && missingIndexes.length
			? await embedInStableBatches(
					embeddingClient,
					missingIndexes.map(({ index }) => `${embedPrefix}\n${contents[index]!}`)
				)
			: undefined;
	const generated = new Map(
		embedded ? missingIndexes.map(({ hash }, index) => [hash, embedded[index]!]) : []
	);

	const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
		const hash = hashes[chunkIndex]!;
		const prior = reusable.get(hash);
		const vector = prior?.embedding ?? generated.get(hash);
		const model = prior?.embedding
			? prior.embeddingModel
			: vector
				? embeddingClient.model
				: undefined;
		return {
			...base,
			id: (prior?.id ?? crypto.randomUUID()) as SearchDocumentId,
			content,
			contentHash: hash,
			chunkIndex,
			...(vector ? { embedding: vector } : {}),
			...(model ? { embeddingModel: model } : {})
		};
	});

	await repository.stage(actor, source, documents);
};

export class EmbeddedNoteIndexer implements NoteIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker(),
		private readonly defer = false
	) {}

	async index(actor: ActorContext, note: Note): Promise<void> {
		await applyIndex(this.repository, this.embeddingClient, this.defer, actor, {
			source: { kind: 'note', noteId: note.id },
			contents: note.archivedAt ? [] : this.chunker.chunk(note.plainText),
			metadata: { sourceTitle: note.title },
			embedPrefix: note.title,
			base: {
				projectId: note.projectId,
				noteId: note.id,
				sourceTitle: note.title,
				sourceRevision: note.currentRevision
			}
		});
	}
}

export class EmbeddedAttachmentIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker(),
		private readonly defer = false
	) {}

	async index(
		actor: ActorContext,
		attachment: Attachment,
		text: string
	): Promise<{ truncated: boolean }> {
		const all = this.chunker.chunk(text);
		const contents = all.slice(0, ATTACHMENT_CHUNK_LIMIT);
		const sourceTitle = attachment.path.split('/').at(-1) ?? attachment.path;
		await applyIndex(this.repository, this.embeddingClient, this.defer, actor, {
			source: { kind: 'attachment', attachmentId: attachment.id },
			contents,
			metadata: { sourceTitle, sectionPath: attachment.path },
			embedPrefix: attachment.path,
			base: {
				projectId: attachment.projectId,
				attachmentId: attachment.id,
				attachmentPath: attachment.path,
				sourceTitle,
				sectionPath: attachment.path,
				sourceRevision: 1
			}
		});
		return { truncated: all.length > contents.length };
	}
}

export class EmbeddedMemoryIndexer implements MemoryIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly chunker: ContentChunker = new TokenAwareChunker(),
		private readonly defer = false
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
		await applyIndex(this.repository, this.embeddingClient, this.defer, actor, {
			source: { kind: 'memory', memoryEntryId: entry.id },
			contents,
			metadata: { sourceTitle: MEMORY_SOURCE_TITLE },
			embedPrefix: MEMORY_SOURCE_TITLE,
			base: {
				projectId,
				memoryEntryId: entry.id,
				sourceTitle: MEMORY_SOURCE_TITLE,
				sourceRevision: 1
			}
		});
	}
}

export class EmbeddedDiagramIndexer implements DiagramIndexer {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingClient: EmbeddingClient,
		private readonly noteReader: import('$lib/services/notes/contracts').NoteReader,
		private readonly chunker: ContentChunker = new TokenAwareChunker(),
		private readonly defer = false
	) {}

	async index(actor: ActorContext, diagram: Diagram): Promise<void> {
		const contents = this.chunker.chunk(diagram.searchableText);
		if (!contents.length) {
			await this.repository.deleteForDiagram(actor, diagram.id);
			return;
		}
		const note = await this.noteReader.get(actor, diagram.noteId);
		const sourceTitle = `Diagram in ${note.title}`;
		await applyIndex(this.repository, this.embeddingClient, this.defer, actor, {
			source: { kind: 'diagram', diagramId: diagram.id },
			contents,
			metadata: { sourceTitle, sectionPath: note.title },
			embedPrefix: sourceTitle,
			base: {
				projectId: note.projectId,
				noteId: diagram.noteId,
				diagramId: diagram.id,
				sourceTitle,
				sectionPath: note.title,
				sourceRevision: 0
			}
		});
	}
}
