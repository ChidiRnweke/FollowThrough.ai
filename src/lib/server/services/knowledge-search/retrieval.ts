import type {
	DiagramIndexContext,
	DiagramIndexContextRequirement,
	IndexContent,
	IndexChunking,
	IndexPlan,
	IndexingResult
} from '$lib/models/knowledge-search';
import { InvalidGeneratedContentError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { Attachment, ContentHash } from '$lib/models/attachments';
import type { Diagram } from '$lib/models/diagrams';
import type { Widget } from '$lib/models/widgets';
import type { MemoryEntry } from '$lib/models/memory';
import type { Note } from '$lib/models/notes';
import type { SearchDocument, SearchDocumentId } from '$lib/models/knowledge-search';
import type {
	IndexSource,
	RetrievalIndexRepository
} from '$lib/server/repositories/knowledge-search';
import {
	EMBEDDING_BATCH_TOKENS,
	type EmbeddingBatch
} from '$lib/models/knowledge-search/embeddings';
import {
	DEFAULT_RERANK_MODEL,
	rerankResponseSchema,
	searchQueryCompletionSchema,
	type EmbeddedSource,
	type KnowledgeSearchSource,
	type RerankEndpoint,
	type RetrievalScope,
	type PendingIndexSource,
	type SearchMatch
} from '$lib/models/knowledge-search';
import type { StoredMessage } from '$lib/models/agent';
import type { OperationObserver } from '$lib/models/telemetry';
import type { TokenCodec } from '$lib/models/tokenization';
import { ExternalServiceError } from '$lib/errors';
import {
	rerankerInputTraceAttributes,
	rerankerOutputTraceAttributes
} from '$lib/server/infrastructure/telemetry/rerank';
import { getEmbeddingAttributes } from '@arizeai/openinference-core';
import type OpenAI from 'openai';
import { MimeType, OpenInferenceSpanKind } from '@arizeai/openinference-semantic-conventions';
const decideIndexPlan = (content: IndexContent): IndexPlan =>
	content.contents.length
		? { kind: 'index', ...content }
		: { kind: 'remove', source: content.source };

const MEMORY_SOURCE_TITLE = 'Project memory';

const retrievalContentHash = async (
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
		case 'widget':
			return repository.listForWidget(actor, source.widgetId);
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
		case 'widget':
			return repository.deleteForWidget(actor, source.widgetId);
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

export interface KnowledgeRetrievalDependencies {
	readonly repository: RetrievalIndexRepository;
	/** OpenAI-compatible client for embeddings and search-query rewriting. */
	readonly provider: Pick<OpenAI, 'embeddings' | 'chat'>;
	readonly rerank: RerankEndpoint;
	readonly models: { readonly embedding: string; readonly query: string };
	readonly encoding: TokenCodec;
	readonly chunking: IndexChunking;
	/** Stage new chunks without vectors and leave them to the backfill. */
	readonly defer: boolean;
	readonly observer: OperationObserver;
}

export interface NoteIndexing {
	indexNote(actor: ActorContext, note: Note): Promise<void>;
}
export interface AttachmentIndexing {
	indexAttachment(actor: ActorContext, attachment: Attachment, text: string): Promise<void>;
	removeAttachment(actor: ActorContext, attachmentId: Attachment['id']): Promise<void>;
}
export interface MemoryIndexing {
	indexMemory(actor: ActorContext, entry: MemoryEntry): Promise<void>;
}
export interface DiagramIndexing {
	diagramContextRequirement(diagram: Diagram): DiagramIndexContextRequirement;
	indexDiagram(actor: ActorContext, diagram: Diagram, context: DiagramIndexContext): Promise<void>;
}
export interface WidgetIndexing {
	indexWidget(actor: ActorContext, widget: Widget, searchableText: string): Promise<void>;
}
/** The durable embedding queue: pending chunks are the work. */
export interface IndexBackfill {
	pendingSources(limit: number, after?: string): Promise<readonly PendingIndexSource[]>;
	/** Embed one source's pending chunks. No write; the caller owns the transaction. */
	embedPending(actor: ActorContext, source: IndexSource): Promise<EmbeddedSource>;
	completePending(actor: ActorContext, embedded: EmbeddedSource): Promise<void>;
}
/** Semantic search over indexed knowledge, ranked under ADR 0036. */
export interface KnowledgeSearch {
	/** Nearest neighbours, then a rerank of the candidate pool. */
	retrieve(
		actor: ActorContext,
		query: string,
		scope: RetrievalScope
	): Promise<readonly SearchMatch[]>;
	/** Nearest neighbours only, for a caller that filters before ranking. */
	candidates(
		actor: ActorContext,
		query: string,
		scope: RetrievalScope
	): Promise<readonly SearchMatch[]>;
	/** Rerank candidates; a provider failure keeps vector order, cancellation propagates. */
	rank(
		query: string,
		candidates: readonly SearchMatch[],
		limit: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]>;
	source(document: SearchDocument): KnowledgeSearchSource;
	/** The query to embed: the query itself, or a rewrite of the conversation that led to it. */
	searchQuery(query: string, history: readonly StoredMessage[]): Promise<string>;
}
export interface KnowledgeRetrievalCapabilities
	extends
		NoteIndexing,
		AttachmentIndexing,
		MemoryIndexing,
		DiagramIndexing,
		WidgetIndexing,
		IndexBackfill,
		KnowledgeSearch {}

/**
 * Knowledge retrieval: chunk and embed sources into the search index, and answer queries from it.
 * The embedding and rerank providers belong to this capability; the repository only persists.
 */
export class KnowledgeRetrieval implements KnowledgeRetrievalCapabilities {
	private readonly targetTokens: number;
	private readonly overlapTokens: number;
	private readonly repository: RetrievalIndexRepository;
	private readonly embeddingModel: string;
	private readonly encoding: TokenCodec;
	private readonly defer: boolean;
	constructor(private readonly dependencies: KnowledgeRetrievalDependencies) {
		const { targetTokens, overlapTokens } = dependencies.chunking;
		if (!Number.isInteger(targetTokens) || targetTokens <= 0)
			throw new Error('Retrieval chunk target must be a positive integer');
		if (!Number.isInteger(overlapTokens) || overlapTokens < 0 || overlapTokens >= targetTokens)
			throw new Error('Retrieval chunk overlap must be non-negative and smaller than target');
		this.targetTokens = targetTokens;
		this.overlapTokens = overlapTokens;
		this.repository = dependencies.repository;
		this.embeddingModel = dependencies.models.embedding;
		this.encoding = dependencies.encoding;
		this.defer = dependencies.defer;
	}

	async retrieve(
		actor: ActorContext,
		query: string,
		scope: RetrievalScope
	): Promise<readonly SearchMatch[]> {
		const candidates = await this.candidates(actor, query, {
			...scope,
			// Preserve the accepted candidate pool (ADR 0036).
			limit: Math.max(40, scope.limit * 5)
		});
		return candidates.length > 1
			? this.rank(query, candidates, scope.limit, scope.signal)
			: candidates;
	}

	async candidates(
		actor: ActorContext,
		query: string,
		scope: RetrievalScope
	): Promise<readonly SearchMatch[]> {
		const batch = await this.embed([query], scope.signal);
		scope.signal?.throwIfAborted();
		const vector = batch.vectors[0];
		// A query has exactly one vector; malformed provider output cannot become an empty search.
		if (!vector || batch.vectors.length !== 1)
			throw new InvalidGeneratedContentError('Query embedding returned an invalid result');
		return this.repository.searchByEmbedding(
			actor,
			vector,
			scope.limit,
			scope.projectId,
			scope.filter
		);
	}

	async rank(
		query: string,
		candidates: readonly SearchMatch[],
		limit: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]> {
		try {
			return await this.rerank(query, candidates, limit, signal);
		} catch (error) {
			if (signal?.aborted) throw error;
			// ADR 0036: the provider trace keeps the failure; retrieved knowledge stays usable.
			return candidates.slice(0, limit);
		}
	}

	source(document: SearchDocument): KnowledgeSearchSource {
		const context = {
			projectId: document.projectId,
			...(document.sourceTitle ? { title: document.sourceTitle } : {})
		};
		if (document.attachmentId) return { ...context, kind: 'attachment', id: document.attachmentId };
		if (document.diagramId) return { ...context, kind: 'diagram', id: document.diagramId };
		if (document.widgetId) return { ...context, kind: 'widget', id: document.widgetId };
		if (document.memoryEntryId)
			return { ...context, kind: 'memory', id: document.memoryEntryId, title: document.content };
		if (document.noteId) return { ...context, kind: 'note', id: document.noteId };
		return { kind: 'unavailable', projectId: document.projectId };
	}

	async searchQuery(query: string, history: readonly StoredMessage[]): Promise<string> {
		if (history.length <= 1) return query;
		const spoken = history.flatMap((message) => {
			if (message.kind === 'unreadable') return [];
			const content = message.content;
			return [
				typeof content.text === 'string'
					? content.text
					: typeof content.content === 'string'
						? content.content
						: JSON.stringify(content)
			];
		});
		return this.rewrite([...spoken, 'user: ' + query].join('\n'));
	}

	private async rewrite(transcript: string): Promise<string> {
		const model = this.dependencies.models.query;
		try {
			return await this.dependencies.observer.run(
				'knowledge_search.generate_query',
				{ input: transcript, metadata: { model } },
				async () => {
					const completion = searchQueryCompletionSchema.safeParse(
						await this.dependencies.provider.chat.completions.create({
							model,
							messages: [
								{ role: 'system', content: CONDENSE_PROMPT },
								{ role: 'user', content: transcript }
							]
						})
					);
					const rewritten = completion.data?.choices[0]?.message.content?.trim();
					if (!rewritten)
						throw new ExternalServiceError('Search query generation returned no usable text');
					return rewritten;
				},
				(result) => result
			);
		} catch (error) {
			throw new ExternalServiceError('Search query generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	pendingSources(limit: number, after?: string): Promise<readonly PendingIndexSource[]> {
		return this.repository.listPendingSources(limit, after);
	}

	async embedPending(actor: ActorContext, source: IndexSource): Promise<EmbeddedSource> {
		const documents = await this.repository.listPending(actor, source);
		const batch = await this.embed(documents.map(embeddingInput));
		if (batch.vectors.length !== documents.length)
			throw new InvalidGeneratedContentError('Embedding result count did not match chunk count');
		return {
			source,
			model: batch.model,
			chunks: documents.map((document, index) => ({
				id: document.id,
				embedding: batch.vectors[index]!
			}))
		};
	}

	completePending(actor: ActorContext, embedded: EmbeddedSource): Promise<void> {
		return this.repository.completePending(actor, embedded.source, embedded.chunks, embedded.model);
	}

	async removeAttachment(actor: ActorContext, attachmentId: Attachment['id']): Promise<void> {
		await this.apply(actor, { kind: 'remove', source: { kind: 'attachment', attachmentId } });
	}

	/** Decide whether the owning operation needs an authorized source-note title. */
	diagramContextRequirement(diagram: Diagram): DiagramIndexContextRequirement {
		return this.isDiagramIndexable(diagram) && diagram.sourceNoteId !== undefined
			? { kind: 'source_note', noteId: diagram.sourceNoteId }
			: { kind: 'standalone' };
	}

	private isDiagramIndexable(diagram: Diagram): boolean {
		return diagram.archivedAt === undefined && diagram.searchableText.trim().length > 0;
	}

	private async apply(actor: ActorContext, plan: IndexPlan, defer = this.defer): Promise<void> {
		const result = await applyIndex(this.repository, this.embeddingModel, defer, actor, plan);
		if (result.kind === 'stored') return;
		const batch = await this.embed(result.missing.map((chunk) => chunk.input));
		if (batch.model !== result.model || batch.vectors.length !== result.missing.length)
			throw new InvalidGeneratedContentError('Embedding results did not match the prepared index');
		const vectors = new Map(
			result.missing.map((chunk, index) => [chunk.id, batch.vectors[index]!])
		);
		await this.repository.stage(
			actor,
			result.source,
			result.documents.map((document) => {
				const embedding = vectors.get(document.id);
				return embedding ? { ...document, embedding, embeddingModel: batch.model } : document;
			})
		);
	}

	/** Ordered provider requests within the batch budget; no input is discarded or split. */
	private async embed(contents: readonly string[], signal?: AbortSignal): Promise<EmbeddingBatch> {
		const vectors: (readonly number[])[] = [];
		for (const batch of this.batches(contents))
			vectors.push(...(await this.request(batch, signal)));
		return { model: this.embeddingModel, vectors };
	}

	private *batches(contents: readonly string[]): Iterable<readonly string[]> {
		let batch: string[] = [];
		let tokens = 0;
		for (const content of contents) {
			const count = this.count(content);
			if (batch.length && tokens + count > EMBEDDING_BATCH_TOKENS) {
				yield batch;
				batch = [];
				tokens = 0;
			}
			batch.push(content);
			tokens += count;
		}
		if (batch.length) yield batch;
	}

	private async request(
		contents: readonly string[],
		signal?: AbortSignal
	): Promise<readonly (readonly number[])[]> {
		const model = this.embeddingModel;
		try {
			return await this.dependencies.observer.run(
				'embedding.batch',
				{
					input: JSON.stringify(contents),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.EMBEDDING,
					metadata: { model, inputCount: contents.length },
					tags: ['embedding'],
					attributes: getEmbeddingAttributes({ modelName: model }),
					onlyWithinWorkflow: true
				},
				async () => {
					const response = await this.dependencies.provider.embeddings.create(
						{ model, input: [...contents] },
						{ signal }
					);
					const ordered = [...response.data].sort((a, b) => a.index - b.index);
					if (ordered.length !== contents.length)
						throw new InvalidGeneratedContentError(
							'Embedding result count did not match input count'
						);
					if (ordered.some((item, index) => item.index !== index))
						throw new InvalidGeneratedContentError(
							'Embedding result indexes did not match input positions'
						);
					return ordered.map((item) => item.embedding);
				},
				(vectors) => JSON.stringify({ model, vectorCount: vectors.length })
			);
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Embedding generation failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}

	/** Cohere rerank through OpenRouter, with titles and sections as YAML evidence (ADR 0036). */
	private async rerank(
		query: string,
		matches: readonly SearchMatch[],
		topN: number,
		signal?: AbortSignal
	): Promise<readonly SearchMatch[]> {
		if (matches.length === 0) return [];
		const { url, headers, fetch } = this.dependencies.rerank;
		const model = DEFAULT_RERANK_MODEL;
		try {
			return await this.dependencies.observer.run(
				'retrieval.rerank',
				{
					input: JSON.stringify({
						query,
						documents: matches.map((match) => ({
							id: match.document.id,
							content: rerankDocumentText(match),
							score: match.score
						}))
					}),
					inputMimeType: MimeType.JSON,
					outputMimeType: MimeType.JSON,
					kind: OpenInferenceSpanKind.RERANKER,
					metadata: { model, topN },
					attributes: rerankerInputTraceAttributes(
						query,
						matches.map((match) => ({
							id: match.document.id,
							content: rerankDocumentText(match)
						})),
						model,
						topN
					)
				},
				async () => {
					const response = await fetch(url, {
						method: 'POST',
						headers: { 'content-type': 'application/json', ...headers },
						body: JSON.stringify({
							model,
							query,
							documents: matches.map(rerankDocumentText),
							top_n: Math.min(topN, matches.length)
						}),
						signal
					});
					if (!response.ok)
						throw new ExternalServiceError('Reranking failed', {
							cause: `OpenRouter rerank returned ${response.status}`
						});
					const body = rerankResponseSchema.parse(await response.json());
					return body.results
						.map((result) => {
							const match = matches[result.index];
							if (!match) return undefined;
							const score = result.relevance_score ?? result.relevanceScore ?? match.score;
							return { document: match.document, score };
						})
						.filter((match): match is SearchMatch => match !== undefined);
				},
				(results) =>
					JSON.stringify({
						results: results.map((result) => ({
							documentId: result.document.id,
							sourceTitle: result.document.sourceTitle,
							score: result.score,
							content: result.document.content
						}))
					}),
				(results) =>
					rerankerOutputTraceAttributes(
						results.map((match) => ({
							id: match.document.id,
							content: rerankDocumentText(match),
							score: match.score
						}))
					)
			);
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof ExternalServiceError) throw error;
			throw new ExternalServiceError('Reranking failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
	async indexNote(actor: ActorContext, note: Note): Promise<void> {
		return this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'note', noteId: note.id },
				contents: note.archivedAt ? [] : this.chunk(note.plainText),
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
		const contents = this.chunk(text);
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
	async indexMemory(actor: ActorContext, entry: MemoryEntry): Promise<void> {
		// User-profile entries (no project) are injected into agent context directly and
		// never enter the retrieval index.
		const projectId = entry.projectId;
		const contents =
			!projectId || entry.deletedAt || !entry.shareWithAgents ? [] : this.chunk(entry.content);
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
	): Promise<void> {
		const contents = this.chunk(diagram.searchableText);
		// A diagram in the trash answers no searches, for the same reason one with no
		// labels does not: the index describes what the project currently holds. Both
		// conditions land here rather than in a second port, so "make the index agree
		// with this row" stays one call whatever changed about the row.
		if (!this.isDiagramIndexable(diagram) || !contents.length) {
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

	/**
	 * A widget is indexed by the words it shows, which its controller derives. A widget in the
	 * trash, or one that shows no words, answers no searches.
	 */
	async indexWidget(actor: ActorContext, widget: Widget, searchableText: string): Promise<void> {
		const contents = widget.archivedAt ? [] : this.chunk(searchableText);
		if (!contents.length)
			return this.apply(actor, { kind: 'remove', source: { kind: 'widget', widgetId: widget.id } });
		// A widget chunk is a list of labels, so its title is the context the reranker gets.
		const sourceTitle = `Widget: ${widget.title}`;
		return this.apply(
			actor,
			decideIndexPlan({
				source: { kind: 'widget', widgetId: widget.id },
				contents,
				embedPrefix: sourceTitle,
				base: {
					projectId: widget.projectId,
					widgetId: widget.id,
					sourceTitle,
					sectionPath: widget.title,
					sourceRevision: widget.layoutRevision + widget.dataRevision,
					sourceCreatedAt: widget.createdAt
				}
			})
		);
	}
	private chunk(content: string): readonly string[] {
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

	private count(content: string): number {
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

/** Titles are retrieval evidence, not display-only metadata (ADR 0036, `RERANKING_STRATEGY`). */
const rerankDocumentText = (match: SearchMatch): string => {
	const content = match.document.content
		.split('\n')
		.map((line) => `  ${line}`)
		.join('\n');
	return [
		match.document.sourceTitle ? `Title: ${JSON.stringify(match.document.sourceTitle)}` : undefined,
		match.document.sectionPath
			? `Section: ${JSON.stringify(match.document.sectionPath)}`
			: undefined,
		`Content: |-\n${content}`
	]
		.filter((part): part is string => part !== undefined)
		.join('\n');
};

const embeddingInput = (document: SearchDocument): string => {
	const prefix = document.attachmentId ? document.attachmentPath : document.sourceTitle;
	return prefix ? `${prefix}\n${document.content}` : document.content;
};

const CONDENSE_PROMPT =
	'Rewrite the following conversation into a single, focused search-query statement that captures ' +
	'what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.';
