import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import type { WriteOutcome } from '$lib/models/outbox';
import type { WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceSubmission } from '$lib/client/services/workspace/transport';
import type { WorkspaceController, WorkspaceResourcesController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { replicaProject } from '$lib/testing/workspace/fixtures/replica-records';

const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
const first = replicaProject(1, 'Original');
const second = replicaProject(2, 'Second original');

type Fixture = ReturnType<typeof workspaceFixture>;
/** The account with two saved projects, started offline so tests decide when work is sent. */
const setup = async (fixture: Fixture = workspaceFixture()) => {
	started.push(fixture.workspace);
	fixture.replica.seed(
		fixture.accountId,
		[first, second].map((project) => ({
			key: project.key,
			entry: { kind: 'present' as const, snapshot: project.at(1n) }
		}))
	);
	const resources = await fixture.start(false);
	let version = 10n;
	/** The server applies exactly what this device queued. */
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
	const drafts = new Map<string, ReturnType<WorkspaceResourcesController['draft']>>();
	/** Renames through the project's editor, as the project page does. */
	const rename = async (project: typeof first, name: string) => {
		let draft = drafts.get(project.id);
		if (!draft) {
			draft = resources.draft(project.identity);
			await draft.open();
			drafts.set(project.id, draft);
		}
		const saved = await draft.stage({ kind: 'renameProject', projectId: project.id, name });
		if (saved.kind !== 'saved') throw new Error(saved.message);
		return resources.pending.at(-1)!.intent.operationId;
	};
	const online = () => {
		fixture.environment.online = true;
		resources.setOnline(true);
	};
	const pending = () =>
		resources.pending.map((entry) => [
			entry.intent.local?.type === 'projects' ? entry.intent.local.value.name : null,
			entry.delivery.kind
		]);
	const stored = (project: typeof first) => {
		const entry = fixture.replica.resource(fixture.accountId, project.key);
		return entry?.kind === 'present' && entry.snapshot.value.type === 'projects'
			? entry.snapshot.value.value.name
			: entry;
	};
	const names = () =>
		fixture.transport.sent.map((input) =>
			input.command.kind === 'renameProject' ? input.command.name : input.command.kind
		);
	return { ...fixture, resources, applied, rename, online, pending, stored, names, drafts };
};
const fail = (message: string) => async (): Promise<never> => {
	throw new Error(message);
};

describe('submission', () => {
	it('keeps offline writes durable without starting submission', async () => {
		const { resources, rename, replica, accountId, transport } = await setup();
		await rename(first, 'Edited');
		await resources.synchronize();
		expect({
			sent: transport.sent,
			status: resources.writeStatus,
			queued: replica.entries(accountId).map((entry) => entry.delivery.kind)
		}).toEqual({ sent: [], status: { kind: 'offline' }, queued: ['queued'] });
	});
	it('stores the receipt and the applied version once the queue acknowledgement is durable', async () => {
		const { resources, rename, online, transport, applied, replica, accountId, stored } =
			await setup();
		const operationId = await rename(first, 'Edited');
		transport.sendWrite = async (input) => applied(input);
		online();
		await resources.synchronize();
		expect({
			queued: replica.entries(accountId),
			receipt: replica.receipt(accountId, first.key)?.operationId,
			stored: stored(first)
		}).toEqual({ queued: [], receipt: operationId, stored: 'Edited' });
	});
	it('sends independent work after a failure while keeping the failed edit’s descendants', async () => {
		const ctx = await setup();
		const failed = await ctx.rename(first, 'Edited');
		await ctx.rename(first, 'Further');
		await ctx.rename(second, 'Independent');
		ctx.transport.sendWrite = async (input) => {
			if (input.operationId === failed) throw new Error('Connection lost');
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.resources.synchronize();
		expect({ pending: ctx.pending(), independent: ctx.stored(second) }).toEqual({
			pending: [
				['Edited', 'retry'],
				['Further', 'queued']
			],
			independent: 'Independent'
		});
	});
	it('retries an interrupted request with the same identity and input', async () => {
		const ctx = await setup();
		const firstOperation = await ctx.rename(first, 'Edited');
		let attempts = 0;
		ctx.transport.sendWrite = async (input) => {
			if (++attempts === 1) throw new Error('Connection lost');
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.rename(first, 'Later typing');
		await ctx.resources.synchronize(true);
		await vi.waitFor(() => {
			if (ctx.resources.pending.length) throw new Error('The queue has not drained');
		});
		expect({
			names: ctx.names(),
			retriedSameOperation: ctx.transport.sent[1]?.operationId === firstOperation
		}).toEqual({
			names: ['Edited', 'Edited', 'Later typing'],
			retriedSameOperation: true
		});
	});
	it('continues unrelated writes after a conflict without discarding the conflicting edit', async () => {
		const ctx = await setup();
		const conflicted = await ctx.rename(first, 'Edited');
		await ctx.rename(first, 'Further');
		await ctx.rename(second, 'Independent');
		ctx.transport.sendWrite = async (input) =>
			input.operationId === conflicted
				? { kind: 'conflict', remote: { kind: 'deleted', etag: syncEtag(2n) } }
				: ctx.applied(input);
		ctx.online();
		await ctx.resources.synchronize();
		expect({ pending: ctx.pending(), independent: ctx.stored(second) }).toEqual({
			pending: [
				['Edited', 'conflict'],
				['Further', 'queued']
			],
			independent: 'Independent'
		});
	});
	it('stores the server version of a conflict while keeping the local edit for review', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		ctx.transport.sendWrite = async () => ({
			kind: 'conflict',
			remote: { kind: 'found', snapshot: first.at(2n, 'Other client') }
		});
		ctx.online();
		await ctx.resources.synchronize();
		expect({ stored: ctx.stored(first), pending: ctx.pending() }).toEqual({
			stored: 'Other client',
			pending: [['Edited', 'conflict']]
		});
	});
	it('discards an uncertain edit only after durable server cancellation', async () => {
		const ctx = await setup();
		const operationId = await ctx.rename(first, 'Edited');
		ctx.transport.sendWrite = fail('Response lost');
		ctx.transport.cancelWrite = async () => ({ kind: 'cancelled' });
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.resources.discard([operationId]);
		expect({
			pending: ctx.resources.pending,
			cancelled: ctx.transport.cancelled.map((input) => input.operationId)
		}).toEqual({ pending: [], cancelled: [operationId] });
	});
	it('does not send a write taken after the account stopped', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		ctx.transport.sendWrite = async (input) => ctx.applied(input);
		ctx.online();
		// The writer recovers interrupted sends first; the next transaction takes the write.
		const take = ctx.replica.pauseTransaction(1);
		const flushing = ctx.resources.synchronize();
		await take.started;
		ctx.workspace.stop();
		take.release();
		await flushing;
		expect(ctx.transport.sent).toEqual([]);
	});
	it('finishes a durable acknowledgement after the account stops without exposing it', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		const sending = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		ctx.transport.sendWrite = async (input) => {
			sending.resolve();
			await release.promise;
			return ctx.applied(input);
		};
		ctx.online();
		const flushing = ctx.resources.synchronize();
		await sending.promise;
		ctx.workspace.stop();
		release.resolve();
		await flushing;
		expect({
			durable: ctx.replica.entries(ctx.accountId),
			exposed: ctx.resources.pending,
			stored: ctx.stored(first)
		}).toEqual({ durable: [], exposed: [], stored: 'Edited' });
	});
});

