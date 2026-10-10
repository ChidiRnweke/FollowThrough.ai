import { NoteTextSearchService } from '$lib/services/notes/text-search';
import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { createTestContentIndex as createContentIndex } from '$lib/testing/knowledge-search/fixtures/content-index';
import { saveNoteDraft } from '$lib/testing/notes/fixtures/saved-draft';
import { describe, expect, it } from 'vitest';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { InMemoryEmbeddingClient } from '$lib/testing/knowledge-search/fakes/in-memory-search';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const first = await seedNote(suffix);
	const second = await seedNote(`${suffix}1`, first.owner);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const { services: catalog, markdown } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const search = new KnowledgeIndexRecords(database);
	const index = createContentIndex(
		search,
		new InMemoryEmbeddingClient().model,
		{ targetTokens: 2400, overlapTokens: 480 },
		true
	).notes;
	const original = await Promise.all(
		[first.note, second.note].map((note) =>
			saveNoteDraft(catalog.editor, transactionRunner, first.owner, {
				...note,
				...markdown.read('ship release')
			})
		)
	);
	for (const note of original) await index.index(first.owner, note);
	const effects = new InMemoryNoteContent();
	const faults = { secondIndex: false };
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			textSearch: new NoteTextSearchService(),
			noteReferences: new NoteReferenceService(),
			sections: new NoteSectionNumberingService(),
			noteCreationRules: new NoteLifecycleRulesService(),
			noteTrashRules: new NoteLifecycleRulesService(),
			notePublicationRules: new NoteLifecycleRulesService(),
			noteEditingRules: new NoteEditingRulesService(),
			notePresentation: new NotePresentationService(),
			suggestionPresentation: new SuggestionPresentationService(),
			transactionRunner,
			noteReader: catalog.reader,
			noteEditor: catalog.editor,
			noteTextSearcher: catalog.textSearcher,
			anchorRepairer: effects,
			noteLinkReconciler: effects,
			noteIndexer: {
				index: async (actor, note) => {
					const result = await index.index(actor, note);
					if (faults.secondIndex && note.id === second.note.id)
						throw new Error('Second index write failed');
					return result;
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
				note: await catalog.reader.get(first.owner, note.id),
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
