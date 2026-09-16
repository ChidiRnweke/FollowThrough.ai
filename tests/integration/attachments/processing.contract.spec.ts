import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { PostgresAttachmentClaims } from '$lib/server/repositories/attachments/postgres/claims';
import { AttachmentRecords } from '$lib/server/repositories/attachments/postgres/attachments';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ContentIndex, TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import {
	InMemoryTextParser,
	InMemoryStorage,
	InMemoryOcrEngine,
	InMemoryImageDescriber
} from '$lib/testing/attachments/fakes/processing';
import { AttachmentContent } from '$lib/server/services/attachments/content';
import { AttachmentParserRegistry } from '$lib/server/services/attachments/storage';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import { actor, context, now, seedNote } from '../database-harness';
const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});
const setup = async (suffix: string, chunker = new TokenAwareChunker()) => {
	const owner = actor(suffix);
	await new UserRecords(context.db).ensureLocal(owner);
	const { note } = await seedNote(suffix, owner);
	const client = postgres(context.url, { max: 3 });
	clients.push(client);
	const transaction = createTransactionContext(drizzle(client, { schema }));
	const records = new AttachmentRecords(transaction.database);
	const search = new KnowledgeIndexRecords(transaction.database);
	const finalize = () =>
		transaction.transactionRunner.run(async () => {
			const versionId = crypto.randomUUID() as AttachmentVersionId;
			const upload = await records.createUpload(owner, {
				id: crypto.randomUUID() as AttachmentUploadId,
				projectId: note.projectId,
				noteId: note.id,
				path: 'document.txt',
				objectKey: `upload/${versionId}`,
				mediaType: 'text/plain',
				byteSize: 12,
				checksumSha256: 'a'.repeat(64),
				expiresAt: now,
				createdAt: now
			});
			return records.finalize(owner, upload, {
				id: versionId,
				attachmentId: crypto.randomUUID() as AttachmentId,
				objectKey: `object/${versionId}`,
				mediaType: 'text/plain',
				byteSize: 12,
				checksumSha256: 'a'.repeat(64),
				processingStatus: 'queued',
				createdAt: now
			});
		});
	const view = await finalize();
	const parser = new InMemoryTextParser();
	parser.text = 'Extracted document';
	const worker = new AttachmentProcessing({
		records,
		claims: new PostgresAttachmentClaims(
			{ open: () => postgres(context.url, { max: 1, idle_timeout: 0, max_lifetime: 0 }) },
			transaction.connectionScope
		),
		storage: new InMemoryStorage(),
		parsers: new AttachmentParserRegistry([parser]),
		ocr: new InMemoryOcrEngine(),
		imageDescriber: new InMemoryImageDescriber(),
		content: new AttachmentContent(),
		parseLimit: 1024,
		maxPages: 100,
		preferences: {
			get: async () => ({
				userId: owner.userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: now,
				updatedAt: now
			})
		},
		indexer: new ContentIndex(search, new InMemoryEmbeddingClient(), chunker).attachments,
		transactionRunner: transaction.transactionRunner,
		visionModel: 'test/model',
		logger: { error: () => {} }
	});
	return { owner, records, search, view, parser, worker, finalize, transaction };
};
describe('attachment processing persistence', () => {
	it('recovers an old truncated index from saved extraction without parsing again', async () => {
		const { owner, records, search, view, parser, worker } = await setup(
			'9751',
			new TokenAwareChunker(30, 5)
		);
		const text =
			Array.from(
				{ length: 60 },
				(_, index) => `Section ${index}. ${'Document evidence. '.repeat(10)}`
			).join('\n\n') + '\n\nRecovery marker amberfalcon.';
		await records.updateVersion(owner, {
			...view.version,
			processingStatus: 'partial',
			parserKind: 'text',
			extractedText: text
		});
		parser.beforeParse = async () => {
			throw new Error('Parsing is unavailable');
		};
		await worker.run();
		const saved = await records.findById(owner, view.attachment.id);
		const matches = await search.search(owner, 'amberfalcon', 10, view.attachment.projectId);
		expect({
			status: saved?.version.processingStatus,
			tail: matches.map(({ document }) => document.chunkIndex >= 50)
		}).toEqual({ status: 'ready', tail: [true] });
	});

	it('rescans interrupted versions and saves searchable text', async () => {
		const { owner, records, search, view, worker, transaction } = await setup('9711');
		await transaction.transactionRunner.run(() =>
			records.updateVersion(owner, { ...view.version, processingStatus: 'processing' })
		);
		await worker.process(owner, view.version.id);
		expect({
			status: (await records.findById(owner, view.attachment.id))?.version.processingStatus,
			text: (await search.listForAttachment(owner, view.attachment.id)).map((item) => item.content)
		}).toEqual({ status: 'ready', text: ['Extracted document'] });
	});
	it('does not publish older text when another upload becomes current during extraction', async () => {
		const { owner, records, search, view, parser, worker, finalize } = await setup('9712');
		parser.beforeParse = async () => {
			await finalize();
		};
		await worker.process(owner, view.version.id);
		expect({
			current: (await records.findById(owner, view.attachment.id))?.version.processingStatus,
			chunks: await search.listForAttachment(owner, view.attachment.id)
		}).toEqual({ current: 'queued', chunks: [] });
	});
	it('lists both queued and interrupted versions in the durable backlog', async () => {
		const { owner, records, view, finalize, transaction } = await setup('9713');
		await transaction.transactionRunner.run(() =>
			records.updateVersion(owner, { ...view.version, processingStatus: 'processing' })
		);
		const latest = await finalize();
		expect(
			(await records.listPendingVersions())
				.filter((item) => item.userId === owner.userId)
				.map((item) => item.versionId)
				.sort()
		).toEqual([view.version.id, latest.version.id].sort());
	});
	it('clears a previous failure when retry queues a version', async () => {
		const { owner, records, view, transaction } = await setup('9714');
		await transaction.transactionRunner.run(() =>
			records.updateVersion(owner, {
				...view.version,
				processingStatus: 'failed',
				processingFailure: 'OCR unavailable',
				processedAt: now
			})
		);
		await transaction.transactionRunner.run(() =>
			records.updateVersion(owner, { ...view.version, processingStatus: 'queued' })
		);
		expect(
			(await records.findById(owner, view.attachment.id))?.version.processingFailure
		).toBeUndefined();
	});
});
