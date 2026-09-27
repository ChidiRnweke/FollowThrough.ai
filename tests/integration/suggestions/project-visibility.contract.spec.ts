import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import type { MemorySuggestion, SuggestionId } from '$lib/models/suggestions';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import type { ProjectId } from '$lib/models/projects';
import { seedUser, context, now, seedProvenance } from '../database-harness';

const setup = async (suffix: string) => {
	const owner = await seedUser(suffix);
	const project = await new ProjectRecords(context.db).insert(owner, {
		id: `abcdef00-0000-4000-8000-${suffix.padStart(12, '0')}` as ProjectId,
		name: `Memory proposals ${suffix}`
	});
	const provenance = await seedProvenance(owner, suffix);
	const repository = new SuggestionRecords(context.db);
	const proposal: MemorySuggestion = {
		id: crypto.randomUUID() as SuggestionId,
		userId: owner.userId,
		kind: 'memory',
		status: 'proposed',
		payload: {
			scope: 'project',
			projectId: project.id,
			operation: 'add',
			content: 'Project convention'
		},
		provenanceId: provenance.id,
		isAutoAccepted: false,
		createdAt: now,
		updatedAt: now
	};
	await repository.insert(owner, proposal);
	return { owner, project, repository, proposal };
};
it('hides a note-less memory proposal when its project is archived', async () => {
	const { owner, project, repository } = await setup('22701');
	await new ProjectRecords(context.db).archive(owner, project.id);
	expect(await repository.list(owner, { status: 'proposed' })).toEqual([]);
});
it('keeps active project and profile proposals in the inbox', async () => {
	const { owner, repository, proposal } = await setup('22702');
	const profile: MemorySuggestion = {
		...proposal,
		id: crypto.randomUUID() as SuggestionId,
		payload: { scope: 'user', operation: 'add', content: 'Profile preference' }
	};
	await repository.insert(owner, profile);
	expect(
		(await repository.list(owner, { status: 'proposed' }))
			.map((row) => (row.status === 'readable' ? row.suggestion.id : 'unreadable'))
			.sort()
	).toEqual([proposal.id, profile.id].sort());
});
it('retains a hidden proposal for its decision history', async () => {
	const { owner, project, repository, proposal } = await setup('22703');
	await new ProjectRecords(context.db).archive(owner, project.id);
	expect(await repository.findById(owner, proposal.id)).toEqual(proposal);
});
it('reports an invalid stored project key without making neighboring proposals unreadable', async () => {
	const { owner, repository, proposal } = await setup('22704');
	const invalidId = crypto.randomUUID() as SuggestionId;
	await repository.insert(owner, { ...proposal, id: invalidId });
	await context.db.execute(
		sql`update suggestions set payload = jsonb_set(payload,'{projectId}','"not-a-uuid"') where id = ${invalidId}`
	);
	const stored = await repository.list(owner, { status: 'proposed' });
	expect(
		stored
			.map((row) =>
				row.status === 'readable'
					? { id: row.suggestion.id, status: row.status }
					: { id: row.id, status: row.status }
			)
			.sort((a, b) => a.id.localeCompare(b.id))
	).toEqual(
		[
			{ id: proposal.id, status: 'readable' },
			{ id: invalidId, status: 'unreadable' }
		].sort((a, b) => a.id.localeCompare(b.id))
	);
});

it('matches a valid uppercase project key to its archived project', async () => {
	const { owner, project, repository, proposal } = await setup('22705');
	await context.db.execute(
		sql`update suggestions set payload = jsonb_set(payload,'{projectId}',to_jsonb(upper(payload->>'projectId'))) where id = ${proposal.id}`
	);
	await new ProjectRecords(context.db).archive(owner, project.id);
	expect(await repository.list(owner, { status: 'proposed' })).toEqual([]);
});
