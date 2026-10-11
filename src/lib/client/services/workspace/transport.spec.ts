import { describe, expect, it } from 'vitest';
import { syncCursorSchema, syncEtag } from '$lib/models/sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { todoBuilder, testTodoId } from '$lib/testing/workspace/fixtures/domain-builders';
import { RemoteWorkspaceTransport, type WorkspaceRemoteFunctions } from './transport';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const todo = todoBuilder();
const key = workspaceResourceKey({ type: 'todos', id: [todo.id] });
const found = {
	kind: 'found',
	snapshot: { etag: syncEtag(2n), value: { type: 'todos', value: todo } }
};

/** The server answering every function with `answer`, recording what it was asked. */
const server = (answer: unknown) => {
	const asked: unknown[] = [];
	const respond = async (input: unknown) => {
		asked.push(input);
		return answer;
	};
	const remote: WorkspaceRemoteFunctions = {
		bootstrap: () => respond({}),
		pull: respond,
		read: respond,
		push: respond,
		cancel: respond
	};
	return { asked, transport: new RemoteWorkspaceTransport(remote) };
};

describe('reading the server’s answers', () => {
	it('returns a downloaded page as typed records', async () => {
		const { transport } = server({
			cursor: '7',
			hasMore: false,
			records: [{ key, resource: found }]
		});
		expect(await transport.pull('alice', syncCursorSchema.parse('0'))).toEqual({
			cursor: '7',
			hasMore: false,
			records: [{ key, resource: found }]
		});
	});
	it('refuses a page that names one resource twice', async () => {
		const { transport } = server({
			cursor: '7',
			hasMore: false,
			records: [
				{ key, resource: found },
				{ key, resource: found }
			]
		});
		await expect(transport.pull('alice', syncCursorSchema.parse('0'))).rejects.toThrow(
			'A sync page must contain each resource only once'
		);
	});
	it('refuses a record whose body is not a workspace record', async () => {
		const { transport } = server({
			kind: 'found',
			snapshot: { etag: syncEtag(2n), value: { type: 'todos', value: { title: 'No id' } } }
		});
		await expect(transport.read('alice', key, null)).rejects.toThrow();
	});
});

describe('addressing the server', () => {
	it('asks for the resource its storage key names', async () => {
		const { transport, asked } = server({ kind: 'unavailable' });
		await transport.read('alice', key, syncEtag(1n));
		expect(asked).toEqual([
			{ accountId: 'alice', identity: { type: 'todos', id: [todo.id] }, etag: syncEtag(1n) }
		]);
	});
	it('refuses a storage key that names no resource before asking the server', async () => {
		const { transport, asked } = server({ kind: 'unavailable' });
		const outcome = await transport.read('alice', '["todos"]', null).then(
			() => 'read',
			() => 'refused'
		);
		expect({ outcome, asked }).toEqual({ outcome: 'refused', asked: [] });
	});
	it('cancels with the exact submission it may have sent', async () => {
		const { transport, asked } = server({ kind: 'cancelled' });
		const submission = {
			operationId: crypto.randomUUID(),
			baseEtag: syncEtag(1n),
			command: { kind: 'updateTodo' as const, todoId: testTodoId(), title: 'Renamed' }
		};
		await transport.cancel('alice', submission).catch(() => undefined);
		expect(asked).toEqual([
			{
				operationId: submission.operationId,
				request: JSON.stringify(submission),
				accountId: 'alice'
			}
		]);
	});
});
