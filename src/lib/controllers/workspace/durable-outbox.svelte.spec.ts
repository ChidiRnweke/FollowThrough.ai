import { afterEach, describe, expect, it } from 'vitest';
import { IndexedDbWorkspaceReplica } from '$lib/client/repositories/workspace/replica';
import type { WriteOutcome } from '$lib/models/outbox';
import { syncEtag, type SyncSnapshot } from '$lib/models/sync';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { resourceDataSchemas, workspaceRecordSchema } from '$lib/models/workspace-records';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { Todo } from '$lib/models/todos';
import type { WorkspaceSubmission } from '$lib/client/services/workspace/transport';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController } from './workspace';
import {
	noteBuilder,
	projectBuilder,
	todoBuilder
} from '$lib/testing/workspace/fixtures/domain-builders';
import { InMemoryWorkspaceTransport } from '$lib/testing/workspace/fakes/in-memory-transport';
import { workspaceTab } from '$lib/testing/workspace/fixtures/workspace';

const { noteCommand, workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
const accounts: string[] = [];
/** IndexedDB blocks a deletion until transactions already running on a closed tab finish. */
const transactionsFinished = () => new Promise((resolve) => setTimeout(resolve, 20));
afterEach(async () => {
	for (const workspace of started.splice(0)) workspace.stop();
	await transactionsFinished();
	const replica = new IndexedDbWorkspaceReplica(workspaceCommandSchema, workspaceRecordSchema);
	for (const accountId of accounts.splice(0)) await replica.resetAccount(accountId);
});

/**
 * One browser profile of a fresh account: every tab opens its own IndexedDB connection, and the
 * server answers each submission with `respond`.
 */
const browser = () => {
	const accountId = resourceDataSchemas.users.shape.id.parse(crypto.randomUUID());
	accounts.push(accountId);
	const transport = new InMemoryWorkspaceTransport();
	let locks = new Map<string, Promise<void>>();
	/** A restarted browser: earlier tabs and the writer locks they held are gone. */
	const restart = () => {
		for (const workspace of started) workspace.stop();
		locks = new Map();
	};
	const tab = () => {
		const opened = workspaceTab(
			accountId,
			new IndexedDbWorkspaceReplica(workspaceCommandSchema, workspaceRecordSchema),
			transport,
			locks
		);
		started.push(opened.workspace);
		return opened;
	};
	/** What a tab opened after this point finds in device storage. */
	const stored = () => {
		const reader = tab();
		reader.storage.open(accountId);
		return reader.storage.read(accountId);
	};
	return { accountId, transport, tab, stored, restart };
};

/** A todo stored on this device at version 1. */
const savedTodo = async (tab: ReturnType<ReturnType<typeof browser>['tab']>, todo: Todo) => {
	const identity = { type: 'todos' as const, id: [todo.id] as [string] };
	tab.storage.open(todo.userId);
	await tab.storage.commitCache(todo.userId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: { type: 'todos', value: todo } }
				}
			}
		]
	});
	return identity;
};
const applied = (
	input: WorkspaceSubmission,
	snapshot: SyncSnapshot<WorkspaceRecord>
): WriteOutcome<WorkspaceRecord> => ({
	kind: 'applied',
	receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot } }
});
const todoAt = (todo: Todo, version: bigint): SyncSnapshot<WorkspaceRecord> => ({
	etag: syncEtag(version),
	value: { type: 'todos', value: todo }
});

