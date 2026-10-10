import { expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import { syncEtag } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import type { DiagramSuggestion } from '$lib/models/suggestions';
import { noteWorkspaceFixture } from '$lib/testing/notes/fixtures/workspace';
import {
	testActor,
	testNoteId,
	testSuggestionId,
	testProvenanceId,
	testNow,
	testDiagramId
} from '$lib/testing/workspace/fixtures/domain-builders';

const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;
const suggestion = {
	id: testSuggestionId(),
	userId: testActor().userId,
	noteId: testNoteId(),
	kind: 'diagram',
	payload: { noteId: testNoteId(), kind: 'mermaid', source: 'graph TD; A-->B' },
	provenanceId: testProvenanceId(),
	isAutoAccepted: false,
	createdAt: testNow,
	updatedAt: testNow,
	status: 'proposed'
} satisfies DiagramSuggestion;
const suggestionKey = workspaceResourceKey({ type: 'suggestions', id: [suggestion.id] });
const seedSuggestion = (
	fixture: Awaited<ReturnType<typeof noteWorkspaceFixture>>,
	value: DiagramSuggestion = suggestion
) => {
	fixture.transport.records.set(suggestionKey, {
		etag: syncEtag(value.status === 'accepted' ? 2n : 1n),
		value: { type: 'suggestions', value }
	});
};
const setup = async () => {
	const fixture = await noteWorkspaceFixture();
	seedSuggestion(fixture);
	fixture.account.executionState.setOnline(true);
	const outcome = fixture.controller.trackAction(
		{ runId, latestCursor: '000000' },
		{ action: 'diagram', context: { insertAt: 13 } }
	);
	const deliver = () =>
		fixture.actionTransport.streams[0].deliver({
			kind: 'readable',
			runId,
			cursor: '000001',
			attempt: 1,
			createdAt: new Date(0),
			event: { type: 'workflow_result', result: { action: 'diagram', output: { suggestion } } }
		});
	return { ...fixture, outcome, deliver };
};
it('inserts a generated diagram at the live mapped point before accepting its suggestion', async () => {
	const fixture = await setup();
	fixture.actionEditor.insertionPoint = 17;
	await fixture.deliver();
	expect({
		insertions: fixture.actionEditor.insertions,
		accepted: fixture.actionReview.accepted,
		running: fixture.controller.runningActions
	}).toEqual({
		insertions: [{ at: 17, source: suggestion.payload.source }],
		accepted: [suggestion.id],
		running: []
	});
});
it('uses the persisted insertion point when restoring a diagram result', async () => {
	const fixture = await setup();
	await fixture.deliver();
	expect(fixture.actionEditor.insertions).toEqual([{ at: 13, source: suggestion.payload.source }]);
});
it('leaves a suggestion available when its insertion point was deleted', async () => {
	const fixture = await setup();
	fixture.actionEditor.insertionPoint = 'lost';
	await fixture.deliver();
	expect({
		insertions: fixture.actionEditor.insertions,
		accepted: fixture.actionReview.accepted,
		feedback: fixture.feedback.messages
	}).toEqual({
		insertions: [],
		accepted: [],
		feedback: [
			{
				kind: 'error',
				message:
					'The diagram is ready, but its place in the note was lost. Copy it from the suggestion tray.'
			}
		]
	});
});
it('retries acceptance without inserting the same diagram twice', async () => {
	const fixture = await setup();
	fixture.actionReview.failure = new Error('Acceptance transport failed');
	const firstFailure = await Promise.resolve(fixture.deliver()).then(
		() => undefined,
		(error: Error) => error.message
	);
	const retained = fixture.actionStorage.load()[0].cursor;
	fixture.actionReview.failure = null;
	await fixture.deliver();
	expect({
		firstFailure,
		retained,
		insertions: fixture.actionEditor.insertions,
		accepted: fixture.actionReview.accepted,
		saved: fixture.actionStorage.load()
	}).toEqual({
		firstFailure: 'Acceptance transport failed',
		retained: '000000',
		insertions: [{ at: 13, source: suggestion.payload.source }],
		accepted: [suggestion.id],
		saved: []
	});
});
it.each(['account', 'generation', 'pane'] as const)(
	'retains recovery when the %s changes while diagram acceptance is pending',
	async (change) => {
		const fixture = await setup();
		const gate = fixture.actionReview.pause();
		const delivering = fixture.deliver();
		await gate.started;
		if (change === 'account') fixture.binding.accountId = 'replacement-account';
		if (change === 'generation') fixture.binding.generation++;
		if (change === 'pane') fixture.controller.close();
		gate.release();
		await delivering;
		expect({
			cursor: fixture.actionStorage.load()[0].cursor,
			running: fixture.controller.runningActions,
			success: fixture.feedback.messages.filter(({ kind }) => kind === 'success')
		}).toEqual({ cursor: '000000', running: [], success: [] });
	}
);

it('restores a durably inserted diagram after refresh without inserting it again', async () => {
	const first = await setup();
	first.actionReview.failure = new Error('Acceptance transport failed');
	await Promise.resolve(first.deliver()).then(
		() => undefined,
		(): { kind: 'failure' } => ({ kind: 'failure' })
	);
	const savedNote = first.controller.note;
	const marker = first.actionStorage.load()[0].delivery;
	first.controller.close();
	first.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'diagram',
		result: { suggestion }
	});
	const next = await noteWorkspaceFixture(savedNote, {
		actionTransport: first.actionTransport,
		actionStorage: first.actionStorage
	});
	seedSuggestion(next);
	next.account.executionState.setOnline(true);
	next.controller.hydrateActions();
	await next.actionTransport.flush();
	expect({
		marker,
		inserted: next.actionEditor.insertions,
		diagramNodes: next.controller.note.document.content?.filter(({ type }) => type === 'mermaid')
			.length,
		accepted: next.actionReview.accepted,
		saved: next.actionStorage.load()
	}).toEqual({
		marker: 'inserted',
		inserted: [],
		diagramNodes: 1,
		accepted: [suggestion.id],
		saved: []
	});
});
it('does not persist an insertion marker or accept a suggestion when saving its document fails', async () => {
	const fixture = await setup();
	fixture.outbox.appendFailures.set(fixture.key, 'Device storage is full');
	const failure = await Promise.resolve(fixture.deliver()).then(
		() => undefined,
		(error: Error) => error.message
	);
	expect({
		failure,
		delivery: fixture.actionStorage.load()[0].delivery,
		accepted: fixture.actionReview.accepted,
		cursor: fixture.actionStorage.load()[0].cursor
	}).toEqual({ failure: expect.any(String), delivery: undefined, accepted: [], cursor: '000000' });
});

