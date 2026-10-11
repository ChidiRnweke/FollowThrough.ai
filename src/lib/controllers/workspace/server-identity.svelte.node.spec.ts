import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

const todo = todoBuilder();
const identity = { type: 'todos' as const, id: [todo.id] as [string] };
const key = workspaceResourceKey(identity);
const other: WorkspaceRecord = { type: 'todos', value: todoBuilder({ id: testTodoId(2) }) };

/** One todo saved on this device; the server is reachable. */
const setup = async () => {
	const fixture = workspaceFixture({ accountId: todo.userId });
	started.push(fixture.workspace);
	const snapshot = { etag: syncEtag(1n), value: { type: 'todos' as const, value: todo } };
	fixture.replica.seed(todo.userId, [{ key, entry: { kind: 'present', snapshot } }]);
	const resources = await fixture.start(false);
	/** Queue one offline edit, then reconnect so it is submitted. */
	const submitEdit = async () => {
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Updated', dueDate: null });
		fixture.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		await vi.waitFor(() => {
			if (!fixture.transport.sent.length) throw new Error('The edit was not submitted');
		});
		return draft;
	};
	return { ...fixture, resources, submitEdit };
};

describe('a server answer for something other than the request', () => {
	it('does not show a read body that belongs to another resource', async () => {
		const { resources, transport } = await setup();
		const missing = { type: 'todos' as const, id: [testTodoId(3)] as [string] };
		transport.reads.records.set(workspaceResourceKey(missing), {
			etag: syncEtag(2n),
			value: other
		});
		resources.setOnline(true);
		const access = await resources.open(missing);
		expect(access).toEqual({
			kind: 'failure',
			message: 'The server returned a different resource'
		});
	});
	it('keeps an edit queued when the acknowledgement names another operation', async () => {
		const { resources, transport, submitEdit } = await setup();
		transport.sendWrite = async () => ({
			kind: 'applied',
			receipt: {
				operationId: crypto.randomUUID(),
				resource: {
					kind: 'found',
					snapshot: {
						etag: syncEtag(2n),
						value: { type: 'todos', value: { ...todo, title: 'Updated' } }
					}
				}
			}
		});
		await submitEdit();
		expect(resources.pending.map((entry) => entry.delivery)).toEqual([
			{ kind: 'retry', message: 'The server acknowledged a different operation' }
		]);
	});
	it('keeps an edit queued when its acknowledgement carries another resource', async () => {
		const { resources, transport, submitEdit } = await setup();
		transport.sendWrite = async (input) => ({
			kind: 'applied',
			receipt: {
				operationId: input.operationId,
				resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: other } }
			}
		});
		const draft = await submitEdit();
		expect({
			delivery: resources.pending.map((entry) => entry.delivery),
			shown: draft.value?.id,
			other: resources.records.has(workspaceResourceKey({ type: 'todos', id: [testTodoId(2)] }))
		}).toEqual({
			delivery: [{ kind: 'retry', message: 'The server returned a different resource' }],
			shown: todo.id,
			other: false
		});
	});
});
