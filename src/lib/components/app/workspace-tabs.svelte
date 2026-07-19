<script lang="ts">
	import type { NoteId, ProjectId, ShellContext } from '$lib/models';
	import { workbench } from '$lib/stores/workbench.svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { Button } from '$lib/components/ui/button';
	import X from '@lucide/svelte/icons/x';
	import Pin from '@lucide/svelte/icons/pin';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';

	let {
		shell,
		onopenNew
	}: {
		shell: ShellContext;
		onopenNew?: () => void;
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
</script>

<div
	class="flex h-9 shrink-0 items-stretch gap-1 overflow-x-auto border-b border-border bg-sidebar/30 px-2"
	role="tablist"
	aria-label="Open notes"
>
	{#each groups as group (group.projectId)}
		{#if groups.length > 1}
			<div class="flex shrink-0 items-center gap-0.5 pr-1 text-xs text-muted-foreground">
				<button
					type="button"
					class="flex items-center gap-0.5 rounded px-1 py-0.5 hover:bg-accent"
					aria-label={folded.has(group.projectId)
						? `Expand ${group.projectName} tabs`
						: `Collapse ${group.projectName} tabs`}
					onclick={() => toggleFold(group.projectId)}
				>
					{#if folded.has(group.projectId)}
						<ChevronRight class="size-3.5" />
					{:else}
						<ChevronDown class="size-3.5" />
					{/if}
					<span class="max-w-[10rem] truncate">{group.projectName}</span>
				</button>
				<span class="text-sidebar-border" aria-hidden="true">|</span>
			</div>
		{/if}
		{#each group.tabs as noteId (noteId)}
			{#if showTab(group.projectId, noteId)}
				{@const active = workbench.focusedNoteId === noteId}
				<button
					type="button"
					role="tab"
					aria-selected={active}
					title={titleOf(noteId)}
					class="group relative flex h-full min-w-[8rem] max-w-[16rem] shrink-0 items-center gap-1 rounded-md px-2 text-xs transition-colors {active
						? 'bg-background text-foreground shadow-sm'
						: 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'}"
					onclick={() => void workbench.focusTab(noteId)}
				>
					{#if workbench.isPinned(noteId)}
						<Pin class="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
					{/if}
					<span class="min-w-0 flex-1 truncate text-left">{titleOf(noteId)}</span>
					<span
						role="button"
						tabindex={-1}
						aria-label={`Close ${titleOf(noteId)}`}
						class="ml-1 hidden size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground group-hover:flex {active
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
	{#if onopenNew}
		<Button
			variant="ghost"
			size="icon-sm"
			class="ml-auto shrink-0 self-center"
			aria-label="Open a new note"
			onclick={onopenNew}
		>
			<Plus class="size-4" />
		</Button>
	{/if}
</div>
