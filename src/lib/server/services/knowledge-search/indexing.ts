import type {
	DiagramIndexContext,
	IndexContent,
	IndexPlan,
	IndexingResult
} from '$lib/models/knowledge-search';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { Attachment, ContentHash } from '$lib/models/attachments';
import type { Diagram } from '$lib/models/diagrams';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import type {
	IndexSource,
	RetrievalIndexRepository
} from '$lib/server/repositories/knowledge-search';
import type { EmbeddingBatch } from '$lib/models/knowledge-search/embeddings';

import { getEncoding, type Tiktoken } from 'js-tiktoken';

export const diagramIndexNoteId = (diagram: Diagram) =>
	diagram.archivedAt === undefined && diagram.searchableText.trim()
		? diagram.sourceNoteId
		: undefined;
let sharedEncoding: Tiktoken | undefined;
export const retrievalEncoding = (): Tiktoken => (sharedEncoding ??= getEncoding('cl100k_base'));
export interface ContentChunker {
	chunk(content: string): readonly string[];
}
export type { EmbeddingBatch };
const decideIndexPlan = (content: IndexContent): IndexPlan =>
	content.contents.length
		? { kind: 'index', ...content }
		: { kind: 'remove', source: content.source };

const DEFAULT_TARGET_TOKENS = 2400;
const DEFAULT_OVERLAP_TOKENS = 480;
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
		if (current) chunks.push(current);
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
	embeddingModel: string,
	defer: boolean,
	actor: ActorContext,
	plan: IndexPlan
): Promise<IndexingResult> => {
	if (plan.kind === 'remove') {
		await deleteFor(repository, actor, plan.source);
		return { kind: 'stored' };
	}

	const { source, contents, embedPrefix, base } = plan;
	const metadata = { sourceTitle: base.sourceTitle, sectionPath: base.sectionPath };

	const hashes = await Promise.all(
		contents.map((content) => retrievalContentHash(content, metadata))
	);
	const existing = await listFor(repository, actor, source);
	const reusable = new Map<
		string,
		{ ids: SearchDocumentId[]; embedding: readonly number[] | undefined }
	>();
	for (const document of existing) {
		if (document.embeddingModel !== embeddingModel) continue;
		const prior = reusable.get(document.contentHash);
		if (prior) {
			prior.ids.push(document.id);
			prior.embedding ??= document.embedding;
		} else {
			reusable.set(document.contentHash, { ids: [document.id], embedding: document.embedding });
		}
	}
	const missingIndexes = hashes
		.map((hash, index) => ({ hash, index }))
		.filter(({ hash }) => !reusable.get(hash)?.embedding);

	const documents: SearchDocument[] = contents.map((content, chunkIndex) => {
		const hash = hashes[chunkIndex]!;
		const prior = reusable.get(hash);
		const vector = prior?.embedding;
		return {
			...base,
			id: (prior?.ids.shift() ?? crypto.randomUUID()) as SearchDocumentId,
			content,
			contentHash: hash,
			chunkIndex,
			...(vector ? { embedding: vector, embeddingModel } : {})
		};
	});

	if (!defer && missingIndexes.length)
		return {
			kind: 'needs_embeddings',
			source,
			documents,
			model: embeddingModel,
			missing: missingIndexes.map(({ index }) => ({
				id: documents[index]!.id,
				input: `${embedPrefix}\n${contents[index]!}`
			}))
		};
	await repository.stage(actor, source, documents);
	return { kind: 'stored' };
};

