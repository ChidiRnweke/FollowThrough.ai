import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { SuggestionId } from '$lib/models/suggestions';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { context, now, seedNote, seedProvenance } from '../database-harness';
describe('Postgres suggestion repository invariants', () => {
	it('reads an older memory proposal with explicit scope after loading', async () => {
		const { owner, note, project } = await seedNote('9811');
		const provenance = await seedProvenance(owner, '9811');
		const repository = new SuggestionRecords(owner, context.db);
		const proposal = await repository.insert({
			id: crypto.randomUUID() as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'memory',
			status: 'proposed',
			payload: {
				scope: 'project',
				projectId: project.id,
				operation: 'add',
				content: 'Existing project fact'
			},
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		await context.db.execute(
			sql`update suggestions set payload = payload - 'scope' where id = ${proposal.id}`
		);
		const restored = await repository.findById(proposal.id);
		expect(restored?.payload).toEqual(proposal.payload);
	});
	it('reports an older memory update without a target as unreadable', async () => {
		const { owner, note, project } = await seedNote('9812');
		const provenance = await seedProvenance(owner, '9812');
		const repository = new SuggestionRecords(owner, context.db);
		const proposal = await repository.insert({
			id: crypto.randomUUID() as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'memory',
			status: 'proposed',
			payload: {
				scope: 'project',
				projectId: project.id,
				operation: 'add',
				content: 'Existing project fact'
			},
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		await context.db.execute(
			sql`update suggestions set payload = jsonb_set(payload - 'scope', '{operation}', '"update"') where id = ${proposal.id}`
		);
		expect((await repository.list({ noteId: note.id }))[0]).toMatchObject({
			status: 'unreadable',
			id: proposal.id
		});
	});
	it('allows only one transition from the same expected status', async () => {
		const { owner, note, project } = await seedNote('27');
		const provenance = await seedProvenance(owner, '27');
		const repository = new SuggestionRecords(owner, context.db);
		const suggestion = await repository.insert({
			id: '70000000-0000-4000-8000-000000000027' as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'todo',
			status: 'proposed',
			payload: { projectId: project.id, title: 'Atomic task', responsibility: 'mine' },
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		const results = await Promise.all([
			repository.transition(suggestion.id, 'proposed', {
				status: 'rejected',
				decidedAt: now
			}),
			repository.transition(suggestion.id, 'proposed', {
				status: 'rejected',
				decidedAt: now
			})
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
	it('hides suggestions attached to an archived project', async () => {
		const { owner, note, project } = await seedNote('44');
		const provenance = await seedProvenance(owner, '44');
		const repository = new SuggestionRecords(owner, context.db);
		await repository.insert({
			id: '70000000-0000-4000-8000-000000000044' as SuggestionId,
			userId: owner.userId,
			noteId: note.id,
			kind: 'todo',
			status: 'proposed',
			payload: { projectId: project.id, title: 'Archived task', responsibility: 'mine' },
			provenanceId: provenance.id,
			isAutoAccepted: false,
			createdAt: now,
			updatedAt: now
		});
		await new ProjectRecords(owner, context.db).archive(project.id);
		expect(await repository.list({ status: 'proposed' })).toEqual([]);
	});
});
