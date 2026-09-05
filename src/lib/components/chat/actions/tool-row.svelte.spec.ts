import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import ToolRow from './tool-row.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const call = (over: ToolActivityOverrides): ChatToolActivity => ({
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

describe('A disclosure is earned by having something behind it', () => {
	// A chevron on every row was the problem: a settled `get_note` opened onto `Title:
	// Infrastructure` under a row already reading `Read note · Infrastructure`, and a
	// disclosure that pays out nothing teaches the reader not to open the next one.
	it('gives a read of one thing no disclosure, because the row already says it', async () => {
		const screen = await renderRow(call({}));
		expect(await screen.getByRole('button', { name: /Read note/ }).all()).toHaveLength(0);
	});

	it('gives a read of many things a disclosure onto what came back', async () => {
		const screen = await renderRow(
			call({ name: 'list_todos', arguments: {}, output: { todos: [{ title: 'Draft the RFC' }] } })
		);
		await screen.getByRole('button', { name: /Listed todos/ }).click();
		await expect.element(screen.getByText('Draft the RFC')).toBeVisible();
	});

	it('gives a write a disclosure onto what changed', async () => {
		const screen = await renderRow(
			call({ name: 'update_todo', arguments: { todoId: NOTE_ID, status: 'done' }, output: {} })
		);
		await screen.getByRole('button', { name: /Updated todo/ }).click();
		await expect.element(screen.getByText('done', { exact: true })).toBeVisible();
	});
});

/**
 * A row only ever renders behind the turn's log door, and the log is evidence. The
 * reader-facing sentence is `TurnFailure`'s, stated once above — printing it here as
 * well put the same words on screen twice, ten pixels apart, which is what
 * `turn-failure.svelte` has always said this row is *not* for.
 */
describe('A failed call shows the run own message as evidence', () => {
	it('shows the raw failure rather than repeating the sentence stated above it', async () => {
		const screen = await renderRow(
			call({
				name: 'edit_note',
				status: 'failed',
				failure: 'oldText was not found in the note.'
			})
		);
		await screen.getByRole('button', { name: /Note was not saved/ }).click();
		await expect.element(screen.getByText('oldText was not found in the note.')).toBeVisible();
	});
});

describe('A search of the notes and files says what it looked for and found', () => {
	const grepCall = () =>
		call({
			name: 'grep',
			arguments: { pattern: 'element61', path: '/' },
			output: {
				kind: 'matches',
				exitCode: 0,
				pattern: 'element61',
				path: '/',
				matches: [
					{
						path: `/projects/proj-1/notes/${NOTE_ID}.md`,
						lineNumber: 12,
						line: 'element61 should own the rollout'
					}
				]
			}
		});

	it('reads as a search, not as the tool that ran it', async () => {
		const screen = await renderRow(grepCall());
		await expect.element(screen.getByText('Searched notes and files')).toBeVisible();
	});

	it('names what it searched for', async () => {
		const screen = await renderRow(grepCall());
		await expect.element(screen.getByText('element61', { exact: true })).toBeVisible();
	});

	it('shows the matching lines behind the row', async () => {
		const screen = await renderRow(grepCall());
		await screen.getByRole('button', { name: /Searched notes and files/ }).click();
		await expect.element(screen.getByText('element61 should own the rollout')).toBeVisible();
	});
});

describe('An edited note is named and openable from its disclosure', () => {
	it('names the note behind the row, as a thing that opens', async () => {
		const screen = await renderRow(
			call({
				name: 'edit_note',
				arguments: { noteId: NOTE_ID, edits: [{ oldText: 'a', newText: 'b' }] },
				output: { noteId: NOTE_ID, title: 'Infrastructure', currentRevision: 3 }
			})
		);
		await screen.getByRole('button', { name: /Edited note/ }).click();
		await expect
			.element(screen.getByRole('button', { name: 'Infrastructure', exact: true }))
			.toBeInTheDocument();
	});
});
