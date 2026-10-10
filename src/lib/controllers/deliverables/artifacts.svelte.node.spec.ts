import { expect, it } from 'vitest';
import { ArtifactActions } from './artifacts';
import { ArtifactActionStore } from '$lib/stores/deliverables/artifacts.svelte';
import {
	InMemoryArtifactActions,
	InMemoryArtifactDownloads
} from '$lib/testing/deliverables/fakes/artifact-actions';
import { browserExportFixture } from '$lib/testing/deliverables/fixtures/browser-export';
import type { ArtifactId } from '$lib/models/deliverables';
const id = '20000000-0000-4000-8000-000000000001' as ArtifactId;
const setup = async () => {
	const f = await browserExportFixture();
	const remote = new InMemoryArtifactActions();
	remote.available.add(id);
	const downloads = new InMemoryArtifactDownloads();
	const controller = new ArtifactActions(new ArtifactActionStore(), f.workspace, remote, downloads);
	return {
		...f,
		remote,
		downloads,
		controller,
		close: () => {
			controller.close();
			f.close();
		}
	};
};
it('downloads the selected artifact and releases its busy state', async () => {
	const f = await setup();
	try {
		const result = await f.controller.download(id);
		expect({ result, urls: f.downloads.urls, busy: f.controller.busy(id) }).toEqual({
			result: { kind: 'complete' },
			urls: [`https://storage.test/${id}.pdf`],
			busy: false
		});
	} finally {
		f.close();
	}
});
it('downloads the regenerated artifact', async () => {
	const f = await setup();
	try {
		const result = await f.controller.regenerate(id);
		expect({ result, urls: f.downloads.urls, busy: f.controller.busy(id) }).toEqual({
			result: { kind: 'complete' },
			urls: [`https://storage.test/regenerated-${id}.pdf`],
			busy: false
		});
	} finally {
		f.close();
	}
});
it('removes the selected artifact without starting a download', async () => {
	const f = await setup();
	try {
		const result = await f.controller.remove(id);
		expect({ result, available: [...f.remote.available], urls: f.downloads.urls }).toEqual({
			result: { kind: 'complete' },
			available: [],
			urls: []
		});
	} finally {
		f.close();
	}
});
it('reports a failed regeneration without downloading or retaining busy state', async () => {
	const f = await setup();
	try {
		f.remote.failure = new Error('Provider unavailable');
		const result = await f.controller.regenerate(id);
		expect({ result, urls: f.downloads.urls, busy: f.controller.busy(id) }).toEqual({
			result: { kind: 'failure', message: 'Could not regenerate the document.' },
			urls: [],
			busy: false
		});
	} finally {
		f.close();
	}
});
it('does not download a late response after the library closes', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.download(id);
		await gate.started;
		f.controller.close();
		gate.release();
		expect({ result: await pending, urls: f.downloads.urls, busy: f.controller.busy(id) }).toEqual({
			result: { kind: 'superseded' },
			urls: [],
			busy: false
		});
	} finally {
		f.close();
	}
});
it('does not download a regenerated artifact after account teardown', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.regenerate(id);
		await gate.started;
		f.workspace.stop();
		gate.release();
		expect({ result: await pending, urls: f.downloads.urls }).toEqual({
			result: { kind: 'superseded' },
			urls: []
		});
	} finally {
		f.close();
	}
});
it('keeps a pending action busy when another action on the same artifact finishes', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.download(id);
		await gate.started;
		await f.controller.regenerate(id);
		const stillBusy = f.controller.busy(id);
		gate.release();
		await pending;
		expect({ stillBusy, finishedBusy: f.controller.busy(id), urls: f.downloads.urls }).toEqual({
			stillBusy: true,
			finishedBusy: false,
			urls: [`https://storage.test/regenerated-${id}.pdf`, `https://storage.test/${id}.pdf`]
		});
	} finally {
		f.close();
	}
});
