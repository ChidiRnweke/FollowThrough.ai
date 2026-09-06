import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteSummary } from '$lib/models/notes';
import type { ShellContext } from '$lib/models/workspace';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { ToolActivityOverrides } from '$lib/testing/agent/tool-activity';
import TurnActivity from './turn-activity.svelte';

const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [],
	noteTree: [
		{ id: NOTE_ID, title: 'Infrastructure', projectId: 'proj-1' } as unknown as NoteSummary
	]
} as unknown as ShellContext;

let nextCall = 0;
const call = (over: ToolActivityOverrides): ChatToolActivity => ({
	callId: `call-${++nextCall}`,
	name: 'get_note',
	arguments: { noteId: NOTE_ID },
	status: 'succeeded',
	...over
});

const grep = () =>
	call({
		name: 'grep',
		arguments: { pattern: 'rollout', path: '/' },
		output: {
			kind: 'matches',
			matches: [
				{
					path: `/projects/proj-1/notes/${NOTE_ID}.md`,
					lineNumber: 12,
					line: 'element61 should own the rollout'
				}
			]
		}
	});

/** The summary hangs off the turn's last activity group, so only that group is given it. */
const renderTurn = (tools: ChatToolActivity[]) =>
	render(TurnActivity, { tools, shell, summarise: true });

describe('A settled turn reports the things it touched, once each', () => {
	it('states one note once, however many calls touched it', async () => {
		const screen = await renderTurn([call({}), grep(), call({ name: 'save_note' })]);
		expect(await screen.getByText('Infrastructure').all()).toHaveLength(1);
	});

	it('says what became of it', async () => {
		const screen = await renderTurn([call({}), call({ name: 'save_note' })]);
		await expect.element(screen.getByText('· edited')).toBeVisible();
	});

	it('offers to open it, beside the name it opens', async () => {
		const screen = await renderTurn([call({ name: 'save_note' })]);
		await expect
			.element(screen.getByRole('button', { name: 'Open Infrastructure in a tab' }))
			.toBeInTheDocument();
	});

	it('leaves the agent finding its own tools out of the reckoning', async () => {
		const screen = await renderTurn([call({ name: 'search_tools', arguments: { query: 'save' } })]);
		expect(await screen.getByText('·').all()).toHaveLength(0);
	});
});

describe('What was only read is context, and lives behind one door', () => {
	it('does not put a note it merely searched in the thread', async () => {
		const screen = await renderTurn([grep()]);
		await expect.element(screen.getByText('Infrastructure')).not.toBeVisible();
	});

	// "Called 6 tools" named mechanism: how hard it worked, never what it worked from.
	it('names the door by what it holds rather than by how many calls it made', async () => {
		const screen = await renderTurn([grep()]);
		await expect.element(screen.getByRole('button', { name: 'Read 1 note' })).toBeVisible();
	});

	it('names the note once the door is open', async () => {
		const screen = await renderTurn([grep()]);
		await screen.getByRole('button', { name: 'Read 1 note' }).click();
		await expect.element(screen.getByText('Infrastructure')).toBeVisible();
	});
});

describe('Evidence waits until it is asked for', () => {
	it('keeps the matched line behind the thing it was found in', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await expect.element(screen.getByText('element61 should own the rollout')).not.toBeVisible();
	});

	it('shows it once the thing is opened', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		await expect.element(screen.getByText('element61 should own the rollout')).toBeVisible();
	});

	it('names what the agent searched for, apart from what it found', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		await expect.element(screen.getByText('rollout', { exact: true })).toBeVisible();
	});
});

describe('Nothing is counted that is also shown', () => {
	it('never states how many matches a search found', async () => {
		const screen = await renderTurn([grep()]);
		expect(await screen.getByText(/match/).all()).toHaveLength(0);
	});

	it('never states how many edits an edit applied', async () => {
		const screen = await renderTurn([
			call({
				name: 'edit_note',
				arguments: { noteId: NOTE_ID, edits: [{ oldText: 'a', newText: 'b' }] },
				output: { noteId: NOTE_ID, appliedEdits: 1 }
			})
		]);
		expect(await screen.getByText(/edit$/).all()).toHaveLength(0);
	});
});

describe('A failure is news only when nothing put it right', () => {
	// The attempt is still filed under the note as evidence, where a reader who opens it can
	// see the agent correcting itself. It is simply not news.
	it('says nothing about one the agent then corrected', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'Not callable directly.' }),
			call({ name: 'save_note' })
		]);
		expect(await screen.getByText('One change was not applied').all()).toHaveLength(0);
	});

	it('states one that stood', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })
		]);
		await expect.element(screen.getByText('One change was not applied')).toBeVisible();
	});
});

describe('A turn still running is watched, not audited', () => {
	// Folding mid-stream would reorder the list under the reader as calls settled.
	it('names the step in flight in the present tense', async () => {
		const screen = await renderTurn([
			call({ name: 'grep', status: 'running', arguments: { pattern: 'rollout' } })
		]);
		await expect.element(screen.getByText(/Searching for/)).toBeVisible();
	});
});
