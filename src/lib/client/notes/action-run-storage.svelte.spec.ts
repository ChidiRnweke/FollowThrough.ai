import { afterEach, beforeEach, expect, it } from 'vitest';
import type { AgentRunId, StoredNoteActionRun } from '$lib/models/agent';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { SessionRunStorage } from './action-run-storage';

const clearScenario = () => {
	for (const suffix of ['', '.action-test-a', '.action-test-b'])
		sessionStorage.removeItem('followthrough.notes.active-actions' + suffix);
};
beforeEach(clearScenario);
afterEach(clearScenario);

const run: StoredNoteActionRun = {
	runId: 'run-a' as AgentRunId,
	action: 'promises',
	noteId: testNoteId(),
	cursor: '3',
	context: {}
};

it('does not restore another account’s pending note actions', () => {
	new SessionRunStorage(sessionStorage, 'action-test-a').save([run]);
	expect(new SessionRunStorage(sessionStorage, 'action-test-b').load()).toEqual([]);
});

it('restores the original account’s actions after another account clears its own actions', () => {
	new SessionRunStorage(sessionStorage, 'action-test-a').save([run]);
	new SessionRunStorage(sessionStorage, 'action-test-b').save([]);
	expect(new SessionRunStorage(sessionStorage, 'action-test-a').load()).toEqual([run]);
});

it('does not assign unscoped legacy actions to the next account', () => {
	sessionStorage.setItem('followthrough.notes.active-actions', JSON.stringify([run]));
	expect(new SessionRunStorage(sessionStorage, 'action-test-b').load()).toEqual([]);
});

it('reports unreadable saved actions for their account', () => {
	sessionStorage.setItem('followthrough.notes.active-actions.action-test-a', 'corrupt');
	expect(() => new SessionRunStorage(sessionStorage, 'action-test-a').load()).toThrow();
});
