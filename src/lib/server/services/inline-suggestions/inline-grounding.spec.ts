import { describe, expect, it } from 'vitest';
import { InlineGroundingService } from './inline-grounding';
import { InMemoryInlineGrounding } from '$lib/testing/inline-suggestions/fakes/inline-grounding';
import { testNoteId, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const scope = {
	noteId: testNoteId(),
	projectId: testProjectId(),
	headingPath: ['Plan', 'Cutover']
};
const grounding = {
	projectPassages: [
		{ sourceTitle: 'Runbook', sourceType: 'note' as const, content: 'Ana owns the cutover.' }
	],
	userMemory: ['Writes in British English.']
};

/** A section whose grounding was kept against the corpus as the fake describes it now. */
const kept = async () => {
	const snapshots = new InMemoryInlineGrounding();
	const service = new InlineGroundingService(snapshots);
	await service.keep(scope, grounding, snapshots.markers);
	return { service, snapshots };
};

describe('InlineGroundingService', () => {
	it('rebuilds when the section has no stored grounding', async () => {
		const service = new InlineGroundingService(new InMemoryInlineGrounding());
		expect(await service.decide(scope, 'reuse')).toEqual({
			kind: 'rebuild',
			reason: 'missing',
			markers: { knowledge: 'knowledge-1', memory: 'memory-1' }
		});
	});

	it('reuses the stored grounding while the corpus is unchanged', async () => {
		const { service } = await kept();
		expect(await service.decide(scope, 'reuse')).toEqual({ kind: 'reuse', grounding });
	});

	it('rebuilds when the project knowledge changed since', async () => {
		const { service, snapshots } = await kept();
		snapshots.markers = { knowledge: 'knowledge-2', memory: 'memory-1' };
		expect(await service.decide(scope, 'reuse')).toMatchObject({
			kind: 'rebuild',
			reason: 'knowledge_changed'
		});
	});

	it('rebuilds when the user memory changed since', async () => {
		const { service, snapshots } = await kept();
		snapshots.markers = { knowledge: 'knowledge-1', memory: 'memory-2' };
		expect(await service.decide(scope, 'reuse')).toMatchObject({
			kind: 'rebuild',
			reason: 'memory_changed'
		});
	});

	it('rebuilds when the writer asks for it, even with fresh grounding', async () => {
		const { service } = await kept();
		expect(await service.decide(scope, 'rebuild')).toMatchObject({
			kind: 'rebuild',
			reason: 'requested'
		});
	});

	it('keeps the grounding of one section apart from its neighbours', async () => {
		const { service } = await kept();
		expect(
			await service.decide({ ...scope, headingPath: ['Plan', 'Rollback'] }, 'reuse')
		).toMatchObject({ kind: 'rebuild', reason: 'missing' });
	});
});
