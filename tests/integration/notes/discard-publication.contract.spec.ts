import { NoteReferenceService } from '$lib/services/notes/references';
import { NoteSectionNumberingService } from '$lib/services/notes/section-numbering';
import { NoteEditingService as NoteEditingRulesService } from '$lib/services/notes/editing';
import { NoteLifecycleService as NoteLifecycleRulesService } from '$lib/services/notes/lifecycle';
import { NotePresentationService } from '$lib/services/notes/presentation';
import { SuggestionPresentationService } from '$lib/services/suggestions/presentation';
import { expect, it, vi } from 'vitest';
import type { Database } from '$lib/server/db';
import type { AtomicOperation } from '$lib/models/workspace';
import type { Note } from '$lib/models/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { noteEtag } from '$lib/models/notes';
import { context, seedNote } from '../database-harness';

const controllerFor = (db: Database, transactionRunner: AtomicOperation) => {
	const { services: catalog } = createNotesCapability({ db, projects: new ProjectRecords(db) });
	const effects = new InMemoryNoteContent();
	return new Notes(
		capabilityDependencies<NotesDependencies>({
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
			notePublisher: catalog.publisher,
			revisionRecorder: catalog.revisionRecorder,
			revisionReader: catalog.revisionReader,
			attachmentRestorer: catalog.attachmentRestorer,
			anchorRepairer: catalog.anchorRepairer,
			noteLinkReconciler: effects,
			noteIndexer: effects
		})
	);
};
const content = (text: string): Pick<Note, 'plainText' | 'document'> => ({
	plainText: text,
	document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
});
it('discards to the publication committed while it waits for the note lock', async () => {
	const { owner, note } = await seedNote('26001');
	const seedTx = createTransactionContext(context.db);
	const seed = controllerFor(seedTx.database, seedTx.transactionRunner);
	const first = await seed.save(owner, { note: { ...note, ...content('First publication') } });
	const published = await seed.publish(owner, {
		noteId: note.id,
		baseEtag: noteEtag(first.note.id, first.note.currentRevision)
	});
	const draft = await seed.save(owner, {
		note: { ...published.note, ...content('New publication') }
	});
	const peer = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const peerTx = createTransactionContext(peer.db);
	const writeTx = createTransactionContext(writer.db);
	const ready = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const publishing = peerTx.transactionRunner.run(async () => {
		const result = await controllerFor(peerTx.database, peerTx.transactionRunner).publish(owner, {
			noteId: note.id,
			baseEtag: noteEtag(draft.note.id, draft.note.currentRevision)
		});
		ready.resolve();
		await release.promise;
		return result;
	});
	void publishing.catch((error) => {
		ready.reject(error);
		return { kind: 'failure', error };
	});
	try {
		await ready.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const discarding = controllerFor(writeTx.database, writeTx.transactionRunner).discardDraft(
			owner,
			{ noteId: note.id }
		);
		await vi.waitFor(async () => {
			const waiting = await context.client<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Discard has not reached the locked note');
		});
		release.resolve();
		const latest = await publishing;
		const discarded = await discarding;
		expect({
			result: discarded.note,
			stored: await new NoteRecords(context.db).findById(owner, note.id)
		}).toEqual({ result: latest.note, stored: latest.note });
	} finally {
		release.resolve();
		await publishing;
		await Promise.all([peer.close(), writer.close()]);
	}
});
