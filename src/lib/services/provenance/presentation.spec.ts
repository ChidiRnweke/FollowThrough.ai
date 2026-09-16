import { expect, it } from 'vitest';
import { provenanceOrigin } from './presentation';
import {
	testActor,
	testAnchorId,
	testProvenanceId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';

const identity = { id: testProvenanceId(), userId: testActor().userId, createdAt: testNow };

it('names the pipeline that produced the record', () => {
	expect(
		provenanceOrigin({
			...identity,
			producerKind: 'pipeline',
			producerName: 'Reference',
			pipeline: 'reference',
			sourceAnchorId: testAnchorId(),
			metadata: {}
		})
	).toEqual({ pipeline: 'reference', createdAt: testNow });
});

it('names the producer when the record has no pipeline', () => {
	expect(
		provenanceOrigin({
			...identity,
			producerKind: 'user',
			producerName: 'document-export',
			metadata: {}
		})
	).toEqual({ producerName: 'document-export', createdAt: testNow });
});
