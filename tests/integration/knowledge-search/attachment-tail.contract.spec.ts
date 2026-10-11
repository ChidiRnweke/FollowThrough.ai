import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { InMemoryMaintenanceProgress } from '$lib/testing/maintenance/fakes/in-memory-maintenance-progress';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Attachment, AttachmentId, AttachmentVersionId } from '$lib/models/attachments';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import { retrievalTransport } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { z } from 'zod';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import * as schema from '$lib/server/db/schema';
import { context, now, seedNote } from '../database-harness';

const text =
	Array.from(
		{ length: 60 },
		(_, index) => `Section ${index}. ${'The report describes supporting evidence. '.repeat(3)}`
	).join('\n\n') + '\n\nThe final approval code is amberfalcon.';
const vector = (tail: boolean) =>
	Array.from({ length: 3072 }, (_, index) => (index === (tail ? 0 : 1) ? 1 : 0));
const client = retrievalTransport(async (_url, init) => {
	const contents = z
		.object({ input: z.array(z.string()) })
		.parse(JSON.parse(String(init?.body))).input;
	return Response.json({
		data: contents.map((content, index) => ({
			index,
			embedding: Buffer.from(
				new Float32Array(vector(content.includes('amberfalcon'))).buffer
			).toString('base64')
		}))
	});
}, 'contract-embedding');
const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const attachment: Attachment = {
		id: crypto.randomUUID() as AttachmentId,
		projectId: project.id,
		path: 'complete-report.txt',
		currentVersionId: crypto.randomUUID() as AttachmentVersionId,
		createdAt: now,
		updatedAt: now
	};
	await context.db.insert(schema.attachments).values({
		...attachment,
		currentVersionId: null,
		userId: owner.userId,
		createdAt: new Date(now),
		updatedAt: new Date(now)
	});
	await context.db.insert(schema.attachmentVersions).values({
		id: attachment.currentVersionId,
		attachmentId: attachment.id,
		objectKey: `contract/${attachment.id}`,
		mediaType: 'text/plain',
		byteSize: new TextEncoder().encode(text).length,
		checksumSha256: 'a'.repeat(64),
		parserKind: 'text',
		extractedText: text,
		processingStatus: 'ready',
		processedAt: new Date(now)
	});
	await context.db
		.update(schema.attachments)
		.set({ currentVersionId: attachment.currentVersionId })
		.where(eq(schema.attachments.id, attachment.id));
	const transaction = createTransactionContext(context.db);
	const repository = new KnowledgeIndexRecords(owner, transaction.database);
	await createContentIndex(repository, client.model, {
		targetTokens: 30,
		overlapTokens: 5
	}).indexAttachment(attachment, text);
	return { owner, project, attachment, repository, transaction };
};

describe('attachment search tail in PostgreSQL', () => {
	it('finds accepted tail text before embeddings are ready', async () => {
		const { owner, project, repository } = await setup('9741');
		const matches = await repository.search('amberfalcon', 10, project.id);
		expect(
			matches.map(({ document }) => ({
				tail: document.chunkIndex >= 50,
				path: document.attachmentPath
			}))
		).toEqual([{ tail: true, path: 'complete-report.txt' }]);
	});

	it('returns the tail as the nearest semantic result after backfill', async () => {
		const { owner, project, attachment, repository, transaction } = await setup('9742');
		await new EmbeddingMaintenance(
			createContentIndex(repository, client.model, undefined, false, client),
			transaction.transactionRunner,
			new InMemoryMaintenanceProgress()
		).run();
		const matches = await repository.searchByEmbedding(vector(true), 1, project.id);
		expect(
			matches.map(({ document }) => ({
				id: document.attachmentId,
				tail: document.chunkIndex >= 50,
				content: document.content.includes('amberfalcon')
			}))
		).toEqual([{ id: attachment.id, tail: true, content: true }]);
	});
});
