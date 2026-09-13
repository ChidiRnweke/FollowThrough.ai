import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { workspaceMutationRequestSchema } from '$lib/models/workspace-mutations';
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
			noteArchiver: catalog,
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
	return {
		...seeded,
		controller,
		synchronization,
		catalog,
		database,
		transactionRunner,
		baseEtag: resource.snapshot.etag
	};
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

describe('guarded note trash actions', () => {
	it('archives a note once even after a lost acknowledgement', async () => {
		const { owner, note, controller, baseEtag } = await setup('9107');
		const request = {
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'archiveNote' as const, noteId: note.id }
		};
		const first = await controller.synchronize(owner, request);
		expect(await controller.synchronize(owner, request)).toEqual(first);
	});
	it('restores the guarded note through the owning trash rules', async () => {
		const { owner, note, controller, synchronization, catalog } = await setup('9108');
		await catalog.archive(owner, note.id);
		const current = await synchronization.objects.read(
			owner,
			{ type: 'notes', id: [note.id] },
			null
		);
		if (current.kind !== 'found') throw new Error('The archived note must exist');
		const result = await controller.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: current.snapshot.etag,
			command: { kind: 'restoreNote', noteId: note.id }
		});
		const restored = await catalog.get(owner, note.id);
		expect({ result: result.kind, archivedAt: restored.archivedAt }).toEqual({
			result: 'applied',
			archivedAt: undefined
		});
	});
});

it('returns a sync rejection when a referenced row disappears inside the transaction', async () => {
	const { owner, note, database, synchronization, baseEtag } = await setup('9181');
	const result = await synchronization.mutations.run(
		owner,
		{
			operationId: crypto.randomUUID(),
			baseEtag,
			command: { kind: 'renameNote', noteId: note.id, title: 'Never committed' }
		},
		async () => {
			await database.execute(
				sql`update notes set project_id = ${crypto.randomUUID()} where id = ${note.id}`
			);
		}
	);
	expect(result).toEqual({
		kind: 'rejected',
		message: 'A referenced item is no longer available. Review or discard this change.'
	});
});
it('does not disguise a non-sync database failure as a domain decision', async () => {
	const { note, database, transactionRunner } = await setup('9182');
	await expect(
		transactionRunner.run(
			async () => {
				await database.execute(sql`update notes set title = NULL where id = ${note.id}`);
			},
			{ retry: 'never' }
		)
	).rejects.toMatchObject({ cause: { code: '23502' } });
});
it('matches cancellation to normalized input after an applied response is lost', async () => {
	const { owner, note, controller, synchronization, baseEtag } = await setup('9183');
	const input = workspaceMutationRequestSchema.parse({
		operationId: crypto.randomUUID(),
		baseEtag,
		command: { kind: 'renameNote', noteId: note.id, title: 'Plan ' }
	});
	if (input.command.kind !== 'renameNote') throw new Error('Expected a note rename');
	const applied = await controller.synchronize(owner, { ...input, command: input.command });
	const recovered = await synchronization.mutations.cancel(owner, {
		operationId: input.operationId,
		request: JSON.stringify(input)
	});
	expect(recovered).toEqual(applied);
});
