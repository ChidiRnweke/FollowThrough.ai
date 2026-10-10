import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { ActiveRunStore } from './active-runs';
const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;

describe('process active run handles', () => {
	it('retains the handle observed by the running execution', () => {
		const store = new ActiveRunStore();
		const handle = new AbortController();
		store.register(runId, handle);
		expect(store.get(runId)).toBe(handle);
	});
	it('has no handle for a run executing in another process', () => {
		expect(new ActiveRunStore().get(runId)).toBeUndefined();
	});
	it('forgets a released execution', () => {
		const store = new ActiveRunStore();
		const handle = new AbortController();
		store.register(runId, handle);
		store.release(runId, handle);
		expect(store.get(runId)).toBeUndefined();
	});
	it('keeps a resumed execution when the previous attempt releases its slot', () => {
		const store = new ActiveRunStore();
		const previous = new AbortController();
		const current = new AbortController();
		store.register(runId, previous);
		store.register(runId, current);
		store.release(runId, previous);
		expect(store.get(runId)).toBe(current);
	});
});
