import { afterEach, describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { initialSyncCursor, syncEtag, type ResourceState } from '$lib/models/sync';
import { workspaceRecordSchema, type WorkspaceRecord } from '$lib/models/workspace-records';
import type { WorkspaceResourceType } from '$lib/models/workspace-sync';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import type { WorkspaceController, ResourceViewController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { replicaProject } from '$lib/testing/workspace/fixtures/replica-records';

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
const subject = replicaProject(1, 'Local project');
const { identity, key } = subject;
const project = subject.record;
const present = (
	version: bigint,
	value: WorkspaceRecord = project
): ResourceState<WorkspaceRecord> => ({
	kind: 'present',
	snapshot: { etag: syncEtag(version), value }
});

/** The workspace started online; nothing is downloaded until a test asks for it. */
const setup = async (
	seed: { records?: [string, ResourceState<WorkspaceRecord>][]; inventory?: boolean } = {}
) => {
	const fixture = workspaceFixture();
	started.push(fixture.workspace);
	fixture.replica.seed(
		fixture.accountId,
		(seed.records ?? []).map(([key, entry]) => ({ key, entry })),
		seed.inventory === undefined
			? undefined
			: { cursor: initialSyncCursor, inventoryComplete: seed.inventory }
	);
	const resources = await fixture.start();
	/** Another tab's queued creation of the project. */
	const queueCreation = () =>
		fixture.replica.queue(fixture.accountId, {
			intent: {
				operationId: crypto.randomUUID(),
				key,
				command: { kind: 'createProject', id: subject.id, name: 'Local project' },
				base: null,
				basedOn: null,
				local: project,
				coalesce: null,
				references: [],
				dependencies: []
			},
			delivery: { kind: 'queued' }
		});
	/** Lets this tab observe what other tabs stored. */
	const observe = () => fixture.replica.read(fixture.accountId);
	return { ...fixture, resources, queueCreation, observe };
};
const renamed = (name: string) => ({ kind: 'renameProject' as const, projectId: subject.id, name });

describe('shared workspace reads', () => {
	it('opens a locally created resource without a server round trip', async () => {
		const { resources, queueCreation, observe } = await setup();
		resources.setOnline(false);
		queueCreation();
		await observe();
		expect(await resources.open(identity)).toEqual({ kind: 'ready', value: project });
	});
	it('opens a retained resource while its newer page is downloading', async () => {
		const { resources, transport } = await setup({ records: [[key, present(1n)]] });
		transport.reads.records.set(key, { etag: syncEtag(2n), value: project });
		const paused = transport.reads.pause('changes');
		const pulling = resources.synchronize();
		await paused.started;
		const opened = await resources.open(identity);
		paused.release();
		await pulling;
		expect(opened).toEqual({ kind: 'ready', value: project });
	});
	it('does not wait for a retained collection body that is already refreshing', async () => {
		const { resources, transport } = await setup({ records: [[key, present(1n)]] });
		transport.reads.records.set(key, { etag: syncEtag(2n), value: project });
		const paused = transport.reads.pause('changes');
		const warming = resources.synchronize();
		await paused.started;
		await resources.prepare();
		const listed = resources.records.get(key);
		paused.release();
		await warming;
		expect(listed).toEqual(project);
	});
	it('downloads all records included in a complete page', async () => {
		const { resources, transport, accountId } = await setup();
		const user = workspaceRecordSchema.parse({
			type: 'users',
			value: {
				id: accountId,
				email: 'alice@example.test',
				displayName: 'Alice',
				role: 'USER',
				createdAt: '2026-09-07T10:00:00Z',
				updatedAt: '2026-09-07T10:00:00Z'
			}
		});
		const userIdentity = { type: 'users' as const, id: [accountId] as [string] };
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		transport.reads.records.set(workspaceResourceKey(userIdentity), {
			etag: syncEtag(2n),
			value: user
		});
		await resources.requireCollections();
		expect({
			listed: resources.records.get(key),
			unrelated: resources.access(userIdentity)
		}).toEqual({
			listed: project,
			unrelated: { kind: 'ready', value: user }
		});
	});
	it('clears exposed records when the account stops', async () => {
		const { resources, workspace } = await setup({ records: [[key, present(1n)]] });
		workspace.stop();
		expect([...resources.records]).toEqual([]);
	});
});

describe('a surface observing one record', () => {
	const observed = (view: ResourceViewController<WorkspaceResourceType>) =>
		$effect.root(() => {
			$effect(() => {
				void view.state;
			});
		});
	it('opens a cached record without reading device storage again', async () => {
		const { resources, replica } = await setup({ records: [[key, present(1n)]] });
		replica.readFailure = 'Device storage was read';
		expect(await resources.open(identity)).toEqual({ kind: 'ready', value: project });
	});
	it('shows a cached record at once', async () => {
		const { resources } = await setup({ records: [[key, present(1n)]] });
		expect(resources.view(identity).state).toEqual({ kind: 'ready', value: project.value });
	});
	it('downloads an uncached record once a surface observes it', async () => {
		const { resources, transport } = await setup();
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'ready', value: project.value });
		stop();
	});
	it('reports an uncached record as unavailable offline', async () => {
		const { resources } = await setup();
		resources.setOnline(false);
		expect(resources.view(identity).state).toEqual({ kind: 'unavailable' });
	});
	it('reports a record the server does not have as unavailable', async () => {
		const { resources } = await setup();
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'unavailable' });
		stop();
	});
	it('reports a failed download', async () => {
		const { resources, transport } = await setup();
		transport.reads.readFailure = 'Server down';
		const view = resources.view(identity);
		const stop = observed(view);
		flushSync();
		await expect.poll(() => view.state).toEqual({ kind: 'failure', message: 'Server down' });
		stop();
	});
	it('recovers a failed download on retry', async () => {
		const { resources, transport } = await setup();
		transport.reads.readFailure = 'Server down';
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		const view = resources.view(identity);
		await view.retry();
		transport.reads.readFailure = null;
		await view.retry();
		expect(view.state).toEqual({ kind: 'ready', value: project.value });
	});
	it('reports a server deletion', async () => {
		const { resources } = await setup({
			records: [[key, { kind: 'deleted', etag: syncEtag(2n) }]]
		});
		expect(resources.view(identity).state).toEqual({ kind: 'deleted' });
	});
});

