import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { abortActiveRun, registerActiveRun, releaseActiveRun } from './active-runs';

const runId = (value: number): AgentRunId =>
	`00000000-0000-4000-8000-${String(value).padStart(12, '0')}` as AgentRunId;

describe('active run registry', () => {
	it('aborts a run that was registered as executing', () => {
		const id = runId(1);
		registerActiveRun(id);

		expect(abortActiveRun(id)).toBe(true);
		releaseActiveRun(id);
	});

	it('reports nothing to abort for an unknown run', () => {
		expect(abortActiveRun(runId(2))).toBe(false);
	});

	it('forgets a run once it is released', () => {
		const id = runId(3);
		registerActiveRun(id);
		releaseActiveRun(id);

		expect(abortActiveRun(id)).toBe(false);
	});
});
