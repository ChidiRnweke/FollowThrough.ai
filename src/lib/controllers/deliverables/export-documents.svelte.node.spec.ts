import { expect, it } from 'vitest';
import type { ProseMirrorDocument } from '$lib/models/notes';
import { browserExportFixture as setup } from '$lib/testing/deliverables/fixtures/browser-export';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { workspaceResourceKey } from '$lib/services/workspace/commands';
import { syncEtag } from '$lib/models/sync';
it.each(['merged', 'zip'] as const)(
	'preserves selected document order and paths in a %s export',
	async (bundle) => {
		const f = await setup();
		try {
			const second = noteBuilder({ id: testNoteId(2), title: 'Second' });
			f.transport.records.set(workspaceResourceKey({ type: 'notes', id: [second.id] }), {
				etag: syncEtag(2n),
				value: { type: 'notes', value: second }
			});
			await f.controller.open(f.note.projectId, [second.id, f.note.id]);
			const entries = [
				{ id: second.id, title: second.title, path: 'B/Second', depth: 1 },
				{ id: f.note.id, title: f.note.title, path: 'A/First', depth: 1 }
			];
			await f.controller.bundle({
				projectId: f.note.projectId,
				entries,
				title: 'Ordered',
				settings: f.input.settings,
				format: 'docx',
				bundle
			});
			expect({
				selected: f.controller.documents([second.id, f.note.id]).map((note) => note.id),
				submitted: bundle === 'zip' ? f.remote.bundles[0].entries : f.remote.documents[0].noteIds
			}).toEqual({
				selected: [second.id, f.note.id],
				submitted:
					bundle === 'zip'
						? [
								{ noteId: second.id, path: 'B/Second' },
								{ noteId: f.note.id, path: 'A/First' }
							]
						: [second.id, f.note.id]
			});
		} finally {
			f.close();
		}
	}
);
it('fails a missing selected document instead of submitting a partial bundle', async () => {
	const f = await setup();
	try {
		await f.controller.bundle({
			projectId: f.note.projectId,
			entries: [{ id: testNoteId(2), title: 'Missing', path: 'Missing', depth: 0 }],
			title: 'Bundle',
			settings: f.input.settings,
			format: 'pdf',
			bundle: 'zip'
		});
		expect({ requests: f.remote.bundles, error: f.controller.error }).toEqual({
			requests: [],
			error: 'The selected note is unavailable'
		});
	} finally {
		f.close();
	}
});
it('keeps SVGs and dimensions when draw.io rasterization is unavailable', async () => {
	const f = await setup();
	try {
		f.images.png = null;
		await f.controller.preview({
			...f.input,
			documents: [
				{
					document: { type: 'doc', content: [{ type: 'drawio', attrs: { diagramId: 'drawing' } }] }
				}
			],
			diagrams: [{ id: 'drawing', renderedSvg: '<svg viewBox="0 0 80 40"></svg>' }]
		});
		expect({
			svgs: f.remote.previews[0].diagramSvgs,
			pngs: f.remote.previews[0].diagramPngs,
			sizes: f.remote.previews[0].diagramSizes
		}).toEqual({
			svgs: { drawing: '<svg viewBox="0 0 80 40"></svg>' },
			pngs: {},
			sizes: { drawing: { width: 80, height: 40 } }
		});
	} finally {
		f.close();
	}
});
it('uses the export palette and document mode with Mermaid SVG fallback', async () => {
	const f = await setup();
	try {
		const source = 'flowchart LR\nA-->B\nstyle A fill:#ff0000';
		const documents: readonly { document: ProseMirrorDocument }[] = [
			{
				document: {
					type: 'doc',
					content: [{ type: 'mermaid', content: [{ type: 'text', text: source }] }]
				}
			}
		];
		f.images.png = null;
		const pending = f.controller.preview({
			...f.input,
			documents,
			settings: {
				...f.input.settings,
				diagramTheme: { base: 'dark', colors: { background: '#123456' } }
			}
		});
		f.renderer.complete(source, '<svg viewBox="0 0 80 40"></svg>');
		await pending;
		expect({
			summary: f.controller.inspect(documents),
			mode: f.renderer.requests[0].mode,
			background: f.renderer.requests[0].config.themeVariables.background,
			svgs: Object.values(f.remote.previews[0].diagramSvgs ?? {}),
			sizes: Object.values(f.remote.previews[0].diagramSizes ?? {})
		}).toEqual({
			summary: { hasDiagrams: true, hasSelfStyledDiagrams: true },
			mode: 'document',
			background: '#123456',
			svgs: ['<svg viewBox="0 0 80 40"></svg>'],
			sizes: [{ width: 80, height: 40 }]
		});
	} finally {
		f.close();
	}
});
