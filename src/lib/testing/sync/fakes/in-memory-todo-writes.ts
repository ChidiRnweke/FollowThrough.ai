import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { type SyncEtag } from '$lib/models/sync';
import { syncEtag } from '$lib/models/sync';
import type { WriteOutcome } from '$lib/models/outbox';
import type { DateTime } from '$lib/models/workspace';
import type { OutboxTransport } from '$lib/client/sync/outbox-contracts';
import { TodoEditingRulesService } from '$lib/services/todos/edits';
const todoEditing = new TodoEditingRulesService();
import { InMemorySyncTransport } from './in-memory-sync';

/** Version-guarded todo edits, answering each request after the event loop turns like a network. */
export class InMemoryTodoWrites
	extends InMemorySyncTransport<WorkspaceRecord>
	implements OutboxTransport<WorkspaceCommand, WorkspaceRecord>
{
	readonly requests: { readonly operationId: string; readonly baseEtag: SyncEtag | null }[] = [];
	constructor(private readonly now: DateTime) {
		super();
	}
	async send(input: {
		operationId: string;
		baseEtag: SyncEtag | null;
		command: WorkspaceCommand;
	}): Promise<WriteOutcome<WorkspaceRecord>> {
		await new Promise((resolve) => setTimeout(resolve));
		const command = input.command;
		if (command.kind !== 'updateTodo') throw new Error('This fake supports todo edits');
		const { kind, todoId, ...patch } = command;
		void kind;
		this.requests.push({ operationId: input.operationId, baseEtag: input.baseEtag });
		const key = workspaceResourceKey({ type: 'todos', id: [todoId] });
		const current = this.records.get(key);
		if (!current) return { kind: 'conflict', remote: { kind: 'unavailable' } };
		if (current.etag !== input.baseEtag)
			return { kind: 'conflict', remote: { kind: 'found', snapshot: current } };
		if (current.value.type !== 'todos') throw new Error('Invalid todo fixture');
		const snapshot = {
			etag: syncEtag(BigInt(current.etag.slice(8)) + 1n),
			value: {
				type: 'todos' as const,
				value: todoEditing.edit(current.value.value, patch, this.now)
			}
		};
		this.records.set(key, snapshot);
		return {
			kind: 'applied',
			receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot } }
		};
	}
}
