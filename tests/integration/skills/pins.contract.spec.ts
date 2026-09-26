import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { KnowledgeIndexRecords } from '$lib/server/repositories/knowledge-search/postgres/search';
import { ContentIndex, TokenAwareChunker } from '$lib/server/services/knowledge-search/indexing';
import { actor, context, replaceNoteFixture, seedNote } from '../database-harness';
import { competingSkillWrites, skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const note = await replaceNoteFixture({
		...seeded.note,
		kind: 'skill',
		isPinned: true,
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Release guidance' }] }]
		},
		plainText: 'Release guidance'
	});
	const target = await new ProjectRecords(context.db).insert(seeded.owner, { name: 'Launch' });
	const records = new SkillRecords(context.db);
	await records.insert(seeded.owner, {
		note,
		slug: `skill-${suffix}`,
		description: 'Release guidance',
		triggerHints: [],
		metadata: {},
		allowImplicitInvocation: true,
		isEnabled: true
	});
	return { ...seeded, note, target, records };
};

it('keeps project skill pins separate from note pins and from other project catalogs', async () => {
	const { owner, note, target, records } = await setup('20001');
	const tx = createTransactionContext(context.db);
	const controller = skillController(tx.database, tx.transactionRunner);
	const pin = { noteId: note.id, projectId: target.id, pinned: true };
	await controller.setPinned(owner, pin);
	await controller.setPinned(owner, pin);
	const selected = await records.listAll(owner, target.id);
	const global = await records.listAll(owner);
	await controller.setPinned(owner, { ...pin, pinned: false });
	expect({
		selected: selected.map((skill) => ({ projectId: skill.projectId, pinned: skill.isPinned })),
		global: global.map((skill) => skill.isPinned),
		unpinned: (await records.listAll(owner, target.id)).map((skill) => skill.isPinned),
		notePinned: (await new NoteRecords(context.db).findById(owner, note.id))?.isPinned
	}).toEqual({
		selected: [{ projectId: note.projectId, pinned: true }],
		global: [false],
		unpinned: [false],
		notePinned: true
	});
});

it.each([
	{ change: 'project', suffix: '20002', code: 'NOT_FOUND' },
	{ change: 'note', suffix: '20003', code: 'VALIDATION' }
])('rejects a pin after a concurrent $change archive commits', async ({ change, suffix, code }) => {
	const { owner, note, target } = await setup(suffix);
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const tx = createTransactionContext(writer.db);
	const ready = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const archiving = blocker.begin(async (transaction) => {
		if (change === 'project')
			await transaction`update projects set archived_at = now() where id = ${target.id}`;
		else await transaction`update notes set archived_at = now() where id = ${note.id}`;
		ready.resolve();
		await release.promise;
	});
	void archiving.catch((error) => {
		ready.reject(error);
		return { kind: 'failure', error };
	});
	try {
		await ready.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = skillController(tx.database, tx.transactionRunner)
			.setPinned(owner, { noteId: note.id, projectId: target.id, pinned: true })
			.then(
				() => ({ kind: 'success' as const }),
				(error: Error) => ({ kind: 'failure' as const, error })
			);
		await vi.waitFor(async () => {
			const rows = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The pin write has not reached its lock');
		});
		release.resolve();
		await archiving;
		expect({
			result: await writing,
			pins: await context.client`select project_id from project_skill_pins where skill_note_id = ${note.id}`
		}).toMatchObject({ result: { kind: 'failure', error: { code } }, pins: [] });
	} finally {
		release.resolve();
		try {
			await archiving;
		} finally {
			await Promise.all([writer.close(), blocker.end()]);
		}
	}
});

it('preserves a project pin while concurrent built-in provisioning waits', async () => {
	const owner = actor('20004');
	const tx = createTransactionContext(context.db);
	await skillController(tx.database, tx.transactionRunner).list(owner);
	const note = (await new NoteRecords(context.db).findByBuiltInKey(owner, 'followthrough'))!;
	const target = await new ProjectRecords(context.db).insert(owner, { name: 'Launch' });
	const result = await competingSkillWrites(
		(skills) => skills.setPinned(owner, { noteId: note.id, projectId: target.id, pinned: true }),
		(skills) => skills.list(owner)
	);
	const catalog = await new SkillRecords(context.db).listAll(owner, target.id);
	expect({
		result: result.kind,
		pinned: catalog.find((skill) => skill.noteId === note.id)?.isPinned
	}).toEqual({ result: 'success', pinned: true });
});

it('allows note indexing to finish while a pin holds project locks and waits for that note', async () => {
	const { owner, note, target } = await setup('20005');
	const editor = connectPostgresTestDatabase(context.url);
	const writer = connectPostgresTestDatabase(context.url);
	const observer = postgres(context.url, { max: 1 });
	const edit = createTransactionContext(editor.db);
	const write = createTransactionContext(writer.db);
	const ready = Promise.withResolvers<void>();
	const index = Promise.withResolvers<void>();
	const editing = edit.transactionRunner
		.run(async () => {
			await new NoteRecords(edit.database).findForWrite(owner, note.id);
			ready.resolve();
			await index.promise;
			await new ContentIndex(
				new KnowledgeIndexRecords(edit.database),
				'contract-model',
				new TokenAwareChunker(),
				true
			).indexNote(owner, note);
		})
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => {
				ready.reject(error);
				return { kind: 'failure' as const, error };
			}
		);
	try {
		await ready.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const writing = skillController(write.database, write.transactionRunner)
			.setPinned(owner, { noteId: note.id, projectId: target.id, pinned: true })
			.then(
				() => ({ kind: 'success' as const }),
				(error: Error) => ({ kind: 'failure' as const, error })
			);
		await vi.waitFor(async () => {
			const rows = await observer<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (rows.length !== 1) throw new Error('The pin has not reached the locked note');
		});
		index.resolve();
		expect({ indexing: await editing, pin: await writing }).toEqual({
			indexing: { kind: 'success' },
			pin: { kind: 'success' }
		});
	} finally {
		index.resolve();
		await editing;
		await Promise.all([editor.close(), writer.close(), observer.end()]);
	}
});
