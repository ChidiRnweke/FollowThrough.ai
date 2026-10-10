import { expect, it } from 'vitest';
import { ProjectExportSettings } from './settings';
import { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
import { defaultExportSettings } from '$lib/models/deliverables';
import { browserExportFixture } from '$lib/testing/deliverables/fixtures/browser-export';
it('opens absent project defaults without creating a pending edit', async () => {
	const f = await browserExportFixture();
	const controller = new ProjectExportSettings(new ExportSettingsStore(), f.workspace);
	try {
		const result = await controller.open(f.note.projectId);
		expect({ result, ready: controller.ready, pending: f.resources.pending }).toEqual({
			result: { kind: 'ready', settings: defaultExportSettings },
			ready: true,
			pending: []
		});
	} finally {
		controller.close();
		f.close();
	}
});
it('saves project defaults durably while offline', async () => {
	const f = await browserExportFixture();
	const controller = new ProjectExportSettings(new ExportSettingsStore(), f.workspace);
	try {
		await controller.open(f.note.projectId);
		f.resources.setOnline(false);
		const settings = { ...defaultExportSettings, fontSize: 14, includeTitle: true };
		const result = await controller.save(settings);
		expect({
			result,
			busy: controller.busy,
			commands: f.resources.pending.map((entry) => entry.intent.command)
		}).toEqual({
			result: { kind: 'saved' },
			busy: false,
			commands: [
				{
					kind: 'updateExportSettings',
					userId: f.note.userId,
					projectId: f.note.projectId,
					settings
				}
			]
		});
	} finally {
		controller.close();
		f.close();
	}
});
it('refuses invalid export defaults without creating a pending edit', async () => {
	const f = await browserExportFixture();
	const controller = new ProjectExportSettings(new ExportSettingsStore(), f.workspace);
	try {
		await controller.open(f.note.projectId);
		const result = await controller.save({ ...defaultExportSettings, fontSize: 100 });
		expect({ result, busy: controller.busy, pending: f.resources.pending }).toEqual({
			result: { kind: 'failure', message: 'Could not save the export defaults.' },
			busy: false,
			pending: []
		});
	} finally {
		controller.close();
		f.close();
	}
});
it('does not write defaults after the dialog closes', async () => {
	const f = await browserExportFixture();
	const controller = new ProjectExportSettings(new ExportSettingsStore(), f.workspace);
	try {
		await controller.open(f.note.projectId);
		controller.close();
		const result = await controller.save({ ...defaultExportSettings, fontSize: 14 });
		expect({ result, pending: f.resources.pending }).toEqual({
			result: { kind: 'superseded' },
			pending: []
		});
	} finally {
		controller.close();
		f.close();
	}
});
it('does not write defaults through a stopped account', async () => {
	const f = await browserExportFixture();
	const controller = new ProjectExportSettings(new ExportSettingsStore(), f.workspace);
	try {
		await controller.open(f.note.projectId);
		f.workspace.stop();
		expect(await controller.save({ ...defaultExportSettings, fontSize: 14 })).toEqual({
			kind: 'superseded'
		});
	} finally {
		controller.close();
		f.close();
	}
});
