import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { AgentEventStore } from './events';

describe('AgentEventStore', () => {
	it('delivers only to subscribers for the named run until they unsubscribe', () => {
		const events = new AgentEventStore();
		const firstRun = '00000000-0000-4000-8000-000000000001' as AgentRunId;
		const secondRun = '00000000-0000-4000-8000-000000000002' as AgentRunId;
		const delivered: string[] = [];
		const unsubscribe = events.subscribe(firstRun, () => delivered.push(firstRun));

		events.notify(secondRun);
		events.notify(firstRun);
		unsubscribe();
		events.notify(firstRun);

		expect(delivered).toEqual([firstRun]);
	});
});
