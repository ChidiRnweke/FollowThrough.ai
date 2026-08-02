<script lang="ts">
	import type { NoteId, NoteSummary } from '$lib/models/notes';
	import type { Project, ProjectId } from '$lib/models/projects';
	import { dragHandle, dragHandleZone, type DndEvent } from 'svelte-dnd-action';
	import { writeNoteDrag } from '$lib/client/notes/note-drag';
	import * as ContextMenu from '$lib/components/ui/context-menu';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Tip } from '$lib/components/ui/tooltip';
	import { mergeProps } from '$lib/utils';
	import {
		FtChevronRight as ChevronRight,
		FtEllipsis as Ellipsis,
		FtDocument as FileText,
		FtFolder as Folder,
		FtFolderOpen as FolderOpen,
		FtFolderBoard as FolderKanban,
		FtFolderPlus as FolderPlus,
		FtPin as Pin,
		FtPlus as Plus,
		FtSkills as Wrench,
		FtGrip as GripVertical
	} from '$lib/components/icons';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import TreeInlineInput from '../shared/tree-inline-input.svelte';

	type InlineEdit =
		| { mode: 'create'; kind: 'note' | 'folder' | 'skill'; projectId: ProjectId; parentId?: NoteId }
		| { mode: 'rename'; entryId: NoteId; current: string };

	let {
		projects,
		activeNoteId,
		activePath,
		transitionsReady,
		inlineEdit = $bindable<InlineEdit | null>(null),
		inlineCreateValue = $bindable(''),
		busy,
		zoneItems,
		isProjectOpen,
		isFolderOpen,
		foldersOf,
		isCreatingIn,
		toggle,
		toggleProject,
		startCreate,
		handleInlineCreateKeydown,
		handleInlineCreateBlur,
		submitInline,
		handleDndConsider,
		handleDndFinalize,
		moveEntry,
		archiveEntry,
		archiveProject,
		onopen,
		onopenbackground,
		onopensplit,
		onrenameproject
	}: {
		projects: readonly Project[];
		activeNoteId?: NoteId;
		activePath: string;
		transitionsReady: boolean;
		inlineEdit?: InlineEdit | null;
		inlineCreateValue?: string;
		busy: boolean;
		zoneItems: (projectId: ProjectId, parentId?: NoteId) => NoteSummary[];
		isProjectOpen: (projectId: ProjectId) => boolean;
		isFolderOpen: (folderId: NoteId) => boolean;
		foldersOf: (projectId: ProjectId) => NoteSummary[];
		isCreatingIn: (projectId: ProjectId, parentId?: NoteId) => boolean;
		toggle: (key: string) => void;
		toggleProject: (projectId: ProjectId) => void;
		startCreate: (
			kind: 'note' | 'folder' | 'skill',
			projectId: ProjectId,
			parentId?: NoteId
		) => void;
		handleInlineCreateKeydown: (event: KeyboardEvent) => void;
		handleInlineCreateBlur: () => void;
		submitInline: (value: string) => Promise<void>;
		handleDndConsider: (
			projectId: ProjectId,
			parentId: NoteId | undefined,
			event: CustomEvent<DndEvent<NoteSummary>>
		) => void;
		handleDndFinalize: (
			projectId: ProjectId,
			parentId: NoteId | undefined,
			event: CustomEvent<DndEvent<NoteSummary>>
		) => void;
		moveEntry: (entry: NoteSummary, parentId?: NoteId) => Promise<void>;
		archiveEntry: (entry: NoteSummary) => Promise<void>;
		archiveProject: (project: Project) => Promise<void>;
		onopen: (noteId: NoteId) => void;
		onopenbackground: (noteId: NoteId) => void;
		onopensplit: (noteId: NoteId) => void;
		onrenameproject: (project: Project) => void;
	} = $props();

	const MAX_DEPTH = 8;
</script>

<!-- The one place creation lives. Rendered by the hover `+` action, and reused at
     the top of the right-click / overflow menus so every route to "new" agrees. -->
{#snippet createMenuItems(
	projectId: ProjectId,
	parentId: NoteId | undefined,
	Menu: typeof ContextMenu | typeof DropdownMenu
)}
	<Menu.Item onclick={() => startCreate('note', projectId, parentId)}>
		<FileText class="size-4" />
		New note
	</Menu.Item>
	<Menu.Item onclick={() => startCreate('folder', projectId, parentId)}>
		<FolderPlus class="size-4" />
		New folder
	</Menu.Item>
	<Menu.Item onclick={() => startCreate('skill', projectId, parentId)}>
		<Wrench class="size-4" />
		New skill
	</Menu.Item>
{/snippet}

