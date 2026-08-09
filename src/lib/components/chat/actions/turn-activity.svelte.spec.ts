import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import TurnActivity from './turn-activity.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

let nextCall = 0;
const call = (over: Partial<ChatToolActivity>): ChatToolActivity => ({
	callId: `call-${++nextCall}`,
	name: 'get_note',
	arguments: { noteId: NOTE_ID },
	status: 'succeeded',
	...over
});

const renderTurn = (tools: ChatToolActivity[], settled = true) =>
	render(TurnActivity, { tools, shell, settled });

describe('A settled turn reports the things it touched', () => {
	it('reports one entry however many times it worked on the same note', async () => {
		const screen = await renderTurn([call({}), call({}), call({ name: 'save_note' })]);
		expect(await screen.getByText('Infrastructure').all()).toHaveLength(1);
	});

	it('makes that entry a control naming what it opens', async () => {
		const screen = await renderTurn([call({})]);
		await expect
			.element(screen.getByRole('button', { name: /Infrastructure/ }))
			.toBeInTheDocument();
	});

	it('says what became of it', async () => {
		const screen = await renderTurn([call({}), call({ name: 'save_note' })]);
		await expect.element(screen.getByText('edited')).toBeVisible();
	});

	it('leaves the agent finding its own tools out of the report', async () => {
		const screen = await renderTurn([
			call({ name: 'search_tools', arguments: { query: 'save_note' } })
		]);
		expect(await screen.getByRole('button', { name: /·/ }).all()).toHaveLength(0);
	});

	it('says nothing about a failure the agent then put right', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'Not callable directly.' }),
			call({ name: 'save_note' })
		]);
		expect(await screen.getByText('Not callable directly.').all()).toHaveLength(0);
	});

	it('states a failure that stood', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })
		]);
		await expect.element(screen.getByText('The note was locked.')).toBeVisible();
	});
});

describe('The call log is one door per turn', () => {
	it('offers details even for a turn whose every call was mechanism', async () => {
		const screen = await renderTurn([call({ name: 'search_tools', arguments: {} })]);
		await expect.element(screen.getByRole('button', { name: 'Details' })).toBeInTheDocument();
	});

	it('lists the calls the summary left out', async () => {
		const screen = await renderTurn([
			call({ name: 'search_tools', arguments: { query: 'save_note' } }),
			call({ name: 'save_note' })
		]);
		await screen.getByRole('button', { name: 'Details' }).click();
		await expect.element(screen.getByText('2 steps, in the order they ran.')).toBeVisible();
	});
});

describe('A running turn shows the steps as they arrive', () => {
	it('keeps every step while the turn is still working', async () => {
		const screen = await renderTurn([call({}), call({ name: 'save_note' })], false);
		expect(await screen.getByText('Infrastructure').all()).toHaveLength(2);
	});
});