export class ContentIndex {
	constructor(
		private readonly repository: RetrievalIndexRepository,
		private readonly embeddingModel: string,
		private readonly chunker: ContentChunker = new TokenAwareChunker(),
		private readonly defer = false
	) {}
	async complete(
		actor: ActorContext,
		pending: Extract<IndexingResult, { kind: 'needs_embeddings' }>,
		batch: EmbeddingBatch
	): Promise<void> {
		if (batch.model !== pending.model || batch.vectors.length !== pending.missing.length)
			throw new InvalidGeneratedContentError('Embedding results did not match the prepared index');
		const vectors = new Map(
			pending.missing.map((chunk, index) => [chunk.id, batch.vectors[index]!])
		);
		await this.repository.stage(
			actor,
			pending.source,
			pending.documents.map((document) => {
				const embedding = vectors.get(document.id);
				return embedding ? { ...document, embedding, embeddingModel: batch.model } : document;
			})
		);
	}
	readonly notes = { index: this.indexNote.bind(this) };
	readonly attachments = {
		index: this.indexAttachment.bind(this),
		remove: async (actor: ActorContext, attachmentId: Attachment['id']) => {
			await this.apply(actor, { kind: 'remove', source: { kind: 'attachment', attachmentId } });
		}
	};
	readonly memories = { index: this.indexMemory.bind(this) };
	readonly diagrams = { index: this.indexDiagram.bind(this) };
	apply(actor: ActorContext, plan: IndexPlan, defer = this.defer): Promise<IndexingResult> {
		return applyIndex(this.repository, this.embeddingModel, defer, actor, plan);
	}
	async indexNote(actor: ActorContext, note: Note): Promise<IndexingResult> {
		return this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'note', noteId: note.id },
				contents: note.archivedAt ? [] : this.chunker.chunk(note.plainText),
				embedPrefix: note.title,
				base: {
					projectId: note.projectId,
					noteId: note.id,
					sourceTitle: note.title,
					sourceRevision: note.currentRevision,
					sourceCreatedAt: note.createdAt
				}
			})
		);
	}
	async indexAttachment(actor: ActorContext, attachment: Attachment, text: string): Promise<void> {
		const contents = this.chunker.chunk(text);
		const sourceTitle = attachment.path.split('/').at(-1) ?? attachment.path;
		await this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'attachment', attachmentId: attachment.id },
				contents,
				embedPrefix: attachment.path,
				base: {
					projectId: attachment.projectId,
					attachmentId: attachment.id,
					attachmentPath: attachment.path,
					sourceTitle,
					sectionPath: attachment.path,
					sourceRevision: 1,
					sourceCreatedAt: attachment.createdAt
				}
			}),
			true
		);
	}
	async indexMemory(actor: ActorContext, entry: MemoryEntry): Promise<IndexingResult> {
		// User-profile entries (no project) are injected into agent context directly and
		// never enter the retrieval index.
		const projectId = entry.projectId;
		const contents =
			!projectId || entry.deletedAt || !entry.shareWithAgents
				? []
				: this.chunker.chunk(entry.content);
		if (!contents.length || !projectId) {
			return this.apply(actor, {
				kind: 'remove',
				source: { kind: 'memory', memoryEntryId: entry.id }
			});
		}
		return this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'memory', memoryEntryId: entry.id },
				contents,
				embedPrefix: MEMORY_SOURCE_TITLE,
				base: {
					projectId,
					memoryEntryId: entry.id,
					sourceTitle: MEMORY_SOURCE_TITLE,
					sourceRevision: 1,
					sourceCreatedAt: entry.createdAt
				}
			})
		);
	}
	async indexDiagram(
		actor: ActorContext,
		diagram: Diagram,
		context: DiagramIndexContext
	): Promise<IndexingResult> {
		const contents = this.chunker.chunk(diagram.searchableText);
		// A diagram in the trash answers no searches, for the same reason one with no
		// labels does not: the index describes what the project currently holds. Both
		// conditions land here rather than in a second port, so "make the index agree
		// with this row" stays one call whatever changed about the row.
		if (diagram.archivedAt !== undefined || !contents.length) {
			return this.apply(actor, {
				kind: 'remove',
				source: { kind: 'diagram', diagramId: diagram.id }
			});
		}
		// A diagram chunk is a bare list of labels, so its title is the only context
		// the reranker gets — `rerankDocumentText` joins title, section and content.
		// A diagram that came from a note borrows that note's name; a studio diagram
		// has none, so it must still say what it is rather than index untitled.
		//
		// The controller resolves the source-note title; the diagram owns its project.
		const sectionPath =
			context.kind === 'note' ? context.title : (diagram.title ?? 'Untitled diagram');
		const sourceTitle =
			context.kind === 'note' ? `Diagram in ${sectionPath}` : `Diagram: ${sectionPath}`;
		return this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'diagram', diagramId: diagram.id },
				contents,
				embedPrefix: sourceTitle,
				base: {
					projectId: diagram.projectId,
					diagramId: diagram.id,
					sourceTitle,
					sectionPath,
					sourceRevision: 0,
					sourceCreatedAt: diagram.createdAt
				}
			})
		);
	}
}
