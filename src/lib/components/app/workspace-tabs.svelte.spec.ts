import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from 'vitest-browser-svelte';
import type { NoteId, NoteSummary, ProjectId, ShellContext } from '$lib/models';
import { NOTE_DRAG_MIME } from '$lib/client/note-drag';

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

const workbenchState = {
	openTabs: [] as NoteId[],
	focusedNoteId: undefined as NoteId | undefined,
	pinnedTabs: [] as NoteId[],
	recentlyUsed: [] as NoteId[],
	stripHidden: false,
	isPinned: () => false,
	focusTab: vi.fn(),
	closeTab: vi.fn(),
	openTabInBackground: vi.fn(),
	toggleStripHidden: vi.fn()
};

vi.mock('$lib/stores/workbench.svelte', () => ({
	workbench: workbenchState
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

afterEach(() => {
	cleanup();
	// Reset the shared workbench mock to its empty default; each test that
	// needs tab state sets it explicitly before rendering.
	workbenchState.openTabs = [];
	workbenchState.focusedNoteId = undefined;
	workbenchState.pinnedTabs = [];
	workbenchState.recentlyUsed = [];
	workbenchState.stripHidden = false;
	workbenchState.isPinned = () => false;
	workbenchState.openTabInBackground.mockClear();
});

const useTabs = (tabs: NoteId[], focused?: NoteId): void => {
	workbenchState.openTabs = tabs;
	workbenchState.focusedNoteId = focused ?? tabs[0];
};

describe('WorkspaceTabs', () => {
	it('groups open tabs by project, rendering each project name as a tab-group label', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		workbenchState.pinnedTabs = [id(1)];
		const screen = await render(WorkspaceTabs, { shell });
		await expect.element(screen.getByText('Acme rebrand')).toBeVisible();
		await expect.element(screen.getByText('Q3 planning')).toBeVisible();
		await expect.element(screen.getByText('Meeting notes')).toBeVisible();
		await expect.element(screen.getByText('Positions')).toBeVisible();
		await expect.element(screen.getByText('Sprint plan')).toBeVisible();
	});

	it('renders an uppercase project label even when only one project is open', async () => {
		useTabs([id(1), id(2)]);
		const singleProjectShell: ShellContext = {
			...shell,
			noteTree: [
				note(1, projectId(1), 'Meeting notes'),
				note(2, projectId(1), 'Positions')
			] as never
		} as never;
		const screen = await render(WorkspaceTabs, { shell: singleProjectShell });
		const label = screen.container.querySelector('.eyebrow') as HTMLElement;
		expect(label).toBeTruthy();
		if (label) await expect.element(label).toHaveTextContent('Acme rebrand');
	});

	it('marks the focused tab as selected with a teal top accent', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		workbenchState.pinnedTabs = [id(1)];
		const screen = await render(WorkspaceTabs, { shell });
		const activeTab = screen.getByRole('tab', { selected: true });
		await expect.element(activeTab).toHaveTextContent('Positions');
		// The accent is now an inset <span> inside the active tab so it reads
		// clearly off the sticky strip's top edge ( thicker + 2px inset).
		const accent = activeTab.element().querySelector('.bg-primary');
		expect(accent).toBeTruthy();
		expect(accent!.className).toContain('rounded-b-sm');
	});

	it('renders a thin vertical divider between adjacent tabs in the same project group', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		// Acme rebrand has two tabs (Meeting notes, Positions); between them
		// there must be a 1px-wide divider with the border color and 1rem height.
		const dividers = screen.container.querySelectorAll('div.w-px.bg-border');
		expect(dividers.length).toBeGreaterThanOrEqual(1);
	});

	// A tab takes the cursor but not the lift: it holds a nested close button, so
	// lifting both would double the travel. The chevron is a free target and opts
	// into the full contract via `tactile`. See DESIGN_SYSTEM.md "Interaction
	// states" — the bare `cursor: pointer` for every other button now comes from
	// the base layer in layout.css rather than from any class here.
	it('makes tabs pointer-cursor clickable without lifting them', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		const tabs = screen.container.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBeGreaterThan(0);
		for (const tab of tabs) {
			expect(tab.className).toContain('cursor-pointer');
		}
	});

	it('gives the project chevron the tactile hover contract', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		const chevrons = screen.container.querySelectorAll('button[aria-expanded]');
		expect(chevrons.length).toBeGreaterThan(0);
		for (const chevron of chevrons) {
			expect(chevron.className).toContain('tactile');
		}
	});

	it('marks a folded project as collapsed for assistive technology', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		const collapse = screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' });
		const collapseButton = collapse.element();
		await collapse.click();
		expect(collapseButton.getAttribute('aria-expanded')).toBe('false');
	});

	it('removes a folded unpinned tab from keyboard and assistive technology immediately', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		const wrapper = screen.container.querySelector(`[data-project-tab="${id(2)}"]`);
		expect(wrapper?.hasAttribute('inert')).toBe(true);
	});

	it('keeps a folded unpinned tab mounted while its exit animation runs', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
		const exitingTab = screen.container.querySelector(`[data-project-tab="${id(2)}"] [role="tab"]`);
		expect(exitingTab).not.toBeNull();
	});

	it('removes a folded unpinned tab after its exit animation', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		await new Promise((resolve) => setTimeout(resolve, 350));
		const foldedTab = screen.container.querySelector(`[data-project-tab="${id(2)}"] [role="tab"]`);
		expect(foldedTab).toBeNull();
	});

	it('keeps pinned tabs visible when their project is folded', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		workbenchState.isPinned = (noteId: NoteId) => noteId === id(1);
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		const pinnedTab = screen.container.querySelector(`[data-project-tab="${id(1)}"] [role="tab"]`);
		expect(pinnedTab).not.toBeNull();
	});

	it('keeps other projects visible when one project is folded', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		const otherProjectTab = screen.container.querySelector(
			`[data-project-tab="${id(3)}"] [role="tab"]`
		);
		expect(otherProjectTab).not.toBeNull();
	});

	it('restores folded tabs when their project is expanded', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		await screen.getByRole('button', { name: 'Collapse Acme rebrand tabs' }).click();
		await screen.getByRole('button', { name: 'Expand Acme rebrand tabs' }).click();
		const restoredTab = screen.container.querySelector(
			`[data-project-tab="${id(2)}"] [role="tab"]`
		);
		expect(restoredTab).not.toBeNull();
	});

	it('renders a pin glyph for pinned tabs', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		// `isPinned` is set in the mock's initial definition to return true
		// only for id(1); we just need to also mark it as pinned in the
		// `pinnedTabs` collection (which the component reads via `isPinned`).
		workbenchState.pinnedTabs = [id(1)];
		workbenchState.isPinned = (noteId: NoteId) => noteId === id(1);
		const screen = await render(WorkspaceTabs, { shell });
		const pins = screen.container.querySelectorAll('svg.lucide-pin');
		expect(pins.length).toBeGreaterThan(0);
	});

	it('renders the + new-note button with a stable, matching sidebar affordance', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const oncreateNote = vi.fn();
		const screen = await render(WorkspaceTabs, { shell, oncreateNote });
		const newNoteButton = screen.getByRole('button', { name: 'New note' });
		await expect.element(newNoteButton).toBeVisible();
		await newNoteButton.click();
		expect(oncreateNote).toHaveBeenCalledOnce();
	});

	it('renders the edge chevron at the right of the strip and toggles hidden on click', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const ontoggleHidden = vi.fn();
		const screen = await render(WorkspaceTabs, { shell, ontoggleHidden });
		const hideButton = screen.getByRole('button', { name: 'Hide tab strip' });
		await expect.element(hideButton).toBeVisible();
		// The chevron must be the very last button in the strip so its click
		// target is at a stable screen position regardless of tab count.
		const buttons = screen.container.querySelectorAll('button');
		expect(buttons[buttons.length - 1]).toBe(hideButton.element());
		await hideButton.click();
		expect(ontoggleHidden).toHaveBeenCalledOnce();
	});

	it('uses the panel height transition tokens while expanded', async () => {
		const screen = await render(WorkspaceTabs, { shell });
		const strip = screen.getByRole('tablist', { name: 'Open notes' }).element();
		expect(strip.className).toContain(
			'transition-[height] duration-(--duration-panel) ease-(--ease-standard)'
		);
	});

	it('uses the 40px expanded height endpoint', async () => {
		const screen = await render(WorkspaceTabs, { shell });
		const strip = screen.getByRole('tablist', { name: 'Open notes' }).element();
		expect(strip.className).toContain('h-10');
	});

	it('uses the panel height transition tokens while collapsed', async () => {
		const screen = await render(WorkspaceTabs, { shell, hidden: true });
		const strip = screen.getByRole('tablist', { name: 'Open notes' }).element();
		expect(strip.className).toContain(
			'transition-[height] duration-(--duration-panel) ease-(--ease-standard)'
		);
	});

	it('uses the 24px collapsed height endpoint', async () => {
		const screen = await render(WorkspaceTabs, { shell, hidden: true });
		const strip = screen.getByRole('tablist', { name: 'Open notes' }).element();
		expect(strip.className).toContain('h-6');
	});

	it('collapses to a 24px strip when hidden and reveals only the show chevron', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const ontoggleHidden = vi.fn();
		const screen = await render(WorkspaceTabs, {
			shell,
			hidden: true,
			ontoggleHidden
		});
		const showButton = screen.getByRole('button', { name: 'Show tab strip' });
		await expect.element(showButton).toBeVisible();
		// Nothing else is rendered in the hidden strip: no `+`, no tabs,
		// no project groups.  `role="tab"` elements must be absent.
		expect(screen.container.querySelectorAll('[role="tab"]').length).toBe(0);
		const newNote = screen.container.querySelector('[aria-label="New note"]');
		expect(newNote).toBeNull();
		await showButton.click();
		expect(ontoggleHidden).toHaveBeenCalledOnce();
	});

	it('shows an empty state with no project chip when there are no open tabs', async () => {
		// `afterEach` leaves `workbenchState` empty by default, so the strip
		// renders with zero open tabs — the "No notes open" branch.
		const screen = await render(WorkspaceTabs, {
			shell,
			oncreateNote: vi.fn()
		});
		await expect.element(screen.getByText('No notes open')).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'New note' })).toBeVisible();
		expect(screen.container.querySelectorAll('[role="tab"]').length).toBe(0);
	});

	it('marks each tab as draggable so drag-to-split can carry its note id', async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		const tabs = screen.container.querySelectorAll('[role="tab"]');
		expect(tabs.length).toBe(3);
		for (const tab of tabs) {
			expect(tab.getAttribute('draggable')).toBe('true');
		}
	});

	it("writes the dragged tab's note id to the dataTransfer on dragstart", async () => {
		useTabs([id(1), id(2), id(3)], id(2));
		const screen = await render(WorkspaceTabs, { shell });
		const tabs = screen.container.querySelectorAll('[role="tab"]');
		const firstTab = tabs[0] as HTMLElement;
		// Chromium's DragEvent constructor rejects a fake `DataTransfer`, so
		// we dispatch a plain `Event` and stub `dataTransfer` on it via
		// `Object.defineProperty`.  Svelte's `ondragstart` only needs the
		// `dataTransfer.setData` / `.effectAllowed` surface.
		const dataTransfer = {
			_data: {} as Record<string, string>,
			setData(type: string, value: string) {
				this._data[type] = value;
			},
			getData(type: string) {
				return this._data[type] ?? '';
			},
			effectAllowed: 'none'
		};
		const event = new Event('dragstart', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
		firstTab.dispatchEvent(event);
		expect({
			payload: dataTransfer._data[NOTE_DRAG_MIME],
			effect: dataTransfer.effectAllowed
		}).toEqual({ payload: id(1), effect: 'copy' });
	});

	it('opens a valid dropped note in the background', async () => {
		useTabs([id(1)], id(1));
		const screen = await render(WorkspaceTabs, { shell });
		const dataTransfer = {
			types: [NOTE_DRAG_MIME],
			getData: (type: string) => (type === NOTE_DRAG_MIME ? id(2) : ''),
			dropEffect: 'none'
		};
		const event = new Event('drop', { bubbles: true, cancelable: true });
		Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
		screen.getByRole('tablist', { name: 'Open notes' }).element().dispatchEvent(event);
		expect(workbenchState.openTabInBackground).toHaveBeenCalledWith(id(2));
	});
});
