import { expect, it } from 'vitest';
import { defaultExportSettings } from '$lib/models/deliverables';
import { browserExportFixture as setup } from '$lib/testing/deliverables/fixtures/browser-export';
it('loads absent defaults without staging a workspace write', async () => {
	const fixture = await setup();
	try {
		expect({ loaded: fixture.loaded, pending: await fixture.pending() }).toEqual({
			loaded: { kind: 'ready', settings: defaultExportSettings },
			pending: []
		});
	} finally {
		fixture.close();
	}
});
it('generates the selected document with its resolved diagrams and layout', async () => {
	const f = await setup();
	try {
		await f.controller.generate({ ...f.input, format: 'docx' });
		expect({
			requests: f.remote.documents,
			result: f.controller.result,
			busy: f.controller.busy
		}).toEqual({
			requests: [
				{
					projectId: f.note.projectId,
					noteIds: [f.note.id],
					title: 'Review',
					format: 'docx',
					settings: defaultExportSettings,
					diagramSvgs: {},
					diagramPngs: {},
					diagramSizes: {}
				}
			],
			result: { url: 'https://storage.test/document.pdf', fileCount: 1 },
			busy: false
		});
	} finally {
		f.close();
	}
});
it('previews only referenced draw.io diagrams at their saved dimensions', async () => {
	const f = await setup();
	try {
		await f.controller.preview({
			...f.input,
			documents: [
				{
					document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'drawing' } }] }
				}
			],
			diagrams: [
				{ id: 'drawing', renderedSvg: '<svg viewBox="0 0 80 40"></svg>' },
				{ id: 'unreferenced', renderedSvg: '<svg viewBox="0 0 1 1"></svg>' }
			]
		});
		expect({ request: f.remote.previews[0], preview: [...f.urls.active.values()] }).toEqual({
			request: {
				projectId: f.note.projectId,
				noteIds: [f.note.id],
				title: 'Review',
				settings: defaultExportSettings,
				diagramSvgs: {},
				diagramPngs: { drawing: 'data:image/png;base64,cG5n' },
				diagramSizes: { drawing: { width: 80, height: 40 } }
			},
			preview: ['JVBERi0=']
		});
	} finally {
		f.close();
	}
});
it('releases a replaced preview and the final preview when closed', async () => {
	const f = await setup();
	try {
		await f.controller.preview(f.input);
		const first = f.controller.previewUrl;
		await f.controller.preview(f.input);
		const replacement = [...f.urls.active.keys()];
		f.controller.close();
		expect({
			first,
			replacement,
			remaining: [...f.urls.active],
			url: f.controller.previewUrl
		}).toEqual({
			first: 'blob:preview-1',
			replacement: ['blob:preview-2'],
			remaining: [],
			url: ''
		});
	} finally {
		f.close();
	}
});
it('does not create a preview URL when its response arrives after closing', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.preview(f.input);
		await gate.started;
		f.controller.close();
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
it('does not publish a generated document after account teardown', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.generate({ ...f.input, format: 'pdf' });
		await gate.started;
		f.workspace.stop();
		gate.release();
		await pending;
		expect({ result: f.controller.result, busy: f.controller.busy }).toEqual({
			result: null,
			busy: false
		});
	} finally {
		f.close();
	}
});
it('does not publish an older export into a reopened dialog', async () => {
	const f = await setup();
	try {
		const gate = f.remote.pause();
		const pending = f.controller.generate({ ...f.input, format: 'pdf' });
		await gate.started;
		await f.controller.open(f.note.projectId);
		gate.release();
		await pending;
		expect({
			result: f.controller.result,
			ready: f.controller.ready,
			busy: f.controller.busy
		}).toEqual({ result: null, ready: true, busy: false });
	} finally {
		f.close();
	}
});
it('reports a generation failure and releases busy state for retry', async () => {
	const f = await setup();
	try {
		f.remote.failure = new Error('Storage unavailable');
		await f.controller.generate({ ...f.input, format: 'pdf' });
		expect({
			error: f.controller.error,
			result: f.controller.result,
			busy: f.controller.busy
		}).toEqual({ error: 'Storage unavailable', result: null, busy: false });
	} finally {
		f.close();
	}
});
it('loads selected notes and preserves relative paths when generating a bundle', async () => {
	const f = await setup();
	try {
		await f.controller.bundle({
			projectId: f.note.projectId,
			entries: [{ id: f.note.id, title: f.note.title, path: 'Meetings/Review', depth: 1 }],
			title: ' Review ',
			settings: defaultExportSettings,
			format: 'pdf',
			bundle: 'zip'
		});
		expect({ requests: f.remote.bundles, result: f.controller.result }).toEqual({
			requests: [
				{
					projectId: f.note.projectId,
					entries: [{ noteId: f.note.id, path: 'Meetings/Review' }],
					title: 'Review',
					settings: defaultExportSettings,
					format: 'pdf',
					diagramSvgs: {},
					diagramPngs: {},
					diagramSizes: {}
				}
			],
			result: { url: 'https://storage.test/bundle.zip', fileCount: 1 }
		});
	} finally {
		f.close();
	}
});
it('does not submit an export after closing during diagram rendering', async () => {
	const f = await setup();
	try {
		const source = 'flowchart LR\nA-->B';
		const pending = f.controller.generate({
			...f.input,
			format: 'pdf',
			documents: [
				{
					document: {
						type: 'doc',
						content: [{ type: 'mermaid', content: [{ type: 'text', text: source }] }]
					}
				}
			]
		});
		f.controller.close();
		f.renderer.complete(source, '<svg viewBox="0 0 80 40"></svg>');
		await pending;
		expect({ requests: f.remote.documents, result: f.controller.result }).toEqual({
			requests: [],
			result: null
		});
	} finally {
		f.close();
	}
});
it('reports failed diagram rendering without submitting an incomplete export', async () => {
	const f = await setup();
	try {
		const source = 'invalid';
		const pending = f.controller.generate({
			...f.input,
			format: 'pdf',
			documents: [
				{
					document: {
						type: 'doc',
						content: [{ type: 'mermaid', content: [{ type: 'text', text: source }] }]
					}
				}
			]
		});
		f.renderer.fail(source);
		await pending;
		expect({
			requests: f.remote.documents,
			error: f.controller.error,
			busy: f.controller.busy
		}).toEqual({ requests: [], error: 'A diagram could not be rendered for export', busy: false });
	} finally {
		f.close();
	}
});
