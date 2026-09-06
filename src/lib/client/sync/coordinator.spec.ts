import { describe, expect, it } from 'vitest';
import { syncEtag } from '$lib/models/sync';
import { InMemorySyncCache, InMemorySyncTransport } from '$lib/testing/sync/fakes/in-memory-sync';
import { SyncReadCoordinator } from './coordinator';

const setup = () => {
	const repository = new InMemorySyncCache<string>();
	const transport = new InMemorySyncTransport<string>();
	const coordinator = new SyncReadCoordinator('user-a', { repository, transport });
	return { repository, transport, coordinator };
};
const first = { etag: syncEtag(1n), value: 'First copy' };
const second = { etag: syncEtag(2n), value: 'Second copy' };

describe('workspace cache coordination', () => {
	it('does not claim a workspace is available before learning its inventory', () => {
		expect(setup().coordinator.availability).toBe('unknown');
	});

	it('reports incomplete warming until all inventoried content is stored', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		await coordinator.refresh();
		expect(coordinator.availability).toBe('partial');
	});

	it('recognizes a successfully checked empty workspace as complete', async () => {
		const { coordinator } = setup();
		await coordinator.refresh();
		expect(coordinator.availability).toBe('complete');
	});

	it('reports complete warming after all inventoried content is stored', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		await coordinator.refresh();
		await coordinator.warm();
		expect(coordinator.availability).toBe('complete');
	});
	it('downloads current content initially and no bodies on unchanged synchronization', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		await coordinator.refresh();
		await coordinator.warm();
		await coordinator.refresh();
		await coordinator.warm();
		expect(transport.deliveredBodies).toEqual(['note:1']);
	});

	it('opens a warmed but previously unvisited record offline after reload', async () => {
		const { repository, transport, coordinator } = setup();
		transport.records.set('note:1', first);
		await coordinator.refresh();
		await coordinator.warm();
		const reopened = new SyncReadCoordinator('user-a', { repository, transport });
		reopened.setOnline(false);
		expect(await reopened.open('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('retains saved content when the inventory request fails', async () => {
		const { transport, coordinator } = setup();
		await coordinator.accept('note:1', first);
		transport.inventoryFailure = 'Server unavailable';
		await coordinator.refresh();
		expect(coordinator.access('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('removes a record only after receiving the complete authoritative inventory', async () => {
		const { coordinator } = setup();
		await coordinator.accept('note:1', first);
		await coordinator.refresh();
		coordinator.setOnline(false);
		expect(coordinator.access('note:1')).toEqual({ kind: 'unavailable' });
	});

	it('shares a background download with foreground demand', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', second);
		await coordinator.accept('note:1', first);
		await coordinator.refresh();
		const gate = transport.pause('note:1');
		const warming = coordinator.warm();
		await gate.started;
		const opened = coordinator.open('note:1');
		gate.release();
		await Promise.all([warming, opened]);
		expect(transport.deliveredBodies).toEqual(['note:1']);
	});

	it('lets foreground demand bypass a different background download', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		transport.records.set('note:2', second);
		await coordinator.refresh();
		const gate = transport.pause('note:1');
		const warming = coordinator.warm();
		await gate.started;
		const opened = await coordinator.open('note:2');
		gate.release();
		await warming;
		expect(opened).toEqual({ kind: 'ready', value: 'Second copy' });
	});

	it('keeps an updating object behind the read barrier until its live value arrives', async () => {
		const { transport, coordinator } = setup();
		await coordinator.accept('note:1', first);
		transport.records.set('note:1', second);
		await coordinator.refresh();
		const gate = transport.pause('note:1');
		const warming = coordinator.warm();
		await gate.started;
		const during = coordinator.access('note:1');
		const opened = coordinator.open('note:1');
		gate.release();
		await warming;
		expect({ during, after: await opened }).toEqual({
			during: { kind: 'wait' },
			after: { kind: 'ready', value: 'Second copy' }
		});
	});

	it('allows the retained copy offline while a background refresh is in flight', async () => {
		const { transport, coordinator } = setup();
		await coordinator.accept('note:1', first);
		transport.records.set('note:1', second);
		await coordinator.refresh();
		const gate = transport.pause('note:1');
		const warming = coordinator.warm();
		await gate.started;
		coordinator.setOnline(false);
		const opened = await coordinator.open('note:1');
		gate.release();
		await warming;
		expect(opened).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('does not replace an accepted mutation with a late read response', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		await coordinator.refresh();
		const gate = transport.pause('note:1');
		const opened = coordinator.open('note:1');
		await gate.started;
		await coordinator.accept('note:1', second);
		gate.release();
		expect(await opened).toEqual({ kind: 'ready', value: 'Second copy' });
	});

	it('rechecks an inventory that predates an accepted creation', async () => {
		const { transport, coordinator } = setup();
		const gate = transport.pause('inventory');
		const refreshing = coordinator.refresh();
		await gate.started;
		transport.records.set('note:1', first);
		await coordinator.accept('note:1', first);
		gate.release();
		await refreshing;
		expect(coordinator.access('note:1')).toEqual({ kind: 'ready', value: 'First copy' });
	});

	it('does not expose another account’s persisted records', async () => {
		const { repository, transport, coordinator } = setup();
		await coordinator.accept('note:1', first);
		const other = new SyncReadCoordinator('user-b', { repository, transport });
		other.setOnline(false);
		expect(await other.open('note:1')).toEqual({ kind: 'unavailable' });
	});

	it('does not restore private data when a request finishes after logout', async () => {
		const { transport, coordinator } = setup();
		transport.records.set('note:1', first);
		const gate = transport.pause('note:1');
		const opened = coordinator.open('note:1');
		await gate.started;
		coordinator.stop();
		gate.release();
		expect(await opened).toEqual({ kind: 'unavailable' });
	});

	it('reports a live missing record as unavailable', async () => {
		const { coordinator } = setup();
		expect(await coordinator.open('missing')).toEqual({ kind: 'unavailable' });
	});

	it('does not claim that a downloaded record was stored when persistence fails', async () => {
		const { repository, transport, coordinator } = setup();
		transport.records.set('note:1', first);
		repository.writeFailure = 'Storage full';
		expect(await coordinator.open('note:1')).toEqual({ kind: 'failure', message: 'Storage full' });
	});
});
