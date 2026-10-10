import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import {
	InMemoryNoteActionRunStorage,
	InMemoryNoteActionRunTransport,
	InMemoryNoteActionRunWorkspace
} from '$lib/testing/notes/fakes/in-memory-note-action-runs';
import { NoteActionRuns } from './action-runs';
import { NoteActionRunStore } from '$lib/stores/notes/note-action-runs.svelte';
import { testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';

const noteId = testNoteId();
const otherNoteId = testNoteId(2);
const runId = '00000000-0000-4000-8000-000000000001' as AgentRunId;

const create = (
	noteId: ReturnType<typeof testNoteId>,
	transport: InMemoryNoteActionRunTransport,
	storage: InMemoryNoteActionRunStorage,
	workspace = new InMemoryNoteActionRunWorkspace()
) =>
	new NoteActionRuns(
		noteId,
		workspace.session,
		workspace,
		new NoteActionRunStore(),
		transport,
		storage
	);
const setup = () => {
	const transport = new InMemoryNoteActionRunTransport();
	const storage = new InMemoryNoteActionRunStorage();
	const workspace = new InMemoryNoteActionRunWorkspace();
	const store = create(noteId, transport, storage, workspace);
	store.on('revise', () => {});
	return { transport, storage, store, workspace };
};

/** Starts a tracked run and returns the promise callers await on the live path. */
const start = (store: NoteActionRuns, action: 'revise' | 'promises' = 'revise') =>
	store.track({ runId, latestCursor: '000000' }, { action, context: { source: 'graph TD' } });

describe('NoteActionRuns', () => {
	it('reports an unreadable saved action instead of leaving its waiter pending', async () => {
		const { store, transport } = setup();
		const outcome = start(store);
		await transport.streams[0].deliver({
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
	it('reports a tracked run as in flight', () => {
		const { store } = setup();
		void start(store);

		expect(store.find('revise')?.runId).toBe(runId);
	});

	it('keeps a diagram-node action out of the bubble menu slot', () => {
		const { store } = setup();
		void start(store);

		expect(store.activeSelectionAction).toBeUndefined();
	});

	it('hands a result to the handler registered for its action', async () => {
		const { store, transport } = setup();
		const delivered: { result: unknown; context: unknown }[] = [];
		store.on('revise', (result, context) => void delivered.push({ result, context }));
		const settled = start(store);
		transport.emit(runId, {
			type: 'workflow_result',
			action: 'revise',
			result: { source: '<mxfile />' }
		});
		await settled;

		expect({ delivered, running: store.running, streams: transport.openStreams }).toEqual({
			delivered: [
				{
					result: { action: 'revise', output: { source: '<mxfile />' } },
					context: { source: 'graph TD' }
				}
			],
			running: [],
			streams: []
		});
	});

	it('persists a context patch so a refresh sees the moved insertion point', () => {
		const { store, storage } = setup();
		void start(store);
		store.updateContext(runId, { insertAt: 13 });

		const stored = storage.load().find((run) => run.runId === runId);
		expect(stored?.context.insertAt).toBe(13);
	});

	it('resolves the caller with the completed result', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, {
			type: 'workflow_result',
			action: 'revise',
			result: { source: 'done' }
		});

		expect(await settled).toEqual({
			status: 'completed',
			result: { action: 'revise', output: { source: 'done' } }
		});
	});

	it('resolves the caller as cancelled when the run is stopped', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, { type: 'cancelled', runId, message: 'Generation stopped' });

		expect(await settled).toEqual({ status: 'cancelled' });
	});

	it('resolves the caller as failed with the reason', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, {
			type: 'failed',
			runId,
			code: 'WORKFLOW_FAILED',
			message: 'boom',
			retryable: true
		});

		expect(await settled).toEqual({ status: 'failed', message: 'boom' });
	});

	it('asks the server to stop the run when cancelled', async () => {
		const { store, transport } = setup();
		void start(store);
		await store.cancel(runId);

		expect(transport.cancelled).toEqual([runId]);
	});

	it('marks the run as cancelling while the server settles it', async () => {
		const { store } = setup();
		void start(store);
		await store.cancel(runId);

		expect(store.find('revise')?.cancelling).toBe(true);
	});

	it('replays a run left in flight into the same handler after a refresh', async () => {
		const { store, transport, storage } = setup();
		void start(store);
		transport.emit(runId, { type: 'run_started', runId, attempt: 1 });
		// The tab goes away mid-run; the server finishes the work regardless.
		store.detach();
		transport.emit(runId, {
			type: 'workflow_result',
			action: 'revise',
			result: { source: 'recovered' }
		});

		// The tab reloads: a new store, the same session storage, no promise left to resolve.
		const reloaded = create(noteId, transport, storage);
		const applied: unknown[] = [];
		reloaded.on('revise', (result) => void applied.push(result));
		reloaded.hydrate();
		await transport.flush();

		expect(applied).toEqual([{ action: 'revise', output: { source: 'recovered' } }]);
	});

	it('resumes from the stored cursor rather than the start of the log', () => {
		const { store, transport, storage } = setup();
		void start(store);
		const advanced = transport.emit(runId, { type: 'run_started', runId, attempt: 1 });

		create(noteId, transport, storage).hydrate();

		expect(transport.streams.at(-1)?.after).toBe(advanced.cursor);
	});

	it('leaves another note’s runs parked in storage', () => {
		const transport = new InMemoryNoteActionRunTransport();
		const storage = new InMemoryNoteActionRunStorage();
		void create(otherNoteId, transport, storage).track(
			{ runId: '00000000-0000-4000-8000-000000000002' as AgentRunId, latestCursor: '000000' },
			{ action: 'promises' }
		);
		const workspace = new InMemoryNoteActionRunWorkspace();
		const store = create(noteId, transport, storage, workspace);
		store.hydrate();
		void start(store);

		expect(storage.load().map((run: { runId: AgentRunId }) => run.runId)).toEqual([
			'00000000-0000-4000-8000-000000000002',
			'00000000-0000-4000-8000-000000000001'
		]);
	});

	it('shows nothing for a note whose runs all belong elsewhere', () => {
		const transport = new InMemoryNoteActionRunTransport();
		const storage = new InMemoryNoteActionRunStorage();
		void create(otherNoteId, transport, storage).track(
			{ runId: '00000000-0000-4000-8000-000000000002' as AgentRunId, latestCursor: '000000' },
			{ action: 'promises' }
		);
		const workspace = new InMemoryNoteActionRunWorkspace();
		const store = create(noteId, transport, storage, workspace);
		store.hydrate();

		expect(store.running).toEqual([]);
	});

	it('drops its streams without settling the runs on teardown', () => {
		const { store, transport } = setup();
		void start(store);
		store.detach();

		expect(transport.openStreams).toEqual([]);
	});
});

