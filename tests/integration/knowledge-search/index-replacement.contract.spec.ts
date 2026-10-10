import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { describe, expect, it } from 'vitest';
import type { EmbeddingClient } from '$lib/models/knowledge-search/embeddings';
import { EmbeddingMaintenance } from '$lib/server/controllers/knowledge-indexing/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { IndexBacklog } from '$lib/server/services/knowledge-search/index-backlog';
import { EmbeddingProgressStore } from '$lib/server/stores/maintenance/embedding-progress';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { context, replaceNoteFixture, seedNote } from '../database-harness';

const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
const model = 'contract-model';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const repository = new KnowledgeIndexRecords(database);
	const committed = new KnowledgeIndexRecords(context.db);
	const index = createTestContentIndex(repository, model, undefined, true);
	const inline = createTestContentIndex(repository, model);
	const note = await replaceNoteFixture({ ...seeded.note, plainText: 'original searchable text' });
	await transactionRunner.run(async () => {
		const prepared = await inline.indexNote(seeded.owner, note);
		if (prepared.kind !== 'needs_embeddings') throw new Error('Expected a fresh index');
		await inline.complete(seeded.owner, prepared, {
			model,
			vectors: prepared.missing.map(() => vector)
		});
	});
	const save = async (text: string, revision: number) => {
		const updated = await replaceNoteFixture({
			...note,
			plainText: text,
			currentRevision: revision
		});
		await transactionRunner.run(() => index.indexNote(seeded.owner, updated));
	};
	const contents = async () =>
		(await committed.listForNote(seeded.owner, note.id))
			.map((row) => ({
				content: row.content,
				embedded: row.embedding !== undefined,
				superseded: row.supersededAt !== undefined
			}))
			.sort((a, b) => a.content.localeCompare(b.content));
	const semantic = async () =>
		(await committed.searchByEmbedding(seeded.owner, vector, 10, seeded.project.id)).map(
			(match) => match.document.content
		);
	const maintenance = (embed: EmbeddingClient['embed']) =>
		new EmbeddingMaintenance(
			new IndexBacklog(repository),
			{ model, embed },
			transactionRunner,
			new EmbeddingProgressStore(),
			{
				logger: {
					log: () => {},
					error: (message, error) => {
						throw new Error(String(message), { cause: error });
					}
				}
			}
		);
	return {
		database,
		...seeded,
		note,
		repository,
		committed,
		transactionRunner,
		index,
		inline,
		save,
		contents,
		semantic,
		maintenance
	};
};

describe('PostgreSQL index replacement', () => {
	it('keeps old vectors searchable while literal search exposes only the replacement', async () => {
		const fixture = await setup('99601');
		await fixture.save('replacement searchable text', 2);
		expect({
			semantic: await fixture.semantic(),
			oldLiteral: (
				await fixture.committed.search(fixture.owner, 'original', 10, fixture.project.id)
			).map((match) => match.document.content),
			newLiteral: (
				await fixture.committed.search(fixture.owner, 'replacement', 10, fixture.project.id)
			).map((match) => match.document.content)
		}).toEqual({
			semantic: ['original searchable text'],
			oldLiteral: [],
			newLiteral: ['replacement searchable text']
		});
	});

	it('retires old chunks only after the replacement embeddings commit', async () => {
		const fixture = await setup('99602');
		await fixture.save('replacement searchable text', 2);
		await fixture
			.maintenance(async (inputs) => ({ model, vectors: inputs.map(() => vector) }))
			.run();
		expect({ rows: await fixture.contents(), semantic: await fixture.semantic() }).toEqual({
			rows: [{ content: 'replacement searchable text', embedded: true, superseded: false }],
			semantic: ['replacement searchable text']
		});
	});

	it('ignores an older embedding completion after a newer edit commits', async () => {
		const fixture = await setup('99603');
		await fixture.save('intermediate searchable text', 2);
		const requested = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const pending = fixture
			.maintenance(async (inputs) => {
				requested.resolve();
				await release.promise;
				return { model, vectors: inputs.map(() => vector) };
			})
			.run();
		try {
			await requested.promise;
			await fixture.save('newest searchable text', 3);
		} finally {
			release.resolve();
			await pending;
		}
		expect({ rows: await fixture.contents(), semantic: await fixture.semantic() }).toEqual({
			rows: [
				{ content: 'newest searchable text', embedded: false, superseded: false },
				{ content: 'original searchable text', embedded: true, superseded: true }
			],
			semantic: ['original searchable text']
		});
	});

	it('does not resurrect chunks when their source is deleted during embedding', async () => {
		const fixture = await setup('99604');
		await fixture.save('replacement searchable text', 2);
		const requested = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const pending = fixture
			.maintenance(async (inputs) => {
				requested.resolve();
				await release.promise;
				return { model, vectors: inputs.map(() => vector) };
			})
			.run();
		try {
			await requested.promise;
			const archived = await replaceNoteFixture({
				...fixture.note,
				archivedAt: fixture.note.updatedAt
			});
			await fixture.transactionRunner.run(async () => {
				await fixture.index.indexNote(fixture.owner, archived);
				await new NoteRecords(fixture.database).deleteTrashed(fixture.owner, archived.id);
			});
		} finally {
			release.resolve();
			await pending;
		}
		expect({ rows: await fixture.contents(), semantic: await fixture.semantic() }).toEqual({
			rows: [],
			semantic: []
		});
	});

	it('publishes a fully embedded replacement atomically to other connections', async () => {
		const fixture = await setup('99605');
		const updated = await replaceNoteFixture({
			...fixture.note,
			plainText: 'replacement searchable text',
			currentRevision: 2
		});
		const staged = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const writing = fixture.transactionRunner.run(async () => {
			const result = await fixture.inline.indexNote(fixture.owner, updated);
			if (result.kind !== 'needs_embeddings') throw new Error('Expected changed chunks');
			await fixture.inline.complete(fixture.owner, result, {
				model,
				vectors: result.missing.map(() => vector)
			});
			staged.resolve();
			await release.promise;
		});
		const reader = connectPostgresTestDatabase(context.url);
		let beforeCommit;
		try {
			await staged.promise;
			beforeCommit = (
				await new KnowledgeIndexRecords(reader.db).listForNote(fixture.owner, fixture.note.id)
			).map((row) => ({
				content: row.content,
				embedded: row.embedding !== undefined,
				superseded: row.supersededAt !== undefined
			}));
		} finally {
			release.resolve();
			await writing;
			await reader.close();
		}
		expect({ beforeCommit, afterCommit: await fixture.contents() }).toEqual({
			beforeCommit: [{ content: 'original searchable text', embedded: true, superseded: false }],
			afterCommit: [{ content: 'replacement searchable text', embedded: true, superseded: false }]
		});
	});

	it('rolls back replacement without losing the previously committed index', async () => {
		const fixture = await setup('99606');
		const updated = await replaceNoteFixture({
			...fixture.note,
			plainText: 'replacement searchable text',
			currentRevision: 2
		});
		const outcome = await fixture.transactionRunner
			.run(async () => {
				await fixture.index.indexNote(fixture.owner, updated);
				throw new Error('Replacement rejected');
			})
			.then(
				() => 'stored',
				() => 'rejected'
			);
		expect({ outcome, rows: await fixture.contents() }).toEqual({
			outcome: 'rejected',
			rows: [{ content: 'original searchable text', embedded: true, superseded: false }]
		});
	});
});
