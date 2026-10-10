import type { ShellContext } from '$lib/models/workspace-views';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteSummary } from '$lib/models/notes';

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
					line: 'northwind should own the rollout'
				}
			]
		}
	});

/** The summary hangs off the turn's last activity group, so only that group is given it. */
const renderTurn = (tools: ChatToolActivity[]) =>
	render(TurnActivity, { tools, shell, summarise: true });

describe('A settled turn reports the things it touched, once each', () => {
	it('states the touched note once and shows the edit outcome', async () => {
		const screen = await renderTurn([call({}), grep(), call({ name: 'save_note' })]);
		expect(await screen.getByText('Infrastructure', { exact: true }).all()).toHaveLength(1);
		await expect.element(screen.getByText('· edited')).toBeVisible();
	});

	// `toBeVisible`, not `toBeInTheDocument`. The button was rendered and then pushed past the
	// panel's edge by a row that could not shrink, so it was on the page and on nobody's screen.
	// The weaker assertion is what let that ship.
	it('offers to open it, beside the name it opens', async () => {
		const screen = await renderTurn([call({ name: 'save_note' })]);
		await expect
			.element(screen.getByRole('button', { name: 'Open Infrastructure in a tab' }))
			.toBeVisible();
	});

	it('offers to open it from a row that has evidence behind it too', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await expect
			.element(screen.getByRole('button', { name: 'Open Infrastructure in a tab' }))
			.toBeVisible();
		const row = screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.element();
		const parent = row.parentElement as HTMLElement;
		expect(parent.scrollWidth).toBeLessThanOrEqual(parent.clientWidth);
		await expect.element(screen.getByText('northwind should own the rollout')).not.toBeVisible();
	});

	it('leaves the agent finding its own tools out of the reckoning', async () => {
		const screen = await renderTurn([call({ name: 'search_tools', arguments: { query: 'save' } })]);
		expect(await screen.getByText('·').all()).toHaveLength(0);
	});
});

describe('What was only read is context, and lives behind one door', () => {
	// "Called 6 tools" named mechanism: how hard it worked, never what it worked from.
	it('names the note behind the read door and keeps it out of the thread', async () => {
		const screen = await renderTurn([grep()]);
		const door = screen.getByRole('button', { name: 'Read 1 note' });
		await expect.element(door).toBeVisible();
		await expect.element(screen.getByText('Infrastructure')).not.toBeVisible();
		await door.click();
		await expect.element(screen.getByText('Infrastructure')).toBeVisible();
	});
});

describe('Evidence waits until it is asked for', () => {
	it('reveals the matched line and query only when the note is opened', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await expect.element(screen.getByText('northwind should own the rollout')).not.toBeVisible();
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		await expect.element(screen.getByText('northwind should own the rollout')).toBeVisible();
		await expect.element(screen.getByText('rollout', { exact: true })).toBeVisible();
	});

	// A hit from a knowledge search carries no passage, so its row once had nothing behind it and
	// said only "· searched" — never what the agent searched for.
	it('reveals what a search searched for on a note it found', async () => {
		const screen = await renderTurn([
			call({
				name: 'search',
				arguments: { query: 'rollout plan' },
				output: [{ source: { kind: 'note', noteId: NOTE_ID, title: 'Infrastructure' } }]
			})
		]);
		await screen.getByRole('button', { name: 'Read 1 note' }).click();
		await screen.getByRole('button', { name: 'Infrastructure · searched' }).click();
		await expect.element(screen.getByText('rollout plan', { exact: true })).toBeVisible();
	});

	it('names the note in its own passes rather than calling it "note"', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		await expect.element(screen.getByText('Saved Infrastructure')).toBeVisible();
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
		expect(await screen.getByText(/not applied/).all()).toHaveLength(0);
	});

	it('states one that stood, on the subject it befell', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })
		]);
		await expect.element(screen.getByText(/not applied/)).toBeVisible();
		expect(await screen.getByText(/changes? (was|were) not applied/).all()).toHaveLength(0);
	});
});

describe('Looks that found nothing are a row like everything else behind the door', () => {
	const fruitless = () =>
		call({
			name: 'grep',
			arguments: { pattern: 'southwind', path: '/' },
			output: { kind: 'no_matches' }
		});

	const openDoor = async (tools: ChatToolActivity[]) => {
		const screen = await renderTurn(tools);
		await screen.getByText('What it looked at').click();
		return screen;
	};

	// Named by what it did, because that is the only identity it has. A count named a quantity
	// where every neighbouring row names a thing.
	it('gives each look its own row', async () => {
		const screen = await openDoor([fruitless(), fruitless()]);
		expect(await screen.getByText(/Searched for/).all()).toHaveLength(2);
	});

	// `toBeVisible` rather than a count of matches, for the reason this file already records
	// above: the collapsible keeps its content mounted, so presence in the document says nothing
	// about what is on screen.
	it('titles the search row and reveals its empty result on open', async () => {
		const screen = await openDoor([fruitless()]);
		const query = screen.getByText(/Searched for/);
		const empty = screen.getByText('Nothing came back.');
		await expect.element(query).toBeVisible();
		await expect.element(empty).not.toBeVisible();
		await query.click();
		await expect.element(empty).toBeVisible();
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
