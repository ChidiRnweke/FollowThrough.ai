import { RunEventSubscription } from '$lib/client/agent/runs/subscription';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';
import {
	type StoredNoteActionRun as StoredRun,
	type NoteActionContext,
	type StoredAgentRunEventRecord,
	type AgentRunId,
	type NoteActionKind
} from '$lib/models/agent';
import type { NoteId } from '$lib/models/notes';
import {
	SessionRunStorage,
	type NoteActionRunStorage as RunStorage
} from '$lib/client/notes/action-run-storage';
export type { NoteActionContext } from '$lib/models/agent';
import { cancelAgentRun } from '$lib/remote/agent/chat.remote';

export interface NoteActionRun extends StoredRun {
	readonly cancelling: boolean;
}

/** Applies a finished action. Called on live completion and on post-refresh replay alike. */
export type NoteActionHandler = (
	result: unknown,
	context: NoteActionContext,
	runId: AgentRunId
) => void | Promise<void>;

export interface NoteActionOutcome {
	readonly status: 'completed' | 'cancelled' | 'failed';
	readonly result?: unknown;
	readonly message?: string;
}

interface EventStream {
	close(): void;
}

interface NoteActionRunTransport {
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: StoredAgentRunEventRecord) => void | Promise<void>,
		onError: () => void
	): EventStream;
	cancel(runId: AgentRunId): Promise<void>;
}

class BrowserTransport implements NoteActionRunTransport {
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: StoredAgentRunEventRecord) => void | Promise<void>,
		onError: () => void
	): EventStream {
		return new RunEventSubscription({
			runId,
			after,
			onOpen: () => {},
			onError,
			onEvent: async (record) => {
				if (
					record.kind === 'unreadable' ||
					record.event.type === 'workflow_result' ||
					record.event.type === 'resources_stale'
				)
					await workspaceSession.synchronize();
				await onEvent(record);
			}
		});
	}

	async cancel(runId: AgentRunId): Promise<void> {
		await cancelAgentRun({ runId });
	}
}

/**
 * Tracks the note editor's AI actions while they run on the server.
 *
 * The actions are agent runs now, not awaited requests, which is what lets the
 * cancel cross stop one and a refresh pick one back up. This store owns both
 * halves: it keeps each run's id and event cursor in session storage, and it
 * turns the run's event stream back into the single result the editor wants.
 *
 * Completion is delivered through registered handlers rather than the promise
 * `start` returns, because after a refresh there is no promise left to resolve —
 * the same handler has to serve the live path and the replay.
 */
export class NoteActionRunsStore {
	private entries = $state<NoteActionRun[]>([]);
	/* eslint-disable svelte/prefer-svelte-reactivity -- plumbing, not state: no
	   surface reads these, so reactivity would track what nothing consumes. What
	   this store publishes is `entries` above. */
	private readonly streams = new Map<AgentRunId, EventStream>();
	private readonly handlers = new Map<NoteActionKind, NoteActionHandler>();
	private readonly waiters = new Map<AgentRunId, (outcome: NoteActionOutcome) => void>();
	/* eslint-enable svelte/prefer-svelte-reactivity */

	constructor(
		/** One store per note: a split pane must never show its sibling's work. */
		private readonly noteId: NoteId,
		private readonly transport: NoteActionRunTransport,
		private readonly storage: RunStorage
	) {}

	/** Every run currently in flight, for the progress rows to render. */
	get running(): readonly NoteActionRun[] {
		return this.entries;
	}

	/** The selection action occupying the bubble menu, if any. */
	get activeSelectionAction(): NoteActionRun | undefined {
		return this.entries.find((entry) => entry.action !== 'revise' && entry.action !== 'convert');
	}

	find(action: NoteActionKind): NoteActionRun | undefined {
		return this.entries.find((entry) => entry.action === action);
	}

	/** Registers what to do with an action's result, whenever and however it arrives. */
	on(action: NoteActionKind, handler: NoteActionHandler): void {
		this.handlers.set(action, handler);
	}

	/**
	 * Tracks a run the server has just accepted and resolves once it settles.
	 *
	 * The returned promise is a convenience for the caller that started the run;
	 * the registered handler is what actually applies the result, so the outcome is
	 * identical whether the caller is still there to await it or not.
	 */
	track(
		receipt: { readonly runId: AgentRunId; readonly latestCursor: string },
		run: { readonly action: NoteActionKind; readonly context?: NoteActionContext }
	): Promise<NoteActionOutcome> {
		const entry: NoteActionRun = {
			runId: receipt.runId,
			action: run.action,
			noteId: this.noteId,
			cursor: receipt.latestCursor,
			context: run.context ?? {},
			cancelling: false
		};
		this.entries = [...this.entries, entry];
		this.persist();
		const settled = new Promise<NoteActionOutcome>((resolve) => {
			this.waiters.set(entry.runId, resolve);
		});
		this.attach(entry);
		return settled;
	}

