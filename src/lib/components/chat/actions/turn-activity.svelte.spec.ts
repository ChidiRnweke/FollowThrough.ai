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
					line: 'northwind should own the rollout'
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
	});

	it('keeps the statement row inside the width it was given', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		const row = screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.element();
		const parent = row.parentElement as HTMLElement;
		expect(parent.scrollWidth).toBeLessThanOrEqual(parent.clientWidth);
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
		await expect.element(screen.getByText('northwind should own the rollout')).not.toBeVisible();
	});

	it('shows it once the thing is opened', async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		await expect.element(screen.getByText('northwind should own the rollout')).toBeVisible();
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

describe('Teal is what the agent did, and nothing else', () => {
	// Every label used to be the same muted xs, so nothing on the surface said which lines were
	// the agent acting and which were the material it acted on.
	const opened = async () => {
		const screen = await renderTurn([grep(), call({ name: 'edit_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		return screen;
	};

	it('marks a look as an action', async () => {
		const screen = await opened();
		await expect.element(screen.getByText(/^Searched for/)).toHaveClass(/text-brand/);
	});

	it('marks a write as an action too', async () => {
		const screen = await opened();
		await expect.element(screen.getByText('Edited note')).toHaveClass(/text-brand/);
	});

	it('tells the write apart from the look by weight rather than by colour', async () => {
		const screen = await opened();
		await expect.element(screen.getByText('Edited note')).toHaveClass(/font-medium/);
	});

	it('leaves the look at regular weight', async () => {
		const screen = await opened();
		await expect.element(screen.getByText(/^Searched for/)).not.toHaveClass(/font-medium/);
	});

	// The reader's own words handed to a tool, not something the agent did.
	it('does not colour the search string as an action', async () => {
		const screen = await opened();
		await expect
			.element(screen.getByText('rollout', { exact: true }))
			.not.toHaveClass(/text-brand/);
	});
});

describe('Depth in the turn is legible as size', () => {
	// A request titles the block beneath it, and at one size it did not read as a title at all.
	// Asserted as the rung each line claims rather than as a measured pixel: this runner serves
	// no stylesheet, so every computed size here is the browser default and would prove nothing.
	// What the component owns is which rung it asks for; that the rungs differ is `layout.css`.
	const opened = async () => {
		const screen = await renderTurn([grep(), call({ name: 'save_note' })]);
		await screen
			.getByRole('button', { name: /Infrastructure/ })
			.first()
			.click();
		return screen;
	};

	it('sets a request at the rung that titles a block', async () => {
		const screen = await opened();
		await expect.element(screen.getByText(/^Searched for/)).toHaveClass(/text-label/);
	});

	it('sets what came back a rung below the request', async () => {
		const screen = await opened();
		const line = screen.getByText('northwind should own the rollout').element();
		expect(line.closest('ul')?.className).toMatch(/text-2xs/);
	});

	it('leaves the subject above both, at body size', async () => {
		const screen = await opened();
		const row = screen.getByRole('button', { name: /Infrastructure/ }).first();
		await expect.element(row).toHaveClass(/text-sm/);
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
	});

	// The banner that used to head this block named the same subjects the rows below it named,
	// so the failure was stated twice. The row keeps the name, the colour and the way in.
	it('states it once, not in a banner above the rows as well', async () => {
		const screen = await renderTurn([
			call({ name: 'save_note', status: 'failed', failure: 'The note was locked.' })
		]);
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
	it('titles the row with the request, not with how many looks there were', async () => {
		const screen = await openDoor([fruitless()]);
		await expect.element(screen.getByText(/Searched for/)).toBeVisible();
	});

	it('gives each look its own row', async () => {
		const screen = await openDoor([fruitless(), fruitless()]);
		expect(await screen.getByText(/Searched for/).all()).toHaveLength(2);
	});

	// `toBeVisible` rather than a count of matches, for the reason this file already records
	// above: the collapsible keeps its content mounted, so presence in the document says nothing
	// about what is on screen.
	it('keeps the emptiness behind that row chevron', async () => {
		const screen = await openDoor([fruitless()]);
		await expect.element(screen.getByText('Nothing came back.')).not.toBeVisible();
	});

	it('states it on the evidence surface once the chevron is opened', async () => {
		const screen = await openDoor([fruitless()]);
		await screen.getByText(/Searched for/).click();
		await expect.element(screen.getByText('Nothing came back.')).toBeVisible();
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
