import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import ToolRow from './tool-row.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const call = (over: Partial<ChatToolActivity>): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name: 'get_note',
	arguments: { noteId: NOTE_ID },
	status: 'succeeded',
	...over
});

const renderRow = (tool: ChatToolActivity) => render(ToolRow, { tool, shell });

describe('A row names the thing it touched', () => {
	it('shows the note title without being expanded', async () => {
		const screen = await renderRow(call({}));
		await expect.element(screen.getByText('Infrastructure', { exact: true })).toBeVisible();
	});

	it('offers to open that note in a tab', async () => {
		const screen = await renderRow(call({}));
		await expect
			.element(screen.getByRole('button', { name: 'Open Infrastructure in a tab' }))
			.toBeInTheDocument();
	});

	it('offers nothing to open when the call is not about a note', async () => {
		const screen = await renderRow(call({ name: 'search', arguments: { query: 'rollout' } }));
		expect(await screen.getByRole('button', { name: /Open/ }).all()).toHaveLength(0);
	});

	it('names what a search looked for', async () => {
		const screen = await renderRow(call({ name: 'search', arguments: { query: 'rollout' } }));
		await expect.element(screen.getByText('rollout')).toBeVisible();
	});
});

describe('An expanded row shows both halves of the call', () => {
	const expanded = async (tool: ChatToolActivity) => {
		const screen = await renderRow(tool);
		await screen.getByRole('button', { name: /Read note/ }).click();
		return screen;
	};

	it('shows what the call sent', async () => {
		const screen = await expanded(call({ arguments: { noteId: NOTE_ID, query: 'rollout plan' } }));
		await expect.element(screen.getByText('Search: rollout plan')).toBeVisible();
	});

	it('shows what the call returned', async () => {
		const screen = await expanded(call({ output: [{ title: 'Runtime notes' }] }));
		await expect.element(screen.getByText('1 result')).toBeVisible();
	});

	it('shows a failure instead of a result', async () => {
		const screen = await renderRow(
			call({ status: 'failed', failure: 'The note was locked.', output: undefined })
		);
		await screen.getByRole('button', { name: /Read note failed/ }).click();
		await expect.element(screen.getByText('The note was locked.')).toBeVisible();
	});

	it('keeps raw payloads behind an action rather than on the page', async () => {
		const screen = await expanded(call({ output: [{ title: 'Runtime notes' }] }));
		await expect.element(screen.getByRole('button', { name: 'Copy raw' })).toBeInTheDocument();
	});
});
