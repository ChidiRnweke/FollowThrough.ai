import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WriteOutcome } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import { widgetTemplates, type Widget } from '$lib/models/widgets';
import type { Todo } from '$lib/models/todos';
import type { WorkspaceSubmission } from '$lib/client/services/workspace/transport';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { WidgetPatchService } from '$lib/services/widgets/patches';
import type { WorkspaceController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { testNow, todoBuilder } from '$lib/testing/workspace/fixtures/domain-builders';
import { widgetBuilder } from '$lib/testing/widgets/fixtures/widgets';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});

const todo = todoBuilder({ title: 'Draft' });
const todoIdentity = { type: 'todos' as const, id: [todo.id] as [string] };
const todoKey = workspaceResourceKey(todoIdentity);
const stored = (value: Todo, version: bigint) => ({
	key: todoKey,
	entry: {
		kind: 'present' as const,
		snapshot: { etag: syncEtag(version), value: { type: 'todos' as const, value } }
	}
});

/** The account with one saved todo at version 1, started offline. */
const setup = async () => {
	const fixture = workspaceFixture();
	started.push(fixture.workspace);
	fixture.replica.seed(fixture.accountId, [stored(todo, 1n)]);
	const resources = await fixture.start(false);
	/** An editor that captured the todo as this device last saw it. */
	const editor = async () => {
		const draft = resources.draft(todoIdentity);
		await draft.open();
		return {
			draft,
			edit: async (patch: { status?: Todo['status']; title?: string }) => {
				const saved = await draft.stage({
					kind: 'updateTodo',
					todoId: todo.id,
					dueDate: null,
					...patch
				});
				if (saved.kind !== 'saved') throw new Error(saved.message);
			}
		};
	};
	let version = 10n;
	const applied = (input: WorkspaceSubmission): WriteOutcome<WorkspaceRecord> => {
		const local = fixture.replica
			.entries(fixture.accountId)
			.find((entry) => entry.intent.operationId === input.operationId)?.intent.local;
		if (!local) throw new Error('The server received an unknown operation');
		return {
			kind: 'applied',
			receipt: {
				operationId: input.operationId,
				resource: { kind: 'found', snapshot: { etag: syncEtag(version++), value: local } }
			}
		};
	};
	const online = () => {
		fixture.environment.online = true;
		resources.setOnline(true);
	};
	const queued = () =>
		resources.pending.map((entry) =>
			entry.intent.local?.type === 'todos'
				? { title: entry.intent.local.value.title, status: entry.intent.local.value.status }
				: null
		);
	const drained = () =>
		vi.waitFor(() => {
			if (resources.pending.length) throw new Error('The queue has not drained');
		});
	const current = () => {
		const entry = fixture.replica.resource(fixture.accountId, todoKey);
		return entry?.kind === 'present' && entry.snapshot.value.type === 'todos'
			? { title: entry.snapshot.value.value.title, status: entry.snapshot.value.value.status }
			: entry;
	};
	return { ...fixture, resources, editor, applied, online, queued, drained, current };
};

