import { InMemoryStorage } from '$lib/testing/attachments/fakes/processing';
import {
	AttachmentClaimService,
	AttachmentVersionService
} from '$lib/server/services/attachments/records';
import { InMemoryRetrievalProvider } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { InMemoryAttachmentExtraction } from '$lib/testing/attachments/fakes/extraction';
import { AgentModelSelectionService } from '$lib/services/agent/model-selection';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { testTokenizer } from '$lib/testing/tokenization/fixtures/tokenizer';
import { afterAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { PostgresAttachmentClaims } from '$lib/server/repositories/attachments/postgres/claims';
import {
	AttachmentBacklogRecords,
	AttachmentRecords
} from '$lib/server/repositories/attachments/postgres/attachments';
import { UserRecords } from '$lib/server/repositories/identity/postgres/users';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { AttachmentProcessing } from '$lib/server/controllers/attachment-processing/controller';
import { AttachmentFormatService } from '$lib/server/services/attachments/formats';
import { AttachmentProcessingService } from '$lib/server/services/attachments/content';
import type {
	AttachmentId,
	AttachmentUploadId,
	AttachmentVersionId
} from '$lib/models/attachments';
import { actor, context, now, seedNote } from '../database-harness';
import {
	AgentVirtualFiles,
	type AgentVirtualFilesDependencies
} from '$lib/server/services/agent-files/virtual-files';
import { InMemoryAgentFiles } from '$lib/testing/agent/fakes/in-memory-agent-files';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});
const setup = async (suffix: string, chunker = { targetTokens: 2400, overlapTokens: 480 }) => {
	const owner = actor(suffix);
	await new UserRecords(owner, context.db).ensureLocal();
	const { note } = await seedNote(suffix, owner);
	const client = postgres(context.url, { max: 3 });
	clients.push(client);
	const transaction = createTransactionContext(drizzle(client, { schema }));
	const records = new AttachmentRecords(owner, transaction.database);
	const search = new KnowledgeIndexRecords(owner, transaction.database);
	const finalize = () =>
		transaction.transactionRunner.run(async () => {
			const versionId = crypto.randomUUID() as AttachmentVersionId;
			const upload = await records.createUpload({
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
			return records.finalize(upload, {
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
	const extraction = new InMemoryAttachmentExtraction();
	extraction.results.text = { text: 'Extracted document', parserKind: 'text' };
	const worker = new AttachmentProcessing({
		modelSelection: new AgentModelSelectionService(),
		records: new AttachmentVersionService(records),
		claims: new AttachmentClaimService(
			new PostgresAttachmentClaims(
				{ open: () => postgres(context.url, { max: 1, idle_timeout: 0, max_lifetime: 0 }) },
				transaction.connectionScope
			)
		),
		extraction,
		storage: new InMemoryStorage(),
		processing: new AttachmentProcessingService(),
		formats: new AttachmentFormatService(),
		preferences: {
			get: async () => ({
				userId: owner.userId,
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: now,
				updatedAt: now
			})
		},
		indexer: createContentIndex(search, new InMemoryRetrievalProvider().model, chunker),
		transactionRunner: transaction.transactionRunner,
		visionModel: 'test/model'
	});
	return { owner, records, search, view, extraction, worker, finalize, transaction };
};
describe('attachment processing persistence', () => {
	it('recovers an old truncated index from saved extraction without parsing again', async () => {
		const { records, search, view, extraction, worker } = await setup('9751', {
			targetTokens: 30,
			overlapTokens: 5
		});
		const text =
			Array.from(
				{ length: 60 },
				(_, index) => `Section ${index}. ${'Document evidence. '.repeat(10)}`
			).join('\n\n') + '\n\nRecovery marker amberfalcon.';
		await records.updateVersion({
			...view.version,
			processingStatus: 'partial',
			parserKind: 'text',
			extractedText: text
		});
		extraction.beforeExtract = async () => {
			throw new Error('Parsing is unavailable');
		};
		await worker.process(view.version.id);
		const saved = await records.findById(view.attachment.id);
		const matches = await search.search('amberfalcon', 10, view.attachment.projectId);
		expect({
			status: saved?.version.processingStatus,
			tail: matches.map(({ document }) => document.content.includes('amberfalcon'))
		}).toEqual({ status: 'ready', tail: [true] });
	});

	it('rescans interrupted versions and saves searchable text', async () => {
		const { records, search, view, worker, transaction } = await setup('9711');
		await transaction.transactionRunner.run(() =>
			records.updateVersion({ ...view.version, processingStatus: 'processing' })
		);
		await worker.process(view.version.id);
		expect({
			status: (await records.findById(view.attachment.id))?.version.processingStatus,
			text: (await search.listForAttachment(view.attachment.id)).map((item) => item.content)
		}).toEqual({ status: 'ready', text: ['Extracted document'] });
	});
	it('does not publish older text when another upload becomes current during extraction', async () => {
		const { records, search, view, extraction, worker, finalize } = await setup('9712');
		extraction.beforeExtract = async () => {
			await finalize();
		};
		await worker.process(view.version.id);
		expect({
			current: (await records.findById(view.attachment.id))?.version.processingStatus,
			chunks: await search.listForAttachment(view.attachment.id)
		}).toEqual({ current: 'queued', chunks: [] });
	});
	it('lists both queued and interrupted versions in the durable backlog', async () => {
		const { owner, records, view, finalize, transaction } = await setup('9713');
		await transaction.transactionRunner.run(() =>
			records.updateVersion({ ...view.version, processingStatus: 'processing' })
		);
		const latest = await finalize();
		expect(
			(await new AttachmentBacklogRecords(context.db).listPendingVersions())
				.filter((item) => item.userId === owner.userId)
				.map((item) => item.versionId)
				.sort()
		).toEqual([view.version.id, latest.version.id].sort());
	});
	it('clears a previous failure when retry queues a version', async () => {
		const { records, view, transaction } = await setup('9714');
		await transaction.transactionRunner.run(() =>
			records.updateVersion({
				...view.version,
				processingStatus: 'failed',
				processingFailure: 'OCR unavailable',
				processedAt: now
			})
		);
		await transaction.transactionRunner.run(() =>
			records.updateVersion({ ...view.version, processingStatus: 'queued' })
		);
		expect((await records.findById(view.attachment.id))?.version.processingFailure).toBeUndefined();
	});
});

it('preserves successful empty extraction when the version is read back', async () => {
	const { owner, records, view, extraction, worker } = await setup('21701');
	extraction.results.text = { text: '', parserKind: 'text' };
	await worker.process(view.version.id);
	expect((await records.findById(view.attachment.id))?.version).toMatchObject({
		processingStatus: 'ready',
		parserKind: 'text',
		extractedText: ''
	});
	const files = new AgentVirtualFiles(
		capabilityDependencies<AgentVirtualFilesDependencies>({
			tokens: testTokenizer,
			attachments: records,
			stored: new InMemoryAgentFiles(owner)
		})
	);
	const path = `/projects/${view.attachment.projectId}/attachments/${view.attachment.id}.txt`;
	expect(await files.ls(path)).toMatchObject({
		kind: 'listed',
		entries: [{ kind: 'file', path, byteSize: 0, lineCount: 0 }]
	});
});

it('does not invent extracted text for a queued attachment', async () => {
	const { records, view } = await setup('21703');
	expect((await records.findById(view.attachment.id))?.version.extractedText).toBeUndefined();
});