<!-- Shared context/dropdown items for a tree entry (note, skill, or folder). -->
{#snippet entryMenuItems(entry: NoteSummary, Menu: typeof ContextMenu | typeof DropdownMenu)}
	{#if entry.kind === 'note'}
		<Menu.Item onclick={() => onopenbackground(entry.id)}>Open in background tab</Menu.Item>
		<Menu.Item onclick={() => onopensplit(entry.id)}>Open side-by-side</Menu.Item>
		<Menu.Separator />
	{/if}
	{#if entry.kind === 'folder'}
		{@render createMenuItems(entry.projectId, entry.id, Menu)}
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
			<Input
				class="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
				{placeholder}
				aria-label={placeholder}
				disabled={busy}
				bind:value={inlineCreateValue}
				autofocus
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
			{busy}
			onsubmit={submitInline}
			oncancel={() => (inlineEdit = null)}
		/>
	{/if}
{/snippet}

{#snippet entryRow(entry: NoteSummary, depth: number)}
	{@const isFolder = entry.kind === 'folder'}
	{@const isOpen = isFolderOpen(entry.id)}
	<Sidebar.MenuSubItem>
		{#if inlineEdit?.mode === 'rename' && inlineEdit.entryId === entry.id}
			<TreeInlineInput
				icon={isFolder ? Folder : entry.kind === 'skill' ? Wrench : FileText}
				placeholder="Rename…"
				initialValue={inlineEdit.current}
				{busy}
				onsubmit={submitInline}
				oncancel={() => (inlineEdit = null)}
			/>
		{:else}
			<!-- The row's own positioning context. Without this wrapper the absolutely
			     positioned affordances below resolve against `Sidebar.MenuSubItem`, whose
			     `<li>` also contains the expanded subtree — so `top-1/2` would centre them
			     over the children instead of the row. Scoping `group/entry` here also stops
			     a hovered child row from revealing its parent's buttons. -->
			<div class="group/entry relative">
				<Tip text="Reorder {entry.title}" side="right">
					<!-- eslint-disable-next-line @typescript-eslint/no-unused-vars -->
					{#snippet children({ props: { type: _type, ...props } })}
						<!-- Deliberately not a <button>: svelte-dnd-action refuses drags whose
						     mousedown target has a `value` property (its nested-input guard), and
						     every <button> has one — so a button grip is ungrabbable except for
						     the exact pixels of the icon. `type` is dropped: it's button-only. -->
						<span
							use:dragHandle
							{...props}
							class="absolute top-0 bottom-0 left-0 z-10 my-auto flex size-5 -translate-x-1/2 cursor-grab items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring active:cursor-grabbing group-hover/entry:opacity-100"
							aria-label="Reorder {entry.title}"
						>
							<GripVertical class="size-3" />
						</span>
					{/snippet}
				</Tip>
				<ContextMenu.Root>
					<ContextMenu.Trigger>
						<!-- Tree rows truncate at the rail's width, so the tooltip is the only way to
						     read a long title. `Sidebar.MenuSubButton` takes no `tooltipContent` the
						     way `MenuButton` does, hence wrapping rather than passing a prop. -->
						{#if isFolder}
							<Tip text={entry.title} side="right" delayDuration={700}>
								{#snippet children({ props: tip })}
									<Sidebar.MenuSubButton class="w-full">
										{#snippet child({ props })}
											<Button
												variant="ghost"
												type="button"
												{...props}
												{...tip}
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
											</Button>
										{/snippet}
									</Sidebar.MenuSubButton>
								{/snippet}
							</Tip>
						{:else}
							<Tip text={entry.title} side="right" delayDuration={700}>
								{#snippet children({ props: tip })}
									<Sidebar.MenuSubButton isActive={entry.id === activeNoteId}>
										{#snippet child({ props })}
											<a
												href="/notes/{entry.id}"
												{...props}
												{...tip}
												draggable={entry.kind === 'note'}
												ondragstart={(event) => {
													if (entry.kind !== 'note' || !event.dataTransfer) return;
													event.stopPropagation();
													writeNoteDrag(event.dataTransfer, entry.id);
												}}
												onclick={(event) => {
													if (
														event.metaKey ||
														event.ctrlKey ||
														event.shiftKey ||
														event.button !== 0
													)
														return;
													event.preventDefault();
													onopen(entry.id);
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
								{/snippet}
							</Tip>
						{/if}
					</ContextMenu.Trigger>
					<ContextMenu.Content>
						{@render entryMenuItems(entry, ContextMenu)}
					</ContextMenu.Content>
				</ContextMenu.Root>
				{#if isFolder}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props: menuProps })}
								<Tip text="Create in {entry.title}">
									{#snippet children({ props: tipProps })}
										<Button
											variant="ghost"
											{...mergeProps(menuProps, tipProps)}
											class="tactile absolute top-0 right-7 bottom-0 my-auto size-5 rounded-md text-muted-foreground opacity-0 group-hover/entry:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:opacity-100"
											aria-label="Create in {entry.title}"
										>
											<Plus class="size-3.5" />
										</Button>
									{/snippet}
								</Tip>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{@render createMenuItems(entry.projectId, entry.id, DropdownMenu)}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/if}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props: menuProps })}
							<Tip text="Actions for {entry.title}">
								{#snippet children({ props: tipProps })}
									<Button
										variant="ghost"
										{...mergeProps(menuProps, tipProps)}
										class="tactile absolute top-0 right-1 bottom-0 my-auto size-5 rounded-md text-muted-foreground opacity-0 group-hover/entry:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[state=open]:opacity-100"
										aria-label="Actions for {entry.title}"
									>
										<Ellipsis class="size-3.5" />
									</Button>
								{/snippet}
							</Tip>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start">
						{@render entryMenuItems(entry, DropdownMenu)}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
		{/if}
		{#if isFolder && depth < MAX_DEPTH}
			<div class="tree-collapse" data-open={isOpen} data-transitions-ready={transitionsReady}>
				<div class="min-h-0 overflow-hidden">
					<ul
						class="ml-3.5 flex min-h-1.5 min-w-0 flex-col gap-1 border-l border-sidebar-border py-0.5 pl-2.5"
						use:dragHandleZone={{
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
					<!-- Creation lives on the row's hover `+`; the dashed button survives only
					     as an empty state, where there is nothing else to aim at. -->
					{#if !isCreatingIn(entry.projectId, entry.id) && zoneItems(entry.projectId, entry.id).length === 0}
						<div class="ml-3.5 pl-2.5">
							<Button
								variant="ghost"
								type="button"
								class="tactile flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								onclick={() => startCreate('note', entry.projectId, entry.id)}
							>
								<Plus class="size-3.5 shrink-0" />
								Create your first note
							</Button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</Sidebar.MenuSubItem>
{/snippet}

{#snippet projectMenuItems(project: Project, Menu: typeof ContextMenu | typeof DropdownMenu)}
	{@render createMenuItems(project.id, undefined, Menu)}
	<Menu.Separator />
	<Menu.Item onclick={() => onrenameproject(project)}>Rename</Menu.Item>
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
								<!-- Project rows are identity moments: the icon stays brand-teal so
								     projects stand apart from their gray child rows. -->
								<FolderKanban class="size-4 shrink-0 text-brand" />
								<span class="truncate font-medium">{project.name}</span>
							</a>
						{/snippet}
					</Sidebar.MenuButton>
				</ContextMenu.Trigger>
				<ContextMenu.Content>
					{@render projectMenuItems(project, ContextMenu)}
				</ContextMenu.Content>
			</ContextMenu.Root>
			<Sidebar.MenuAction
				showOnHover
				class="right-[3.25rem]"
				aria-label="Actions for {project.name}"
			>
				{#snippet child({ props: actionProps })}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props: menuProps })}
								<Tip text="Actions for {project.name}">
									{#snippet children({ props: tipProps })}
										<Button variant="ghost" {...mergeProps(actionProps, menuProps, tipProps)}>
											<Ellipsis class="size-3.5" />
										</Button>
									{/snippet}
								</Tip>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{@render projectMenuItems(project, DropdownMenu)}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				{/snippet}
			</Sidebar.MenuAction>
			<Sidebar.MenuAction showOnHover class="right-7" aria-label="Create in {project.name}">
				{#snippet child({ props: actionProps })}
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							{#snippet child({ props: menuProps })}
								<Tip text="Create in {project.name}">
									{#snippet children({ props: tipProps })}
										<Button variant="ghost" {...mergeProps(actionProps, menuProps, tipProps)}>
											<Plus class="size-3.5" />
										</Button>
									{/snippet}
								</Tip>
							{/snippet}
						</DropdownMenu.Trigger>
						<DropdownMenu.Content align="start">
							{@render createMenuItems(project.id, undefined, DropdownMenu)}
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
			<div class="tree-collapse" data-open={isOpen} data-transitions-ready={transitionsReady}>
				<div class="min-h-0 overflow-hidden">
					<div
						class="mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5 group-data-[collapsible=icon]:hidden"
					>
						<ul class="flex min-w-0 flex-col gap-1">
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
						</ul>
						<ul
							class="flex min-h-1.5 min-w-0 flex-col gap-1"
							use:dragHandleZone={{
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
						{#if !isCreatingIn(project.id, undefined) && entries.length === 0}
							<Button
								variant="ghost"
								type="button"
								class="tactile flex w-full items-center gap-2 rounded-md border border-dashed border-sidebar-border px-2 py-1 text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
								onclick={() => startCreate('note', project.id)}
							>
								<Plus class="size-3.5 shrink-0" />
								Create your first note
							</Button>
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