	/** Re-attaches every run this tab left in flight. Call once the handlers are registered. */
	hydrate(): void {
		this.entries = this.storage
			.load()
			.filter((run) => run.noteId === this.noteId)
			.map((run) => ({ ...run, cancelling: false }));
		for (const entry of this.entries) this.attach(entry);
	}

	/** Stops a run and its billing. The server settles it; the stream reports back. */
	async cancel(runId: AgentRunId): Promise<void> {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cancelling: true } : entry
		);
		try {
			await this.transport.cancel(runId);
		} catch (error) {
			this.entries = this.entries.map((entry) =>
				entry.runId === runId ? { ...entry, cancelling: false } : entry
			);
			throw error;
		}
	}

	/** Drops every stream without settling the runs, for component teardown. */
	detach(): void {
		for (const stream of this.streams.values()) stream.close();
		this.streams.clear();
	}

	/**
	 * Merges a patch into a run's context and persists it. The diagram handler
	 * uses this to keep the insertion point current as the author types, so a
	 * refresh mid-run still lands the node where the text is.
	 */
	updateContext(runId: AgentRunId, patch: NoteActionContext): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, context: { ...entry.context, ...patch } } : entry
		);
		this.persist();
	}

	private attach(entry: NoteActionRun): void {
		this.streams.get(entry.runId)?.close();
		const stream = this.transport.open(
			entry.runId,
			entry.cursor,
			(record) => this.consume(entry.runId, record),
			() => {
				// EventSource reconnects on its own; a closed stream on a settled run is
				// expected, and an unsettled one resumes from the persisted cursor.
			}
		);
		this.streams.set(entry.runId, stream);
	}

	private async consume(runId: AgentRunId, record: StoredAgentRunEventRecord): Promise<void> {
		if (record.kind === 'unreadable') {
			this.settle(runId, {
				status: 'failed',
				message:
					'Saved note action activity could not be restored. Reload the note to check its saved result.'
			});
			return;
		}
		const event = record.event;
		if (event.type === 'workflow_result') {
			const entry = this.entries.find((candidate) => candidate.runId === runId);
			const handler = this.handlers.get(event.action);
			if (!entry || !handler) throw new Error(`No handler is registered for ${event.action}`);
			await handler(event.result, entry.context, runId);
			this.advance(runId, record.cursor);
			this.settle(runId, { status: 'completed', result: event.result });
			return;
		}
		this.advance(runId, record.cursor);
		if (event.type === 'cancelled') this.settle(runId, { status: 'cancelled' });
		if (event.type === 'failed') this.settle(runId, { status: 'failed', message: event.message });
	}

	private advance(runId: AgentRunId, cursor: string): void {
		this.entries = this.entries.map((entry) =>
			entry.runId === runId ? { ...entry, cursor } : entry
		);
		this.persist();
	}

	private settle(runId: AgentRunId, outcome: NoteActionOutcome): void {
		this.streams.get(runId)?.close();
		this.streams.delete(runId);
		this.entries = this.entries.filter((entry) => entry.runId !== runId);
		this.persist();
		this.waiters.get(runId)?.(outcome);
		this.waiters.delete(runId);
	}

	private persist(): void {
		// Runs for other notes stay parked rather than being dropped: navigating back
		// to that note should still find its work in flight.
		const foreign = this.storage.load().filter((run) => run.noteId !== this.noteId);
		this.storage.save([
			...foreign,
			...this.entries.map(({ cancelling: _cancelling, ...run }) => run)
		]);
	}
}

// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a registry of stores, not rendered state; each store publishes its own.
const stores = new Map<string, NoteActionRunsStore>();

/** Bind each note store to the signed-in account that created it. */
export const noteActionRunsFor = (noteId: NoteId): NoteActionRunsStore => {
	const session = workspaceSession.current;
	if (!session) throw new Error('The workspace is not ready to track note actions');
	const accountId = session.bootstrap.accountId;
	const key = JSON.stringify([accountId, noteId]);
	const existing = stores.get(key);
	if (existing) return existing;
	const created = new NoteActionRunsStore(
		noteId,
		new BrowserTransport(),
		new SessionRunStorage(sessionStorage, accountId)
	);
	stores.set(key, created);
	return created;
};
