import { expect, it } from 'vitest';
import { TodoBoardExports } from './board-export';
import { TodoBoardExportStore } from '$lib/stores/todos/board-export.svelte';
import { TodoBoardExportService } from '$lib/services/todos/board-export';
import {
	InMemoryBoardExportBrowser,
	InMemoryBoardExportRemote
} from '$lib/testing/todos/fakes/board-export';
import { todoBuilder, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () => {
	const browser = new InMemoryBoardExportBrowser();
	const remote = new InMemoryBoardExportRemote();
	const workspace = { current: { active: true } };
	return {
		browser,
		remote,
		workspace,
		controller: new TodoBoardExports(
			new TodoBoardExportStore(),
			new TodoBoardExportService(),
			remote,
			browser,
			() => workspace.current
		)
	};
};
it('downloads exactly the visible board as Markdown within the user action', () => {
	const { browser, controller } = setup();
	controller.markdown([{ todo: todoBuilder({ title: 'Send the design' }) }]);
	expect(browser.downloads).toEqual([
		{
			kind: 'md',
			filename: 'kanban-all-2026-08-03.md',
			content: '# Todos\n\nGenerated 3 Aug 2026\n\n## Open\n\n- [ ] **Send the design**\n'
		}
	]);
});
it('sends shareable filters and downloads the completed PDF', async () => {
	const { browser, remote, controller } = setup();
	const result = await controller.pdf(
		new URL(
			`https://example.test/todos?projectId=${testProjectId()}&category=%20Client%20&responsibility=waiting_on&query=ignored`
		)
	);
	expect({
		result,
		filters: remote.filters,
		downloads: browser.downloads,
		busy: controller.generatingPdf
	}).toEqual({
		result: { kind: 'downloaded' },
		filters: [{ projectId: testProjectId(), category: 'Client', responsibility: 'waiting_on' }],
		downloads: [{ kind: 'pdf', filename: 'kanban-all-2026-08-03.pdf', content: 'JVBERi0=' }],
		busy: false
	});
});
it('reports failed generation without a download or a retained busy state', async () => {
	const { browser, remote, controller } = setup();
	remote.failure = new Error('Renderer unavailable');
	const result = await controller.pdf(new URL('https://example.test/todos'));
	expect({ result, downloads: browser.downloads, busy: controller.generatingPdf }).toEqual({
		result: { kind: 'failure', message: 'Could not generate the PDF. Try again.' },
		downloads: [],
		busy: false
	});
});
it('does not download a late PDF after the board closes', async () => {
	const { browser, remote, controller } = setup();
	const gate = remote.pause();
	const operation = controller.pdf(new URL('https://example.test/todos'));
	await gate.started;
	controller.close();
	gate.release();
	expect({
		result: await operation,
		downloads: browser.downloads,
		busy: controller.generatingPdf
	}).toEqual({ result: { kind: 'superseded' }, downloads: [], busy: false });
});
it('does not download a late PDF into a replacement workspace', async () => {
	const { browser, remote, controller, workspace } = setup();
	const gate = remote.pause();
	const operation = controller.pdf(new URL('https://example.test/todos'));
	await gate.started;
	workspace.current = { active: true };
	gate.release();
	expect({ result: await operation, downloads: browser.downloads }).toEqual({
		result: { kind: 'superseded' },
		downloads: []
	});
});
it('rejects a malformed project filter before requesting a PDF', async () => {
	const { browser, remote, controller } = setup();
	const result = await controller.pdf(new URL('https://example.test/todos?projectId=broken'));
	expect({ result, filters: remote.filters, downloads: browser.downloads }).toEqual({
		result: { kind: 'failure', message: 'Could not generate the PDF. Try again.' },
		filters: [],
		downloads: []
	});
});
