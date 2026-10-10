import { expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
import { InMemoryNoteActionRunStorage } from '$lib/testing/notes/fakes/in-memory-note-action-runs';

const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;
const otherRunId = '00000000-0000-4000-8000-000000000002' as AgentRunId;

it('waits for queued workspace writes before applying an action result', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.edit('Pending offline edit');
	await fixture.controller.save({ auto: true });
	const sending = fixture.transport.pauseNextSend();
	fixture.account.executionState.setOnline(true);
	const outcome = fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'graph TD; A-->B' }
	});
	await sending.started;
	const before = {
		revisions: [...fixture.actionEditor.revisions],
		cursor: fixture.actionStorage.load()[0].cursor
	};
	sending.release();
	await outcome;
	const saved = fixture.transport.records.get(fixture.key);
	expect({
		before,
		revisions: fixture.actionEditor.revisions,
		saved: saved?.value.type === 'notes' ? saved.value.value.plainText : undefined,
		pending: fixture.actionStorage.load()
	}).toEqual({
		before: { revisions: [], cursor: '000000' },
		revisions: [{ previous: 'graph TD', source: 'graph TD; A-->B' }],
		saved: 'Pending offline edit',
		pending: []
	});
});
it('retains the recovery cursor and avoids editor application when synchronization fails', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.account.executionState.setOnline(true);
	fixture.transport.pullFailure = 'Workspace transport unavailable';
	void fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'retry' }
	});
	const failure = await fixture.actionTransport.flush().then(
		() => undefined,
		(error: Error) => error.message
	);
	expect({
		failure,
		revisions: fixture.actionEditor.revisions,
		cursor: fixture.actionStorage.load()[0]?.cursor,
		active: fixture.controller.runningActions.length
	}).toEqual({ failure: expect.any(String), revisions: [], cursor: '000000', active: 1 });
});
it.each(['account', 'generation', 'pane'] as const)(
	'retains the cursor when the %s changes during synchronization',
	async (change) => {
		const fixture = await noteWorkspaceFixture();
		fixture.account.executionState.setOnline(true);
		const syncing = fixture.transport.pause('changes');
		void fixture.controller.trackAction(
			{ runId, latestCursor: '000000' },
			{ action: 'revise', context: { source: 'graph TD' } }
		);
		fixture.actionTransport.emit(runId, {
			type: 'workflow_result',
			action: 'revise',
			result: { source: 'obsolete' }
		});
		await syncing.started;
		if (change === 'account') fixture.binding.accountId = 'replacement-account';
		if (change === 'generation') fixture.binding.generation++;
		if (change === 'pane') fixture.controller.close();
		syncing.release();
		await fixture.actionTransport.flush();
		expect({
			revisions: fixture.actionEditor.revisions,
			cursor: fixture.actionStorage.load()[0].cursor,
			running: fixture.controller.runningActions
		}).toEqual({ revisions: [], cursor: '000000', running: [] });
	}
);
it('preserves another pane’s new same-note run during context persistence and settlement', async () => {
	const actionStorage = new InMemoryNoteActionRunStorage();
	const first = await noteWorkspaceFixture({}, { actionStorage });
	const second = await noteWorkspaceFixture({}, { actionStorage });
	void first.controller.trackAction({ runId, latestCursor: '000000' }, { action: 'revise' });
	void second.controller.trackAction(
		{ runId: otherRunId, latestCursor: '000000' },
		{ action: 'convert' }
	);
	first.controller.updateActionContext(runId, { source: 'graph TD' });
	const concurrent = actionStorage
		.load()
		.map(({ runId }) => runId)
		.sort();
	first.actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	await first.actionTransport.flush();
	expect({ concurrent, remaining: actionStorage.load().map(({ runId }) => runId) }).toEqual({
		concurrent: [runId, otherRunId],
		remaining: [otherRunId]
	});
});
it('does not resurrect a settled same-note run when another pane saves context', async () => {
	const actionStorage = new InMemoryNoteActionRunStorage();
	const first = await noteWorkspaceFixture({}, { actionStorage });
	const second = await noteWorkspaceFixture({}, { actionStorage });
	void first.controller.trackAction({ runId, latestCursor: '000000' }, { action: 'revise' });
	void second.controller.trackAction(
		{ runId: otherRunId, latestCursor: '000000' },
		{ action: 'convert' }
	);
	first.actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	await first.actionTransport.flush();
	second.controller.updateActionContext(otherRunId, { source: 'graph TD' });
	expect(actionStorage.load().map(({ runId, context }) => ({ runId, context }))).toEqual([
		{ runId: otherRunId, context: { source: 'graph TD' } }
	]);
});

