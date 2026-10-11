import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { describe, expect, it } from 'vitest';
import { NoteProvenance } from './provenance';
import { InMemoryProvenanceRepository } from '$lib/testing/provenance/fakes/in-memory-provenance-repository';
import { InMemoryAnchorRepository } from '$lib/testing/notes/fakes/in-memory-note-repositories';
import {
	anchorBuilder,
	testActor,
	testAnchorId
} from '$lib/testing/workspace/fixtures/domain-builders';

const setup = () => {
	const provenance = new InMemoryProvenanceRepository(testActor());
	const anchors = new InMemoryAnchorRepository(testActor());
	return {
		provenance,
		anchors,
		service: new NoteProvenance(testActor(), provenance, anchors, testClock)
	};
};

describe('Provenance management invariants', () => {
	it('preserves the relationship producer and its owned source anchor', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder()];
		const recorded = await service.record({
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			sourceAnchorId: testAnchorId(),
			metadata: {}
		});
		expect(recorded).toMatchObject({
			userId: testActor().userId,
			producerKind: 'pipeline',
			producerName: 'Relate',
			pipeline: 'relate',
			sourceAnchorId: testAnchorId()
		});
	});

	it('records provenance under the acting user', async () => {
		const { service } = setup();
		const recorded = await service.record({
			producerKind: 'agent',
			producerName: 'Agent memory',
			pipeline: 'memory',
			metadata: {}
		});
		expect(recorded.userId).toBe(testActor().userId);
	});

	it('rejects a source anchor not owned by the actor', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder()];
		anchors.ownerIds.set(testAnchorId(), testActor(2).userId);
		await expect(
			service.record({
				producerKind: 'pipeline',
				producerName: 'Relate',
				pipeline: 'relate',
				sourceAnchorId: testAnchorId(),
				metadata: {}
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
