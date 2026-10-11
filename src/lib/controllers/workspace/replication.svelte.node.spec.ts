import { afterEach, describe, expect, it } from 'vitest';
import { syncCursorSchema } from '$lib/models/sync';
import type { WorkspaceController } from './workspace';
import { workspaceFixture } from '$lib/testing/workspace/fixtures/workspace';
import { replicaProject } from '$lib/testing/workspace/fixtures/replica-records';

const started: WorkspaceController[] = [];
afterEach(() => {
	for (const workspace of started.splice(0)) workspace.stop();
});
const setup = (options: Parameters<typeof workspaceFixture>[0] = {}) => {
	const fixture = workspaceFixture(options);
	started.push(fixture.workspace);
	return fixture;
};
const note = replicaProject(1);
const first = note.at(1n, 'First copy');
const second = note.at(2n, 'Second copy');

describe('page replication', () => {
	it('does not claim complete inventory before synchronization', async () => {
		const resources = await setup().start();
		expect(resources.availability).toBe('unknown');
	});
	it('downloads bodies with the first page and none for an unchanged checkpoint', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		await resources.synchronize();
		await resources.synchronize();
		expect(transport.reads.deliveredBodies).toEqual([note.key]);
	});
	it('commits a complete inventory without a second download phase', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		await resources.synchronize();
		expect(resources.availability).toBe('complete');
	});
	it('recognizes an empty server inventory as complete', async () => {
		const resources = await setup().start();
		await resources.synchronize();
		expect(resources.availability).toBe('complete');
	});
	it('follows page checkpoints until every body has been stored', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.pageSize = 2;
		const projects = Array.from({ length: 7 }, (_, index) => replicaProject(index + 1));
		for (const [index, project] of projects.entries())
			transport.reads.records.set(project.key, project.at(BigInt(index + 1)));
		await resources.synchronize();
		expect({
			names: projects.map((project) => {
				const access = resources.access(project.identity);
				return access.kind === 'ready' && access.value.type === 'projects'
					? access.value.value.name
					: access.kind;
			}),
			availability: resources.availability
		}).toEqual({
			names: projects.map((project) => project.record.value.name),
			availability: 'complete'
		});
	});
	it('opens a replicated record offline after a restart', async () => {
		const { replica, transport, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		await resources.synchronize();
		const restarted = await setup({ replica, transport }).start(false);
		expect({
			opened: await restarted.open(note.identity),
			accessed: restarted.access(note.identity)
		}).toEqual({
			opened: { kind: 'ready', value: first.value },
			accessed: { kind: 'ready', value: first.value }
		});
	});
	it('opens cached content while a newer page is still downloading', async () => {
		const { replica, transport, accountId, start } = setup();
		replica.seed(accountId, [{ key: note.key, entry: { kind: 'present', snapshot: first } }]);
		const resources = await start();
		transport.reads.records.set(note.key, second);
		const gate = transport.reads.pause('changes');
		const pulling = resources.synchronize();
		await gate.started;
		const opened = await resources.open(note.identity);
		const accessed = resources.access(note.identity);
		gate.release();
		await pulling;
		expect({ opened, accessed }).toEqual({
			opened: { kind: 'ready', value: first.value },
			accessed: { kind: 'ready', value: first.value }
		});
	});
	it('preserves cached content when synchronization fails', async () => {
		const { replica, transport, accountId, start } = setup();
		replica.seed(accountId, [{ key: note.key, entry: { kind: 'present', snapshot: first } }]);
		const resources = await start();
		transport.reads.pullFailure = 'Disconnected';
		await resources.synchronize();
		expect({ access: resources.access(note.identity), status: resources.readStatus }).toEqual({
			access: { kind: 'ready', value: first.value },
			status: { kind: 'failure', message: 'Disconnected' }
		});
	});
	it('applies an authoritative tombstone', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		await resources.synchronize();
		transport.reads.records.delete(note.key);
		await resources.synchronize();
		expect(resources.access(note.identity)).toEqual({ kind: 'deleted' });
	});
	it('retains a newer version another tab stored while an older page arrives', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		const gate = transport.reads.pause('changes');
		const pulling = resources.synchronize();
		await gate.started;
		replica.seed(accountId, [{ key: note.key, entry: { kind: 'present', snapshot: second } }]);
		gate.release();
		await pulling;
		expect(resources.access(note.identity)).toEqual({ kind: 'ready', value: second.value });
	});
	it('does not publish a page after the account stops', async () => {
		const { replica, transport, accountId, workspace, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		const gate = transport.reads.pause('changes');
		const pulling = resources.synchronize();
		await gate.started;
		workspace.stop();
		gate.release();
		await pulling;
		expect(replica.resource(accountId, note.key)).toBeUndefined();
	});
	it('does not advance the checkpoint when page persistence fails', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		replica.writeFailure = 'Storage full';
		await resources.synchronize();
		expect((await replica.read(accountId)).cache).toMatchObject({ cursor: null, records: [] });
	});
	it('does not advance past a malformed server record', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		transport.reads.failures.set(note.key, 'Unreadable record');
		await resources.synchronize();
		expect((await replica.read(accountId)).cache).toMatchObject({ cursor: null, records: [] });
	});
	it('does not advance past a page that answers for a different resource', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, replicaProject(2).at(1n));
		await resources.synchronize();
		expect({
			cache: (await replica.read(accountId)).cache,
			status: resources.readStatus
		}).toMatchObject({
			cache: { cursor: null, records: [] },
			status: { kind: 'failure', message: 'The server page returned a different resource' }
		});
	});
});

