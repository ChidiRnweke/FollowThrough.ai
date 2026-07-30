<script lang="ts">
	import { page } from '$app/state';
	import type { NoteId, ProjectId, ShellContext } from '$lib/models';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { cubicOut } from 'svelte/easing';
	import { Button } from '$lib/components/ui/button';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtClose as X,
		FtPin as Pin,
		FtChevronDown as ChevronDown,
		FtChevronRight as ChevronRight,
		FtChevronUp as ChevronUp,
		FtPlus as Plus
	} from '$lib/components/icons';
	import { hasInternalNoteDrag, readActiveNoteDrag, writeNoteDrag } from '$lib/client/note-drag';

	let {
		shell,
		hidden = false,
		oncreateNote,
		ontoggleHidden
	}: {
		shell: ShellContext;
		/** Collapsed state — when true, the strip shrinks to 24px. */
		hidden?: boolean;
		/** One-click note creation (matches the sidebar's `+` affordance). */
		oncreateNote?: () => void;
		/** Toggle the strip's collapsed state. */
		ontoggleHidden?: () => void;
	} = $props();

	const projectOf = (noteId: NoteId): ProjectId | undefined =>
		shell.noteTree.find((entry) => entry.id === noteId)?.projectId;

	const titleOf = (noteId: NoteId): string =>
		shell.noteTree.find((entry) => entry.id === noteId)?.title ?? 'Untitled';

	const groups = $derived.by(() => {
		const projectName = new SvelteMap<ProjectId, string>();
		for (const project of shell.projects) projectName.set(project.id, project.name);
		const order: ProjectId[] = [];
		const buckets = new SvelteMap<ProjectId, NoteId[]>();
		for (const id of workbench.openTabs) {
			const projectId = projectOf(id);
			if (!projectId) continue;
			if (!buckets.has(projectId)) {
				buckets.set(projectId, []);
				order.push(projectId);
			}
			buckets.get(projectId)!.push(id);
		}
		return order.map((projectId) => ({
			projectId,
			projectName: projectName.get(projectId) ?? 'Project',
			tabs: buckets.get(projectId) ?? []
		}));
	});

	// Project groups the user has folded away.  Pinned tabs stay visible even
	// inside a folded group.
	let folded = new SvelteSet<ProjectId>();

	function toggleFold(projectId: ProjectId): void {
		if (folded.has(projectId)) folded.delete(projectId);
		else folded.add(projectId);
	}

	function showTab(projectId: ProjectId, noteId: NoteId): boolean {
		if (!folded.has(projectId)) return true;
		return workbench.isPinned(noteId);
	}

	const hasTabs = $derived(workbench.openTabs.length > 0);
	// The focused tab persists when the user navigates to a non-note route
	// (Today, Todos, …) so the working set survives; the "you are here"
	// highlight must not — only colour a tab while actually on its route.
	const onNoteRoute = $derived(page.url.pathname.startsWith('/notes/'));
	let noteDragOver = $state(false);

	function onDragOver(event: DragEvent): void {
		if (!hasInternalNoteDrag(event.dataTransfer)) return;
		event.preventDefault();
		noteDragOver = true;
		if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
	}

	function onDragLeave(event: DragEvent): void {
		if (event.currentTarget instanceof Node && event.relatedTarget instanceof Node) {
			if (event.currentTarget.contains(event.relatedTarget)) return;
		}
		noteDragOver = false;
	}

	function onDrop(event: DragEvent): void {
		if (!hasInternalNoteDrag(event.dataTransfer)) return;
		event.preventDefault();
		noteDragOver = false;
		const noteId = readActiveNoteDrag(event.dataTransfer, shell.noteTree);
		if (!noteId) return;
		void workbench.openTabInBackground(noteId);
	}

	function horizontalPanelCollapse(node: HTMLElement) {
		const width = node.offsetWidth;

		return {
			duration: 300,
			easing: cubicOut,
			css: (t: number) => `width: ${t * width}px`
		};
	}

	function hasVisiblePredecessor(
		projectId: ProjectId,
		tabs: readonly NoteId[],
		index: number
	): boolean {
		return tabs.slice(0, index).some((noteId) => showTab(projectId, noteId));
	}
