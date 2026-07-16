<script lang="ts">
	import { page } from '$app/state';
	import AppSidebar from '$lib/components/app/app-sidebar.svelte';
	import CommandPalette from '$lib/components/app/command-palette.svelte';
	import RightPanel from '$lib/components/app/right-panel.svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { palette } from '$lib/stores/palette.svelte';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import type { NoteId } from '$lib/models';
	import { CommandKeyboardHandler } from '$lib/commands/keyboard';

	let { data, children } = $props();

	const activeNoteId = $derived(
		page.url.pathname.startsWith('/notes/')
			? (page.url.pathname.split('/')[2] as NoteId)
			: undefined
	);

	const keyboard = new CommandKeyboardHandler();
	function onkeydown(event: KeyboardEvent): void {
		keyboard.handle(event);
	}
</script>

<svelte:window {onkeydown} />

<Sidebar.Provider open={data.sidebarOpen} class="h-dvh min-h-0 overflow-hidden">
	<AppSidebar shell={data.shell} activePath={page.url.pathname} {activeNoteId} />
	<Sidebar.Inset class="min-w-0 overflow-y-auto border-l border-sidebar-border">
		{@render children()}
	</Sidebar.Inset>
	<RightPanel
		shell={data.shell}
		agentPreferences={data.agentPreferences}
		agentModels={data.agentModels}
		agentAvailable={data.agentAvailable}
		{activeNoteId}
		onstatus={(todoId, status) => void todoUpdates.setStatus(todoId, status)}
	/>
</Sidebar.Provider>

<CommandPalette shell={data.shell} />
