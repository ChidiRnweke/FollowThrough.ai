<script lang="ts">
	import type { NoteId, NoteSummary, Project, ProjectId } from '$lib/models';
	import { goto } from '$app/navigation';
	import { dndzone, type DndEvent } from 'svelte-dnd-action';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { toast } from 'svelte-sonner';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FileText from '@lucide/svelte/icons/file-text';
	import Folder from '@lucide/svelte/icons/folder';
	import FolderOpen from '@lucide/svelte/icons/folder-open';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import FolderPlus from '@lucide/svelte/icons/folder-plus';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Pin from '@lucide/svelte/icons/pin';
	import Plus from '@lucide/svelte/icons/plus';
	import Wrench from '@lucide/svelte/icons/wrench';
	import { onMount, untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { projectActions } from '$lib/stores/project-actions.svelte';
	import { workbench } from '$lib/stores/workbench.svelte';
	import NameDialog from './name-dialog.svelte';
	import TreeInlineInput from './tree-inline-input.svelte';

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

	const STORAGE_KEY = 'workbench.tree.expanded';
	const MAX_DEPTH = 8;

	const active = $derived(noteTree.filter((note) => !note.archivedAt));
	const byId = $derived(new Map(active.map((note) => [note.id, note])));
	const childrenOf = $derived.by(() => {
		const map = new SvelteMap<string, NoteSummary[]>();
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

	const dndOverrides = new SvelteMap<string, NoteSummary[]>();

	// Server truth arrived (invalidateAll after a move): drop local overrides.
	$effect(() => {
		void childrenOf;
		if (untrack(() => dndOverrides.size) > 0) untrack(() => dndOverrides.clear());
	});

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
		dndOverrides.set(zoneKey(projectId, parentId), event.detail.items);
		const draggedId = event.detail.info.id as NoteId;
		const index = event.detail.items.findIndex((item) => item.id === draggedId);
		if (index < 0) return;
		const original = byId.get(draggedId);
		if (!original) return;
		if ((original.parentId ?? undefined) === parentId && original.position === index) return;
		void projectActions.moveEntry(projectId, draggedId, parentId, index).then((output) => {
			if (!output) toast.error('Could not move it. Try again.');
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

	function autofocus(node: HTMLInputElement): void {
		node.focus();
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
				toast.error('Could not rename it. Try again.');
				return;
			}
			inlineEdit = null;
			return;
		}
		if (pending.kind === 'note') {
			const output = await projectActions.createNote(value, pending.projectId, pending.parentId);
			if (!output) {
				toast.error('Could not create the note. Try again.');
				return;
			}
			inlineEdit = null;
			await workbench.openTab(output.note.id);
		} else if (pending.kind === 'folder') {
			const output = await projectActions.createFolder(pending.projectId, value, pending.parentId);
			if (!output) {
				toast.error('Could not create the folder. Try again.');
				return;
			}
			inlineEdit = null;
		} else {
			const output = await projectActions.createSkill(value, pending.projectId, pending.parentId);
			if (!output) {
				toast.error('Could not create the skill. Try again.');
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

	async function submitDialog(value: string): Promise<void> {
		if (!dialog) return;
		const pending = dialog;
		if (pending.kind === 'new-project') {
			const output = await projectActions.createProject(value);
			if (!output) toast.error('Could not create the project. Try again.');
			else await goto(`/projects/${output.project.id}`);
		} else {
			const output = await projectActions.renameProject(pending.projectId, value);
			if (!output) toast.error('Could not rename the project. Try again.');
		}
	}

	async function archiveEntry(entry: NoteSummary): Promise<void> {
		const output = await projectActions.archiveNote(entry.id);
		if (!output) {
			toast.error(
				entry.kind === 'folder'
					? 'Could not archive the folder. Empty it first.'
					: 'Could not archive it. Try again.'
			);
			return;
		}
		if (activeNoteId === entry.id) await goto('/');
	}

	async function archiveProject(project: Project): Promise<void> {
		const output = await projectActions.archiveProject(project.id);
		if (!output) {
			toast.error('Could not archive the project. Try again.');
			return;
		}
		if (activePath.startsWith(`/projects/${project.id}`)) await goto('/');
	}

	async function moveEntry(entry: NoteSummary, parentId?: NoteId): Promise<void> {
		if ((entry.parentId ?? undefined) === parentId) return;
		const position = entriesUnder(entry.projectId, parentId).length;
		const output = await projectActions.moveEntry(entry.projectId, entry.id, parentId, position);
		if (!output) toast.error('Could not move it. Try again.');
		else if (parentId && !isFolderOpen(parentId)) toggled.add(parentId);
	}

	function openNewProject(): void {
		dialog = { kind: 'new-project' };
	}

	export { openNewProject };
</script>

<!-- Shared context/dropdown items for a tree entry (note, skill, or folder). -->
{#snippet entryMenuItems(entry: NoteSummary, Menu: typeof ContextMenu | typeof DropdownMenu)}
	{#if entry.kind === 'folder'}
		<Menu.Item onclick={() => startCreate('folder', entry.projectId, entry.id)}>
			<FolderPlus class="size-4" />
			New folder
		</Menu.Item>
		<Menu.Item onclick={() => startCreate('skill', entry.projectId, entry.id)}>
			<Wrench class="size-4" />
			New skill
		</Menu.Item>
		<Menu.Separator />
	{/if}
	<Menu.Item
		onclick={() => (inlineEdit = { mode: 'rename', entryId: entry.id, current: entry.title })}
	>
		Rename
	</Menu.Item>
	<Menu.Sub>
		<Menu.SubTrigger>Move to</Menu.SubTrigger>
		<Menu.SubContent>
			<Menu.Item
				disabled={entry.parentId === undefined}
				onclick={() => void moveEntry(entry, undefined)}
			>
				Project root
			</Menu.Item>
			{#each foldersOf(entry.projectId).filter((folder) => folder.id !== entry.id) as folder (folder.id)}
				<Menu.Item
					disabled={folder.id === entry.parentId}
					onclick={() => void moveEntry(entry, folder.id)}
				>
					{folder.title}
				</Menu.Item>
			{/each}
		</Menu.SubContent>
	</Menu.Sub>
	<Menu.Separator />
	<Menu.Item variant="destructive" onclick={() => void archiveEntry(entry)}>Archive</Menu.Item>
{/snippet}

{#snippet inlineCreateRow(
	edit: Extract<InlineEdit, { mode: 'create' }>,
	variant: 'default' | 'inline' = 'default'
)}
	{#if variant === 'inline'}
		{@const placeholder =
			edit.kind === 'folder'
				? 'Folder name…'
				: edit.kind === 'skill'
					? 'Skill name…'
					: 'Note title…'}
		<div
			class="flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-1 transition-colors focus-within:border-sidebar-ring focus-within:ring-1 focus-within:ring-sidebar-ring"
		>
			<Plus class="size-3.5 shrink-0 text-muted-foreground" />
			<input
				class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
				{placeholder}
				aria-label={placeholder}
				disabled={projectActions.busy}
				bind:value={inlineCreateValue}
				use:autofocus
				onkeydown={handleInlineCreateKeydown}
				onblur={handleInlineCreateBlur}
			/>
		</div>
	{:else}
		<TreeInlineInput
			icon={edit.kind === 'folder' ? Folder : edit.kind === 'skill' ? Wrench : FileText}
			placeholder={edit.kind === 'folder'
				? 'Folder name…'
				: edit.kind === 'skill'
					? 'Skill name…'
					: 'Note title…'}
			busy={projectActions.busy}
			onsubmit={submitInline}
			oncancel={() => (inlineEdit = null)}
		/>
	{/if}
{/snippet}

{#snippet entryRow(entry: NoteSummary, depth: number)}
	{@const isFolder = entry.kind === 'folder'}
	{@const isOpen = isFolderOpen(entry.id)}
	<Sidebar.MenuSubItem class="group/entry">
		{#if inlineEdit?.mode === 'rename' && inlineEdit.entryId === entry.id}
			<TreeInlineInput
				icon={isFolder ? Folder : entry.kind === 'skill' ? Wrench : FileText}
				placeholder="Rename…"
				initialValue={inlineEdit.current}
				busy={projectActions.busy}
				onsubmit={submitInline}
				oncancel={() => (inlineEdit = null)}
			/>
		{:else}
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					{#if isFolder}
						<Sidebar.MenuSubButton class="w-full cursor-pointer">
							{#snippet child({ props })}
								<button
									type="button"
									{...props}
									onclick={() => toggle(entry.id)}
									aria-expanded={isOpen}
								>
									<ChevronRight
										class="size-3.5 shrink-0 text-muted-foreground transition-transform duration-(--duration-micro) {isOpen
											? 'rotate-90'
											: ''}"
									/>
									{#if isOpen}
										<FolderOpen class="size-4 shrink-0 text-muted-foreground" />
									{:else}
										<Folder class="size-4 shrink-0 text-muted-foreground" />
									{/if}
									<span class="truncate">{entry.title}</span>
								</button>
							{/snippet}
						</Sidebar.MenuSubButton>
					{:else}
						<Sidebar.MenuSubButton isActive={entry.id === activeNoteId}>
							{#snippet child({ props })}
								<a
									href="/notes/{entry.id}"
									{...props}
									onclick={(event) => {
										if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
											return;
										event.preventDefault();
										void workbench.openTab(entry.id);
									}}
								>
									{#if entry.kind === 'skill'}
										<Wrench class="size-4 shrink-0 text-muted-foreground" />
									{:else}
										<FileText class="size-4 shrink-0 text-muted-foreground" />
									{/if}
									<span class="truncate">{entry.title}</span>
									{#if entry.isPinned}
										<Pin class="ml-auto size-3 shrink-0 text-muted-foreground" />
									{/if}
								</a>
							{/snippet}
						</Sidebar.MenuSubButton>
					{/if}
				</ContextMenu.Trigger>
				<ContextMenu.Content>
					{@render entryMenuItems(entry, ContextMenu)}
				</ContextMenu.Content>
			</ContextMenu.Root>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							class="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/entry:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:opacity-100"
							aria-label="Actions for {entry.title}"
						>
							<Ellipsis class="size-3.5" />
						</button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="start">
					{@render entryMenuItems(entry, DropdownMenu)}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{/if}
		{#if isFolder && depth < MAX_DEPTH}
			<div
				class="tree-collapse"
				data-open={isOpen}
				style={transitionsReady
					? undefined
					: `display:grid;grid-template-rows:${isOpen ? '1fr' : '0fr'};transition:none`}
			>
				<div class="min-h-0 overflow-hidden">
					<ul
						class="ml-3.5 flex min-h-1.5 min-w-0 flex-col gap-1 border-l border-sidebar-border py-0.5 pl-2.5"
						use:dndzone={{
							items: zoneItems(entry.projectId, entry.id),
							type: `tree-${entry.projectId}`,
							flipDurationMs: 125,
							dropTargetStyle: {}
						}}
						onconsider={(event) => handleDndConsider(entry.projectId, entry.id, event)}
						onfinalize={(event) => handleDndFinalize(entry.projectId, entry.id, event)}
					>
						{#each zoneItems(entry.projectId, entry.id) as child (child.id)}
							{@render entryRow(child, depth + 1)}
						{/each}
					</ul>
					{#if inlineEdit?.mode === 'create' && isCreatingIn(entry.projectId, entry.id)}
						<div class="ml-3.5 pl-2.5">
							{@render inlineCreateRow(inlineEdit, 'inline')}
						</div>
					{/if}
					{#if !isCreatingIn(entry.projectId, entry.id)}
						<div class="ml-3.5 pl-2.5">
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								onclick={() => startCreate('note', entry.projectId, entry.id)}
							>
								<Plus class="size-3.5 shrink-0" />
								{zoneItems(entry.projectId, entry.id).length === 0
									? 'Create your first note'
									: 'New note'}
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</Sidebar.MenuSubItem>
{/snippet}

{#snippet projectMenuItems(project: Project, Menu: typeof ContextMenu | typeof DropdownMenu)}
	<Menu.Item onclick={() => startCreate('folder', project.id)}>
		<FolderPlus class="size-4" />
		New folder
	</Menu.Item>
	<Menu.Item onclick={() => startCreate('skill', project.id)}>
		<Wrench class="size-4" />
		New skill
	</Menu.Item>
	<Menu.Separator />
	<Menu.Item
		onclick={() =>
			(dialog = { kind: 'rename-project', projectId: project.id, current: project.name })}
	>
		Rename
	</Menu.Item>
	<Menu.Item variant="destructive" onclick={() => void archiveProject(project)}>
		Archive project
	</Menu.Item>
{/snippet}

<Sidebar.Menu>
	{#each projects as project (project.id)}
		{@const isOpen = isProjectOpen(project.id)}
		{@const entries = zoneItems(project.id)}
		{@const projectHref = `/projects/${project.id}`}
		<Sidebar.MenuItem class="group/project">
			<ContextMenu.Root>
				<ContextMenu.Trigger>
					<Sidebar.MenuButton isActive={activePath === projectHref} tooltipContent={project.name}>
						{#snippet child({ props })}
							<a href={projectHref} {...props}>
								<FolderKanban class="size-4 shrink-0" />
								<span class="truncate font-medium">{project.name}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</ContextMenu.Trigger>
				<ContextMenu.Content>
					{@render projectMenuItems(project, ContextMenu)}
				</ContextMenu.Content>
			</ContextMenu.Root>
			<Sidebar.MenuAction showOnHover class="right-7" aria-label="Actions for {project.name}">
				{#snippet child({ props })}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger {...props}>
							<Ellipsis class="size-3.5" />
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{@render projectMenuItems(project, DropdownMenu)}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</Sidebar.MenuAction>
			<Sidebar.MenuAction
				onclick={() => toggleProject(project.id)}
				aria-label="{isOpen ? 'Collapse' : 'Expand'} {project.name}"
				class="group-data-[collapsible=icon]:hidden"
			>
				<ChevronRight
					class="size-4 text-muted-foreground {transitionsReady
						? 'transition-transform duration-(--duration-micro)'
						: ''} {isOpen ? 'rotate-90' : ''}"
				/>
			</Sidebar.MenuAction>
			<div
				class="tree-collapse"
				data-open={isOpen}
				style={transitionsReady
					? undefined
					: `display:grid;grid-template-rows:${isOpen ? '1fr' : '0fr'};transition:none`}
			>
				<div class="min-h-0 overflow-hidden">
					<div
						class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden"
					>
						<Sidebar.MenuSubItem>
							<Sidebar.MenuSubButton isActive={activePath.startsWith(`${projectHref}/todos`)}>
								{#snippet child({ props })}
									<a {...props} href="{projectHref}/todos">
										<ListTodo class="size-4 shrink-0 text-muted-foreground" />
										<span class="truncate">Todos</span>
									</a>
								{/snippet}
							</Sidebar.MenuSubButton>
						</Sidebar.MenuSubItem>
						<ul
							class="flex min-h-1.5 min-w-0 flex-col gap-1"
							use:dndzone={{
								items: entries,
								type: `tree-${project.id}`,
								flipDurationMs: 125,
								dropTargetStyle: {}
							}}
							onconsider={(event) => handleDndConsider(project.id, undefined, event)}
							onfinalize={(event) => handleDndFinalize(project.id, undefined, event)}
						>
							{#each entries as entry (entry.id)}
								{@render entryRow(entry, 0)}
							{/each}
						</ul>
						{#if inlineEdit?.mode === 'create' && isCreatingIn(project.id, undefined)}
							{@render inlineCreateRow(inlineEdit, 'inline')}
						{/if}
						{#if !isCreatingIn(project.id, undefined)}
							<button
								type="button"
								class="flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								onclick={() => startCreate('note', project.id)}
							>
								<Plus class="size-3.5 shrink-0" />
								{entries.length === 0 ? 'Create your first note' : 'New note'}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</Sidebar.MenuItem>
	{/each}
	{#if projects.length === 0}
		<li class="px-2 py-1 text-xs text-muted-foreground">No projects yet. Create one to start.</li>
	{/if}
</Sidebar.Menu>

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
