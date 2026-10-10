import { expect, it } from 'vitest';
import { ArtifactActions } from './artifacts';
import { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import {
	InMemoryArtifactActions,
	InMemoryArtifactDownloads
} from '$lib/testing/deliverables/fakes/artifact-actions';
import { browserExportFixture } from '$lib/testing/deliverables/fixtures/browser-export';
import type { ArtifactId } from '$lib/models/deliverables';
import { syncEtag, type SynchronizationResult } from '$lib/models/sync';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
const id = '20000000-0000-4000-8000-000000000001' as ArtifactId;
const setup = async () => {
	const f = await browserExportFixture();
	const remote = new InMemoryArtifactActions();
	remote.available.add(id);
	const navigation = new InMemoryArtifactDownloads();
	const actions = new ArtifactActions(new ArtifactActionStore(), {
		...f.dependencies,
		remote,
		navigation
	});
	return {
		...f,
		remote,
		navigation,
		actions,
		close: () => {
			actions.close();
			f.close();
		}
	};
};
it('reports a refresh failure after regeneration and permits a successful retry', async () => {
	const f = await setup();
	try {
		f.transport.pullFailure = 'Refresh unavailable';
		const failed = await f.actions.regenerate(id);
		f.transport.pullFailure = null;
		const retried = await f.actions.regenerate(id);
		expect({ failed, retried, busy: f.actions.busy(id), downloads: f.navigation.urls }).toEqual({
			failed: {
				kind: 'failure',
				message: 'Could not regenerate the document. Refresh unavailable'
			},
			retried: { kind: 'complete' },
			busy: false,
			downloads: [
				`https://storage.test/regenerated-${id}.pdf`,
				`https://storage.test/regenerated-${id}.pdf`
			]
		});
	} finally {
		f.close();
	}
});
it('obtains a fresh pass after a pull that predates the mutation', async () => {
	const f = await setup();
	try {
		const key = workspaceResourceKey({ type: 'notes', id: [f.note.id] });
		const older = Promise.withResolvers<SynchronizationResult>();
		f.workspace.cacheState.update({ checking: older.promise });
		const pending = f.actions.remove(id);
		f.transport.records.set(key, {
			etag: syncEtag(2n),
			value: { type: 'notes', value: { ...f.note, title: 'After mutation' } }
		});
		older.resolve({ kind: 'complete' });
		const result = await pending;
		const stored = await f.workspace.cache.load(f.note.userId);
		expect({ result, record: stored.records.find((row) => row.key === key)?.entry }).toEqual({
			result: { kind: 'complete' },
			record: {
				kind: 'present',
				snapshot: {
					etag: syncEtag(2n),
					value: { type: 'notes', value: { ...f.note, title: 'After mutation' } }
				}
			}
		});
	} finally {
		f.close();
	}
});
it.each(['close', 'account', 'session'] as const)(
	'does not commit a late artifact refresh after %s replacement',
	async (kind) => {
		const f = await setup();
		try {
			const before = await f.workspace.cache.load(f.note.userId);
			f.transport.records.set(workspaceResourceKey({ type: 'notes', id: [f.note.id] }), {
				etag: syncEtag(2n),
				value: { type: 'notes', value: { ...f.note, title: 'Late' } }
			});
			const gate = f.transport.pause('changes');
			const pending = f.actions.remove(id);
			await gate.started;
			if (kind === 'close') f.actions.close();
			else f.workspace.replace(kind === 'account' ? 'replacement' : f.note.userId);
			gate.release();
			const result = await pending;
			expect({
				result,
				stored: await f.workspace.cache.load(f.note.userId),
				downloads: f.navigation.urls
			}).toEqual({ result: { kind: 'superseded' }, stored: before, downloads: [] });
		} finally {
			f.close();
		}
	}
);
it('keeps an atomic cache failure explicit without advancing its checkpoint', async () => {
	const f = await setup();
	try {
		const before = await f.workspace.cache.load(f.note.userId);
		f.workspace.cache.writeFailure = 'Device full';
		const result = await f.actions.remove(id);
		expect({ result, stored: await f.workspace.cache.load(f.note.userId) }).toEqual({
			result: { kind: 'failure', message: 'Could not delete the artifact. Device full' },
			stored: before
		});
	} finally {
		f.close();
	}
});
it('allows different artifacts to finish without releasing each other’s busy state', async () => {
	const f = await setup();
	try {
		const other = '20000000-0000-4000-8000-000000000002' as ArtifactId;
		f.remote.available.add(other);
		const gate = f.remote.pause();
		const pending = f.actions.download(id);
		await gate.started;
		await f.actions.download(other);
		const firstBusy = f.actions.busy(id);
		gate.release();
		await pending;
		expect({ firstBusy, downloads: f.navigation.urls }).toEqual({
			firstBusy: true,
			downloads: [`https://storage.test/${other}.pdf`, `https://storage.test/${id}.pdf`]
		});
	} finally {
		f.close();
	}
});
it('does not overwrite a newer cached version with a delayed pull', async () => {
	const f = await setup();
	try {
		const key = workspaceResourceKey({ type: 'notes', id: [f.note.id] });
		const gate = f.transport.pause('changes');
		const pending = f.actions.regenerate(id);
		await gate.started;
		const entry = {
			kind: 'present' as const,
			snapshot: {
				etag: syncEtag(5n),
				value: { type: 'notes' as const, value: { ...f.note, title: 'Newer' } }
			}
		};
		await f.workspace.cache.commit(f.note.userId, { put: [{ key, entry }], remove: [] });
		gate.release();
		await pending;
		expect(
			(await f.workspace.cache.load(f.note.userId)).records.find((row) => row.key === key)?.entry
		).toEqual(entry);
	} finally {
		f.close();
	}
});