it('retries a failed local diagram save without duplicating the in-memory insertion', async () => {
	const fixture = await setup();
	fixture.outbox.appendFailures.set(fixture.key, 'Device storage is full');
	await Promise.resolve(fixture.deliver()).then(
		() => undefined,
		(): { kind: 'failure' } => ({ kind: 'failure' })
	);
	fixture.outbox.appendFailures.clear();
	await fixture.deliver();
	expect({
		insertions: fixture.actionEditor.insertions,
		diagramNodes: fixture.controller.note.document.content?.filter(({ type }) => type === 'mermaid')
			.length,
		accepted: fixture.actionReview.accepted,
		saved: fixture.actionStorage.load()
	}).toEqual({
		insertions: [{ at: 13, source: suggestion.payload.source }],
		diagramNodes: 1,
		accepted: [suggestion.id],
		saved: []
	});
});

it.each(['account', 'generation', 'pane'] as const)(
	'does not publish a late acceptance failure after the %s is replaced',
	async (change) => {
		const fixture = await setup();
		const gate = fixture.actionReview.pause();
		const delivering = Promise.resolve(fixture.deliver()).then(
			() => undefined,
			(error: Error) => error.message
		);
		await gate.started;
		if (change === 'account') fixture.binding.accountId = 'replacement-account';
		if (change === 'generation') fixture.binding.generation++;
		if (change === 'pane') fixture.controller.close();
		fixture.actionReview.failure = new Error('Obsolete acceptance failed');
		gate.release();
		expect({
			failure: await delivering,
			cursor: fixture.actionStorage.load()[0].cursor,
			running: fixture.controller.runningActions,
			feedback: fixture.feedback.messages
		}).toEqual({
			failure: 'Obsolete acceptance failed',
			cursor: '000000',
			running: [],
			feedback: []
		});
	}
);

it('recovers an acceptance committed before its response was lost without accepting or inserting twice', async () => {
	const first = await setup();
	first.actionReview.failure = new Error('Acceptance response lost');
	await Promise.resolve(first.deliver()).then(
		() => undefined,
		(): { kind: 'failure' } => ({ kind: 'failure' })
	);
	const accepted = {
		...suggestion,
		status: 'accepted',
		decidedAt: testNow,
		appliedArtifactId: testDiagramId()
	} satisfies DiagramSuggestion;
	seedSuggestion(first, accepted);
	const savedNote = first.controller.note;
	first.controller.close();
	first.actionTransport.emit(runId, {
		type: 'workflow_result',
		action: 'diagram',
		result: { suggestion }
	});
	const next = await noteWorkspaceFixture(savedNote, {
		actionTransport: first.actionTransport,
		actionStorage: first.actionStorage
	});
	seedSuggestion(next, accepted);
	next.account.executionState.setOnline(true);
	next.controller.hydrateActions();
	await next.actionTransport.flush();
	expect({
		inserted: next.actionEditor.insertions,
		acceptedAgain: next.actionReview.accepted,
		saved: next.actionStorage.load(),
		running: next.controller.runningActions
	}).toEqual({ inserted: [], acceptedAgain: [], saved: [], running: [] });
});
