import { describe, expect, it } from 'vitest';
import { NoteProvenance } from './provenance';
import { InMemoryProvenanceRepository } from '$lib/testing/fakes/in-memory-provenance-repository';
import { InMemoryAnchorRepository } from '$lib/testing/fakes/in-memory-note-repositories';
import { anchorBuilder, testActor, testAnchorId } from '$lib/testing/fixtures/domain-builders';

const setup = () => {
	const provenance = new InMemoryProvenanceRepository();
	const anchors = new InMemoryAnchorRepository();
	return { provenance, anchors, service: new NoteProvenance(provenance, anchors) };
};

describe('Provenance management invariants', () => {
	it('records provenance under the acting user', async () => {
		const { service } = setup();
		const recorded = await service.record(testActor(), {
			producerKind: 'agent',
			producerName: 'Agent',
			metadata: {}
		});
		expect(recorded.userId).toBe(testActor().userId);
	});

	it('rejects a source anchor not owned by the actor', async () => {
		const { service, anchors } = setup();
		anchors.anchors = [anchorBuilder()];
		anchors.ownerIds.set(testAnchorId(), testActor().userId);
		await expect(
			service.record(testActor(2), {
				producerKind: 'pipeline',
				producerName: 'Relate',
				sourceAnchorId: testAnchorId(),
				metadata: {}
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
});