describe('durable local writes', () => {
	it('retains a locally created project after the browser restarts', async () => {
		const { tab, accountId } = browser();
		const first = tab();
		const project = projectBuilder({ userId: accountId });
		await (
			await first.start(false)
		).create({ kind: 'createProject', id: project.id, name: 'Kept offline' });
		first.workspace.stop();
		const reopened = tab();
		await reopened.start(false);
		expect(reopened.views.get('projects', project.id)?.name).toBe('Kept offline');
	});
	it('applies concurrent edits from two tabs one after another, so neither is lost', async () => {
		const { tab, accountId } = browser();
		const [one, two] = [tab(), tab()];
		const todo = todoBuilder({ userId: accountId, title: 'Draft' });
		const identity = await savedTodo(one, todo);
		const [left, right] = [await one.start(false), await two.start(false)];
		const [completing, renaming] = [left.draft(identity), right.draft(identity)];
		await Promise.all([completing.open(), renaming.open()]);
		await Promise.all([
			completing.stage({ kind: 'updateTodo', todoId: todo.id, status: 'done', dueDate: null }),
			renaming.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Renamed', dueDate: null })
		]);
		await left.synchronize();
		const local = left.records.get(workspaceResourceKey(identity));
		expect(local?.type === 'todos' && [local.value.title, local.value.status]).toEqual([
			'Renamed',
			'done'
		]);
	});
	it('keeps typing after submission as a separate edit that waits for the first', async () => {
		const { tab, accountId, transport } = browser();
		const first = tab();
		const todo = todoBuilder({ userId: accountId, title: 'Draft' });
		const identity = await savedTodo(first, todo);
		const resources = await first.start(false);
		const editor = resources.draft(identity);
		await editor.open();
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Sent', dueDate: null });
		const response = Promise.withResolvers<WriteOutcome<WorkspaceRecord>>();
		const sending = Promise.withResolvers<void>();
		transport.sendWrite = () => {
			sending.resolve();
			return response.promise;
		};
		first.environment.online = true;
		resources.setOnline(true);
		void resources.synchronize();
		await sending.promise;
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Later', dueDate: null });
		const queued = resources.pending.map((entry) => entry.delivery.kind);
		response.resolve({ kind: 'rejected', message: 'Stop here' });
		expect(queued).toEqual(['sending', 'queued']);
	});
	it('stores the acknowledged version and bases the waiting edit on it', async () => {
		const { tab, accountId, transport, stored } = browser();
		const first = tab();
		const todo = todoBuilder({ userId: accountId, title: 'Draft' });
		const identity = await savedTodo(first, todo);
		const resources = await first.start(false);
		const editor = resources.draft(identity);
		await editor.open();
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Sent', dueDate: null });
		const acknowledged = todoAt({ ...todo, title: 'Sent' }, 2n);
		const release = Promise.withResolvers<void>();
		const sending = Promise.withResolvers<void>();
		transport.sendWrite = async (input) => {
			if (transport.sent.length > 1) return { kind: 'rejected', message: 'Stop here' };
			sending.resolve();
			await release.promise;
			return applied(input, acknowledged);
		};
		first.environment.online = true;
		resources.setOnline(true);
		const submitting = resources.synchronize();
		await sending.promise;
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Later', dueDate: null });
		resources.setOnline(false);
		release.resolve();
		await submitting;
		const reopened = await stored();
		expect({
			stored: reopened.cache.records.find((row) => row.key === workspaceResourceKey(identity))
				?.entry,
			waiting: reopened.writes.entries.map((entry) => entry.intent.base?.etag)
		}).toEqual({
			stored: { kind: 'present', snapshot: acknowledged },
			waiting: [syncEtag(2n)]
		});
	});
	it('retries the exact submitted input after the browser restarts mid-request', async () => {
		const { tab, accountId, transport, restart } = browser();
		const first = tab();
		const project = projectBuilder({ userId: accountId });
		const resources = await first.start(false);
		await resources.create({ kind: 'createProject', id: project.id, name: 'Plan ' });
		const sending = Promise.withResolvers<void>();
		transport.sendWrite = () => {
			sending.resolve();
			return new Promise(() => undefined);
		};
		first.environment.online = true;
		resources.setOnline(true);
		void resources.synchronize();
		await sending.promise;
		restart();
		const second = tab();
		const retried = Promise.withResolvers<WorkspaceSubmission>();
		transport.sendWrite = async (input) => {
			retried.resolve(input);
			return { kind: 'rejected', message: 'Stop here' };
		};
		await (await second.start(true)).synchronize();
		expect(await retried.promise).toEqual(transport.sent[0]);
	});
	it('normalizes the input it submits and the copy it keeps for cancellation alike', async () => {
		const { tab, accountId, transport, stored } = browser();
		const first = tab();
		const project = projectBuilder({ userId: accountId });
		const resources = await first.start(false);
		await resources.create({ kind: 'createProject', id: project.id, name: 'Plan ' });
		transport.sendWrite = async () => {
			throw new Error('Response lost');
		};
		first.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		first.workspace.stop();
		const [retained] = (await stored()).writes.entries;
		expect({ submitted: transport.sent[0]?.command, kept: retained?.intent.command }).toEqual({
			submitted: { kind: 'createProject', id: project.id, name: 'Plan' },
			kept: { kind: 'createProject', id: project.id, name: 'Plan' }
		});
	});
});

