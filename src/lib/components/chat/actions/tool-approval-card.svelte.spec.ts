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

const pendingCall = (name: string, args: Record<string, unknown>): ChatToolActivity => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name,
	arguments: args,
	status: 'approval_required'
});

const createTodos = (todos: Record<string, unknown>[]): ChatToolActivity =>
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