describe('targeted downloads', () => {
	it('opens an uncached record without waiting for the inventory download', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		const paused = transport.reads.pause('changes');
		const pulling = resources.synchronize();
		await paused.started;
		const result = await resources.open(note.identity);
		paused.release();
		await pulling;
		expect(result).toEqual({ kind: 'ready', value: first.value });
	});
	it('does not establish inventory completeness', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		await resources.open(note.identity);
		expect((await replica.read(accountId)).cache).toMatchObject({
			cursor: null,
			inventoryComplete: false
		});
	});
	it('does not let an older response replace a newer stored version', async () => {
		const { replica, transport, accountId, start } = setup();
		const resources = await start();
		transport.reads.records.set(note.key, first);
		const paused = transport.reads.pause(note.key);
		const opening = resources.open(note.identity);
		await paused.started;
		replica.seed(accountId, [{ key: note.key, entry: { kind: 'present', snapshot: second } }]);
		paused.release();
		expect(await opening).toEqual({ kind: 'ready', value: second.value });
	});
	it('remembers that the server has no such record until the next read', async () => {
		const resources = await setup().start();
		const opened = await resources.open(note.identity);
		expect({ opened, accessed: resources.access(note.identity) }).toEqual({
			opened: { kind: 'unavailable' },
			accessed: { kind: 'unavailable' }
		});
	});
	it('reports a failed download', async () => {
		const { transport, start } = setup();
		const resources = await start();
		transport.reads.readFailure = 'Disconnected';
		const opened = await resources.open(note.identity);
		expect({
			opened,
			accessed: resources.access(note.identity),
			failures: resources.failedDownloads
		}).toEqual({
			opened: { kind: 'failure', message: 'Disconnected' },
			accessed: { kind: 'failure', message: 'Disconnected' },
			failures: 1
		});
	});
	it('keeps an unknown record unavailable offline without a network request', async () => {
		const { transport, start } = setup();
		transport.reads.readFailure = 'Network must not be used';
		const resources = await start(false);
		const opened = await resources.open(note.identity);
		expect({ opened, accessed: resources.access(note.identity) }).toEqual({
			opened: { kind: 'unavailable' },
			accessed: { kind: 'unavailable' }
		});
	});
	it('does not retain a delayed download failure after the account stops', async () => {
		const { transport, workspace, start } = setup();
		const resources = await start();
		const gate = transport.reads.pause(note.key);
		const opening = resources.open(note.identity);
		await gate.started;
		workspace.stop();
		transport.reads.readFailure = 'Disconnected';
		gate.release();
		expect({
			opened: await opening,
			failures: resources.failedDownloads,
			records: resources.records.size,
			status: resources.readStatus
		}).toEqual({
			opened: { kind: 'unavailable' },
			failures: 0,
			records: 0,
			status: { kind: 'stopped' }
		});
	});
});

it('reads the stored checkpoint when the account restarts', async () => {
	const { replica, accountId, start } = setup();
	replica.seed(accountId, [], { cursor: syncCursorSchema.parse('4'), inventoryComplete: true });
	const resources = await start(false);
	expect(resources.availability).toBe('complete');
});
