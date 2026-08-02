<script lang="ts">
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import { goto } from '$app/navigation';
	import type { DndEvent } from 'svelte-dnd-action';
	import { toast } from 'svelte-sonner';
	import { onMount } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { projectActions } from '$lib/stores/projects/project-actions.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import NameDialog from './name-dialog.svelte';
	import ProjectTreeView from './project-tree-view.svelte';

	let {
		projects,
		noteTree,
		activeNoteId,
		activePath
	}: {
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
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (raw) return JSON.parse(raw) as string[];
		} catch {
			// Fall back to the defaults.
		}
		return [];
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

	// Keep the active note reachable: expand its project and folder ancestors.
	$effect(() => {
		if (!activeNoteId) return;
		const node = byId.get(activeNoteId);
		if (!node) return;
		toggled.delete(`project:${node.projectId}`);
		let parentId = node.parentId;
		let guard = 0;
		while (parentId && guard++ < 32) {
			toggled.add(parentId);
			parentId = byId.get(parentId)?.parentId;
		}
	});

	// --- Drag and drop (within a project only; the zone type enforces it) ---

	// Overrides are written only from the dnd event handlers and dropped once the
	// server round-trip that follows a move has landed.  Deliberately not driven
	// by an `$effect` on `childrenOf`: that made an effect write state the
	// template reads back, and it fired on every unrelated `invalidateAll`.
	const dndOverrides = new SvelteMap<string, NoteSummary[]>();

	function zoneItems(projectId: ProjectId, parentId?: NoteId): NoteSummary[] {
		return dndOverrides.get(zoneKey(projectId, parentId)) ?? entriesUnder(projectId, parentId);
	}

	function handleDndConsider(
		projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		dndOverrides.set(zoneKey(projectId, parentId), event.detail.items);
	}

	function handleDndFinalize(
		projectId: ProjectId,
		parentId: NoteId | undefined,
		event: CustomEvent<DndEvent<NoteSummary>>
	): void {
		const key = zoneKey(projectId, parentId);
		dndOverrides.set(key, event.detail.items);
		const draggedId = event.detail.info.id as NoteId;
		const index = event.detail.items.findIndex((item) => item.id === draggedId);
		const original = index < 0 ? undefined : byId.get(draggedId);
		const moved =
			original !== undefined &&
			((original.parentId ?? undefined) !== parentId || original.position !== index);
		if (!moved) {
			// Nothing to ask the server for, so nothing will arrive to supersede the
			// override — release it now (it already matches the rendered order).
			dndOverrides.delete(key);
			return;
		}
		void projectActions.moveEntry(projectId, draggedId, parentId, index).then((output) => {
			if (!output) toast.error(failureMessage('Could not move it. Try again.'));
			// Server truth has landed (moveEntry invalidates); on failure the tree
			// should snap back to it rather than keep showing the dropped order.
			dndOverrides.delete(key);
		});
	}

	// --- Inline creation / rename ---

	type InlineEdit =
		| { mode: 'create'; kind: 'note' | 'folder' | 'skill'; projectId: ProjectId; parentId?: NoteId }
		| { mode: 'rename'; entryId: NoteId; current: string };

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
			const output = await projectActions.renameNote(pending.entryId, value);
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
		{ kind: 'new-project' } | { kind: 'rename-project'; projectId: ProjectId; current: string };

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
		const output = await projectActions.renameProject(pending.projectId, value);
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
						? 'Could not archive the folder. Empty it first.'
						: 'Could not archive it. Try again.'
				)
			);
			return;
		}
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
	{moveEntry}
	{archiveEntry}
	{archiveProject}
	onopen={(noteId) => void workbench.openTab(noteId)}
	onopenbackground={(noteId) => void workbench.openTabInBackground(noteId)}
	onopensplit={openSideBySide}
	onrenameproject={(project) =>
		(dialog = { kind: 'rename-project', projectId: project.id, current: project.name })}
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
