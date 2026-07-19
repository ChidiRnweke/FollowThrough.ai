<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { navigating, page } from '$app/state';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import CommandPalette from '$lib/components/app/command-palette.svelte';
	import RightPanel from '$lib/components/app/right-panel.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import type { NoteId, ProjectId } from '$lib/models';
	import { CommandKeyboardHandler } from '$lib/commands/keyboard';

	let { data, children } = $props();

	const isNavigating = $derived(navigating.to !== null);

	let insetRef = $state<HTMLElement | null>(null);

	afterNavigate(() => {
		if (insetRef) insetRef.scrollTop = 0;
	});

	const activeNoteId = $derived(
		page.url.pathname.startsWith('/notes/')
			? (page.url.pathname.split('/')[2] as NoteId)
			: undefined
	);
	const activeProjectId = $derived.by(() => {
		const note = data.shell.noteTree.find((entry) => entry.id === activeNoteId);
		if (note) return note.projectId;
		if (page.url.pathname.startsWith('/projects/'))
			return page.url.pathname.split('/')[2] as ProjectId;
		return undefined;
	});

	const keyboard = new CommandKeyboardHandler();
	function onkeydown(event: KeyboardEvent): void {
		keyboard.handle(event);
	}
</script>

<svelte:window {onkeydown} />

<Sidebar.Provider open={data.sidebarOpen} class="h-dvh min-h-0 overflow-hidden">
	<AppSidebar
		shell={data.shell}
		activePath={page.url.pathname}
		{activeNoteId}
		loading={isNavigating}
	/>
	<Sidebar.Inset bind:ref={insetRef} class="relative min-w-0 overflow-y-auto border-l border-sidebar-border">
		{#if isNavigating}
			<div class="absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden">
				<div class="bg-primary h-full w-full origin-left animate-pulse"></div>
			</div>
		{/if}
		{@render children()}
	</Sidebar.Inset>
	<RightPanel
		shell={data.shell}
		sessions={data.sessions}
		agentPreferences={data.agentPreferences}
		agentModels={data.agentModels}
		agentAvailable={data.agentAvailable}
		{activeNoteId}
		{activeProjectId}
		onstatus={(todoId, status) => void todoUpdates.setStatus(todoId, status)}
	/>
</Sidebar.Provider>

<CommandPalette shell={data.shell} />
