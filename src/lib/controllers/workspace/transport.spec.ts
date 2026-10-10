import { describe, expect, it } from 'vitest';
import { WorkspaceReads, WorkspaceWrites, type WorkspaceWriteController } from './transport';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { initialSyncCursor, syncEtag } from '$lib/models/sync';

const rules = new WorkspaceCommandRulesService();
const todo = todoBuilder();
const record: WorkspaceRecord = { type: 'todos', value: todo };
const key = rules.workspaceRecordIdentity(record);
const snapshot = { value: record, etag: syncEtag(2n) };
const otherKey = rules.workspaceResourceKey({ type: 'todos', id: [testTodoId(2)] });
const input = {
	operationId: crypto.randomUUID(),
	baseEtag: syncEtag(1n),
	command: { kind: 'updateTodo' as const, todoId: todo.id, title: 'Updated' }
};

describe('workspace transport identity', () => {
	it('returns the complete matching resource', async () => {
		const source = new InMemorySyncTransport<WorkspaceRecord>();
		source.records.set(rules.workspaceResourceKey(key), snapshot);
		const reads = new WorkspaceReads(source, rules);
		expect(await reads.read(rules.workspaceResourceKey(key), null)).toEqual({
			kind: 'found',
			snapshot
		});
	});
	it('rejects a page body stored under another resource key', async () => {
		const source = new InMemorySyncTransport<WorkspaceRecord>();
		source.records.set(otherKey, snapshot);
		await expect(new WorkspaceReads(source, rules).pull(initialSyncCursor)).rejects.toThrow(
			'The server page returned a different resource'
		);
	});
	it('rejects a read body stored under another resource key', async () => {
		const source = new InMemorySyncTransport<WorkspaceRecord>();
		source.records.set(otherKey, snapshot);
		await expect(new WorkspaceReads(source, rules).read(otherKey, null)).rejects.toThrow(
			'The server returned a different resource'
		);
	});
	it('rejects an acknowledgement for another write', async () => {
		const source = capabilityDependencies<WorkspaceWriteController>({
			send: async () => ({
				kind: 'applied',
				receipt: { operationId: crypto.randomUUID(), resource: { kind: 'found', snapshot } }
			})
		});
		const writes = new WorkspaceWrites(
			source,
			new WorkspaceReads(new InMemorySyncTransport<WorkspaceRecord>(), rules),
			rules
		);
		await expect(writes.send(input)).rejects.toThrow(
			'The server acknowledged a different operation'
		);
	});
	it('rejects a matching write acknowledgement containing another resource', async () => {
		const other: WorkspaceRecord = { type: 'todos', value: todoBuilder({ id: testTodoId(2) }) };
		const source = capabilityDependencies<WorkspaceWriteController>({
			send: async () => ({
				kind: 'applied',
				receipt: {
					operationId: input.operationId,
					resource: { kind: 'found', snapshot: { ...snapshot, value: other } }
				}
			})
		});
		const writes = new WorkspaceWrites(
			source,
			new WorkspaceReads(new InMemorySyncTransport<WorkspaceRecord>(), rules),
			rules
		);
		await expect(writes.send(input)).rejects.toThrow('The server returned a different resource');
	});
});
