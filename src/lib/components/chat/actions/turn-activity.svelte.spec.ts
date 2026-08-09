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

// A group settles on its own: it is a run of consecutive calls, not the whole turn, so
// "still working" is simply one of its calls still running.
const renderTurn = (tools: ChatToolActivity[]) => render(TurnActivity, { tools, shell });

// The log hangs off the turn's last activity group, so only that group is given it.
const renderTurnWithLog = (tools: ChatToolActivity[]) =>
	render(TurnActivity, { tools, shell, showLog: true });

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
	it('offers the log even for a turn whose every call was mechanism', async () => {
		const screen = await renderTurnWithLog([call({ name: 'search_tools', arguments: {} })]);
		await expect.element(screen.getByRole('button', { name: '1 step' })).toBeInTheDocument();
	});

	it('says how many steps are behind it rather than announcing itself', async () => {
		const screen = await renderTurnWithLog([
			call({ name: 'search_tools', arguments: { query: 'save_note' } }),
			call({ name: 'save_note' })
		]);
		await expect.element(screen.getByRole('button', { name: '2 steps' })).toBeInTheDocument();
	});

	it('lists the calls the summary left out', async () => {
		const screen = await renderTurnWithLog([
			call({ name: 'search_tools', arguments: { query: 'save_note' } }),
			call({ name: 'save_note' })
		]);
		await screen.getByRole('button', { name: '2 steps' }).click();
		await expect.element(screen.getByText('2 steps, in the order they ran.')).toBeVisible();
	});

	it('leaves the other groups of a turn without a door of their own', async () => {
		// A door per group put a "1 step" row beside every attempt the agent had already put
		// right, each opening onto work the reader had no reason to see.
		const screen = await renderTurn([call({ name: 'save_note' })]);
		expect(await screen.getByRole('button', { name: /step/ }).all()).toHaveLength(0);
	});
});

describe('A running group shows the steps as they arrive', () => {
	it('keeps every step while one of its calls is still running', async () => {
		const screen = await renderTurn([call({}), call({ name: 'save_note', status: 'running' })]);
		expect(await screen.getByText('Infrastructure').all()).toHaveLength(2);
	});
});

describe('A failure says what, why and what next', () => {
	const failed = () => [
		call({
			name: 'save_note',
			status: 'failed',
			failure: 'Edit 1: oldText was not found. Read the note again and quote it exactly.'
		})
	];

	it('names the thing it failed on', async () => {
		const screen = await renderTurn(failed());
		await expect.element(screen.getByText(/Infrastructure/)).toBeVisible();
	});

	it('explains the cause in the reader terms rather than the run own words', async () => {
		const screen = await renderTurn(failed());
		await expect
			.element(screen.getByText(/The text it meant to change was not where it expected/))
			.toBeVisible();
	});

	it('keeps the run own words out of the transcript', async () => {
		const screen = await renderTurn(failed());
		expect(await screen.getByText(/oldText/).all()).toHaveLength(0);
	});

	it('offers the way out when the run can be retried', async () => {
		const screen = await render(TurnActivity, {
			tools: failed(),
			shell,
			retryable: true,
			onretry: () => {}
		});
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
	});
});
