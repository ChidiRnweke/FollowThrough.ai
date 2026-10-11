<script lang="ts" module>
	import type { NoteId } from '$lib/models/notes';

	// The last active note whose ancestors were revealed. Module scope, because
	// the mobile sidebar is a sheet that unmounts the tree on every close; a
	// reopen must not undo a collapse the reader made after that reveal.
	let revealedNoteId: NoteId | undefined;
	// The last place scrolled into view, a note or a project page, for the same reason:
	// a reopened sheet must not yank the list back after the reader scrolled away.
	let scrolledTo: string | undefined;
</script>

<script lang="ts">
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/workspace';
	import type { NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import { goto } from '$app/navigation';
	import { TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { onMount, tick } from 'svelte';
	import { PrefersReducedMotion } from '$lib/hooks/prefers-reduced-motion.svelte';
	import { projectTreeController } from '$lib/factories/projects/tree';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { workspaceSession } from '$lib/factories/workspace/session';
	import { createSkill, moveEntry as moveOnServer } from '$lib/remote/projects/projects.remote';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import NameDialog from './name-dialog.svelte';
	import ProjectTreeView from './project-tree-view.svelte';

	let {
		inventoryReady = true,
		projects,
		noteTree,
		activeNoteId,
		activePath
	}: {
		inventoryReady?: boolean;
		projects: readonly Project[];
		noteTree: readonly NoteSummary[];
		activeNoteId?: NoteId;
		activePath: string;
	} = $props();

	// An action in flight disables the name dialogs, so a second Enter cannot submit twice.
	let busy = $state(0);
	async function action<T>(work: () => Promise<T>): Promise<T> {
		busy += 1;
		try {
			return await work();
		} finally {
			busy -= 1;
		}
	}
	/** Move on the server, then show the result: the tree reads the refreshed workspace. */
	const move = (
		projectId: ProjectId,
		entryId: NoteId,
		parentId: NoteId | undefined,
		position: number
	) =>
		action(() =>
			workspaceSession.serverChange(moveOnServer({ projectId, entryId, parentId, position }))
		);
	const missingWorkspace = {
		kind: 'failure',
		message: 'Open the workspace before editing'
	} as const;

	const STORAGE_KEY = 'workbench.tree.expanded';

	const active = $derived(noteTree.filter((note) => !note.archivedAt));
	const byId = $derived(new Map(active.map((note) => [note.id, note])));
	// A plain Map: reactivity comes from the `noteTree` prop, and a SvelteMap
	// built here would be read and written inside its own derivation.
	const childrenOf = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt per derivation; see above
		const map = new Map<string, NoteSummary[]>();
		for (const note of active) {
			const key = `${note.projectId}:${note.parentId ?? 'root'}`;
			const siblings = map.get(key) ?? [];
			siblings.push(note);
			map.set(key, siblings);
		}
		for (const siblings of map.values()) {
			siblings.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
		}
		return map;
	});

	function zoneKey(projectId: ProjectId, parentId?: NoteId): string {
		return `${projectId}:${parentId ?? 'root'}`;
	}

	function entriesUnder(projectId: ProjectId, parentId?: NoteId): NoteSummary[] {
		return childrenOf.get(zoneKey(projectId, parentId)) ?? [];
	}

	function foldersOf(projectId: ProjectId): NoteSummary[] {
		return active.filter((note) => note.projectId === projectId && note.kind === 'folder');
	}

	// Projects default to expanded, folders to collapsed; `toggled` records
	// deviations from that default and is persisted per browser.
	const toggled = new SvelteSet<string>();
	let togglesRestored = $state(false);
	let transitionsReady = $state(false);

	function readStoredToggles(): string[] {
		if (typeof localStorage === 'undefined') return [];
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string'))
			throw new Error('Stored project tree state is invalid');
		return parsed;
	}

	onMount(() => {
		for (const key of readStoredToggles()) toggled.add(key);
		togglesRestored = true;

		let enableTransitionsFrame: number | undefined;
		const restoredStateFrame = requestAnimationFrame(() => {
			enableTransitionsFrame = requestAnimationFrame(() => {
				transitionsReady = true;
			});
		});

		return () => {
			cancelAnimationFrame(restoredStateFrame);
			if (enableTransitionsFrame !== undefined) cancelAnimationFrame(enableTransitionsFrame);
		};
	});

	$effect(() => {
		if (!togglesRestored) return;
		localStorage.setItem(STORAGE_KEY, JSON.stringify([...toggled]));
	});

	function isProjectOpen(projectId: ProjectId): boolean {
		if (!togglesRestored) return false;
		return !toggled.has(`project:${projectId}`);
	}

	function isFolderOpen(folderId: NoteId): boolean {
		return toggled.has(folderId);
	}

	function toggleProject(projectId: ProjectId): void {
		toggle(`project:${projectId}`);
	}

	function toggle(key: string): void {
		if (toggled.has(key)) toggled.delete(key);
		else toggled.add(key);
	}

	function expandTo(projectId: ProjectId, parentId?: NoteId): void {
		toggled.delete(`project:${projectId}`);
		if (parentId && !isFolderOpen(parentId)) toggled.add(parentId);
	}

	// Keep the active note reachable: expand its project and folder ancestors
	// once per change of active note. Tree refreshes and remounts leave the
	// reader's later collapses alone.
	$effect(() => {
		if (!togglesRestored) return;
		if (!activeNoteId) {
			revealedNoteId = undefined;
			return;
		}
		if (activeNoteId === revealedNoteId) return;
		const node = byId.get(activeNoteId);
		if (!node) return;
		toggled.delete(`project:${node.projectId}`);
		for (const parentId of projectTreeController.revealPath(node, byId)) toggled.add(parentId);
		revealedNoteId = activeNoteId;
	});

	// A project page names its project in the path; expand it as a note's ancestors are.
	const routeProjectId = $derived(
		activePath.startsWith('/projects/') ? (activePath.split('/')[2] as ProjectId) : undefined
	);
	$effect(() => {
		if (!togglesRestored || !routeProjectId || scrolledTo === routeProjectId) return;
		toggled.delete(`project:${routeProjectId}`);
	});

	// Expanding is not enough when the open project sits below the fold of a long list:
	// bring its row into view once per change of place, after the expansion renders.
	const reducedMotion = new PrefersReducedMotion();
	$effect(() => {
		const place = activeNoteId ?? routeProjectId;
		if (!togglesRestored || !place || place === scrolledTo) return;
		scrolledTo = place;
		void tick().then(() => {
			const row = document.querySelector<HTMLElement>(
				'[data-sidebar="sidebar"] [data-active="true"]'
			);
			const list = row?.closest<HTMLElement>('[data-sidebar="content"]');
			if (!row || !list) return;
			const shown = list.getBoundingClientRect();
			const at = row.getBoundingClientRect();
			if (at.top >= shown.top && at.bottom <= shown.bottom) return;
			// Centred, so the rows under an expanded project show with it.
			row.scrollIntoView({ block: 'center', behavior: reducedMotion.current ? 'auto' : 'smooth' });
		});
	});

	// --- Drag and drop (within a project only; the zone type enforces it) ---

	// Overrides are written only from the dnd event handlers and dropped once the
	// server round-trip that follows a move has landed.  Deliberately not driven
	// by an `$effect` on `childrenOf`: that made an effect write state the
	// template reads back, and it fired on every unrelated `invalidateAll`.
	const dndOverrides = new SvelteMap<string, NoteSummary[]>();

	// Keys whose override stands in for a move the server has not confirmed yet.
	const awaitingServer = new SvelteSet<string>();

	function zoneItems(projectId: ProjectId, parentId?: NoteId): NoteSummary[] {
		return dndOverrides.get(zoneKey(projectId, parentId)) ?? entriesUnder(projectId, parentId);
	}

	// A zone the drag only passed over gets `consider` events but no `finalize`, so
	// its override would outlive the drag and hide what the server later puts there
	// (a note dropped on a folder row vanished this way). Once a drag ends, only
	// overrides still waiting on the server may stay.
	function releaseIdleOverrides(): void {
		for (const key of [...dndOverrides.keys()])
			if (!awaitingServer.has(key)) dndOverrides.delete(key);
	}

	function holdUntilServer(overrides: ReadonlyMap<string, NoteSummary[]>, move: Promise<unknown>) {
		for (const [key, items] of overrides) {
			dndOverrides.set(key, items);
			awaitingServer.add(key);
		}
		void move.finally(() => {
			// Server truth has landed (the move refreshes the workspace); on failure the tree
			// should snap back to it rather than keep showing the dropped order.
			for (const key of overrides.keys()) {
				awaitingServer.delete(key);
				dndOverrides.delete(key);
			}
		});
	}

	// The entry being dragged, so its own subtree can refuse the drop: the server
	// rejects a move below a descendant, and the tree should not offer one.
	let draggingId = $state<NoteId | undefined>(undefined);
	// Where the shadow last sat in a list, read when it moves into a folder row.
	let lastShadow: { key: string; index: number } | undefined;
	// The folder row currently holding the shadow, and whether the shadow reached
	// it from above within the same list.
	let folderHover = $state<{ folderId: NoteId; fromAbove: boolean } | undefined>(undefined);

	function endDrag(): void {
		draggingId = undefined;
		lastShadow = undefined;
		folderHover = undefined;
	}

	function isDropBlocked(folderId: NoteId): boolean {
		if (draggingId === undefined) return false;
		const folder = byId.get(folderId);
		return folder !== undefined && projectTreeController.contains(folder, draggingId, byId);
	}

	function handleDndConsider(
		projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		if (event.detail.info.trigger === TRIGGERS.DRAG_STARTED)
			draggingId = event.detail.info.id as NoteId;
		const key = zoneKey(projectId, parentId);
		const index = event.detail.items.findIndex((item) => item.id === draggingId);
		if (index >= 0) lastShadow = { key, index };
		dndOverrides.set(key, event.detail.items);
	}

	function handleDndFinalize(
		projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		endDrag();
		const key = zoneKey(projectId, parentId);
		const draggedId = event.detail.info.id as NoteId;
		const index = event.detail.items.findIndex((item) => item.id === draggedId);
		const original = index < 0 ? undefined : byId.get(draggedId);
		const moved =
			original !== undefined &&
			((original.parentId ?? undefined) !== parentId || original.position !== index);
		if (moved) {
			const moving = move(projectId, draggedId, parentId, index);
			void moving.then((moved) => {
				if (moved.kind === 'failure') toast.error(moved.message);
			});
			holdUntilServer(new Map([[key, event.detail.items]]), moving);
		}
		// Anything else already matches the rendered order, or nothing will arrive
		// to supersede it.
		releaseIdleOverrides();
	}

	// Each folder row carries a second zone that means "into this folder". It only
	// ever holds the drag shadow while the pointer rests on the row.
	function intoKey(folderId: NoteId): string {
		return `into:${folderId}`;
	}

	function intoItems(folderId: NoteId): NoteSummary[] {
		return dndOverrides.get(intoKey(folderId)) ?? [];
	}

	// How a folder row splits between "into" and reordering around it. The library
	// puts the shadow at the index of whatever row it hovers, so hovering a folder
	// from below means "before it" and from above means "after it". The reorder
	// band therefore sits on the edge away from the shadow, and the near edge
	// belongs to "into"; otherwise approaching a row would push the folder out from
	// under the pointer. The band stays put while the shadow is inside.
	//
	// Entering the row also takes the shadow out of the list. When it sat above the
	// folder, the folder would jump up a row and leave the pointer below it, so the
	// row holds the vacated space (`holdsSlot`) until the shadow leaves again.
	function folderDrop(folder: NoteSummary): { band: 'top' | 'bottom'; holdsSlot: boolean } {
		if (folderHover?.folderId === folder.id)
			return {
				band: folderHover.fromAbove ? 'bottom' : 'top',
				holdsSlot: folderHover.fromAbove
			};
		const siblings = zoneItems(folder.projectId, folder.parentId);
		const shadow = siblings.findIndex((entry) => entry.id === draggingId);
		const self = siblings.findIndex((entry) => entry.id === folder.id);
		return { band: shadow >= 0 && shadow < self ? 'bottom' : 'top', holdsSlot: false };
	}

	function handleIntoConsider(
		folder: NoteSummary,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		dndOverrides.set(intoKey(folder.id), event.detail.items);
		const holdsShadow = event.detail.items.some((item) => item.id === draggingId);
		if (!holdsShadow) {
			if (folderHover?.folderId === folder.id) folderHover = undefined;
			return;
		}
		if (folderHover?.folderId === folder.id) return;
		// The list has already dropped the shadow, so compare against where the
		// folder stood beside it: the shadow was above if it sat at or before the
		// folder's current index.
		const parentKey = zoneKey(folder.projectId, folder.parentId);
		const self = zoneItems(folder.projectId, folder.parentId).findIndex(
			(entry) => entry.id === folder.id
		);
		folderHover = {
			folderId: folder.id,
			fromAbove: lastShadow?.key === parentKey && lastShadow.index <= self
		};
	}

	function handleIntoFinalize(
		folder: NoteSummary,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		endDrag();
		dndOverrides.delete(intoKey(folder.id));
		const draggedId = event.detail.info.id as NoteId;
		const dragged = byId.get(draggedId);
		const dropped = event.detail.items.some((item) => item.id === draggedId);
		if (dragged && dropped && (dragged.parentId ?? undefined) !== folder.id) {
			const target = entriesUnder(folder.projectId, folder.id);
			const moving = move(folder.projectId, dragged.id, folder.id, target.length);
			void moving.then((moved) => {
				if (moved.kind === 'failure') toast.error(moved.message);
			});
			// Show the drop at once: the entry leaves its list and ends the folder's,
			// which opens so the result is visible.
			holdUntilServer(
				new Map([
					[
						zoneKey(dragged.projectId, dragged.parentId),
						entriesUnder(dragged.projectId, dragged.parentId).filter(
							(entry) => entry.id !== dragged.id
						)
					],
					[zoneKey(folder.projectId, folder.id), [...target, dragged]]
				]),
				moving
			);
			expandTo(folder.projectId, folder.id);
		}
		releaseIdleOverrides();
	}

	// --- Inline creation / rename ---

	type InlineEdit =
		| { mode: 'create'; kind: 'note' | 'folder' | 'skill'; projectId: ProjectId; parentId?: NoteId }
		| {
				mode: 'rename';
				entryId: NoteId;
				current: string;
				draft: WorkspaceDraftController<'notes'> | null;
		  };

	let inlineEdit = $state<InlineEdit | null>(null);
	let inlineCreateValue = $state('');
	let inlineCreateSubmitted = false;

	function startCreate(
		kind: 'note' | 'folder' | 'skill',
		projectId: ProjectId,
		parentId?: NoteId
	): void {
		expandTo(projectId, parentId);
		inlineCreateValue = '';
		inlineCreateSubmitted = false;
		inlineEdit = { mode: 'create', kind, projectId, parentId };
	}

	function handleInlineCreateKeydown(event: KeyboardEvent): void {
		if (event.key === 'Enter') {
			event.preventDefault();
			const trimmed = inlineCreateValue.trim();
			if (!trimmed || busy) return;
			inlineCreateSubmitted = true;
			void submitInline(trimmed);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			inlineEdit = null;
		}
	}

	function handleInlineCreateBlur(): void {
		if (!inlineCreateSubmitted && !busy) inlineEdit = null;
	}

	function isCreatingIn(projectId: ProjectId, parentId?: NoteId): boolean {
		return (
			inlineEdit?.mode === 'create' &&
			inlineEdit.projectId === projectId &&
			(inlineEdit.parentId ?? undefined) === parentId
		);
	}

	async function submitInline(value: string): Promise<void> {
		if (!inlineEdit) return;
		const pending = inlineEdit;
		if (pending.mode === 'rename') {
			const draft = pending.draft;
			const renamed = await action(() =>
				draft
					? draft.stage({ kind: 'renameNote', noteId: pending.entryId, title: value })
					: Promise.resolve(missingWorkspace)
			);
			if (renamed.kind === 'failure') {
				toast.error(renamed.message);
				return;
			}
			inlineEdit = null;
			return;
		}
		if (pending.kind === 'note') {
			const id = crypto.randomUUID() as NoteId;
			const created = await action(() =>
				workspaceSession.create({
					kind: 'createNote',
					id,
					projectId: pending.projectId,
					parentId: pending.parentId,
					title: value
				})
			);
			if (created.kind === 'failure') {
				toast.error(created.message);
				return;
			}
			inlineEdit = null;
			await workbench.openTab(id);
		} else if (pending.kind === 'folder') {
			const created = await action(() =>
				workspaceSession.create({
					kind: 'createFolder',
					id: crypto.randomUUID() as NoteId,
					projectId: pending.projectId,
					parentId: pending.parentId,
					name: value
				})
			);
			if (created.kind === 'failure') {
				toast.error(created.message);
				return;
			}
			inlineEdit = null;
		} else {
			const created = await action(() =>
				workspaceSession.serverChange(
					createSkill({ name: value, projectId: pending.projectId, parentId: pending.parentId })
				)
			);
			if (created.kind === 'failure') {
				toast.error(created.message);
				return;
			}
			inlineEdit = null;
			await workbench.openTab(created.value.skill.note.id);
		}
	}

	// --- Project-level dialog (create / rename projects only) ---

	type ProjectDialog =
		| { kind: 'new-project' }
		| {
				kind: 'rename-project';
				projectId: ProjectId;
				draft: WorkspaceDraftController<'projects'> | null;
				current: string;
		  };

	let dialog = $state<ProjectDialog | null>(null);

	// Returns false on failure so the dialog stays open with the name still typed —
	// the toast now says what was wrong (e.g. the name is taken), so it is fixable.
	async function submitDialog(value: string): Promise<boolean> {
		if (!dialog) return true;
		const pending = dialog;
		if (pending.kind === 'new-project') {
			const id = crypto.randomUUID() as ProjectId;
			const created = await action(() =>
				workspaceSession.create({ kind: 'createProject', id, name: value })
			);
			if (created.kind === 'failure') {
				toast.error(created.message);
				return false;
			}
			await goto(`/projects/${id}`);
			return true;
		}
		const draft = pending.draft;
		const renamed = await action(() =>
			draft
				? draft.stage({ kind: 'renameProject', projectId: pending.projectId, name: value })
				: Promise.resolve(missingWorkspace)
		);
		if (renamed.kind === 'failure') {
			toast.error(renamed.message);
			return false;
		}
		return true;
	}

	async function archiveEntry(entry: NoteSummary): Promise<void> {
		const archived = await action(() =>
			workspaceSession.edit(
				{ type: 'notes', id: [entry.id] },
				{ kind: 'archiveNote', noteId: entry.id }
			)
		);
		if (archived.kind === 'failure') {
			toast.error(archived.message);
			return;
		}
		toast.success('Moved to trash');
		if (activeNoteId === entry.id) await goto('/today');
	}

	async function archiveProject(project: Project): Promise<void> {
		const archived = await action(() =>
			workspaceSession.edit(
				{ type: 'projects', id: [project.id] },
				{ kind: 'archiveProject', projectId: project.id }
			)
		);
		if (archived.kind === 'failure') {
			toast.error(archived.message);
			return;
		}
		if (activePath.startsWith(`/projects/${project.id}`)) await goto('/today');
	}

	async function moveEntry(entry: NoteSummary, parentId?: NoteId): Promise<void> {
		if ((entry.parentId ?? undefined) === parentId) return;
		const position = entriesUnder(entry.projectId, parentId).length;
		const moved = await move(entry.projectId, entry.id, parentId, position);
		if (moved.kind === 'failure') toast.error(moved.message);
		else if (parentId && !isFolderOpen(parentId)) toggled.add(parentId);
	}

	function openSideBySide(noteId: NoteId): void {
		if (noteId === workbench.focusedNoteId || noteId === workbench.splitNoteId) return;
		void workbench.setSplit(noteId);
	}

	function openNewProject(): void {
		dialog = { kind: 'new-project' };
	}

	export { openNewProject };
