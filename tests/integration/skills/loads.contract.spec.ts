import { expect, it } from 'vitest';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { SkillRecords } from '$lib/server/repositories/skills/postgres/skills';
import {
	actor,
	context,
	now,
	replaceNoteFixture,
	seedNote,
	seedProvenance
} from '../database-harness';
import { skillController } from './edit-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const note = await replaceNoteFixture({ ...seeded.note, kind: 'skill' });
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
	const provenance = await seedProvenance(seeded.owner, suffix);
	const tx = createTransactionContext(context.db);
	return {
		...seeded,
		note,
		records,
		provenance,
		controller: skillController(tx.database, tx.transactionRunner)
	};
};

it('records an agent load with context in another owned project and leaves read-only views uncounted', async () => {
	const { owner, note, provenance, controller, records } = await setup('20301');
	const other = await seedNote('20302', owner);
	const result = await controller.loadForAgent(owner, {
		noteId: note.id,
		provenanceId: provenance.id,
		contextNoteId: other.note.id
	});
	await controller.get(owner, { noteId: note.id });
	expect({
		stored: (await records.listUsages(owner, note.id)).map(
			({ skillNoteId, contextNoteId, provenanceId }) => ({
				skillNoteId,
				contextNoteId,
				provenanceId
			})
		),
		context: result.usages.map((view) => view.contextNote)
	}).toEqual({
		stored: [{ skillNoteId: note.id, contextNoteId: other.note.id, provenanceId: provenance.id }],
		context: [{ id: other.note.id, title: other.note.title }]
	});
});

it('records a context-free agent load with its provenance', async () => {
	const { owner, note, provenance, controller } = await setup('20303');
	const result = await controller.loadForAgent(owner, {
		noteId: note.id,
		provenanceId: provenance.id
	});
	expect(
		result.usages.map(({ usage, contextNote }) => ({
			context: usage.contextNoteId,
			provenance: usage.provenanceId,
			contextNote
		}))
	).toEqual([{ context: undefined, provenance: provenance.id, contextNote: undefined }]);
});

it.each([
	{ resource: 'provenance', suffix: '20304', foreign: '20305' },
	{ resource: 'context', suffix: '20306', foreign: '20307' }
])(
	'rejects another actor’s $resource without recording usage',
	async ({ resource, suffix, foreign }) => {
		const { owner, note, provenance, controller, records } = await setup(suffix);
		const other = await seedNote(foreign, actor(foreign));
		const foreignProvenance = await seedProvenance(other.owner, foreign);
		const result = await controller
			.loadForAgent(owner, {
				noteId: note.id,
				provenanceId: resource === 'provenance' ? foreignProvenance.id : provenance.id,
				contextNoteId: resource === 'context' ? other.note.id : undefined
			})
			.then(
				() => ({ kind: 'success' as const }),
				(error: Error) => ({ kind: 'failure' as const, error })
			);
		expect({ result, usages: await records.listUsages(owner, note.id) }).toMatchObject({
			result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
			usages: []
		});
	}
);

it('hides an archived skill from discovery and refuses to count it as loaded', async () => {
	const { owner, note, provenance, controller, records } = await setup('20308');
	await replaceNoteFixture({ ...note, archivedAt: now });
	const result = await controller
		.loadForAgent(owner, { noteId: note.id, provenanceId: provenance.id })
		.then(
			() => ({ kind: 'success' as const }),
			(error: Error) => ({ kind: 'failure' as const, error })
		);
	expect({
		result,
		catalog: await records.listAll(owner),
		usages: await records.listUsages(owner, note.id)
	}).toMatchObject({
		result: { kind: 'failure', error: { code: 'NOT_FOUND' } },
		catalog: [],
		usages: []
	});
});
