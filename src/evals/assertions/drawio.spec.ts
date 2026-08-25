import { describe, expect, it } from 'vitest';
import { VALID_DRAWIO_XML } from '$lib/testing/diagrams/fixtures/drawio';
import { inspectDrawio } from './drawio';

describe('draw.io eval inspection', () => {
	it('reads labels and directed edges from production-valid XML', () => {
		expect(inspectDrawio(VALID_DRAWIO_XML)).toEqual({
			kind: 'valid',
			labels: ['API & worker'],
			edges: [{ source: 'API & worker', target: 'API & worker', label: '' }]
		});
	});

	it('reports malformed XML as an explicit failure', () => {
		expect(inspectDrawio('<mxfile>')).toMatchObject({ kind: 'failure' });
	});
});
