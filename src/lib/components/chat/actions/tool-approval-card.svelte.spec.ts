import { noteReviewBuilder } from '$lib/testing/notes/fixtures/note-review';
import ToolApprovalGroup from './tool-approval-group.svelte';
import type { ShellContext } from '$lib/client/shell/views';
import type { AgentToolName } from '$lib/models/agent/tool-catalog';
import type { AgentPayloadObject } from '$lib/models/agent/payload';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
import type { NoteSummary } from '$lib/models/notes';
import type { Project } from '$lib/models/projects';

import ToolApprovalCard from './tool-approval-card.svelte';

const PROJECT_ID = 'e0d3f07c-460b-40c3-9b8c-a8dc00ddc565';
const NOTE_ID = '9e8e1812-0a7c-474d-96e4-65c5b60b3f75';

const shell = {
	projects: [{ id: PROJECT_ID, name: 'Platform Notes' } as unknown as Project],
	noteTree: [{ id: NOTE_ID, title: 'Infrastructure' } as unknown as NoteSummary]
} as unknown as ShellContext;

const pendingCall = (
	name: AgentToolName,
	args: AgentPayloadObject
): Extract<ChatToolActivity, { status: 'approval_required' }> => ({
	callId: '00000000-0000-4000-8000-0000000000aa',
	name,
	arguments: args,
	status: 'approval_required'
});

const createTodos = (todos: readonly AgentPayloadObject[]): ChatToolActivity =>
	pendingCall('create_todos', {
		requestId: '00000000-0000-4000-8000-0000000000bb',
		projectId: PROJECT_ID,
		todos
	});

const renderCard = (tool: ChatToolActivity) =>
	render(ToolApprovalCard, { tool, shell, onapprove: () => {}, onreject: () => {} });

describe('The review card shows the content a call will store', () => {
	it('shows each todo title and its stored details', async () => {
		const screen = await renderCard(
			createTodos([
				{
					title: 'Draft the RFC',
					description: 'Cover the rollout plan',
					responsibility: 'mine',
					dueDate: '2026-08-10'
				},
				{ title: 'Book the review', responsibility: 'waiting_on', waitingOn: 'Priya' }
			])
		);
		await expect.element(screen.getByText('Draft the RFC', { exact: true })).toBeVisible();
		await expect.element(screen.getByText('Book the review', { exact: true })).toBeVisible();
		await expect.element(screen.getByText('Description: Cover the rollout plan')).toBeVisible();
		await expect.element(screen.getByText('Responsibility: mine')).toBeVisible();
		await expect.element(screen.getByText('Due: 2026-08-10')).toBeVisible();
		await expect.element(screen.getByText('Waiting on: Priya')).toBeVisible();
	});

	it('shows compact overflow and the expanded item for the same todo batch', async () => {
		const screen = await renderCard(
			createTodos(
				['One', 'Two', 'Three', 'Four', 'Five', 'Six'].map((title) => ({
					title: `Todo ${title}`
				}))
			)
		);
		await expect.element(screen.getByText('…and 1 more')).toBeVisible();
		await screen.getByRole('button', { name: 'Review in full' }).click();
		await expect.element(screen.getByText('Todo Six', { exact: true })).toBeVisible();
	});
});

describe('The review card names what an id-only call acts on', () => {
	it('names the note an archive_note call will archive', async () => {
		const screen = await renderCard(pendingCall('archive_note', { noteId: NOTE_ID }));
		await expect.element(screen.getByText('Move note to trash · Infrastructure')).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: 'Review in full' }))
			.not.toBeInTheDocument();
	});

	it('shows both the note being renamed and its proposed title', async () => {
		const screen = await renderCard(
			pendingCall('rename_note', { noteId: NOTE_ID, title: 'Renamed' })
		);
		await expect.element(screen.getByText('Rename note · Renamed')).toBeVisible();
		await expect.element(screen.getByText('on Infrastructure', { exact: true })).toBeVisible();
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

	it('hands a settings change the control that makes it instead', async () => {
		const screen = await renderSettings();
		await expect.element(screen.getByRole('link', { name: 'Open settings' })).toBeVisible();
		await expect.element(screen.getByText('openai/gpt-5.6', { exact: true })).toBeVisible();
	});
});

describe('Reviewed note approval controls', () => {
	it('names the reviewed skill without downloading its current body', async () => {
		const review = noteReviewBuilder();
		const screen = await renderCard({
			...pendingCall('edit_skill', {
				noteId: review.change.noteId,
				edits: [{ oldText: 'Monday', newText: 'Tuesday' }]
			}),
			status: 'approval_required',
			noteReview: review
		});
		await expect.element(screen.getByText('Edit skill · Release', { exact: true })).toBeVisible();
	});
	it('blocks approval but leaves rejection available when a skill review is missing', async () => {
		const screen = await renderCard(
			pendingCall('save_skill', { noteId: NOTE_ID, markdown: 'Tuesday' })
		);
		await expect
			.element(screen.getByRole('button', { name: 'Approve', exact: true }))
			.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
	});
	it('blocks bundle approval when a skill change has no saved review', async () => {
		const screen = await render(ToolApprovalGroup, {
			tools: [
				pendingCall('save_skill', { noteId: NOTE_ID, markdown: 'Tuesday' }),
				{ ...pendingCall('archive_note', { noteId: NOTE_ID }), callId: 'another-call' }
			],
			onapprove: () => {},
			onreject: () => {}
		});
		await expect.element(screen.getByRole('button', { name: 'Approve all (2)' })).toBeDisabled();
	});
	it('names the prepared note without downloading the current note', async () => {
		const review = noteReviewBuilder();
		const screen = await renderCard({
			...pendingCall('save_note', { noteId: review.change.noteId, markdown: 'Tuesday' }),
			status: 'approval_required',
			noteReview: review
		});
		await expect.element(screen.getByText('Save note · Release', { exact: true })).toBeVisible();
	});
	it('blocks approval but leaves rejection available for a legacy note change', async () => {
		const screen = await renderCard(
			pendingCall('save_note', { noteId: NOTE_ID, markdown: 'Tuesday' })
		);
		await expect
			.element(screen.getByRole('button', { name: 'Approve', exact: true }))
			.toBeDisabled();
		await expect.element(screen.getByRole('button', { name: 'Reject', exact: true })).toBeEnabled();
	});
	it('does not approve a bundle containing a missing note review', async () => {
		const screen = await render(ToolApprovalGroup, {
			tools: [
				pendingCall('save_note', { noteId: NOTE_ID, markdown: 'Tuesday' }),
				{ ...pendingCall('archive_note', { noteId: NOTE_ID }), callId: 'another-call' }
			],
			onapprove: () => undefined,
			onreject: () => undefined
		});
		await expect.element(screen.getByRole('button', { name: 'Approve all (2)' })).toBeDisabled();
	});
	it('also blocks bundle approval from an expanded prepared review', async () => {
		const screen = await render(ToolApprovalGroup, {
			tools: [
				pendingCall('save_note', { noteId: NOTE_ID, markdown: 'Tuesday' }),
				{
					...pendingCall('save_note', { noteId: NOTE_ID, markdown: 'Tuesday' }),
					callId: 'prepared-call',
					status: 'approval_required',
					noteReview: noteReviewBuilder()
				}
			],
			onapprove: () => undefined,
			onreject: () => undefined
		});
		await screen.getByRole('button', { name: 'Review in full' }).click();
		await expect
			.element(screen.getByRole('button', { name: 'Approve', exact: true }))
			.toBeDisabled();
	});
});
