import { expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import type { NoteWorkspaceController } from './workspace';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
import {
	InMemoryNoteActionRunStorage,
	InMemoryNoteActionRunTransport
} from '$lib/testing/notes/fakes/in-memory-note-action-runs';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;
const otherRunId = '00000000-0000-4000-8000-000000000002' as AgentRunId;
const start = (controller: NoteWorkspaceController) =>
	controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
const setup = async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.account.executionState.setOnline(true);
	return fixture;
};
it('reports unreadable saved action activity and settles its waiter', async () => {
	const { controller, actionTransport } = await setup();
	const outcome = start(controller);
	await actionTransport.streams[0].deliver({
		kind: 'unreadable',
		runId,
		cursor: '1',
		attempt: 1,
		createdAt: new Date(0),
		reason: 'Unknown event'
	});
	expect(await outcome).toEqual({
		status: 'failed',
		message:
			'Saved note action activity could not be restored. Reload the note to check its saved result.'
	});
});
it('reports a tracked diagram revision outside the selection action slot', async () => {
	const { controller } = await setup();
	void start(controller);
	expect({
		run: controller.findAction('revise')?.runId,
		selection: controller.activeSelectionAction
	}).toEqual({ run: runId, selection: undefined });
});
it('applies a revision result through the mounted editor and closes the completed stream', async () => {
	const { controller, actionTransport, actionEditor, actionStorage } = await setup();
	const outcome = start(controller);
	actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'graph TD; A-->B' }
	});
	const result = await outcome;
	expect({
		result,
		revisions: actionEditor.revisions,
		running: controller.runningActions,
		streams: actionTransport.openStreams,
		saved: actionStorage.load()
	}).toEqual({
		result: {
			status: 'completed',
			result: { action: 'revise', output: { source: 'graph TD; A-->B' } }
		},
		revisions: [{ previous: 'graph TD', source: 'graph TD; A-->B' }],
		running: [],
		streams: [],
		saved: []
	});
});
it('persists a moved insertion point for refresh recovery', async () => {
	const { controller, actionStorage } = await setup();
	void start(controller);
	controller.updateActionContext(runId, { insertAt: 13 });
	expect(actionStorage.load()[0].context).toEqual({ source: 'graph TD', insertAt: 13 });
});
it('resolves cancellation from its terminal event', async () => {
	const { controller, actionTransport, actionStorage } = await setup();
	const outcome = start(controller);
	actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Generation stopped' });
	expect({ outcome: await outcome, stored: actionStorage.load() }).toEqual({
		outcome: { status: 'cancelled' },
		stored: []
	});
});
it('resolves a failed run with its explicit reason', async () => {
	const { controller, actionTransport } = await setup();
	const outcome = start(controller);
	actionTransport.emit(runId, {
		type: 'failed',
		runId,
		code: 'WORKFLOW_FAILED',
		message: 'boom',
		retryable: true
	});
	expect(await outcome).toEqual({ status: 'failed', message: 'boom' });
});
it('requests cancellation and retains its pending state until the terminal event', async () => {
	const { controller, actionTransport } = await setup();
	void start(controller);
	await controller.cancelAction(runId);
	expect({
		cancelled: actionTransport.cancelled,
		cancelling: controller.findAction('revise')?.cancelling
	}).toEqual({ cancelled: [runId], cancelling: true });
});
it('restores cancellation controls when transport rejects cancellation', async () => {
	const { controller, actionTransport } = await setup();
	void start(controller);
	actionTransport.cancellationFailure = new Error('Cancellation failed');
	const failure = await controller.cancelAction(runId).then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ failure, cancelling: controller.findAction('revise')?.cancelling }).toEqual({
		failure: 'Cancellation failed',
		cancelling: false
	});
});
it('replays a saved result into the replacement mounted editor after refresh', async () => {
	const first = await setup();
	void start(first.controller);
	first.actionTransport.emit(runId, { type: 'run_started', runId, attempt: 1 });
	first.controller.close();
	first.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'recovered' }
	});
	const next = await noteWorkspaceFixture(
		{},
		{ actionTransport: first.actionTransport, actionStorage: first.actionStorage }
	);
	next.account.executionState.setOnline(true);
	next.controller.hydrateActions();
	await first.actionTransport.flush();
	expect({ revisions: next.actionEditor.revisions, saved: first.actionStorage.load() }).toEqual({
		revisions: [{ previous: 'graph TD', source: 'recovered' }],
		saved: []
	});
});
it('resumes from its stored cursor', async () => {
	const first = await setup();
	void start(first.controller);
	const advanced = first.actionTransport.emit(runId, { type: 'run_started', runId, attempt: 1 });
	await first.actionTransport.flush();
	first.controller.close();
	const next = await noteWorkspaceFixture(
		{},
		{ actionTransport: first.actionTransport, actionStorage: first.actionStorage }
	);
	next.controller.hydrateActions();
	expect(first.actionTransport.streams.at(-1)?.after).toBe(advanced.cursor);
});
it('preserves another note’s parked runs', async () => {
	const actionStorage = new InMemoryNoteActionRunStorage();
	const actionTransport = new InMemoryNoteActionRunTransport();
	const other = await noteWorkspaceFixture(
		{ id: testNoteId(2) },
		{ actionStorage, actionTransport }
	);
	void other.controller.trackAction(
		{ runId: otherRunId, latestCursor: '000000' },
		{ action: 'promises' }
	);
	const current = await noteWorkspaceFixture({}, { actionStorage, actionTransport });
	current.controller.hydrateActions();
	void start(current.controller);
	expect(actionStorage.load().map(({ runId }) => runId)).toEqual([otherRunId, runId]);
});
it('shows no running actions when storage contains only another note', async () => {
	const actionStorage = new InMemoryNoteActionRunStorage();
	const other = await noteWorkspaceFixture({ id: testNoteId(2) }, { actionStorage });
	void other.controller.trackAction(
		{ runId: otherRunId, latestCursor: '000000' },
		{ action: 'promises' }
	);
	const current = await noteWorkspaceFixture({}, { actionStorage });
	current.controller.hydrateActions();
	expect(current.controller.runningActions).toEqual([]);
});
it('closes streams without deleting recovery records when the workspace closes', async () => {
	const { controller, actionTransport, actionStorage } = await setup();
	void start(controller);
	controller.close();
	expect({
		streams: actionTransport.openStreams,
		saved: actionStorage.load().map(({ runId }) => runId)
	}).toEqual({ streams: [], saved: [runId] });
});
it('retains the cursor when editor application throws', async () => {
	const { controller, actionEditor, actionTransport, actionStorage } = await setup();
	actionEditor.revisionFailure = new Error('Editor save failed');
	void start(controller);
	actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'retry' }
	});
	const failure = await actionTransport.flush().then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({
		failure,
		cursor: actionStorage.load()[0].cursor,
		active: controller.runningActions.length
	}).toEqual({ failure: 'Editor save failed', cursor: '000000', active: 1 });
});
it('closes a stream that replays cancellation while opening', async () => {
	const first = await setup();
	void start(first.controller);
	first.controller.close();
	first.actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	const next = await noteWorkspaceFixture(
		{},
		{ actionTransport: first.actionTransport, actionStorage: first.actionStorage }
	);
	next.controller.hydrateActions();
	await first.actionTransport.flush();
	expect({
		streams: first.actionTransport.openStreams,
		saved: first.actionStorage.load(),
		running: next.controller.runningActions
	}).toEqual({ streams: [], saved: [], running: [] });
});

