import { describe, expect, it } from 'vitest';
import type { AgentRunId } from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import {
	InMemoryNoteActionRunStorage,
	InMemoryNoteActionRunTransport
} from '$lib/testing/notes/fakes/in-memory-note-action-runs';
import { NoteActionRunsStore } from './note-action-runs.svelte';

const noteId = 'note-1' as NoteId;
const otherNoteId = 'note-2' as NoteId;
const runId = 'run-1' as AgentRunId;

const setup = () => {
	const transport = new InMemoryNoteActionRunTransport();
	const storage = new InMemoryNoteActionRunStorage();
	return {
		transport,
		storage,
		store: new NoteActionRunsStore(noteId, transport, storage)
	};
};

/** Starts a tracked run and returns the promise callers await on the live path. */
const start = (store: NoteActionRunsStore, action: 'convert' | 'promises' = 'convert') =>
	store.track({ runId, latestCursor: '000000' }, { action, context: { source: 'graph TD' } });

describe('NoteActionRunsStore', () => {
	it('reports a tracked run as in flight', () => {
		const { store } = setup();
		void start(store);

		expect(store.find('convert')?.runId).toBe(runId);
	});

	it('keeps a diagram-node action out of the bubble menu slot', () => {
		const { store } = setup();
		void start(store);

		expect(store.activeSelectionAction).toBeUndefined();
	});

	it('hands a result to the handler registered for its action', async () => {
		const { store, transport } = setup();
		const applied: unknown[] = [];
		store.on('convert', (result) => void applied.push(result));
		void start(store);
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: '<mxfile />' });
		await Promise.resolve();

		expect(applied).toEqual(['<mxfile />']);
	});

	it('gives the handler the context captured when the run started', async () => {
		const { store, transport } = setup();
		const contexts: unknown[] = [];
		store.on('convert', (_result, context) => void contexts.push(context));
		void start(store);
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: 'x' });
		await Promise.resolve();

		expect(contexts).toEqual([{ source: 'graph TD' }]);
	});

	it('persists a context patch so a refresh sees the moved insertion point', () => {
		const { store, storage } = setup();
		void start(store);
		store.updateContext(runId, { insertAt: 13 });

		const stored = (
			storage.load() as readonly { runId: AgentRunId; context: { insertAt?: number } }[]
		).find((run) => run.runId === runId);
		expect(stored?.context.insertAt).toBe(13);
	});

	it('resolves the caller with the completed result', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: 'done' });

		expect(await settled).toEqual({ status: 'completed', result: 'done' });
	});

	it('clears the run once it completes', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: 'done' });
		await settled;

		expect(store.running).toEqual([]);
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

		expect(store.find('convert')?.cancelling).toBe(true);
	});

	it('closes the stream once a run settles', async () => {
		const { store, transport } = setup();
		const settled = start(store);
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: 'done' });
		await settled;

		expect(transport.openStreams).toEqual([]);
	});

	it('replays a run left in flight into the same handler after a refresh', async () => {
		const { store, transport, storage } = setup();
		void start(store);
		transport.emit(runId, { type: 'run_started', runId, attempt: 1 });
		// The tab goes away mid-run; the server finishes the work regardless.
		store.detach();
		transport.emit(runId, { type: 'workflow_result', action: 'convert', result: 'recovered' });

		// The tab reloads: a new store, the same session storage, no promise left to resolve.
		const reloaded = new NoteActionRunsStore(noteId, transport, storage);
		const applied: unknown[] = [];
		reloaded.on('convert', (result) => void applied.push(result));
		reloaded.hydrate();
		await Promise.resolve();

		expect(applied).toEqual(['recovered']);
	});

	it('resumes from the stored cursor rather than the start of the log', () => {
		const { store, transport, storage } = setup();
		void start(store);
		const advanced = transport.emit(runId, { type: 'run_started', runId, attempt: 1 });

		new NoteActionRunsStore(noteId, transport, storage).hydrate();

		expect(transport.streams.at(-1)?.after).toBe(advanced.cursor);
	});

	it('leaves another note’s runs parked in storage', () => {
		const transport = new InMemoryNoteActionRunTransport();
		const storage = new InMemoryNoteActionRunStorage();
		void new NoteActionRunsStore(otherNoteId, transport, storage).track(
			{ runId: 'run-2' as AgentRunId, latestCursor: '000000' },
			{ action: 'promises' }
		);
		const store = new NoteActionRunsStore(noteId, transport, storage);
		store.hydrate();
		void start(store);

		expect(storage.load().map((run: { runId: AgentRunId }) => run.runId)).toEqual([
			'run-2',
			'run-1'
		]);
	});

	it('shows nothing for a note whose runs all belong elsewhere', () => {
		const transport = new InMemoryNoteActionRunTransport();
		const storage = new InMemoryNoteActionRunStorage();
		void new NoteActionRunsStore(otherNoteId, transport, storage).track(
			{ runId: 'run-2' as AgentRunId, latestCursor: '000000' },
			{ action: 'promises' }
		);
		const store = new NoteActionRunsStore(noteId, transport, storage);
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
