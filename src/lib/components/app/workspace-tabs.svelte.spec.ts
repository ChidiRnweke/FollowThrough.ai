import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { NoteId, NoteSummary, ProjectId, ShellContext } from '$lib/models';

const id = (n: number): NoteId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as NoteId;
const projectId = (n: number): ProjectId =>
	`00000000-0000-4000-8000-${String(n).padStart(12, '0')}` as ProjectId;

vi.mock('$app/navigation', () => ({
	goto: vi.fn(async () => undefined),
	invalidateAll: vi.fn(async () => undefined)
}));

vi.mock('$app/state', () => ({
	page: {
		url: new URL('http://localhost/'),
		params: {},
		status: 200,
		error: null,
		data: {}
	},
	navigating: { to: null, from: null, complete: null },
	updated: { check: async () => false }
}));

vi.mock('$lib/stores/workbench.svelte', () => ({
	workbench: {
		openTabs: [id(1), id(2), id(3)],
		focusedNoteId: id(2),
		pinnedTabs: [id(1)],
		recentlyUsed: [id(2), id(1)],
		isPinned: (noteId: NoteId) => noteId === id(1),
		focusTab: vi.fn(),
		closeTab: vi.fn()
	}
}));

const note = (n: number, project: ProjectId, title: string): NoteSummary =>
	({
		id: id(n),
		projectId: project,
		parentId: undefined,
		kind: 'note',
		position: 0,
		title,
		isPinned: false,
		archivedAt: undefined,
		updatedAt: '2026-07-11T09:00:00.000Z'
	}) as NoteSummary;

const shell: ShellContext = {
	user: {
		id: '00000000-0000-4000-8000-000000000010' as never,
		userId: '00000000-0000-4000-8000-000000000010' as never,
		displayName: 'Test',
		email: 'test@example.com'
	} as never,
	projects: [
		{ id: projectId(1), userId: 'u' as never, name: 'Acme rebrand', createdAt: '', updatedAt: '' },
		{ id: projectId(2), userId: 'u' as never, name: 'Q3 planning', createdAt: '', updatedAt: '' }
	] as never,
	noteTree: [
		note(1, projectId(1), 'Meeting notes'),
		note(2, projectId(1), 'Positions'),
		note(3, projectId(2), 'Sprint plan')
	] as never,
	skills: [],
	pendingSuggestionCount: 0,
	pendingMemoryNotifications: []
} as never;

const WorkspaceTabs = (await import('./workspace-tabs.svelte')).default;

describe('WorkspaceTabs', () => {
	it('groups open tabs by project with dividers when more than one project is open', async () => {
		const screen = await render(WorkspaceTabs, { shell });
		await expect.element(screen.getByText('Acme rebrand')).toBeVisible();
		await expect.element(screen.getByText('Q3 planning')).toBeVisible();
		await expect.element(screen.getByText('Meeting notes')).toBeVisible();
		await expect.element(screen.getByText('Positions')).toBeVisible();
		await expect.element(screen.getByText('Sprint plan')).toBeVisible();
	});

	it('marks the focused tab as selected', async () => {
		const screen = await render(WorkspaceTabs, { shell });
		const activeTab = screen.getByRole('tab', { selected: true });
		await expect.element(activeTab).toHaveTextContent('Positions');
	});

	it('renders a pin glyph for pinned tabs', async () => {
		const screen = await render(WorkspaceTabs, { shell });
		const pins = screen.container.querySelectorAll('svg.lucide-pin');
		expect(pins.length).toBeGreaterThan(0);
	});
});
