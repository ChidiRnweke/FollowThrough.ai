<script lang="ts" module>
	import type { NoteId } from '$lib/models/notes';

	// The last active note whose ancestors were revealed. Module scope, because
	// the mobile sidebar is a sheet that unmounts the tree on every close; a
	// reopen must not undo a collapse the reader made after that reveal.
	let revealedNoteId: NoteId | undefined;
</script>

<script lang="ts">
	import type { WorkspaceDraftController } from '$lib/controllers/workspace/resources.svelte';
	import type { NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import { goto } from '$app/navigation';
	import { TRIGGERS, type DndEvent } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { ancestorFolderIds, isWithinSubtree } from '$lib/services/projects/tree-expansion';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
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

	// The store keeps the server's explanation when there was one (e.g. a name
	// already in use); anything unexpected falls back to the generic copy.
	const failureMessage = (fallback: string): string => projectActions.lastError ?? fallback;

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
		for (const parentId of ancestorFolderIds(node, byId)) toggled.add(parentId);
		revealedNoteId = activeNoteId;
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
			// Server truth has landed (moveEntry synchronizes); on failure the tree
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
		return folder !== undefined && isWithinSubtree(folder, draggingId, byId);
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
			const move = projectActions.moveEntry(projectId, draggedId, parentId, index);
			void move.then((output) => {
				if (!output) toast.error(failureMessage('Could not move it. Try again.'));
			});
			holdUntilServer(new Map([[key, event.detail.items]]), move);
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
			const move = projectActions.moveEntry(folder.projectId, dragged.id, folder.id, target.length);
			void move.then((output) => {
				if (!output) toast.error(failureMessage('Could not move it. Try again.'));
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
				move
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
				draft: WorkspaceDraftController<'notes'>;
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
			if (!trimmed || projectActions.busy) return;
			inlineCreateSubmitted = true;
			void submitInline(trimmed);
		} else if (event.key === 'Escape') {
			event.preventDefault();
			inlineEdit = null;
		}
	}

	function handleInlineCreateBlur(): void {
		if (!inlineCreateSubmitted && !projectActions.busy) inlineEdit = null;
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
			const output = await projectActions.renameNote(pending.draft, value);
			if (!output) {
				toast.error(failureMessage('Could not rename it. Try again.'));
				return;
			}
			inlineEdit = null;
			return;
		}
		if (pending.kind === 'note') {
			const output = await projectActions.createNote(value, pending.projectId, pending.parentId);
			if (!output) {
				toast.error(failureMessage('Could not create the note. Try again.'));
				return;
			}
			inlineEdit = null;
			await workbench.openTab(output.note.id);
		} else if (pending.kind === 'folder') {
			const output = await projectActions.createFolder(pending.projectId, value, pending.parentId);
			if (!output) {
				toast.error(failureMessage('Could not create the folder. Try again.'));
				return;
			}
			inlineEdit = null;
		} else {
			const output = await projectActions.createSkill(value, pending.projectId, pending.parentId);
			if (!output) {
				toast.error(failureMessage('Could not create the skill. Try again.'));
				return;
			}
			inlineEdit = null;
			await workbench.openTab(output.skill.note.id);
		}
	}

	// --- Project-level dialog (create / rename projects only) ---

	type ProjectDialog =
		| { kind: 'new-project' }
		| { kind: 'rename-project'; draft: WorkspaceDraftController<'projects'>; current: string };

	let dialog = $state<ProjectDialog | null>(null);

	// Returns false on failure so the dialog stays open with the name still typed —
	// the toast now says what was wrong (e.g. the name is taken), so it is fixable.
	async function submitDialog(value: string): Promise<boolean> {
		if (!dialog) return true;
		const pending = dialog;
		if (pending.kind === 'new-project') {
			const output = await projectActions.createProject(value);
			if (!output) {
				toast.error(failureMessage('Could not create the project. Try again.'));
				return false;
			}
			await goto(`/projects/${output.project.id}`);
			return true;
		}
		const output = await projectActions.renameProject(pending.draft, value);
		if (!output) {
			toast.error(failureMessage('Could not rename the project. Try again.'));
			return false;
		}
		return true;
	}

	async function archiveEntry(entry: NoteSummary): Promise<void> {
		const output = await projectActions.archiveNote(entry.id);
		if (!output) {
			toast.error(
				failureMessage(
					entry.kind === 'folder'
						? 'Could not delete the folder. Empty it first.'
						: 'Could not delete it. Try again.'
				)
			);
			return;
		}
		toast.success('Moved to trash');
		if (activeNoteId === entry.id) await goto('/today');
	}

	async function archiveProject(project: Project): Promise<void> {
		const output = await projectActions.archiveProject(project.id);
		if (!output) {
			toast.error(failureMessage('Could not archive the project. Try again.'));
			return;
		}
		if (activePath.startsWith(`/projects/${project.id}`)) await goto('/today');
	}

	async function moveEntry(entry: NoteSummary, parentId?: NoteId): Promise<void> {
		if ((entry.parentId ?? undefined) === parentId) return;
		const position = entriesUnder(entry.projectId, parentId).length;
		const output = await projectActions.moveEntry(entry.projectId, entry.id, parentId, position);
		if (!output) toast.error(failureMessage('Could not move it. Try again.'));
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
	busy={projectActions.busy}
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
			draft: projectActions.editor('projects', project.id),
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
	busy={projectActions.busy}
	onsubmit={submitDialog}
/>
