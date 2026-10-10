import type {
	StoredNoteActionRun,
	NoteActionContext,
	AgentRunId,
	NoteActionKind
} from '$lib/models/agent';
import type { NoteActionResult, NoteActionEventRecord } from '$lib/models/note-actions';
import type { SessionSynchronization } from '$lib/controllers/workspace/session';
import type { NoteId } from '$lib/models/notes';
import type { NoteActionSession } from './actions';
import type { NoteActionRunStore } from '$lib/stores/notes/note-action-runs.svelte';

export interface NoteActionRun extends StoredNoteActionRun {
	readonly cancelling: boolean;
}
export type NoteActionHandler = (
	result: NoteActionResult,
	context: NoteActionContext,
	runId: AgentRunId
) => void | Promise<void>;
export type NoteActionOutcome =
	| { readonly status: 'completed'; readonly result: NoteActionResult }
	| { readonly status: 'cancelled' }
	| { readonly status: 'failed'; readonly message: string };
export interface NoteActionEventStream {
	close(): void;
}
export interface NoteActionRunTransport {
	open(
		runId: AgentRunId,
		after: string,
		onEvent: (record: NoteActionEventRecord) => void | Promise<void>
	): NoteActionEventStream;
	cancel(runId: AgentRunId): Promise<void>;
}
export interface NoteActionRunStorage {
	load(): readonly StoredNoteActionRun[];
	save(runs: readonly StoredNoteActionRun[]): void;
}
export interface NoteActionRunWorkspace {
	readonly current: NoteActionSession | null;
	synchronize(): Promise<SessionSynchronization>;
}
export interface NoteActionRunsController {
	readonly running: readonly NoteActionRun[];
	readonly activeSelectionAction: NoteActionRun | undefined;
	find(action: NoteActionKind): NoteActionRun | undefined;
	on(action: NoteActionKind, handler: NoteActionHandler): void;
	track(
		receipt: { readonly runId: AgentRunId; readonly latestCursor: string },
		run: { readonly action: NoteActionKind; readonly context?: NoteActionContext }
	): Promise<NoteActionOutcome>;
	hydrate(): void;
	cancel(runId: AgentRunId): Promise<void>;
	detach(): void;
	updateContext(runId: AgentRunId, patch: NoteActionContext): void;
}