describe('durable conflict decisions', () => {
	/** A todo edit the server refused, with the server copy it reported. */
	const conflicted = async (
		remote: (todo: Todo) => WriteOutcome<WorkspaceRecord> & { kind: 'conflict' }
	) => {
		const context = browser();
		const first = context.tab();
		const todo = todoBuilder({ userId: context.accountId, title: 'Draft' });
		const identity = await savedTodo(first, todo);
		const resources = await first.start(false);
		const editor = resources.draft(identity);
		await editor.open();
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Mine', dueDate: null });
		context.transport.sendWrite = async () => remote(todo);
		first.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		return { ...context, first, todo, identity, resources, editor };
	};
	it('stores the server tombstone while retaining the offline edit', async () => {
		const remote = { kind: 'deleted' as const, etag: syncEtag(2n) };
		const { stored: reread, identity } = await conflicted(() => ({ kind: 'conflict', remote }));
		const stored = await reread();
		expect({
			local: stored.writes.entries.map((entry) =>
				entry.intent.local?.type === 'todos' ? entry.intent.local.value.title : null
			),
			record: stored.cache.records.find((row) => row.key === workspaceResourceKey(identity))?.entry
		}).toEqual({ local: ['Mine'], record: remote });
	});
	it('stores the server copy when review reads it after an unavailable conflict', async () => {
		const {
			stored: reread,
			todo,
			transport,
			resources,
			identity
		} = await conflicted(() => ({
			kind: 'conflict',
			remote: { kind: 'unavailable' }
		}));
		const theirs = todoAt({ ...todo, title: 'Theirs' }, 3n);
		transport.reads.records.set(workspaceResourceKey(identity), theirs);
		const [entry] = resources.pending;
		if (!entry) throw new Error('The conflicting edit must remain queued');
		await resources.refreshConflict(entry.intent.operationId);
		const stored = await reread();
		expect({
			delivery: stored.writes.entries.map((queued) => queued.delivery),
			record: stored.cache.records.find((row) => row.key === workspaceResourceKey(identity))?.entry
		}).toEqual({
			delivery: [{ kind: 'conflict', remote: { kind: 'found', snapshot: theirs } }],
			record: { kind: 'present', snapshot: theirs }
		});
	});
	it('sends a kept local edit as a new operation guarded by the reviewed server copy', async () => {
		const { transport, editor } = await conflicted((todo) => ({
			kind: 'conflict',
			remote: { kind: 'found', snapshot: todoAt({ ...todo, title: 'Theirs' }, 2n) }
		}));
		const resent = Promise.withResolvers<WorkspaceSubmission>();
		transport.sendWrite = async (input) => {
			resent.resolve(input);
			return { kind: 'rejected', message: 'Stop here' };
		};
		await editor.keep();
		const input = await resent.promise;
		expect({
			newOperation: input.operationId !== transport.sent[0]?.operationId,
			base: input.baseEtag
		}).toEqual({ newOperation: true, base: syncEtag(2n) });
	});
	it('keeps both copies of a creation conflict when keeping the local copy is refused', async () => {
		const { tab, accountId, transport, stored } = browser();
		const first = tab();
		const project = projectBuilder({ userId: accountId });
		const resources = await first.start(false);
		await resources.create({ kind: 'createProject', id: project.id, name: 'Mine' });
		transport.sendWrite = async () => ({
			kind: 'conflict',
			remote: {
				kind: 'found',
				snapshot: { etag: syncEtag(2n), value: { type: 'projects', value: project } }
			}
		});
		first.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		const [original] = resources.pending;
		if (!original) throw new Error('The creation must remain queued');
		const outcome = await resources.keepLocal(original.intent.operationId).then(
			() => ({ kind: 'kept' }),
			(error: Error) => ({ kind: 'failure', message: error.message })
		);
		first.workspace.stop();
		const [retained] = (await stored()).writes.entries;
		expect({ outcome, retained: retained?.intent.operationId }).toEqual({
			outcome: {
				kind: 'failure',
				message: 'A new item must be explicitly recreated to retain both copies'
			},
			retained: original.intent.operationId
		});
	});
	it('sends a correction of a rejected document after the browser restarts', async () => {
		const { tab, accountId, transport, restart } = browser();
		const first = tab();
		const note = noteBuilder({ userId: accountId, plainText: 'Saved' });
		const identity = { type: 'notes' as const, id: [note.id] as [string] };
		first.storage.open(accountId);
		await first.storage.commitCache(accountId, {
			put: [
				{
					key: workspaceResourceKey(identity),
					entry: {
						kind: 'present',
						snapshot: { etag: syncEtag(1n), value: { type: 'notes', value: note } }
					}
				}
			]
		});
		const resources = await first.start(false);
		const editor = resources.draft(identity);
		await editor.open();
		await editor.stage(noteCommand({ ...note, plainText: 'Invalid document' }));
		transport.sendWrite = async () => ({ kind: 'rejected', message: 'Invalid document' });
		first.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		resources.setOnline(false);
		await editor.stage(noteCommand({ ...note, plainText: 'Corrected document' }));
		restart();
		const resent = Promise.withResolvers<WorkspaceSubmission>();
		transport.sendWrite = async (input) => {
			resent.resolve(input);
			return { kind: 'rejected', message: 'Stop here' };
		};
		await (await tab().start(true)).synchronize();
		const input = await resent.promise;
		expect({
			text: input.command.kind === 'saveNote' && input.command.plainText,
			base: input.baseEtag
		}).toEqual({ text: 'Corrected document', base: syncEtag(1n) });
	});
});

