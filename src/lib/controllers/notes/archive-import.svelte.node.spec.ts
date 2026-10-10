import { expect, it } from 'vitest';
import { ArchiveImports } from './archive-import';
import { ArchiveImportStore } from '$lib/stores/notes/archive-import.svelte';
import { InMemoryArchiveImportUpload } from '$lib/testing/notes/fakes/archive-import';
import { browserExportFixture } from '$lib/testing/deliverables/fixtures/browser-export';
import { noteBuilder, testNoteId } from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import { syncEtag } from '$lib/models/sync';
import type { ArchiveImportResponse, ImportMarkdownArchiveOutput } from '$lib/models/projects';
const partialReport: ImportMarkdownArchiveOutput = {
	importedNoteIds: [testNoteId(2)],
	createdFolderIds: [],
	skipped: [{ path: 'image.png', reason: 'Not Markdown' }],
	failed: [{ path: 'Broken.md', message: 'Body could not be saved' }],
	unmappedFrontmatterKeys: ['tags'],
	unresolvedLinks: [{ path: 'Valid.md', target: 'Unknown', reason: 'missing' }]
};
const setup = async (
	result: ArchiveImportResponse = { kind: 'report', report: partialReport },
	accepted = true
) => {
	const f = await browserExportFixture();
	const imported = noteBuilder({ id: testNoteId(2), title: 'Imported' });
	const upload = new InMemoryArchiveImportUpload({ accepted, result }, () =>
		f.transport.records.set(workspaceResourceKey({ type: 'notes', id: [imported.id] }), {
			etag: syncEtag(2n),
			value: { type: 'notes', value: imported }
		})
	);
	const controller = new ArchiveImports(new ArchiveImportStore(), f.workspace, upload);
	const file = new File(['archive'], 'notes.zip', { type: 'application/zip' });
	return {
		...f,
		upload,
		controller,
		file,
		imported,
		close: () => {
			controller.reset();
			f.close();
		}
	};
};
it('synchronizes successful notes and preserves the full partial-import report', async () => {
	const f = await setup();
	try {
		await f.controller.import(f.file, f.note.projectId);
		expect({
			report: f.controller.report,
			title: f.resources.views.get('notes', f.imported.id)?.title,
			busy: f.controller.busy
		}).toEqual({ report: partialReport, title: 'Imported', busy: false });
	} finally {
		f.close();
	}
});
it('synchronizes an accepted import even when its report could not be decoded', async () => {
	const f = await setup({ kind: 'failure', message: 'Unreadable report' });
	try {
		await f.controller.import(f.file, f.note.projectId);
		expect({
			error: f.controller.error,
			title: f.resources.views.get('notes', f.imported.id)?.title,
			report: f.controller.report
		}).toEqual({ error: 'Unreadable report', title: 'Imported', report: undefined });
	} finally {
		f.close();
	}
});
it('does not synchronize after a rejected upload', async () => {
	const f = await setup({ kind: 'failure', message: 'Invalid archive' }, false);
	try {
		await f.controller.import(f.file, f.note.projectId);
		expect({
			error: f.controller.error,
			imported: f.resources.views.get('notes', f.imported.id),
			report: f.controller.report
		}).toEqual({ error: 'Invalid archive', imported: undefined, report: undefined });
	} finally {
		f.close();
	}
});
it('reports an uncertain upload outcome without claiming an empty successful import', async () => {
	const f = await setup();
	try {
		f.upload.failure = new Error('Connection reset');
		await f.controller.import(f.file, f.note.projectId);
		expect({
			error: f.controller.error,
			report: f.controller.report,
			busy: f.controller.busy
		}).toEqual({
			error: 'The import outcome could not be confirmed. Check the project before trying again.',
			report: undefined,
			busy: false
		});
	} finally {
		f.close();
	}
});
it('does not publish or synchronize a response after the import dialog resets', async () => {
	const f = await setup();
	try {
		const gate = f.upload.pause();
		const pending = f.controller.import(f.file, f.note.projectId);
		await gate.started;
		f.controller.reset();
		gate.release();
		await pending;
		expect({
			report: f.controller.report,
			imported: f.resources.views.get('notes', f.imported.id),
			busy: f.controller.busy
		}).toEqual({ report: undefined, imported: undefined, busy: false });
	} finally {
		f.close();
	}
});
it('does not publish a late import report into a stopped account', async () => {
	const f = await setup();
	try {
		const gate = f.upload.pause();
		const pending = f.controller.import(f.file, f.note.projectId);
		await gate.started;
		f.workspace.stop();
		gate.release();
		await pending;
		expect({
			report: f.controller.report,
			busy: f.controller.busy,
			error: f.controller.error
		}).toEqual({ report: undefined, busy: false, error: '' });
	} finally {
		f.close();
	}
});