/** Coordinates durable recovery and delivery for one note editor and account session. */
export class NoteActionRuns implements NoteActionRunsController {
	constructor(
		private readonly noteId: NoteId,
		private readonly binding: NoteActionSession,
		private readonly workspace: NoteActionRunWorkspace,
		private readonly state: NoteActionRunStore,
		private readonly transport: NoteActionRunTransport,
		private readonly storage: NoteActionRunStorage
	) {}
	private get active(): boolean {
		return !this.state.detached && this.workspace.current === this.binding;
	}
	get running(): readonly NoteActionRun[] {
		return this.active ? this.state.running : [];
	}
	get activeSelectionAction(): NoteActionRun | undefined {
		return this.running.find((entry) => entry.action !== 'revise' && entry.action !== 'convert');
	}
	find(action: NoteActionKind): NoteActionRun | undefined {
		return this.running.find((entry) => entry.action === action);
	}
	on(action: NoteActionKind, handler: NoteActionHandler): void {
		this.requireActive();
		this.state.setHandler(action, handler);
	}
	track(
		receipt: { readonly runId: AgentRunId; readonly latestCursor: string },
		run: { readonly action: NoteActionKind; readonly context?: NoteActionContext }
	): Promise<NoteActionOutcome> {
		this.requireActive();
		const entry: NoteActionRun = {
			runId: receipt.runId,
			action: run.action,
			noteId: this.noteId,
			cursor: receipt.latestCursor,
			context: run.context ?? {},
			cancelling: false
		};
		this.state.replace([...this.state.running, entry]);
		this.persist();
		const settled = new Promise<NoteActionOutcome>((resolve) =>
			this.state.setWaiter(entry.runId, resolve)
		);
		this.attach(entry);
		return settled;
	}
	hydrate(): void {
		this.requireActive();
		this.state.replace(
			this.storage
				.load()
				.filter((run) => run.noteId === this.noteId)
				.map((run) => ({ ...run, cancelling: false }))
		);
		for (const entry of this.state.running) this.attach(entry);
	}
	async cancel(runId: AgentRunId): Promise<void> {
		this.requireActive();
		this.state.setCancelling(runId, true);
		try {
			await this.transport.cancel(runId);
		} catch (error) {
			if (this.active) this.state.setCancelling(runId, false);
			throw error;
		}
	}
	detach(): void {
		for (const stream of this.state.close()) stream.close();
	}
	updateContext(runId: AgentRunId, patch: NoteActionContext): void {
		this.requireActive();
		const entry = this.state.running.find((entry) => entry.runId === runId);
		if (!entry) return;
		this.state.setContext(runId, { ...entry.context, ...patch });
		this.persist();
	}
	private requireActive(): void {
		if (!this.active) throw new Error('The note action editor is no longer active');
	}
	private attach(entry: NoteActionRun): void {
		this.state.takeStream(entry.runId)?.close();
		const stream = this.transport.open(entry.runId, entry.cursor, (record) =>
			this.consume(entry.runId, record)
		);
		// A boundary may deliver a terminal event synchronously while opening.
		if (this.active && this.state.running.some((run) => run.runId === entry.runId))
			this.state.setStream(entry.runId, stream);
		else stream.close();
	}
	private async consume(runId: AgentRunId, record: NoteActionEventRecord): Promise<void> {
		if (!this.active || !this.state.running.some((entry) => entry.runId === runId)) return;
		if (
			record.kind === 'unreadable' ||
			record.event.type === 'workflow_result' ||
			record.event.type === 'resources_stale'
		) {
			await this.workspace.synchronize();
			if (!this.active) return;
		}
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
			const entry = this.state.running.find((candidate) => candidate.runId === runId);
			const handler = this.state.handler(event.result.action);
			if (!entry || !handler)
				throw new Error(`No handler is registered for ${event.result.action}`);
			await handler(event.result, entry.context, runId);
			if (!this.active) return;
			this.advance(runId, record.cursor);
			this.settle(runId, { status: 'completed', result: event.result });
			return;
		}
		this.advance(runId, record.cursor);
		if (event.type === 'cancelled') this.settle(runId, { status: 'cancelled' });
		if (event.type === 'failed') this.settle(runId, { status: 'failed', message: event.message });
	}
	private advance(runId: AgentRunId, cursor: string): void {
		this.state.setCursor(runId, cursor);
		this.persist();
	}
	private settle(runId: AgentRunId, outcome: NoteActionOutcome): void {
		this.state.takeStream(runId)?.close();
		this.state.replace(this.state.running.filter((entry) => entry.runId !== runId));
		this.persist();
		this.state.takeWaiter(runId)?.(outcome);
	}
	private persist(): void {
		const foreign = this.storage.load().filter((run) => run.noteId !== this.noteId);
		this.storage.save([
			...foreign,
			...this.state.running.map(({ cancelling: _cancelling, ...run }) => run)
		]);
	}
}

export interface NoteActionRunsFactory {
	create(noteId: NoteId, session: NoteActionSession): NoteActionRunsController;
}
export interface NoteActionTrackingController {
	open(noteId: NoteId): NoteActionRunsController;
}
export class NoteActionTracking implements NoteActionTrackingController {
	constructor(
		private readonly workspace: NoteActionRunWorkspace,
		private readonly editors: NoteActionRunsFactory
	) {}
	open(noteId: NoteId): NoteActionRunsController {
		const session = this.workspace.current;
		if (!session) throw new Error('The workspace is not ready to track note actions');
		return this.editors.create(noteId, session);
	}
}
