import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import type { Database } from '$lib/server/db';
import type { NoteId, NoteRevisionId } from '$lib/models/notes';
import type { TransactionRunner } from '$lib/server/repositories/workspace';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { NoteRecords } from '$lib/server/repositories/notes/postgres/notes';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import { ProvenanceRecords } from '$lib/server/repositories/provenance/postgres/provenance';
import { BuiltInSkills } from '$lib/server/services/skills/built-ins';
import { SkillLibrary } from '$lib/server/services/skills/library';
import { BUILT_INS, RETIRED_BUILT_INS } from '$lib/server/services/skills/built-in-definitions';
import { Skills, type SkillsDependencies } from '$lib/server/controllers/skills/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { replaceNoteFixture, actor, context, now } from '../database-harness';

const currentDefinitions = { active: BUILT_INS, retired: RETIRED_BUILT_INS };
const controller = (
	database: Database,
	transactionRunner: TransactionRunner,
	definitions: ConstructorParameters<typeof BuiltInSkills>[3]
) => {
	const projects = new ProjectRecords(database);
	const notes = new NoteRecords(database);
	const skills = new SkillRecords(database);
	return new Skills(
		capabilityDependencies<SkillsDependencies>({
			transactionRunner,
			builtInSkills: new BuiltInSkills(projects, notes, skills, definitions),
			skillFinder: new SkillLibrary(skills, notes, new ProvenanceRecords(database))
		})
	);
};

it('upgrades an untouched stored guide and records the new revision', async () => {
	const owner = actor('19503');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const retired = RETIRED_BUILT_INS.find((definition) => definition.key === 'followthrough')!;
	await controller(database, transactionRunner, { active: [retired], retired: [] }).list(owner);
	await controller(database, transactionRunner, currentDefinitions).list(owner);
	const records = new NoteRecords(context.db);
	const note = (await records.findByBuiltInKey(owner, 'followthrough'))!;
	expect({
		instructions: note.plainText,
		revision: note.currentRevision,
		history: (await records.listRevisions(owner, note.id)).map((revision) => revision.revision)
	}).toEqual({
		instructions: BUILT_INS.find((definition) => definition.key === 'followthrough')!.instructions,
		revision: 2,
		history: [1, 2]
	});
});

it('repairs legacy built-ins from an archived project while preserving authored content and identity', async () => {
	const owner = actor('19501');
	const { database, transactionRunner } = createTransactionContext(context.db);
	const skills = controller(database, transactionRunner, currentDefinitions);
	const initial = await skills.list(owner);
	const notes = new NoteRecords(context.db);
	const projects = new ProjectRecords(context.db);
	// Before project roles, provisioning installed built-ins in the ordinary General project.
	const legacy = await projects.insert(owner, { name: 'General', role: 'workspace' });
	await context.client`update notes set project_id = ${legacy.id} where user_id = ${owner.userId} and built_in_key is not null`;
	const original = (await notes.findByBuiltInKey(owner, 'followthrough'))!;
	const folder = await notes.insert(owner, {
		...original,
		id: crypto.randomUUID() as NoteId,
		builtInKey: undefined,
		kind: 'folder',
		title: 'Old folder',
		document: { type: 'doc', content: [] },
		plainText: ''
	});
	const edited = await replaceNoteFixture({
		...original,
		parentId: folder.id,
		title: 'My working guide',
		document: {
			type: 'doc',
			content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep my instructions' }] }]
		},
		plainText: 'Keep my instructions',
		currentRevision: 2,
		publishedRevision: 2,
		publishedAt: now,
		isPinned: true
	});
	await notes.insertRevision(owner, {
		id: crypto.randomUUID() as NoteRevisionId,
		noteId: edited.id,
		revision: edited.currentRevision,
		title: edited.title,
		document: edited.document,
		plainText: edited.plainText,
		createdAt: now
	});
	await projects.archive(owner, original.projectId);
	const result = await skills.list(owner);
	const inbox = (await projects.findInbox(owner))!;
	const stored = await notes.findByBuiltInKey(owner, 'followthrough');
	expect({ ids: result.skills.map((skill) => skill.noteId).sort(), stored }).toMatchObject({
		ids: initial.skills.map((skill) => skill.noteId).sort(),
		stored: {
			id: edited.id,
			projectId: inbox.id,
			parentId: undefined,
			title: edited.title,
			document: edited.document,
			plainText: edited.plainText,
			currentRevision: 2,
			publishedRevision: 2,
			publishedAt: now,
			isPinned: true
		}
	});
});

it.each([
	{ change: 'document', suffix: '19502' },
	{ change: 'disabled state', suffix: '19504' }
])('preserves a concurrent $change while a stock upgrade waits', async ({ change, suffix }) => {
	const owner = actor(suffix);
	const seed = createTransactionContext(context.db);
	const retired = RETIRED_BUILT_INS.find((definition) => definition.key === 'followthrough')!;
	await controller(seed.database, seed.transactionRunner, { active: [retired], retired: [] }).list(
		owner
	);
	const notes = new NoteRecords(context.db);
	const original = (await notes.findByBuiltInKey(owner, 'followthrough'))!;
	const writer = connectPostgresTestDatabase(context.url);
	const blocker = postgres(context.url, { max: 2 });
	const { database, transactionRunner } = createTransactionContext(writer.db);
	const locked = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const editedDocument = {
		type: 'doc',
		content: [
			{ type: 'paragraph', content: [{ type: 'text', text: 'Concurrent user instructions' }] }
		]
	};
	const editing = blocker.begin(async (transaction) => {
		if (change === 'document')
			await transaction`update notes set plain_text = 'Concurrent user instructions', document = ${JSON.stringify(editedDocument)}::jsonb, current_revision = current_revision + 1 where id = ${original.id}`;
		else await transaction`update skills set is_enabled = false where note_id = ${original.id}`;
		locked.resolve();
		await release.promise;
	});
	try {
		await locked.promise;
		const [backend] = await writer.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const provisioning = controller(database, transactionRunner, currentDefinitions).list(owner);
		await vi.waitFor(async () => {
			const waiting = await blocker<
				{ pid: number }[]
			>`select pid from pg_stat_activity where pid = ${backend!.pid} and wait_event_type = 'Lock'`;
			if (waiting.length !== 1) throw new Error('Provisioning has not reached the locked record');
		});
		release.resolve();
		await editing;
		await provisioning;
		const saved = (await notes.findByBuiltInKey(owner, 'followthrough'))!;
		const metadata = await new SkillRecords(context.db).findByNoteId(owner, saved.id);
		const instructions =
			change === 'document'
				? 'Concurrent user instructions'
				: BUILT_INS.find((definition) => definition.key === 'followthrough')!.instructions;
		expect({
			id: saved.id,
			plainText: saved.plainText,
			document: saved.document,
			revision: saved.currentRevision,
			enabled: metadata?.isEnabled
		}).toEqual({
			id: original.id,
			plainText: instructions,
			document: {
				type: 'doc',
				content: [{ type: 'paragraph', content: [{ type: 'text', text: instructions }] }]
			},
			revision: original.currentRevision + 1,
			enabled: change === 'document'
		});
	} finally {
		release.resolve();
		await editing;
		await Promise.all([writer.close(), blocker.end()]);
	}
});
