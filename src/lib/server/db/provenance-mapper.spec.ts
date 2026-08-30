import { describe, expect, it } from 'vitest';
import { toProvenance } from './mappers';

const row = (producerName: string): Parameters<typeof toProvenance>[0] => ({
	id: '10000000-0000-4000-8000-000000000001',
	userId: '20000000-0000-4000-8000-000000000002',
	producerKind: 'pipeline',
	producerName,
	pipeline: 'reference',
	sourceAnchorId: '30000000-0000-4000-8000-000000000003',
	runId: null,
	model: null,
	metadata: {},
	createdAt: new Date('2026-08-30T10:30:00.000Z')
});

describe('provenance mapper', () => {
	it('maps a registered persisted producer', () => {
		expect(toProvenance(row('Reference')).producerName).toBe('Reference');
	});

	it('rejects an unknown persisted producer combination', () => {
		expect(() => toProvenance(row('Unregistered pipeline'))).toThrow();
	});
});
