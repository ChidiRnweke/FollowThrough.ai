import type {
	WorkspaceSubmission,
	WorkspaceTransport
} from '$lib/client/services/workspace/transport';
import type { WriteOutcome, WriteRecovery } from '$lib/models/outbox';
import type { SyncCursor, SyncEtag } from '$lib/models/sync';
import type { WorkspaceBootstrap } from '$lib/models/workspace-bootstrap';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';

/** A server fake that also answers submitted writes against its own records. */
export interface WorkspaceWriteServer {
	send(input: WorkspaceSubmission): Promise<WriteOutcome<WorkspaceRecord>>;
}

/** The workspace's server: a controllable journal and typed handlers for submitted writes. */
export class InMemoryWorkspaceTransport implements WorkspaceTransport {
	constructor(
		readonly reads: InMemorySyncTransport<WorkspaceRecord> &
			Partial<WorkspaceWriteServer> = new InMemorySyncTransport<WorkspaceRecord>()
	) {}
	readonly sent: WorkspaceSubmission[] = [];
	readonly cancelled: WorkspaceSubmission[] = [];
	bootstrapped: WorkspaceBootstrap | null = null;
	sendWrite: (input: WorkspaceSubmission) => Promise<WriteOutcome<WorkspaceRecord>> = async (
		input
	) => {
		if (!this.reads.send) throw new Error('This scenario does not submit edits');
		return this.reads.send(input);
	};
	cancelWrite: (input: WorkspaceSubmission) => Promise<WriteRecovery<WorkspaceRecord>> =
		async () => {
			throw new Error('This scenario does not cancel edits');
		};
	private bootstrapGate: { started(): void; ready: Promise<void> } | null = null;
	/** Holds the next deployment-settings request until the test releases it. */
	pauseBootstrap(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.bootstrapGate = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	async bootstrap(): Promise<WorkspaceBootstrap> {
		const gate = this.bootstrapGate;
		this.bootstrapGate = null;
		if (gate) {
			gate.started();
			await gate.ready;
		}
		if (!this.bootstrapped) throw new Error('The deployment settings are unavailable');
		return this.bootstrapped;
	}
	pull(_accountId: string, since: SyncCursor) {
		return this.reads.pull(since);
	}
	read(_accountId: string, key: string, etag: SyncEtag | null) {
		return this.reads.read(key, etag);
	}
	async send(_accountId: string, input: WorkspaceSubmission) {
		this.sent.push(input);
		return this.sendWrite(input);
	}
	async cancel(_accountId: string, input: WorkspaceSubmission) {
		this.cancelled.push(input);
		return this.cancelWrite(input);
	}
}
