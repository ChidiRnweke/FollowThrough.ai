<script lang="ts">
	import type { NoteId, ProjectId, ShellContext } from '$lib/models';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';
	import Pin from '@lucide/svelte/icons/pin';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		shell,
		hidden = false,
		oncreateNote,
		ontoggleHidden
	}: {
		shell: ShellContext;
		/** Collapsed state — when true, the strip shrinks to a 4px rail. */
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
</script>

{#if hidden}
	<!-- Collapsed rail: a thin strip with a clearly-visible, properly-sized
	     chevron pulled in from the corner so the toggle is easy to find.
	     `h-6` gives the chevron enough breathing room; `mr-2 mt-1` moves it
	     off the very top-right corner. -->
	<div
		class="sticky top-0 z-30 flex h-6 shrink-0 items-center justify-end border-b border-border bg-background"
		role="tablist"
		aria-label="Open notes"
	>
		<button
			type="button"
			class="mr-2 mt-1 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-foreground hover:bg-accent hover:text-accent-foreground"
			aria-label="Show tab strip"
			aria-expanded={false}
			title="Show tab strip"
			onclick={() => ontoggleHidden?.()}
		>
			<ChevronDown class="size-4" />
		</button>
	</div>
{:else}
	<div
		class="sticky top-0 z-30 flex h-9 shrink-0 items-stretch gap-0 overflow-x-auto border-b border-border bg-background px-2"
		role="tablist"
		aria-label="Open notes"
	>
		{#if hasTabs}
			{#each groups as group, groupIndex (group.projectId)}
				{#if groupIndex > 0}
					<div class="w-px shrink-0 self-center" style="height: 1rem;" aria-hidden="true"></div>
				{/if}
				<div class="flex shrink-0 items-center gap-1 pl-1 pr-1">
					<button
						type="button"
						class="flex cursor-pointer items-center rounded px-0.5 py-0.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
					</button>
					<div class="flex items-center gap-1 pr-1">
						<span class="h-4 w-px shrink-0 bg-primary/40" aria-hidden="true"></span>
						<span
							class="max-w-[10rem] cursor-default truncate text-xs font-medium uppercase tracking-wide text-muted-foreground"
						>
							{group.projectName}
						</span>
					</div>
				</div>
				{#each group.tabs as noteId, tabIndex (noteId)}
					{#if showTab(group.projectId, noteId)}
						{#if tabIndex > 0}
							<!-- Thin vertical divider between adjacent tabs in the same project group,
							     mirroring the divider between project groups but shorter so the
							     group's accent rule remains the primary separator. -->
							<div
								class="w-px shrink-0 self-center bg-border"
								style="height: 1rem;"
								aria-hidden="true"
							></div>
						{/if}
						{@const active = workbench.focusedNoteId === noteId}
						<button
							type="button"
							role="tab"
							aria-selected={active}
							title={titleOf(noteId)}
							class="group relative flex h-full min-w-[8rem] max-w-[16rem] shrink-0 cursor-pointer items-center gap-1 border-t-2 border-transparent px-2 text-xs transition-colors {active
								? 'bg-background font-medium text-foreground'
								: 'text-muted-foreground/80 hover:bg-accent/60 hover:text-foreground'}"
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
								class="ml-1 hidden size-4 shrink-0 cursor-pointer items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex {active
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
						</button>
					{/if}
				{/each}
			{/each}
		{:else}
			<!-- Empty strip on non-note routes: keep the 36px height so opening
			     the first note doesn't shift the editor's vertical footprint. -->
			<span
				class="flex shrink-0 items-center px-2 text-xs text-muted-foreground/70"
				aria-label="No notes open"
			>
				No notes open
			</span>
		{/if}

		<!-- `+` new-note button: teal glyph so it reads as a primary action,
		     matching the sidebar's accent affordance. -->
		{#if oncreateNote}
			<Button
				variant="ghost"
				size="icon-sm"
				class="ml-auto shrink-0 self-center text-primary hover:text-primary"
				aria-label="New note"
				title="New note"
				onclick={oncreateNote}
			>
				<Plus class="size-4" />
			</Button>
			<!-- Divider between the `+` action and the strip-hide chevron so the
			     chevron reads as a strip control, not as a second action. -->
			<div
				class="mr-1 ml-1 w-px shrink-0 self-center bg-border"
				style="height: 1rem;"
				aria-hidden="true"
			></div>
		{/if}
		<!-- Edge chevron: always at the very right end of the strip so the
		     toggle is a stable click target regardless of tab count. `text-foreground`
		     keeps it visible (black in light, white in dark) rather than melting
		     into the strip's background. -->
		<button
			type="button"
			class="flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm text-foreground hover:bg-accent hover:text-accent-foreground"
			aria-label="Hide tab strip"
			aria-expanded={true}
			title="Hide tab strip"
			onclick={() => ontoggleHidden?.()}
		>
			<ChevronUp class="size-3.5" />
		</button>
	</div>
{/if}