describe('shared editor context', () => {
	it('captures the original version before a background refresh changes the cache', async () => {
		const { resources, replica, accountId, observe } = await setup({
			records: [[key, present(1n)]]
		});
		const draft = resources.draft(identity);
		await draft.read();
		resources.setOnline(false);
		replica.seed(accountId, [{ key, entry: present(2n) }]);
		await observe();
		await draft.stage(renamed('Changed'));
		expect(resources.pending[0]?.intent.base).toEqual({ etag: syncEtag(1n), value: project });
	});
	it('captures pending local ancestry separately from the server base', async () => {
		const { resources, queueCreation, observe } = await setup();
		resources.setOnline(false);
		const created = queueCreation();
		await observe();
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage(renamed('Changed'));
		expect(resources.pending.at(-1)?.intent).toMatchObject({
			base: null,
			basedOn: created.intent.operationId
		});
	});
	it('submits edits made while a background page is still downloading', async () => {
		const saved = subject.at(3n, 'Edited');
		const { resources, transport } = await setup({ records: [[key, present(1n)]] });
		transport.sendWrite = async (input) => {
			transport.reads.records.set(key, saved);
			return {
				kind: 'applied',
				receipt: { operationId: input.operationId, resource: { kind: 'found', snapshot: saved } }
			};
		};
		transport.reads.records.set(key, { etag: syncEtag(2n), value: project });
		const paused = transport.reads.pause('changes');
		const syncing = resources.synchronize();
		await paused.started;
		const draft = resources.draft(identity);
		await draft.read();
		await draft.stage(renamed('Edited'));
		paused.release();
		await syncing;
		await expect
			.poll(() => ({ pending: resources.pending, value: resources.records.get(key) }))
			.toEqual({ pending: [], value: saved.value });
	});
	it('does not adopt a new base when an editor read has been superseded', async () => {
		const { resources, transport } = await setup({
			records: [[key, present(1n)]],
			inventory: true
		});
		const draft = resources.draft(identity);
		draft.capture();
		transport.reads.records.set(key, { etag: syncEtag(2n), value: project });
		await resources.synchronize();
		await draft.read(() => false);
		resources.setOnline(false);
		const saved = await draft.stage(renamed('Later typing'));
		if (saved.kind !== 'saved') throw new Error(saved.message);
		expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
	});
	it('keeps a created resource visible until its settled projection arrives', async () => {
		const { resources, replica, accountId, queueCreation, observe } = await setup();
		resources.setOnline(false);
		const created = queueCreation();
		await observe();
		replica.pauseObservations();
		await replica.transaction(accountId, ['outbox', 'records', 'receipts'], async (tx) => {
			await tx.replace(await tx.entries(), []);
			const receipt = {
				operationId: created.intent.operationId,
				resource: { kind: 'found' as const, snapshot: { etag: syncEtag(2n), value: project } }
			};
			await tx.putReceipt(key, receipt);
			await tx.receiveResource(key, present(2n));
		});
		const beforePublication = resources.records.get(key);
		replica.resumeObservations();
		await observe();
		expect([beforePublication, resources.records.get(key)]).toEqual([project, project]);
	});
});