it('reuses a tracked receipt without abandoning the original waiter', async () => {
	const { controller, actionTransport } = await setup();
	const first = start(controller);
	const retried = start(controller);
	const running = controller.runningActions.map(({ runId }) => runId);
	const openStreams = actionTransport.openStreams.length;
	actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	expect({ running, openStreams, outcomes: await Promise.all([first, retried]) }).toEqual({
		running: [runId],
		openStreams: 1,
		outcomes: [{ status: 'cancelled' }, { status: 'cancelled' }]
	});
});

it('retries a receipt normally after its first tracking persistence fails', async () => {
	const { controller, actionTransport, actionStorage } = await setup();
	actionStorage.saveFailure = new Error('Session storage is full');
	const failure = await Promise.resolve()
		.then(() => start(controller))
		.then(
			() => undefined,
			(error: Error) => error.message
		);
	const failedState = {
		running: controller.runningActions,
		streams: actionTransport.openStreams.length
	};
	actionStorage.saveFailure = null;
	const outcome = start(controller);
	actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	expect({ failure, failedState, outcome: await outcome, saved: actionStorage.load() }).toEqual({
		failure: 'Session storage is full',
		failedState: { running: [], streams: 0 },
		outcome: { status: 'cancelled' },
		saved: []
	});
});
it('retains its waiter and old cursor when terminal cleanup persistence fails', async () => {
	const { controller, actionTransport, actionStorage } = await setup();
	const outcome = start(controller);
	actionStorage.saveFailure = new Error('Session storage is unavailable');
	const terminal = actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	const failure = await actionTransport.flush().then(
		() => undefined,
		(error: Error) => error.message
	);
	const retained = {
		savedCursor: actionStorage.load()[0].cursor,
		runningCursor: controller.findAction('revise')?.cursor,
		streams: actionTransport.openStreams.length
	};
	actionStorage.saveFailure = null;
	await actionTransport.streams[0].deliver({
		kind: 'readable',
		runId,
		cursor: terminal.cursor,
		attempt: terminal.attempt,
		createdAt: terminal.createdAt,
		event: { type: 'cancelled', runId, message: 'Stopped' }
	});
	expect({
		failure,
		retained,
		outcome: await outcome,
		saved: actionStorage.load(),
		streams: actionTransport.openStreams
	}).toEqual({
		failure: 'Session storage is unavailable',
		retained: { savedCursor: '000000', runningCursor: '000000', streams: 1 },
		outcome: { status: 'cancelled' },
		saved: [],
		streams: []
	});
});