describe('ancestry chosen by the stored queue', () => {
	it('stacks an edit made from a superseded version on the latest local edit', async () => {
		const ctx = await setup();
		const completing = await ctx.editor();
		const renaming = await ctx.editor();
		await completing.edit({ status: 'done' });
		await renaming.edit({ title: 'Renamed' });
		const [completed, renamed] = ctx.resources.pending;
		expect({
			queued: ctx.queued(),
			stacked: renamed?.intent.basedOn === completed?.intent.operationId
		}).toEqual({
			queued: [
				{ title: 'Draft', status: 'done' },
				{ title: 'Renamed', status: 'done' }
			],
			stacked: true
		});
	});
	it('bases an edit from a superseded version on this device’s newer acknowledged write', async () => {
		const ctx = await setup();
		const completing = await ctx.editor();
		const renaming = await ctx.editor();
		await completing.edit({ status: 'done' });
		ctx.transport.sendWrite = async (input) => ctx.applied(input);
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.drained();
		ctx.resources.setOnline(false);
		await renaming.edit({ title: 'Renamed' });
		expect({
			queued: ctx.queued(),
			base: ctx.resources.pending[0]?.intent.base?.etag
		}).toEqual({ queued: [{ title: 'Renamed', status: 'done' }], base: syncEtag(10n) });
	});
	it('asks for a decision when another surface changed the same field after this device’s acknowledged write', async () => {
		const ctx = await setup();
		const first = await ctx.editor();
		ctx.transport.sendWrite = async (input) => ctx.applied(input);
		ctx.online();
		await first.edit({ title: 'Mine' });
		await ctx.resources.synchronize();
		await ctx.drained();
		await (await ctx.editor()).edit({ title: 'Theirs' });
		await ctx.resources.synchronize();
		await ctx.drained();
		ctx.resources.setOnline(false);
		await first.edit({ title: 'Mine again' });
		expect(ctx.resources.pending.map((entry) => entry.delivery.kind)).toEqual(['conflict']);
	});
});

describe('a dependent of a proven write', () => {
	it('is resent once the proof’s server version is read and no field collides', async () => {
		const ctx = await setup();
		const editor = await ctx.editor();
		await editor.edit({ status: 'done' });
		await editor.edit({ title: 'Mine' });
		ctx.transport.reads.records.set(
			todoKey,
			stored({ ...todo, status: 'done', completedAt: testNow }, 2n).entry.snapshot
		);
		ctx.transport.sendWrite = async (input) =>
			ctx.transport.sent.length === 1
				? {
						kind: 'proven',
						proof: { operationId: input.operationId, etag: syncEtag(2n), resourceKind: 'found' }
					}
				: ctx.applied(input);
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.drained();
		expect(ctx.current()).toEqual({ title: 'Mine', status: 'done' });
	});
});

describe('automatic rebase of a server conflict', () => {
	const renamedElsewhere = { ...todo, title: 'Renamed' };
	it('sends the edit again on the server version when the fields do not overlap', async () => {
		const ctx = await setup();
		await (await ctx.editor()).edit({ status: 'done' });
		ctx.transport.sendWrite = async (input) =>
			ctx.transport.sent.length === 1
				? {
						kind: 'conflict',
						remote: { kind: 'found', snapshot: stored(renamedElsewhere, 2n).entry.snapshot }
					}
				: ctx.applied(input);
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.drained();
		expect({
			sameOperation: ctx.transport.sent[0]?.operationId === ctx.transport.sent[1]?.operationId,
			resentBase: ctx.transport.sent[1]?.baseEtag,
			current: ctx.current()
		}).toEqual({
			sameOperation: true,
			resentBase: syncEtag(2n),
			current: { title: 'Renamed', status: 'done' }
		});
	});
	it('keeps an edit for review when the server changed the same field', async () => {
		const ctx = await setup();
		await (await ctx.editor()).edit({ title: 'Mine' });
		ctx.transport.sendWrite = async () => ({
			kind: 'conflict',
			remote: { kind: 'found', snapshot: stored({ ...todo, title: 'Theirs' }, 2n).entry.snapshot }
		});
		ctx.online();
		await ctx.resources.synchronize();
		expect(ctx.resources.pending.map((entry) => entry.delivery.kind)).toEqual(['conflict']);
	});
	it('replays later local edits to the same resource onto the rebased edit', async () => {
		const ctx = await setup();
		const editor = await ctx.editor();
		await editor.edit({ status: 'done' });
		await editor.edit({ status: 'open' });
		const release = Promise.withResolvers<void>();
		ctx.transport.sendWrite = async (input) => {
			if (ctx.transport.sent.length === 1)
				return {
					kind: 'conflict',
					remote: { kind: 'found', snapshot: stored(renamedElsewhere, 2n).entry.snapshot }
				};
			await release.promise;
			return ctx.applied(input);
		};
		ctx.online();
		const flushing = ctx.resources.synchronize();
		await vi.waitFor(() => {
			if (ctx.transport.sent.length < 2) throw new Error('The rebased edit was not resent');
		});
		const replayed = ctx.queued();
		release.resolve();
		await flushing;
		expect(replayed).toEqual([
			{ title: 'Renamed', status: 'done' },
			{ title: 'Renamed', status: 'open' }
		]);
	});
	it('replays an edit from a second editor onto the parent a server conflict rebased', async () => {
		const ctx = await setup();
		const first = await ctx.editor();
		await first.edit({ status: 'done' });
		const second = await ctx.editor();
		const release = Promise.withResolvers<void>();
		ctx.transport.sendWrite = async (input) => {
			if (ctx.transport.sent.length === 1)
				return {
					kind: 'conflict',
					remote: { kind: 'found', snapshot: stored(renamedElsewhere, 2n).entry.snapshot }
				};
			await release.promise;
			return ctx.applied(input);
		};
		ctx.online();
		const flushing = ctx.resources.synchronize();
		await vi.waitFor(() => {
			if (ctx.transport.sent.length < 2) throw new Error('The rebased edit was not resent');
		});
		await second.edit({ status: 'open' });
		const replayed = ctx.queued();
		release.resolve();
		await flushing;
		expect(replayed).toEqual([
			{ title: 'Renamed', status: 'done' },
			{ title: 'Renamed', status: 'open' }
		]);
	});
});

