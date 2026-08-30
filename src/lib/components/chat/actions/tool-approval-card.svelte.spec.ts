import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { NoteSummary } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';
import type { ShellContext } from '$lib/models/workspace';
import ToolApprovalCard from './tool-approval-card.svelte';

const PROJECT_ID = 'e0d3f07c-460b-40c3-9b8c-a8dc00ddc565';
const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [{ id: PROJECT_ID, name: 'Platform Notes' } as unknown as Project],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const pendingCall = (name: string, args: AgentPayloadObject): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name,
	arguments: args,
	status: 'approval_required'
});

const createTodos = (todos: readonly AgentPayloadObject[]): ChatToolActivity =>
	pendingCall('create_todos', { projectId: PROJECT_ID, todos });

const renderCard = (tool: ChatToolActivity) =>
	render(ToolApprovalCard, { tool, shell, onapprove: () => {}, onreject: () => {} });

const visible = async (
	screen: Awaited<ReturnType<typeof renderCard>>,
	texts: Record<string, string>
) => {
	const counts: Record<string, number> = {};
	for (const [key, text] of Object.entries(texts))
		counts[key] = (await screen.getByText(text).all()).length;
	return counts;
};

describe('The review card shows the content a call will store', () => {
	it('shows the title of every todo a create_todos call will create', async () => {
		const screen = await renderCard(
			createTodos([
				{ title: 'Draft the RFC', responsibility: 'mine' },
				{ title: 'Book the review', responsibility: 'waiting_on' }
			])
		);
		expect(await visible(screen, { first: 'Draft the RFC', second: 'Book the review' })).toEqual({
			first: 1,
			second: 1
		});
	});

	it('shows the details stored with each todo, not just the titles', async () => {
		const screen = await renderCard(
			createTodos([
				{
					title: 'Draft the RFC',
					description: 'Cover the rollout plan',
					responsibility: 'mine',
					dueDate: '2026-08-10'
				}
			])
		);
		expect(
			await visible(screen, {
				description: 'Description: Cover the rollout plan',
				due: 'Due: 2026-08-10'
			})
		).toEqual({ description: 1, due: 1 });
	});

	it('says when more todos await review than the card can show', async () => {
		const screen = await renderCard(
			createTodos(
				['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((title) => ({
					title: `Todo ${title}`
				}))
			)
		);
		expect(await visible(screen, { more: '…and 1 more' })).toEqual({ more: 1 });
	});

	it('shows every todo in the full review, past the compact cap', async () => {
		const screen = await renderCard(
			createTodos(
				['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((title) => ({
					title: `Todo ${title}`
				}))
			)
		);
		await screen.getByRole('button', { name: 'Review in full' }).click();
		expect(await visible(screen, { sixth: 'Todo Six' })).toEqual({ sixth: 1 });
	});
});

describe('The review card names what an id-only call acts on', () => {
	it('names the note an archive_note call will archive', async () => {
		const screen = await renderCard(pendingCall('archive_note', { noteId: NOTE_ID }));
		expect(await visible(screen, { note: 'Infrastructure' })).toEqual({ note: 1 });
	});

	it('shows both the note being renamed and its proposed title', async () => {
		const screen = await renderCard(
			pendingCall('rename_note', { noteId: NOTE_ID, title: 'Renamed' })
		);
		expect(await visible(screen, { proposed: 'Renamed', current: 'on Infrastructure' })).toEqual({
			proposed: 1,
			current: 1
		});
	});
});

/**
 * The dialog exists to give a change more room than the panel has. Offered for every call it
 * opened a full-width modal onto one line — "Default model: openai/gpt-5.6" — which asked the
 * user to open a window in order to learn nothing.
 */
describe('The review card only offers the room a change actually needs', () => {
	const preferences = {
		defaultModel: 'openai/gpt-5.6',
		executionMode: 'approval_required',
		inlineSuggestionsEnabled: true
	} as unknown as Parameters<typeof ToolApprovalCard>[1]['preferences'];

	const renderSettings = () =>
		render(ToolApprovalCard, {
			tool: pendingCall('update_agent_preferences', {
				defaultModel: 'anthropic/claude-sonnet-4.5'
			}),
			shell,
			preferences,
			onapprove: () => {},
			onreject: () => {}
		});

	it('offers no full review for a change with nothing held back', async () => {
		const screen = await renderCard(pendingCall('archive_note', { noteId: NOTE_ID }));
		expect(await screen.getByRole('button', { name: 'Review in full' }).all()).toHaveLength(0);
	});

	it('hands a settings change the control that makes it instead', async () => {
		const screen = await renderSettings();
		expect(await screen.getByRole('link', { name: 'Open settings' }).all()).toHaveLength(1);
	});

	it('states the model being replaced, which the arguments alone never said', async () => {
		const screen = await renderSettings();
		expect(await visible(screen, { previous: 'openai/gpt-5.6' })).toEqual({ previous: 1 });
	});
});