describe('optional workspace records', () => {
	it('reports absence after an initial successful journal pull', async () => {
		const { resources } = await setup();
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('does not invent absence before this device has a journal', async () => {
		const { resources } = await setup();
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('retains a journal failure instead of supplying defaults', async () => {
		const { resources, transport } = await setup();
		transport.reads.pullFailure = 'Connection interrupted';
		expect(await resources.lookup(identity)).toEqual({
			kind: 'failure',
			message: 'Connection interrupted'
		});
	});
	it('uses known absence offline', async () => {
		const { resources } = await setup({ inventory: true });
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'absent' });
	});
	it('keeps an unfinished inventory distinct from known absence', async () => {
		const { resources } = await setup({ inventory: false });
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'unavailable' });
	});
	it('keeps a server deletion distinct from absence', async () => {
		const { resources } = await setup({
			records: [[key, { kind: 'deleted', etag: syncEtag(1n) }]],
			inventory: true
		});
		resources.setOnline(false);
		expect(await resources.lookup(identity)).toEqual({ kind: 'deleted' });
	});
});

describe('drafting optional resources', () => {
	it('uses initial values only after a completed journal proves absence', async () => {
		const { resources } = await setup({ inventory: true });
		resources.setOnline(false);
		expect(await resources.draft(identity).readOrCreate(project)).toEqual({
			kind: 'ready',
			value: project.value
		});
	});
	it('does not turn an unknown offline inventory into a writable default', async () => {
		const { resources } = await setup();
		resources.setOnline(false);
		expect(await resources.draft(identity).readOrCreate(project)).toEqual({ kind: 'unavailable' });
	});
	it('retains the existing body instead of replacing it with initial values', async () => {
		const { resources } = await setup({ records: [[key, present(1n)]], inventory: true });
		resources.setOnline(false);
		expect(await resources.draft(identity).readOrCreate(subject.at(1n, 'Default').value)).toEqual({
			kind: 'ready',
			value: project.value
		});
	});
	it('can draft a new resource after its server tombstone', async () => {
		const { resources } = await setup({
			records: [[key, { kind: 'deleted', etag: syncEtag(1n) }]],
			inventory: true
		});
		resources.setOnline(false);
		const draft = resources.draft(identity);
		await draft.readOrCreate(project);
		expect(draft.value).toEqual(project.value);
	});
	it('does not replace a failed known resource read with writable initial values', async () => {
		const { resources, transport } = await setup();
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		transport.reads.pullFailure = 'Download failed';
		expect(await resources.draft(identity).readOrCreate(project)).toEqual({
			kind: 'failure',
			message: 'Download failed'
		});
	});
	it('refuses to capture an optional default before the inventory is known', async () => {
		const { resources } = await setup();
		expect(() => resources.draft(identity).captureOrCreate(project)).toThrow('not available');
	});
	it('refuses an optional default while the inventory is unfinished', async () => {
		const { resources } = await setup({ inventory: false });
		expect(() => resources.draft(identity).captureOrCreate(project)).toThrow('not available');
	});
	it('captures a known absent optional resource without starting a server read', async () => {
		const { resources, transport } = await setup({ inventory: true });
		const draft = resources.draft(identity);
		draft.captureOrCreate(project);
		expect({ value: draft.value, downloads: transport.reads.deliveredBodies }).toEqual({
			value: project.value,
			downloads: []
		});
	});
	it('keeps the displayed base when capturing an optional resource that is refreshing', async () => {
		const { resources } = await setup({ records: [[key, present(1n)]], inventory: true });
		const draft = resources.draft(identity);
		draft.captureOrCreate(project);
		resources.setOnline(false);
		const saved = await draft.stage(renamed('Changed'));
		if (saved.kind !== 'saved') throw new Error(saved.message);
		expect(resources.pending[0]?.intent.base?.etag).toEqual(syncEtag(1n));
	});
	it('does not create a default while an unknown resource is being downloaded', async () => {
		const { resources, transport } = await setup();
		const paused = transport.reads.pause(key);
		const opening = resources.open(identity);
		await paused.started;
		try {
			expect(() => resources.draft(identity).captureOrCreate(project)).toThrow('not available');
		} finally {
			paused.release();
			await opening;
		}
	});
});