it('retains recovery when queued workspace writes fail before result delivery', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.edit('Pending offline edit');
	await fixture.controller.save({ auto: true });
	fixture.account.executionState.setOnline(true);
	fixture.transport.sendFailure = 'Workspace write unavailable';
	void fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'retry' }
	});
	const failure = await fixture.actionTransport.flush().then(
		() => undefined,
		(error: Error) => error.message
	);
	expect({
		failure,
		revisions: fixture.actionEditor.revisions,
		cursor: fixture.actionStorage.load()[0]?.cursor
	}).toEqual({ failure: expect.any(String), revisions: [], cursor: '000000' });
});
it('retains recovery when startup settings cannot refresh before result delivery', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.account.executionState.setOnline(true);
	fixture.binding.startupError = 'Bootstrap needs refresh';
	void fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'retry' }
	});
	const failure = await fixture.actionTransport.flush().then(
		() => undefined,
		(error: Error) => error.message
	);
	expect({
		failure,
		revisions: fixture.actionEditor.revisions,
		cursor: fixture.actionStorage.load()[0]?.cursor
	}).toEqual({ failure: expect.any(String), revisions: [], cursor: '000000' });
});
it('does not resurrect a hydrated run settled by another pane when saving unrelated context', async () => {
	const actionStorage = new InMemoryNoteActionRunStorage();
	const first = await noteWorkspaceFixture({}, { actionStorage });
	void first.controller.trackAction({ runId, latestCursor: '000000' }, { action: 'revise' });
	const second = await noteWorkspaceFixture({}, { actionStorage });
	second.controller.hydrateActions();
	void second.controller.trackAction(
		{ runId: otherRunId, latestCursor: '000000' },
		{ action: 'convert' }
	);
	first.actionTransport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	await first.actionTransport.flush();
	second.controller.updateActionContext(otherRunId, { source: 'graph TD' });
	expect(actionStorage.load().map(({ runId }) => runId)).toEqual([otherRunId]);
});

it('retains recovery without editing a document replaced during synchronization', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.account.executionState.setOnline(true);
	const syncing = fixture.transport.pause('changes');
	void fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'obsolete' }
	});
	await syncing.started;
	fixture.editorState.initialize();
	syncing.release();
	await fixture.actionTransport.flush();
	expect({
		revisions: fixture.actionEditor.revisions,
		cursor: fixture.actionStorage.load()[0].cursor,
		running: fixture.controller.runningActions.map(({ runId }) => runId)
	}).toEqual({ revisions: [], cursor: '000000', running: [runId] });
});

it('retains recovery without editing an editor disposed during synchronization', async () => {
	const fixture = await noteWorkspaceFixture();
	fixture.account.executionState.setOnline(true);
	const syncing = fixture.transport.pause('changes');
	void fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'revise', context: { source: 'graph TD' } }
	);
	fixture.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'revise',
		result: { source: 'obsolete' }
	});
	await syncing.started;
	fixture.editorState.release();
	syncing.release();
	await fixture.actionTransport.flush();
	expect({
		revisions: fixture.actionEditor.revisions,
		cursor: fixture.actionStorage.load()[0].cursor
	}).toEqual({ revisions: [], cursor: '000000' });
});
