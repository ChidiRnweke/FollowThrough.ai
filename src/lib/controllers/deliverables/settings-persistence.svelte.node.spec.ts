import { expect, it } from 'vitest';
import { ProjectExportSettings } from './settings';
import { ExportSettingsStore } from '$lib/stores/deliverables/settings.svelte';
import { browserExportFixture } from '$lib/testing/deliverables/fixtures/browser-export';
const setup = async () => {
	const f = await browserExportFixture();
	const settings = new ProjectExportSettings(new ExportSettingsStore(), f.settingsDependencies);
	await settings.open(f.note.projectId);
	return {
		...f,
		settings,
		close: () => {
			settings.close();
			f.close();
		}
	};
};
it('keeps an unavailable optional settings read distinct from absence', async () => {
	const f = await setup();
	try {
		await f.workspace.cache.commit(f.note.userId, {
			put: [],
			remove: [],
			inventoryComplete: false
		});
		f.transport.pullFailure = 'Read failed';
		const result = await f.settings.open(f.note.projectId);
		expect({ result, ready: f.settings.ready, pending: await f.pending() }).toEqual({
			result: { kind: 'failure', message: 'Read failed' },
			ready: false,
			pending: []
		});
	} finally {
		f.close();
	}
});
it('retries a failed durable save without losing the captured settings', async () => {
	const f = await setup();
	try {
		f.workspace.repository.appendFailure = 'Device full';
		const failed = await f.settings.save({ ...f.input.settings, fontSize: 14 });
		const before = await f.pending();
		f.workspace.repository.appendFailure = null;
		const retried = await f.settings.save({ ...f.input.settings, fontSize: 14 });
		expect({
			failed,
			before,
			retried,
			commands: (await f.pending()).map((entry) => entry.intent.command)
		}).toEqual({
			failed: { kind: 'failure', message: 'Device full' },
			before: [],
			retried: { kind: 'saved' },
			commands: [
				{
					kind: 'updateExportSettings',
					userId: f.note.userId,
					projectId: f.note.projectId,
					settings: { ...f.input.settings, fontSize: 14 }
				}
			]
		});
	} finally {
		f.close();
	}
});
it.each(['close', 'account', 'session'] as const)(
	'rolls back a pending append after %s invalidation',
	async (kind) => {
		const f = await setup();
		try {
			const gate = f.workspace.repository.pauseAppend();
			const pending = f.settings.save({ ...f.input.settings, fontSize: 14 });
			await gate.started;
			if (kind === 'close') f.settings.close();
			else f.workspace.replace(kind === 'account' ? 'replacement-account' : f.note.userId);
			gate.release();
			expect({
				result: await pending,
				pending: await f.pending(),
				ready: f.settings.ready
			}).toEqual({ result: { kind: 'superseded' }, pending: [], ready: false });
		} finally {
			f.close();
		}
	}
);
it('rejects a second save while the first transaction is pending', async () => {
	const f = await setup();
	try {
		const gate = f.workspace.repository.pauseAppend();
		const first = f.settings.save({ ...f.input.settings, fontSize: 14 });
		await gate.started;
		const second = await f.settings.save({ ...f.input.settings, fontSize: 16 });
		gate.release();
		await first;
		expect({ second, commands: (await f.pending()).map((entry) => entry.intent.command) }).toEqual({
			second: { kind: 'superseded' },
			commands: [
				{
					kind: 'updateExportSettings',
					userId: f.note.userId,
					projectId: f.note.projectId,
					settings: { ...f.input.settings, fontSize: 14 }
				}
			]
		});
	} finally {
		f.close();
	}
});
it('keeps successive saved edits on the durable ancestry chain', async () => {
	const f = await setup();
	try {
		await f.settings.save({ ...f.input.settings, fontSize: 14 });
		const first = (await f.pending())[0];
		await f.settings.save({ ...f.input.settings, fontSize: 16 });
		const entries = await f.pending();
		expect(
			entries.map((entry) => ({ basedOn: entry.intent.basedOn, command: entry.intent.command }))
		).toEqual([
			{ basedOn: null, command: first.intent.command },
			{
				basedOn: first.intent.operationId,
				command: {
					kind: 'updateExportSettings',
					userId: f.note.userId,
					projectId: f.note.projectId,
					settings: { ...f.input.settings, fontSize: 16 }
				}
			}
		]);
	} finally {
		f.close();
	}
});
it('does not let an old settings append change a replacement project draft', async () => {
	const f = await setup();
	try {
		const gate = f.workspace.repository.pauseAppend();
		const pending = f.settings.save({ ...f.input.settings, fontSize: 14 });
		await gate.started;
		const reopened = await f.settings.open('replacement-project');
		gate.release();
		expect({
			old: await pending,
			reopened,
			pending: await f.pending(),
			ready: f.settings.ready,
			busy: f.settings.busy
		}).toEqual({
			old: { kind: 'superseded' },
			reopened: { kind: 'ready', settings: f.input.settings },
			pending: [],
			ready: true,
			busy: false
		});
	} finally {
		f.close();
	}
});
