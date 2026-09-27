import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { abortActiveRun, registerActiveRun, releaseActiveRun } from './active-runs';

const runId = (value: number): AgentRunId =>
	`00000000-0000-4000-8000-${String(value).padStart(12, '0')}` as AgentRunId;

describe('active run registry', () => {
	it('aborts a run that was registered as executing', () => {
		const id = runId(1);
		const controller = registerActiveRun(id);

		abortActiveRun(id);
		expect(controller.signal.aborted).toBe(true);
		releaseActiveRun(id, controller);
	});

	it('reports nothing to abort for an unknown run', () => {
		expect(abortActiveRun(runId(2))).toBe(false);
	});

	it('forgets a run once it is released', () => {
		const id = runId(3);
		const controller = registerActiveRun(id);
		releaseActiveRun(id, controller);

		expect(abortActiveRun(id)).toBe(false);
	});
});

it('keeps the current cancellation handle when an older attempt releases its slot', () => {
	const id = runId(4);
	const previous = registerActiveRun(id);
	const current = registerActiveRun(id);
	try {
		releaseActiveRun(id, previous);
		abortActiveRun(id);
		expect(current.signal.aborted).toBe(true);
	} finally {
		releaseActiveRun(id, current);
	}
});
