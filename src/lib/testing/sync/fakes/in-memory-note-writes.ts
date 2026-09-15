import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { syncEtag, type SyncEtag } from '$lib/models/sync';
import type { WriteOutcome } from '$lib/models/outbox';
import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import { InMemorySyncTransport } from './in-memory-sync';

/** Version-guarded note writes against the same records exposed by the fake read transport. */
export class InMemoryNoteWrites
	extends InMemorySyncTransport<WorkspaceRecord>
	implements OutboxTransport<WorkspaceCommand, WorkspaceRecord>
{
	async send(input: {
		operationId: string;
		baseEtag: SyncEtag | null;
		command: WorkspaceCommand;
	}): Promise<WriteOutcome<WorkspaceRecord>> {
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
		return {
			kind: 'applied',
			receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot } }
		};
	}
}
