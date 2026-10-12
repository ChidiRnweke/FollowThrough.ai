import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ConnectionNode, ProjectConnectionsReport } from '$lib/models/context-usage';
import type { ChatHandoff } from '$lib/stores/agent/chat-handoff';
import {
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import ConnectionsAsk from './connections-ask.svelte';

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

/** Records each request the button hands to the chat, as the shell would receive it. */
const recorder = () => {
	const asked: ChatHandoff[] = [];
	return { asked, onask: (request: ChatHandoff) => void asked.push(request) };
};

const renderPanel = (onask: (request: ChatHandoff) => void, selected?: ConnectionNode) =>
	render(ConnectionsAsk, {
		report,
		projectId: testProjectId(),
		projectName: 'Launch',
		selected,
		onask
	});

it('hands one question to the chat with this map pinned and the rest as starters', async () => {
	const { asked, onask } = recorder();
	const screen = await renderPanel(onask);
	await screen.getByRole('button', { name: 'Ask about connections' }).click();
	expect(asked).toEqual([
		{
			prompt: 'Which notes are always read together?',
			projectId: testProjectId(),
			chips: [{ kind: 'connections', id: testProjectId(), name: 'Connections · Launch' }],
			starters: [
				'What does a skill make the agent read next?',
				'Which items are only ever read alone?'
			]
		}
	]);
});

it('loads the question about the selected item and offers the general ones', async () => {
	const { asked, onask } = recorder();
	const screen = await renderPanel(onask, brief);
	await screen.getByRole('button', { name: 'Ask about connections' }).click();
	expect(asked.map((request) => [request.prompt, request.starters?.length])).toEqual([
		['What is Brief read with, and why?', 3]
	]);
});