describe('widget replay', () => {
	it('merges ticks of different checklist items made on two devices', async () => {
		const fixture = workspaceFixture();
		started.push(fixture.workspace);
		const items = widgetTemplates.checklist.data.items;
		const data = (done: readonly boolean[]) => ({
			...widgetTemplates.checklist.data,
			items: items.map((item, index) => ({ ...item, done: done[index] ?? false }))
		});
		const original: Widget = widgetBuilder({ title: 'Checklist', data: data([]) });
		const identity = { type: 'widgets' as const, id: [original.id] as [string] };
		const key = workspaceResourceKey(identity);
		fixture.replica.seed(fixture.accountId, [
			{
				key,
				entry: {
					kind: 'present',
					snapshot: { etag: syncEtag(1n), value: { type: 'widgets', value: original } }
				}
			}
		]);
		const resources = await fixture.start(false);
		const draft = resources.draft(identity);
		await draft.open();
		const [change] = new WidgetPatchService().changesBetween(original, {
			title: original.title,
			layout: original.layout,
			data: data([true])
		});
		if (!change) throw new Error('The tick produced no change');
		await draft.stage({ kind: 'editWidget', widgetId: original.id, change });
		const elsewhere: Widget = {
			...original,
			title: 'Renamed',
			data: data([false, true]),
			dataRevision: 2
		};
		const resent = Promise.withResolvers<WorkspaceSubmission>();
		fixture.transport.sendWrite = async (input) => {
			if (fixture.transport.sent.length === 1)
				return {
					kind: 'conflict',
					remote: {
						kind: 'found',
						snapshot: { etag: syncEtag(2n), value: { type: 'widgets', value: elsewhere } }
					}
				};
			resent.resolve(input);
			return { kind: 'conflict', remote: { kind: 'deleted', etag: syncEtag(3n) } };
		};
		fixture.environment.online = true;
		resources.setOnline(true);
		await resources.synchronize();
		const entry = (await resent.promise) && fixture.replica.entries(fixture.accountId)[0];
		const local = entry?.intent.local;
		expect(
			local?.type === 'widgets' && [local.value.title, local.value.data, entry?.intent.base?.etag]
		).toEqual(['Renamed', data([true, true]), syncEtag(2n)]);
	});
});
