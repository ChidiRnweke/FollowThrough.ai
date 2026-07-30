import { describe, expect, test } from 'vitest';
import { traceOperation } from '$lib/server/services/telemetry';

describe('workflow-only telemetry', () => {
	test('executes background work without applying span result processing', async () => {
		const result = await traceOperation(
			'embedding.batch',
			{ onlyWithinWorkflow: true },
			async () => 'completed',
			() => {
				throw new Error('background work should not create a span');
			}
		);

		expect(result).toBe('completed');
	});
});
