import { describe, expect, it } from 'vitest';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceCommand } from '$lib/models/workspace-mutations';
import type { UpdateTodoInput } from '$lib/models/todos';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/services/sync/versions';
import { testNow, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemorySyncCache } from '$lib/testing/sync/fakes/in-memory-sync';
import {
	InMemoryOutbox,
	InMemoryAccountWriterLock
} from '$lib/testing/sync/fakes/in-memory-outbox';
import { InMemorySyncScheduler } from '$lib/testing/sync/fakes/in-memory-scheduler';
import { InMemoryTodoWrites } from '$lib/testing/sync/fakes/in-memory-todo-writes';
import { ResourceCache } from '$lib/client/sync/resource-cache';
import { MutationQueue } from '$lib/client/sync/mutation-queue';
import { rebaseWorkspaceRecord } from '$lib/controllers/workspace/rebase';
import { WorkspaceResources } from './resources.svelte';

const setup = async () => {
	const todo = todoBuilder();
	const key = workspaceResourceKey({ type: 'todos', id: [todo.id] });
	const server = new InMemoryTodoWrites(testNow);
	const snapshot = { etag: syncEtag(1n), value: { type: 'todos' as const, value: todo } };
	server.records.set(key, snapshot);
	const outbox = new InMemoryOutbox<WorkspaceCommand, WorkspaceRecord>(
		rebaseWorkspaceRecord,
		new InMemorySyncCache()
	);
	const cache = new ResourceCache(todo.userId, {
		repository: outbox.projectedCache,
		transport: server
	});
	const writes = new MutationQueue(todo.userId, {
		repository: outbox,
		transport: server,
		scheduler: new InMemorySyncScheduler(),
		writerLock: new InMemoryAccountWriterLock(),
		pull: () => cache.refresh()
	});
	const resources = new WorkspaceResources(todo.userId, { repository: outbox, cache, writes });
	outbox.observe(todo.userId, (state) => resources.applyLocal(state));
	await cache.accept(key, snapshot);
	/** Each quick action opens its own editor, as the todo list and menus do. */
	const edit = async (patch: Omit<UpdateTodoInput, 'todoId'>) => {
		const draft = resources.draft({ type: 'todos', id: [todo.id] });
		await draft.read();
		return draft.stage({ kind: 'updateTodo', todoId: todo.id, ...patch });
	};
	/** Run submission until nothing is left to send; conflicts stay for review. */
	const settle = async () => {
		const sendable = () =>
			resources.pending.some(
				(entry) => entry.delivery.kind === 'queued' || entry.delivery.kind === 'sending'
			);
		while (sendable()) {
			await resources.synchronize();
			await new Promise((resolve) => setTimeout(resolve));
		}
	};
	return { todo, key, server, resources, outbox, edit, settle };
};

describe('quick successive edits to one resource', () => {
	it('shows both edits locally when the second starts before the first is stored', async () => {
		const { edit, resources, key } = await setup();
		resources.setOnline(false);
		await Promise.all([edit({ status: 'done' }), edit({ priority: 'high' })]);
		const local = resources.records.get(key);
		expect(local?.type === 'todos' && [local.value.status, local.value.priority]).toEqual([
			'done',
			'high'
		]);
	});
	it('sends successive edits against their parent versions and stores both without review', async () => {
		const { edit, server, settle, key, resources } = await setup();
		await Promise.all([edit({ status: 'done' }), edit({ priority: 'high' })]);
		await settle();
		const stored = server.records.get(key)?.value;
		expect({
			baseEtags: server.requests.map((request) => request.baseEtag),
			pending: resources.pending.length,
			server: stored?.type === 'todos' && [stored.value.status, stored.value.priority]
		}).toEqual({
			baseEtags: [syncEtag(1n), syncEtag(2n)],
			pending: 0,
			server: ['done', 'high']
		});
	});
});

describe('a server version changed elsewhere', () => {
	it('resends an edit whose fields the other change did not touch', async () => {
		const { edit, server, settle, key, todo } = await setup();
		server.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'todos', value: { ...todo, title: 'Renamed on another device' } }
		});
		await edit({ status: 'done' });
		await settle();
		const stored = server.records.get(key)?.value;
		expect(stored?.type === 'todos' && [stored.value.title, stored.value.status]).toEqual([
			'Renamed on another device',
			'done'
		]);
	});
	it('asks for a decision when the other change edited the same field', async () => {
		const { edit, server, settle, key, todo, resources } = await setup();
		server.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'todos', value: { ...todo, title: 'Renamed on another device' } }
		});
		await edit({ title: 'Renamed here' });
		await settle();
		expect(resources.pending.map((entry) => entry.delivery.kind)).toEqual(['conflict']);
	});
});