describe('retry and scheduling', () => {
	it('settles a failed edit at its retry deadline without another user action', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		let reachable = false;
		ctx.transport.sendWrite = async (input) => {
			if (!reachable) throw new Error('Connection lost');
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		reachable = true;
		await ctx.environment.scheduler.advance(1000);
		expect({ pending: ctx.resources.pending, stored: ctx.stored(first) }).toEqual({
			pending: [],
			stored: 'Edited'
		});
	});
	it('leaves a stopped account unchanged when a retry deadline arrives', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		let reachable = false;
		ctx.transport.sendWrite = async (input) => {
			if (!reachable) throw new Error('Connection lost');
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		const before = ctx.replica.entries(ctx.accountId);
		ctx.workspace.stop();
		reachable = true;
		await ctx.environment.scheduler.advance(60_000);
		expect(ctx.replica.entries(ctx.accountId)).toEqual(before);
	});
	it('submits independent new work before another operation’s retry deadline', async () => {
		const ctx = await setup();
		const failing = await ctx.rename(first, 'Edited');
		ctx.transport.sendWrite = async (input) => {
			if (input.operationId === failing) throw new Error('Connection lost');
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		await ctx.rename(second, 'Independent');
		await ctx.resources.synchronize();
		expect({ independent: ctx.stored(second), retried: ctx.names() }).toEqual({
			independent: 'Independent',
			retried: ['Edited', 'Independent']
		});
	});
	it('automatically retries a storage failure before any write is submitted', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		ctx.transport.sendWrite = async (input) => ctx.applied(input);
		ctx.replica.readFailure = 'Device storage unavailable';
		ctx.online();
		await ctx.resources.synchronize();
		ctx.replica.readFailure = null;
		await ctx.environment.scheduler.advance(1000);
		expect(ctx.stored(first)).toBe('Edited');
	});
	it('retries a failed page download without waiting for focus or another edit', async () => {
		const ctx = await setup();
		const third = replicaProject(3, 'Downloaded later');
		ctx.transport.reads.records.set(third.key, third.at(1n));
		ctx.transport.reads.pullFailure = 'Storage unavailable';
		ctx.online();
		await ctx.resources.synchronize();
		ctx.transport.reads.pullFailure = null;
		await ctx.environment.scheduler.advance(1000);
		expect({
			downloaded: ctx.stored(third),
			status: ctx.resources.readStatus
		}).toEqual({ downloaded: 'Downloaded later', status: { kind: 'complete' } });
	});
	it('does not restart failed lanes while offline', async () => {
		const ctx = await setup();
		const third = replicaProject(3, 'Downloaded later');
		ctx.transport.reads.records.set(third.key, third.at(1n));
		ctx.transport.reads.pullFailure = 'Disconnected';
		ctx.online();
		await ctx.resources.synchronize();
		ctx.resources.setOnline(false);
		ctx.transport.reads.pullFailure = null;
		await ctx.environment.scheduler.advance(5000);
		expect(ctx.stored(third)).toBeUndefined();
	});
	it('keeps downloading while a submission waits for its response', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		const third = replicaProject(3, 'Downloaded during submission');
		ctx.transport.reads.records.set(third.key, third.at(1n));
		const release = Promise.withResolvers<void>();
		const sending = Promise.withResolvers<void>();
		ctx.transport.sendWrite = async (input) => {
			sending.resolve();
			await release.promise;
			return ctx.applied(input);
		};
		ctx.online();
		const flushing = ctx.resources.synchronize();
		await sending.promise;
		while (ctx.stored(third) === undefined) await new Promise((resolve) => setTimeout(resolve));
		const duringSubmission = ctx.stored(third);
		release.resolve();
		await flushing;
		expect(duringSubmission).toBe('Downloaded during submission');
	});
	it('downloads records the server created with an accepted write', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		const created = replicaProject(3, 'Created by the server');
		ctx.transport.sendWrite = async (input) => {
			ctx.transport.reads.records.set(created.key, created.at(1n));
			return ctx.applied(input);
		};
		ctx.online();
		await ctx.resources.synchronize();
		while (ctx.stored(created) === undefined) await new Promise((resolve) => setTimeout(resolve));
		expect(ctx.stored(created)).toBe('Created by the server');
	});
	it('reports nothing after the account stops during a pending synchronization', async () => {
		const ctx = await setup();
		const gate = ctx.transport.reads.pause('changes');
		ctx.online();
		const synchronizing = ctx.resources.synchronize();
		await gate.started;
		ctx.workspace.stop();
		gate.release();
		await synchronizing;
		await ctx.environment.scheduler.advance(60_000);
		expect({ read: ctx.resources.readStatus, write: ctx.resources.writeStatus }).toEqual({
			read: { kind: 'stopped' },
			write: { kind: 'stopped' }
		});
	});
});

