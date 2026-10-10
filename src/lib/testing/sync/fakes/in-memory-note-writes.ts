import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import type { WriteOutcome, WriteReceipt, WriteRecovery } from '$lib/models/outbox';
import { syncEtag, type SyncEtag } from '$lib/models/sync';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { InMemorySyncTransport } from './in-memory-sync';

/** Version-guarded note writes against the same records exposed by the fake read transport. */
export class InMemoryNoteWrites
	extends InMemorySyncTransport<WorkspaceRecord>
	implements OutboxTransport<WorkspaceCommand, WorkspaceRecord>
{
	readonly sent: { operationId: string; baseEtag: SyncEtag | null; command: WorkspaceCommand }[] =
		[];
	private readonly accepted = new Map<string, WriteReceipt<WorkspaceRecord>>();
	private readonly cancelled = new Set<string>();
	sendFailure: string | null = null;
	loseNextResponse = false;
	private nextSend: { started(): void; ready: Promise<void> } | null = null;
	pauseNextSend(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>(),
			ready = Promise.withResolvers<void>();
		this.nextSend = { started: started.resolve, ready: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	readonly recovery = {
		observe: async (key: string) => {
			const snapshot = this.records.get(key);
			return snapshot ? { kind: 'found' as const, snapshot } : { kind: 'unavailable' as const };
		},
		cancel: async (input: {
			operationId: string;
			baseEtag: SyncEtag | null;
			command: WorkspaceCommand;
		}): Promise<WriteRecovery<WorkspaceRecord>> => {
			const receipt = this.accepted.get(input.operationId);
			if (receipt) return { kind: 'applied', receipt };
			this.cancelled.add(input.operationId);
			return { kind: 'cancelled' };
		}
	};
	async send(input: {
		operationId: string;
		baseEtag: SyncEtag | null;
		command: WorkspaceCommand;
	}): Promise<WriteOutcome<WorkspaceRecord>> {
		this.sent.push(structuredClone(input));
		const pause = this.nextSend;
		this.nextSend = null;
		if (pause) {
			pause.started();
			await pause.ready;
		}
		if (this.sendFailure) throw new Error(this.sendFailure);
		if (this.cancelled.has(input.operationId))
			return { kind: 'rejected', message: 'Cancelled before application' };
		const applied = this.accepted.get(input.operationId);
		if (applied) return { kind: 'applied', receipt: applied };

		const command = input.command;
		if (command.kind !== 'saveNote') throw new Error('This fake supports document saves');
		const key = workspaceResourceKey({ type: 'notes', id: [command.noteId] });
		const current = this.records.get(key);
		if (!current) return { kind: 'conflict', remote: { kind: 'unavailable' } };
		if (current.etag !== input.baseEtag)
			return { kind: 'conflict', remote: { kind: 'found', snapshot: current } };
		if (current.value.type !== 'notes') throw new Error('Invalid note fixture');
		const snapshot = {
			etag: syncEtag(BigInt(current.etag.slice(8)) + 1n),
			value: {
				type: 'notes' as const,
				value: {
					...current.value.value,
					document: command.document,
					plainText: command.plainText,
					title: command.title ?? current.value.value.title,
					isPinned: command.isPinned ?? current.value.value.isPinned,
					currentRevision: current.value.value.currentRevision + 1
				}
			}
		};
		this.records.set(key, snapshot);
		const receipt: WriteReceipt<WorkspaceRecord> = {
			operationId: input.operationId,
			resource: { kind: 'found', snapshot }
		};
		this.accepted.set(input.operationId, receipt);
		if (this.loseNextResponse) {
			this.loseNextResponse = false;
			throw new Error('The send outcome was lost');
		}
		return { kind: 'applied', receipt };
	}
}