describe('collections', () => {
	it('prepares a complete collection within the download capacity', async () => {
		const { resources, transport } = await setup();
		transport.reads.maxConcurrentReads = 32;
		const expected: [string, WorkspaceRecord][] = [];
		for (let index = 0; index < 70; index++) {
			const listed = replicaProject(index + 10, `Project ${index}`);
			expected.push([listed.key, listed.record]);
			transport.reads.records.set(listed.key, listed.at(BigInt(index + 1)));
		}
		await resources.requireCollections();
		const byKey = (records: readonly [string, WorkspaceRecord][]) =>
			[...records].sort(([left], [right]) => left.localeCompare(right));
		expect(byKey([...resources.records])).toEqual(byKey(expected));
	});
	it('marks a collection ready once its full inventory arrives', async () => {
		const { resources, transport } = await setup();
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		await resources.requireCollections();
		expect(resources.collectionReadiness()).toBe('ready');
	});
	it('reports the transport failure when required inventory cannot load', async () => {
		const { resources, transport } = await setup();
		transport.reads.records.set(key, { etag: syncEtag(1n), value: project });
		transport.reads.pullFailure = 'Disconnected';
		await expect(resources.requireCollections()).rejects.toThrow('Disconnected');
	});
	it('downloads records while an unrelated submission is stalled', async () => {
		const { resources, transport, queueCreation, observe } = await setup();
		const entered = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		transport.sendWrite = async (input) => {
			entered.resolve();
			await release.promise;
			return {
				kind: 'applied',
				receipt: {
					operationId: input.operationId,
					resource: { kind: 'found', snapshot: { etag: syncEtag(2n), value: project } }
				}
			};
		};
		resources.setOnline(false);
		queueCreation();
		await observe();
		const other = replicaProject(2);
		transport.reads.records.set(other.key, other.at(1n));
		resources.setOnline(true);
		const synchronizing = resources.synchronize();
		await entered.promise;
		try {
			await expect.poll(() => resources.records.has(other.key), { timeout: 500 }).toBe(true);
		} finally {
			release.resolve();
			await synchronizing;
		}
	});
});