it('bases later typing on its own acknowledged version despite a newer copy from elsewhere', async () => {
	const { tab, accountId, transport } = browser();
	const first = tab();
	const todo = todoBuilder({ userId: accountId, title: 'Draft' });
	const identity = await savedTodo(first, todo);
	const resources = await first.start(false);
	const editor = resources.draft(identity);
	await editor.open();
	await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Sent', dueDate: null });
	transport.sendWrite = async (input) => applied(input, todoAt({ ...todo, title: 'Sent' }, 2n));
	first.environment.online = true;
	resources.setOnline(true);
	await resources.synchronize();
	resources.setOnline(false);
	await first.storage.commitCache(accountId, {
		put: [
			{
				key: workspaceResourceKey(identity),
				entry: { kind: 'present', snapshot: todoAt({ ...todo, title: 'Other client' }, 3n) }
			}
		]
	});
	await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Later', dueDate: null });
	expect(resources.pending.map((entry) => entry.intent.base?.etag)).toEqual([syncEtag(2n)]);
});

it('cannot restore a reset account from a download that was in flight', async () => {
	const { tab, accountId, transport, stored } = browser();
	const first = tab();
	const project = projectBuilder({ userId: accountId });
	transport.reads.records.set(workspaceResourceKey({ type: 'projects', id: [project.id] }), {
		etag: syncEtag(1n),
		value: { type: 'projects', value: project }
	});
	const download = transport.reads.pause('changes');
	const resources = await first.start(true);
	void resources.synchronize();
	await download.started;
	await transactionsFinished();
	await first.workspace.resetLocalWorkspace();
	download.release();
	await new Promise((resolve) => setTimeout(resolve, 50));
	expect((await stored()).cache.records).toEqual([]);
});

describe('an open editor and edits stored by another tab', () => {
	it('opens a note created offline in another tab before the server has it', async () => {
		const { tab, accountId } = browser();
		const [one, two] = [tab(), tab()];
		const project = projectBuilder({ userId: accountId });
		const writer = await one.start(false);
		await writer.create({ kind: 'createProject', id: project.id, name: 'Offline' });
		const noteId = noteBuilder().id;
		await writer.create({
			kind: 'createNote',
			id: noteId,
			projectId: project.id,
			title: 'Captured offline'
		});
		const reader = await two.start(false);
		const editor = reader.draft({ type: 'notes', id: [noteId] });
		const opened = await editor.read();
		expect({
			title: opened.kind === 'ready' ? opened.value.title : opened.kind,
			status: editor.status
		}).toEqual({ title: 'Captured offline', status: 'pending' });
	});
	it('keeps the editor buffer with an error after another tab discards its edit', async () => {
		const { tab, accountId } = browser();
		const [one, two] = [tab(), tab()];
		const todo = todoBuilder({ userId: accountId, title: 'Draft' });
		const identity = await savedTodo(one, todo);
		const [editing, discarding] = [await one.start(false), await two.start(false)];
		const editor = editing.draft(identity);
		await editor.open();
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Typed', dueDate: null });
		await discarding.synchronize();
		await discarding.discard(discarding.pending.map((entry) => entry.intent.operationId));
		await expect
			.poll(() => ({ status: editor.status, retained: editor.value?.title }))
			.toEqual({ status: 'error', retained: 'Typed' });
	});
	it('shows an edit as saved once another tab delivers it while this tab is offline', async () => {
		const { tab, accountId, transport } = browser();
		const [one, two] = [tab(), tab()];
		const todo = todoBuilder({ userId: accountId, title: 'Draft' });
		const identity = await savedTodo(one, todo);
		const editing = await one.start(false);
		const editor = editing.draft(identity);
		await editor.open();
		await editor.stage({ kind: 'updateTodo', todoId: todo.id, title: 'Typed', dueDate: null });
		transport.sendWrite = async (input) => applied(input, todoAt({ ...todo, title: 'Typed' }, 2n));
		await (await two.start(true)).synchronize();
		await expect.poll(() => editor.status).toBe('synced');
	});
});