</script>

<ProjectTreeView
	{inventoryReady}
	{projects}
	{activeNoteId}
	{activePath}
	{transitionsReady}
	bind:inlineEdit
	bind:inlineCreateValue
	busy={busy > 0}
	{zoneItems}
	{isProjectOpen}
	{isFolderOpen}
	{foldersOf}
	{isCreatingIn}
	{toggle}
	{toggleProject}
	{startCreate}
	{handleInlineCreateKeydown}
	{handleInlineCreateBlur}
	{submitInline}
	{handleDndConsider}
	{handleDndFinalize}
	{intoItems}
	{handleIntoConsider}
	{handleIntoFinalize}
	{isDropBlocked}
	{folderDrop}
	{moveEntry}
	{archiveEntry}
	{archiveProject}
	onopen={(noteId) => void workbench.openTab(noteId)}
	onopenbackground={(noteId) => void workbench.openTabInBackground(noteId)}
	onopensplit={openSideBySide}
	onrenameproject={(project) =>
		(dialog = {
			kind: 'rename-project',
			projectId: project.id,
			draft: workspaceSession.capture({ type: 'projects', id: [project.id] }),
			current: project.name
		})}
/>

<NameDialog
	bind:open={
		() => dialog !== null,
		(value) => {
			if (!value) dialog = null;
		}
	}
	title={dialog?.kind === 'new-project' ? 'New project' : 'Rename project'}
	label="Project name"
	submitLabel={dialog?.kind === 'new-project' ? 'Create' : 'Rename'}
	initialValue={dialog?.kind === 'rename-project' ? dialog.current : ''}
	busy={busy > 0}
	onsubmit={submitDialog}
/>