describe('other tabs', () => {
	it('shows another tab’s durable edit without a network connection', async () => {
		const ctx = await setup();
		const other = await setup(ctx.tab());
		await other.rename(first, 'Edited elsewhere');
		await ctx.resources.initialize();
		expect(ctx.pending()).toEqual([['Edited elsewhere', 'queued']]);
	});
	it('removes another tab’s discarded edit', async () => {
		const ctx = await setup();
		const operationId = await ctx.rename(first, 'Edited');
		const other = await setup(ctx.tab());
		await other.resources.discard([operationId]);
		await ctx.resources.initialize();
		await ctx.resources.open(first.identity);
		expect(ctx.resources.pending).toEqual([]);
	});
	it('recognizes an acknowledgement another tab stored for this tab’s edit', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		const other = await setup(ctx.tab());
		other.transport.sendWrite = async (input) => other.applied(input);
		other.online();
		await other.resources.synchronize();
		await ctx.resources.open(first.identity);
		expect(ctx.drafts.get(first.id)?.status).toBe('synced');
	});
	it('does not treat another tab’s discard as an acknowledgement', async () => {
		const ctx = await setup();
		const operationId = await ctx.rename(first, 'Edited');
		const other = await setup(ctx.tab());
		await other.resources.discard([operationId]);
		await ctx.resources.open(first.identity);
		expect(ctx.drafts.get(first.id)?.status).toBe('error');
	});
	it('waits for the tab that holds the writer lock instead of recovering its send', async () => {
		const ctx = await setup();
		await ctx.rename(first, 'Edited');
		const release = Promise.withResolvers<void>();
		const sending = Promise.withResolvers<void>();
		ctx.transport.sendWrite = async (input) => {
			sending.resolve();
			await release.promise;
			return ctx.applied(input);
		};
		ctx.online();
		const flushing = ctx.resources.synchronize();
		await sending.promise;
		const other = await setup(ctx.tab());
		other.online();
		await other.resources.synchronize();
		const status = other.resources.writeStatus;
		release.resolve();
		await flushing;
		expect({ status, sent: ctx.transport.sent.length }).toEqual({
			status: { kind: 'waiting' },
			sent: 1
		});
	});
});
