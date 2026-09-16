import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { Attachment, AttachmentId, AttachmentVersionId } from '$lib/models/attachments';
import { ContentIndex, TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import type { EmbeddingClient } from '$lib/server/services/knowledge-search/contracts';
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
const client: EmbeddingClient = {
	model: 'contract-embedding',
	embed: async (contents) => ({
		model: 'contract-embedding',
		vectors: contents.map((content) => vector(content.includes('amberfalcon')))
	})
};
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
	const repository = new KnowledgeIndexRecords(transaction.database);
	await new ContentIndex(repository, client.model, new TokenAwareChunker(30, 5)).attachments.index(
		owner,
		attachment,
		text
	);
	return { owner, project, attachment, repository, transaction };
};

describe('attachment search tail in PostgreSQL', () => {
	it('finds accepted tail text before embeddings are ready', async () => {
		const { owner, project, repository } = await setup('9741');
		const matches = await repository.search(owner, 'amberfalcon', 10, project.id);
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
			new IndexBacklog(repository),
			client,
			transaction.transactionRunner
		).run();
		const matches = await repository.searchByEmbedding(owner, vector(true), 1, project.id);
		expect(
			matches.map(({ document }) => ({
				id: document.attachmentId,
				tail: document.chunkIndex >= 50,
				content: document.content.includes('amberfalcon')
			}))
		).toEqual([{ id: attachment.id, tail: true, content: true }]);
	});
});
