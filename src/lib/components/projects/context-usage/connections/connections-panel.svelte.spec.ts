import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConnectionNode, ProjectConnectionsReport } from '$lib/models/context-usage';
import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
import {
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import ConnectionsPanel from './connections-panel.svelte';

const brief: ConnectionNode = {
	key: `note:${testNoteId(1)}`,
	item: { kind: 'note', id: testNoteId(1), title: 'Brief' },
	use: { kind: 'read', times: 3, lastAt: testNow },
	chats: 3
};
const report: ProjectConnectionsReport = {
	nodes: [brief],
	together: [],
	links: [],
	chats: 3,
	memoryLeftOut: 0,
	mismatches: { linkedNeverTogether: [], togetherNotLinked: [] },
	ambient: [],
	defaultThreshold: 1
};

/** Records each request the panel hands to the chat, as the shell would receive it. */
const recorder = () => {
	const asked: ChatHandoff[] = [];
	return { asked, onask: (request: ChatHandoff) => void asked.push(request) };
};

const renderPanel = (onask: (request: ChatHandoff) => void, selected?: ConnectionNode) =>
	render(ConnectionsPanel, {
		report,
		projectId: testProjectId(),
		projectName: 'Launch',
		selected,
		mismatch: undefined,
		onselect: () => {},
		onmismatch: () => {},
		onask
	});

it('hands a starter question to the chat with this map pinned', async () => {
	const { asked, onask } = recorder();
	const screen = await renderPanel(onask);
	await screen.getByRole('button', { name: 'Which notes are always read together?' }).click();
	expect(asked).toEqual([
		{
			prompt: 'Which notes are always read together?',
			projectId: testProjectId(),
			chips: [{ kind: 'connections', id: testProjectId(), name: 'Connections · Launch' }]
		}
	]);
});

it('offers a question about the selected item first', async () => {
	const screen = await renderPanel(() => {}, brief);
	const section = screen.getByRole('region', { name: 'Ask the agent' });
	await expect
		.element(section.getByRole('button').first())
		.toHaveTextContent('What is Brief read with, and why?');
});

it('hands a typed question to the chat with this map pinned', async () => {
	const { asked, onask } = recorder();
	const screen = await renderPanel(onask);
	await screen.getByRole('textbox', { name: 'Your question' }).fill('Why is Brief read so often?');
	await screen.getByRole('button', { name: 'Ask', exact: true }).click();
	expect(asked.map((request) => [request.prompt, request.chips?.[0]?.kind])).toEqual([
		['Why is Brief read so often?', 'connections']
	]);
});
