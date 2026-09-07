import { describe, expect, it } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import { Notes, type NotesDependencies } from '$lib/server/controllers/notes/controller';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createNotesCapability } from '$lib/server/factories/capabilities/notes-capability-factory';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const synchronization = createSyncCapability({ db: database, transactionRunner });
	const { catalog } = createNotesCapability({
		db: database,
		projects: new ProjectRecords(database)
	});
	const content = new InMemoryNoteContent();
	const controller = new Notes(
		capabilityDependencies<NotesDependencies>({
			syncMutations: synchronization.mutations,
			transactionRunner,
			noteReader: catalog,
			noteEditor: catalog,
			noteSectionNumbering: catalog,
			noteCreator: catalog,
			notePublisher: catalog,
			revisionRecorder: catalog,
			noteIndexer: content,
			anchorRepairer: content,
			noteLinkReconciler: content
		})
	);
	const resource = await synchronization.objects.read(
		seeded.owner,
		{ type: 'notes', id: [seeded.note.id] },
		null
	);
	if (resource.kind !== 'found') throw new Error('Seeded note was not readable');
	return { ...seeded, controller, baseEtag: resource.snapshot.etag };
};

describe('synchronized domain mutations on PostgreSQL', () => {
	it('does not apply a retried rename twice', async () => {
		const { owner, note, controller, baseEtag } = await setup('9101');
		const request = {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'renameNote' as const, noteId: note.id, title: 'Renamed once' }
		};
		await controller.synchronize(owner, request);
		await controller.synchronize(owner, request);
		const rows = await context.client<
			{ revision: number }[]
		>`select current_revision as revision from notes where id = ${note.id}`;
		expect(rows[0]?.revision).toBe(note.currentRevision + 1);
	});

	it('rejects a stale base without overwriting another client’s edit', async () => {
		const { owner, note, controller, baseEtag } = await setup('9102');
		await context.client`update notes set title = 'Other device' where id = ${note.id}`;
		const outcome = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'renameNote', noteId: note.id, title: 'Stale rename' }
		});
		const rows = await context.client<
			{ title: string }[]
		>`select title from notes where id = ${note.id}`;
		expect({ kind: outcome.kind, title: rows[0]?.title }).toEqual({
			kind: 'conflict',
			title: 'Other device'
		});
	});

	it('creates a new note using its stable local identity with no server base', async () => {
		const { owner, project, controller } = await setup('9103');
		const id = crypto.randomUUID() as NoteId;
		const outcome = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: { kind: 'createNote', id, projectId: project.id, title: 'Offline creation' }
		});
		const rows = await context.client<{ id: string }[]>`select id from notes where id = ${id}`;
		expect({ kind: outcome.kind, id: rows[0]?.id }).toEqual({ kind: 'applied', id });
	});

	it('publishes the guarded current note using the domain’s document revision check', async () => {
		const { owner, note, controller, baseEtag } = await setup('9104');
		await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'publishNote', noteId: note.id }
		});
		const rows = await context.client<
			{ revision: number }[]
		>`select published_revision as revision from notes where id = ${note.id}`;
		expect(rows[0]?.revision).toBe(note.currentRevision);
	});
});

describe('imported note metadata', () => {
	it('applies explicitly edited metadata with the guarded document', async () => {
		const { owner, note, controller, baseEtag } = await setup('9105');
		const outcome = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: {
				kind: 'saveNote',
				noteId: note.id,
				document: note.document,
				plainText: note.plainText,
				title: 'Offline title',
				isPinned: true,
				sectionNumbering: true
			}
		});
		const rows = await context.client<
			{ title: string; pinned: boolean; numbering: boolean }[]
		>`select title, is_pinned as pinned, section_numbering as numbering from notes where id = ${note.id}`;
		expect({ kind: outcome.kind, note: rows[0] }).toEqual({
			kind: 'applied',
			note: { title: 'Offline title', pinned: true, numbering: true }
		});
	});
	it('retains metadata omitted from an imported document edit', async () => {
		const { owner, note, controller, baseEtag } = await setup('9106');
		await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: {
				kind: 'saveNote',
				noteId: note.id,
				document: note.document,
				plainText: note.plainText
			}
		});
		const rows = await context.client<
			{ title: string; pinned: boolean }[]
		>`select title, is_pinned as pinned from notes where id = ${note.id}`;
		expect(rows[0]).toEqual({ title: note.title, pinned: note.isPinned });
	});
});
