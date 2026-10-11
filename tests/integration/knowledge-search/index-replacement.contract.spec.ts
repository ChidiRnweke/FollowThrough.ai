import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { describe, expect, it, onTestFinished } from 'vitest';
import { retrievalTransport } from '$lib/testing/knowledge-search/fakes/in-memory-retrieval-provider';
import { z } from 'zod';
import { KnowledgeIndexing } from '$lib/server/controllers/knowledge-indexing/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { createTestContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { context, replaceNoteFixture, seedNote } from '../database-harness';

const vector = Array.from({ length: 3072 }, (_, index) => (index === 0 ? 1 : 0));
const model = 'contract-model';

type Embed = (
	inputs: readonly string[]
) => Promise<{ readonly model: string; readonly vectors: readonly (readonly number[])[] }>;

/** A provider whose embedding endpoint answers through `embed`. */
const provider = (embed: Embed) =>
	retrievalTransport(async (_url, init) => {
		const inputs = z
			.object({ input: z.array(z.string()) })
			.parse(JSON.parse(String(init?.body))).input;
		const batch = await embed(inputs);
		return Response.json({
			data: batch.vectors.map((embedding, index) => ({
				index,
				embedding: Buffer.from(new Float32Array(embedding).buffer).toString('base64')
			}))
		});
	}, model);
const embedAll: Embed = async (inputs) => ({ model, vectors: inputs.map(() => vector) });

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const repository = new KnowledgeIndexRecords(seeded.owner, database);
	const committed = new KnowledgeIndexRecords(seeded.owner, context.db);
	onTestFinished(() => committed.deleteForNote(seeded.note.id));
	const contentIndex = (defer: boolean, embed: Embed) =>
		createTestContentIndex(repository, model, undefined, defer, provider(embed));
	const index = contentIndex(true, embedAll);
	const inline = contentIndex(false, embedAll);
	const note = await replaceNoteFixture({ ...seeded.note, plainText: 'original searchable text' });
	await transactionRunner.run(() => inline.indexNote(note));
	const save = async (text: string, revision: number) => {
		const updated = await replaceNoteFixture({
			...note,
			plainText: text,
			currentRevision: revision
		});
		await transactionRunner.run(() => index.indexNote(updated));
	};
	const contents = async () =>
		(await committed.listForNote(note.id))
			.map((row) => ({
				content: row.content,
				embedded: row.embedding !== undefined,
				superseded: row.supersededAt !== undefined
			}))
			.sort((a, b) => a.content.localeCompare(b.content));
	const semantic = async () =>
		(await committed.searchByEmbedding(vector, 10, seeded.project.id)).map(
			(match) => match.document.content
		);
	/** The worker's backfill of this note, embedded as its owner. */
	const maintenance = (embed: Embed) => ({
		run: () =>
			new KnowledgeIndexing(contentIndex(false, embed), transactionRunner).backfill({
				kind: 'note',
				noteId: seeded.note.id
			})
	});
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
			oldLiteral: (await fixture.committed.search('original', 10, fixture.project.id)).map(
				(match) => match.document.content
			),
			newLiteral: (await fixture.committed.search('replacement', 10, fixture.project.id)).map(
				(match) => match.document.content
			)
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
				if (inputs.some((input) => input.startsWith(`${fixture.note.title}\n`))) {
					requested.resolve();
					await release.promise;
				}
				return { model, vectors: inputs.map(() => vector) };
			})
			.run();
		try {
			await Promise.race([
				requested.promise,
				pending.then(() => {
					throw new Error('The target source was not requested for embedding');
				})
			]);
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
				if (inputs.some((input) => input.startsWith(`${fixture.note.title}\n`))) {
					requested.resolve();
					await release.promise;
				}
				return { model, vectors: inputs.map(() => vector) };
			})
			.run();
		try {
			await Promise.race([
				requested.promise,
				pending.then(() => {
					throw new Error('The target source was not requested for embedding');
				})
			]);
			const archived = await replaceNoteFixture({
				...fixture.note,
				archivedAt: fixture.note.updatedAt
			});
			await fixture.transactionRunner.run(async () => {
				await fixture.index.indexNote(archived);
				await new NoteRecords(fixture.owner, fixture.database).deleteTrashed(archived.id);
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
			await fixture.inline.indexNote(updated);
			staged.resolve();
			await release.promise;
		});
		const reader = connectPostgresTestDatabase(context.url);
		let beforeCommit;
		try {
			await staged.promise;
			beforeCommit = (
				await new KnowledgeIndexRecords(fixture.owner, reader.db).listForNote(fixture.note.id)
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
				await fixture.index.indexNote(updated);
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