</script>

<div
	class="sticky top-0 z-30 shrink-0 overflow-hidden border-b border-border bg-background transition-[height] duration-(--duration-panel) ease-(--ease-standard) dark:bg-card {hidden
		? 'h-6'
		: 'h-10'}"
	role="tablist"
	tabindex="-1"
	aria-label="Open notes"
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	{#if hidden}
		<!-- Collapsed strip: the 24px height keeps the reveal affordance visible
		     while the persistent outer container animates between endpoints. -->
		<div class="flex h-6 items-center justify-end">
			<Tip text="Show tab strip" side="bottom">
				{#snippet children({ props })}
					<Button
						variant="ghost"
						{...props}
						type="button"
						class="mr-2 mt-1 tactile flex size-7 shrink-0 items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
						aria-label="Show tab strip"
						aria-expanded={false}
						onclick={() => ontoggleHidden?.()}
					>
						<ChevronDown class="size-4" />
					</Button>
				{/snippet}
			</Tip>
		</div>
	{:else}
		<div class="flex h-10 items-stretch gap-0 overflow-x-auto px-2">
			{#if noteDragOver}
				<div
					class="absolute inset-0 z-40 flex items-center justify-center border border-primary bg-background text-xs font-medium text-foreground"
				>
					Drop to add tab
				</div>
			{/if}
			{#if hasTabs}
				{#each groups as group, groupIndex (group.projectId)}
					{#if groupIndex > 0}
						<div class="h-4 w-px shrink-0 self-center" aria-hidden="true"></div>
					{/if}
					<div class="flex shrink-0 items-center gap-1 pl-1 pr-1">
						<Button
							variant="ghost"
							type="button"
							class="tactile flex items-center rounded px-0.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
							aria-label={folded.has(group.projectId)
								? `Expand ${group.projectName} tabs`
								: `Collapse ${group.projectName} tabs`}
							aria-expanded={!folded.has(group.projectId)}
							onclick={() => toggleFold(group.projectId)}
						>
							{#if folded.has(group.projectId)}
								<ChevronRight class="size-3.5" />
							{:else}
								<ChevronDown class="size-3.5" />
							{/if}
						</Button>
						<div class="flex items-center gap-1 pr-1">
							<span class="h-4 w-px shrink-0 bg-primary/40" aria-hidden="true"></span>
							<span class="eyebrow max-w-40 cursor-default truncate">
								{group.projectName}
							</span>
						</div>
					</div>
					{#each group.tabs as noteId, tabIndex (noteId)}
						{@const tabVisible = showTab(group.projectId, noteId)}
						{@const active = onNoteRoute && workbench.focusedNoteId === noteId}
						<div
							class="flex shrink-0 overflow-hidden"
							data-project-tab={noteId}
							data-collapsed={!tabVisible}
							aria-hidden={!tabVisible}
							inert={!tabVisible}
						>
							{#if tabVisible}
								<div class="flex shrink-0" transition:horizontalPanelCollapse|local>
									{#if hasVisiblePredecessor(group.projectId, group.tabs, tabIndex)}
										<!-- Thin vertical divider between adjacent visible tabs in the same project
									     group. Keeping it inside the animated region prevents orphan rules. -->
										<div class="h-4 w-px shrink-0 self-center bg-border" aria-hidden="true"></div>
									{/if}
									<!-- Tab labels truncate at 16rem, so the tooltip is the only way to read a
								     long title. A longer delay than the default keeps it from flashing
								     while the pointer sweeps across the strip. -->
									<Tip text={titleOf(noteId)} side="bottom" delayDuration={700}>
										{#snippet children({ props })}
											<!-- Cursor only, not `tactile`: the tab holds a nested close
											     button, so hovering that would lift both and double the
											     travel. A tab is seated in the strip, not a free target. -->
											<Button
												variant="ghost"
												{...props}
												type="button"
												role="tab"
												aria-selected={active}
												draggable="true"
												class="group relative flex h-full min-w-32 max-w-64 shrink-0 cursor-pointer items-center gap-1 border-t-2 border-transparent px-2 text-sm transition-colors {active
													? 'bg-background font-medium text-foreground'
													: 'text-muted-foreground/80 hover:bg-accent/60 hover:text-foreground'}"
												ondragstart={(event) => {
													if (event.dataTransfer) writeNoteDrag(event.dataTransfer, noteId);
												}}
												onclick={() => void workbench.focusTab(noteId)}
											>
												{#if active}
													<!-- Inset accent: 4px tall, 2px in from the sides, with a rounded
								     bottom edge so it reads as a tab indicator rather than a
								     strip-wide line. The inset keeps the green off the very top
								     edge of the sticky strip where it would visually clip against
								     the viewport. -->
													<span
														class="absolute inset-x-0.5 top-0 h-1 rounded-b-sm bg-primary"
														aria-hidden="true"
													></span>
												{/if}
												{#if workbench.isPinned(noteId)}
													<Pin class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
												{/if}
												<span class="min-w-0 flex-1 truncate text-left">{titleOf(noteId)}</span>
												<span
													role="button"
													tabindex={-1}
													aria-label={`Close ${titleOf(noteId)}`}
													class="tactile ml-1 hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex {active
														? 'flex'
														: ''}"
													onclick={(event) => {
														event.stopPropagation();
														void workbench.closeTab(noteId);
													}}
													onkeydown={(event) => {
														if (event.key === 'Enter' || event.key === ' ') {
															event.preventDefault();
															event.stopPropagation();
															void workbench.closeTab(noteId);
														}
													}}
												>
													<X class="size-3" />
												</span>
											</Button>
										{/snippet}
									</Tip>
								</div>
							{/if}
						</div>
					{/each}
				{/each}
			{:else}
				<!-- Empty strip on non-note routes: keep the 40px height so opening
			     the first note doesn't shift the editor's vertical footprint. -->
				<span
					class="flex shrink-0 items-center px-2 text-sm text-muted-foreground"
					aria-label="No notes open"
				>
					No notes open
				</span>
			{/if}

			<!-- `+` new-note button: teal glyph so it reads as a primary action,
		     matching the sidebar's accent affordance. -->
			{#if oncreateNote}
				<Tip text="New note" side="bottom">
					{#snippet children({ props })}
						<Button
							{...props}
							variant="ghost"
							size="icon-sm"
							class="ml-auto shrink-0 self-center text-primary hover:text-primary"
							aria-label="New note"
							onclick={oncreateNote}
						>
							<Plus class="size-4" />
						</Button>
					{/snippet}
				</Tip>
				<!-- Divider between the `+` action and the strip-hide chevron so the
			     chevron reads as a strip control, not as a second action. -->
				<div class="mr-1 ml-1 h-4 w-px shrink-0 self-center bg-border" aria-hidden="true"></div>
			{/if}
			<!-- Edge chevron: always at the very right end of the strip so the
		     toggle is a stable click target regardless of tab count. `text-foreground`
		     keeps it visible (black in light, white in dark) rather than melting
		     into the strip's background. -->
			<Tip text="Hide tab strip" side="bottom">
				{#snippet children({ props })}
					<Button
						variant="ghost"
						{...props}
						type="button"
						class="tactile flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
						aria-label="Hide tab strip"
						aria-expanded={true}
						onclick={() => ontoggleHidden?.()}
					>
						<ChevronUp class="size-3.5" />
					</Button>
				{/snippet}
			</Tip>
		</div>
	{/if}
</div>
