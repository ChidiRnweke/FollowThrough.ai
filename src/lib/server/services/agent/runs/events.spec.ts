import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { AgentEvents } from './events';

describe('AgentEvents', () => {
	it('delivers only to subscribers for the named run until they unsubscribe', () => {
		const events = new AgentEvents();
		const firstRun = 'run-first' as AgentRunId;
		const secondRun = 'run-second' as AgentRunId;
		const delivered: string[] = [];
		const unsubscribe = events.subscribe(firstRun, () => delivered.push(firstRun));

		events.notify(secondRun);
		events.notify(firstRun);
		unsubscribe();
		events.notify(firstRun);

		expect(delivered).toEqual([firstRun]);
	});
});
