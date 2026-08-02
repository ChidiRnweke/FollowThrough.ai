import { describe, expect, it } from 'vitest';
import type { SuggestionId } from '$lib/models/suggestions';
import { ProjectRecords } from '$lib/server/repositories/projects/postgres/projects';
import { SuggestionRecords } from '$lib/server/repositories/suggestions/postgres/suggestions';
import { context, now, seedNote, seedProvenance } from '../database-harness';
describe('Postgres suggestion repository invariants', () => {
	it('allows only one transition from the same expected status', async () => {
		const { owner, note, project } = await seedNote('27');
		const provenance = await seedProvenance(owner, '27');
		const repository = new SuggestionRecords(context.db);
		const suggestion = await repository.insert(owner, {
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
			repository.transition(owner, suggestion.id, 'proposed', { status: 'rejected' }),
			repository.transition(owner, suggestion.id, 'proposed', { status: 'rejected' })
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});
	it('hides suggestions attached to an archived project', async () => {
		const { owner, note, project } = await seedNote('44');
		const provenance = await seedProvenance(owner, '44');
		const repository = new SuggestionRecords(context.db);
		await repository.insert(owner, {
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
		await new ProjectRecords(context.db).archive(owner, project.id);
		expect(await repository.list(owner, { status: 'proposed' })).toEqual([]);
	});
});