it('retains the recovery cursor when a result arrives after the account stopped', async () => {
	const { store, transport, storage, workspace } = setup();
	const delivered: unknown[] = [];
	store.on('revise', (result) => {
		delivered.push(result);
	});
	void start(store);
	const gate = workspace.pause();
	transport.emit(runId, { type: 'workflow_result', action: 'revise', result: { source: 'late' } });
	await gate.started;
	workspace.current = null;
	gate.release();
	await transport.flush();
	expect({ delivered, running: store.running, cursor: storage.load()[0].cursor }).toEqual({
		delivered: [],
		running: [],
		cursor: '000000'
	});
});
it('does not acknowledge a result whose editor closed while its handler was pending', async () => {
	const { store, transport, storage } = setup();
	const ready = Promise.withResolvers<void>();
	const started = Promise.withResolvers<void>();
	store.on('revise', async () => {
		started.resolve();
		await ready.promise;
	});
	void start(store);
	transport.emit(runId, { type: 'workflow_result', action: 'revise', result: { source: 'late' } });
	await started.promise;
	store.detach();
	ready.resolve();
	await transport.flush();
	expect({
		cursor: storage.load()[0].cursor,
		streams: transport.openStreams,
		running: store.running
	}).toEqual({ cursor: '000000', streams: [], running: [] });
});
it('retains the cursor for replay when applying the result fails', async () => {
	const { store, transport, storage } = setup();
	store.on('revise', async () => {
		throw new Error('Editor save failed');
	});
	void start(store);
	transport.emit(runId, { type: 'workflow_result', action: 'revise', result: { source: 'retry' } });
	const delivery = await transport.flush().then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ delivery, cursor: storage.load()[0].cursor, active: store.running.length }).toEqual({
		delivery: 'Editor save failed',
		cursor: '000000',
		active: 1
	});
});
it('restores the cancel control when the server rejects cancellation', async () => {
	const { store, transport } = setup();
	void start(store);
	transport.cancellationFailure = new Error('Cancellation failed');
	const failure = await store.cancel(runId).then(
		() => 'completed',
		(error: Error) => error.message
	);
	expect({ failure, cancelling: store.find('revise')?.cancelling }).toEqual({
		failure: 'Cancellation failed',
		cancelling: false
	});
});
it('closes a stream that replays cancellation while it opens', async () => {
	const { store, transport, storage } = setup();
	void start(store);
	store.detach();
	transport.emit(runId, { type: 'cancelled', runId, message: 'Stopped' });
	const reopened = create(noteId, transport, storage);
	reopened.hydrate();
	await transport.flush();
	expect({
		streams: transport.openStreams,
		saved: storage.load(),
		running: reopened.running
	}).toEqual({ streams: [], saved: [], running: [] });
});
