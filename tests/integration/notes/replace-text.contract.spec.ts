import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ContentIndex, TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const first = await seedNote(suffix);
	const second = await seedNote(`${suffix}1`, first.owner);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { catalog, markdown } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const search = new KnowledgeIndexRecords(database);
	const index = new ContentIndex(
		search,
		new InMemoryEmbeddingClient(),
		new TokenAwareChunker(),
		true
	).notes;
	const original = await Promise.all(
		[first.note, second.note].map((note) =>
			catalog.save(first.owner, { ...note, ...markdown.read('ship release') })
		)
	);
	for (const note of original) await index.index(first.owner, note);
	const effects = new InMemoryNoteContent();
	const faults = { secondIndex: false };
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			transactionRunner,
			noteReader: catalog,
			noteEditor: catalog,
			noteTextSearcher: catalog,
			anchorRepairer: effects,
			noteLinkReconciler: effects,
			noteIndexer: {
				index: async (actor, note) => {
					await index.index(actor, note);
					if (faults.secondIndex && note.id === second.note.id)
						throw new Error('Second index write failed');
				}
			}
		})
	);
	const input = {
		query: 'ship',
		replacement: 'deploy',
		regex: false,
		caseSensitive: false,
		noteIds: original.map((note) => note.id)
	};
	const read = async () =>
		Promise.all(
			original.map(async (note) => ({
				note: await catalog.get(first.owner, note.id),
				index: await search.listForNote(first.owner, note.id)
			}))
		);
	return { controller, owner: first.owner, faults, input, read };
};

describe('atomic server text replacement', () => {
	it('retains both note bodies and indexes when the second write fails', async () => {
		const { controller, owner, faults, input, read } = await setup('9791');
		const before = await read();
		faults.secondIndex = true;
		await controller.replaceText(owner, input).catch(() => undefined);
		expect(await read()).toEqual(before);
	});
	it('retries a failed batch without leaving a double revision on the first note', async () => {
		const { controller, owner, faults, input, read } = await setup('9792');
		faults.secondIndex = true;
		await controller.replaceText(owner, input).catch(() => undefined);
		faults.secondIndex = false;
		await controller.replaceText(owner, input);
		expect(
			(await read()).map(({ note }) => ({ text: note.plainText, revision: note.currentRevision }))
		).toEqual([
			{ text: 'deploy release', revision: 3 },
			{ text: 'deploy release', revision: 3 }
		]);
	});
});
