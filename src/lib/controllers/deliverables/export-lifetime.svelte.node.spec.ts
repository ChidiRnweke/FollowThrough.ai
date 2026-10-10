import { expect, it } from 'vitest';
import { browserExportFixture as setup } from '$lib/testing/deliverables/fixtures/browser-export';
it.each(['account', 'session'] as const)(
	'rejects export after %s replacement before submission',
	async (kind) => {
		const f = await setup();
		try {
			f.workspace.replace(kind === 'account' ? 'another-account' : f.note.userId);
			await f.controller.generate({ ...f.input, format: 'pdf' });
			expect({
				ready: f.controller.ready,
				result: f.controller.result,
				requests: f.remote.documents
			}).toEqual({ ready: false, result: null, requests: [] });
		} finally {
			f.close();
		}
	}
);
it('rejects a project different from the opened settings', async () => {
	const f = await setup();
	try {
		await f.controller.generate({ ...f.input, projectId: 'replacement', format: 'pdf' });
		expect({ error: f.controller.error, requests: f.remote.documents }).toEqual({
			error: 'The export belongs to another project',
			requests: []
		});
	} finally {
		f.close();
	}
});
it('excludes generation and bundle requests while preview is pending', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.preview(f.input);
		await gate.started;
		await f.controller.generate({ ...f.input, format: 'pdf' });
		await f.controller.bundle({
			projectId: f.note.projectId,
			entries: [{ id: f.note.id, title: f.note.title, path: 'Review', depth: 0 }],
			title: 'Bundle',
			format: 'pdf',
			bundle: 'zip',
			settings: f.input.settings
		});
		const busy = f.controller.busy;
		gate.release();
		await pending;
		expect({
			busy,
			documents: f.remote.documents,
			bundles: f.remote.bundles,
			previews: f.remote.previews.length
		}).toEqual({ busy: true, documents: [], bundles: [], previews: 1 });
	} finally {
		f.close();
	}
});
it('dismisses the nested preview and releases its URL', async () => {
	const f = await setup();
	try {
		await f.controller.preview(f.input);
		f.controller.dismissPreview();
		expect({
			urls: [...f.urls.active],
			preview: f.controller.previewUrl,
			ready: f.controller.ready
		}).toEqual({ urls: [], preview: '', ready: true });
	} finally {
		f.close();
	}
});
it('does not publish a dismissed in-flight preview', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.preview(f.input);
		await gate.started;
		f.controller.dismissPreview();
		gate.release();
		await pending;
		expect({
			urls: [...f.urls.active],
			preview: f.controller.previewUrl,
			busy: f.controller.busy
		}).toEqual({ urls: [], preview: '', busy: false });
	} finally {
		f.close();
	}
});
it('retries a failed generation successfully', async () => {
	const f = await setup();
	try {
		f.remote.failure = new Error('Storage offline');
		await f.controller.generate({ ...f.input, format: 'pdf' });
		f.remote.failure = undefined;
		await f.controller.generate({ ...f.input, format: 'pdf' });
		expect({
			error: f.controller.error,
			result: f.controller.result,
			busy: f.controller.busy
		}).toEqual({
			error: '',
			result: { url: 'https://storage.test/document.pdf', fileCount: 1 },
			busy: false
		});
	} finally {
		f.close();
	}
});
it('does not let an old completion clear the busy state of a reopened dialog', async () => {
	const f = await setup();
	try {
		const old = f.remote.pause();
		const first = f.controller.generate({ ...f.input, format: 'pdf' });
		await old.started;
		await f.controller.open(f.note.projectId);
		const latest = f.remote.pause();
		const second = f.controller.preview(f.input);
		await latest.started;
		old.release();
		await first;
		const busy = f.controller.busy;
		latest.release();
		await second;
		expect({ busy, result: f.controller.result, previews: [...f.urls.active.values()] }).toEqual({
			busy: true,
			result: null,
			previews: ['JVBERi0=']
		});
	} finally {
		f.close();
	}
});
it('does not adopt settings from a replaced project after a delayed local read', async () => {
	const f = await setup();
	try {
		const gate = f.workspace.cache.pauseNextLoad();
		const old = f.controller.open(f.note.projectId);
		await gate.started;
		const current = await f.controller.open('replacement');
		gate.release();
		expect({ old: await old, current, ready: f.controller.ready }).toEqual({
			old: { kind: 'superseded' },
			current: { kind: 'ready', settings: f.input.settings },
			ready: true
		});
	} finally {
		f.close();
	}
});
it('reports a failed local settings read instead of loading defaults', async () => {
	const f = await setup();
	try {
		f.workspace.repository.snapshotFailure = 'Device read failed';
		const result = await f.controller.open(f.note.projectId);
		expect({ result, ready: f.controller.ready }).toEqual({
			result: { kind: 'failure', message: 'Device read failed' },
			ready: false
		});
	} finally {
		f.close();
	}
});
it('releases the old account preview when its mounted dialog rebinds', async () => {
	const f = await setup();
	try {
		await f.controller.preview(f.input);
		f.workspace.replace();
		await f.controller.open(f.note.projectId);
		expect({
			urls: [...f.urls.active],
			preview: f.controller.previewUrl,
			ready: f.controller.ready
		}).toEqual({ urls: [], preview: '', ready: true });
	} finally {
		f.close();
	}
});
