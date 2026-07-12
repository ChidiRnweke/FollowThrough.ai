<script lang="ts">
	import type { NoteSummary, ShellContext } from '$lib/models';
	import * as Command from '$lib/components/ui/command';
	import { goto } from '$app/navigation';
	import FileText from '@lucide/svelte/icons/file-text';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Inbox from '@lucide/svelte/icons/inbox';
	import MessageSquare from '@lucide/svelte/icons/message-square';
	import Plus from '@lucide/svelte/icons/plus';
	import Settings from '@lucide/svelte/icons/settings';
	import Sun from '@lucide/svelte/icons/sun';
	import { toggleMode } from 'mode-watcher';
	import { palette } from '$lib/stores/palette.svelte';
	import { rightPanel } from '$lib/stores/right-panel.svelte';

	let { shell }: { shell: ShellContext } = $props();

	function go(path: string): void {
		palette.close();
		void goto(path);
	}
	function openNote(note: NoteSummary): void {
		go(`/notes/${note.id}`);
	}
</script>

<Command.Dialog
	bind:open={palette.isOpen}
	title="Command palette"
	description="Search notes and actions"
>
	<Command.Input placeholder="Search notes and actions…" />
	<Command.List>
		<Command.Empty>Nothing found.</Command.Empty>
		<Command.Group heading="Actions">
			<Command.Item onSelect={() => go('/')}>
				<Plus class="size-4" />
				New note (quick capture on Today)
			</Command.Item>
			<Command.Item
				onSelect={() => {
					palette.close();
					rightPanel.openChat();
				}}
			>
				<MessageSquare class="size-4" />
				Open chat
			</Command.Item>
			<Command.Item onSelect={() => go('/todos')}>
				<ListTodo class="size-4" />
				Go to todos
			</Command.Item>
			<Command.Item onSelect={() => go('/suggestions')}>
				<Inbox class="size-4" />
				Review suggestions
				{#if shell.pendingSuggestionCount > 0}
					<Command.Shortcut>{shell.pendingSuggestionCount}</Command.Shortcut>
				{/if}
			</Command.Item>
			<Command.Item onSelect={() => go('/settings')}>
				<Settings class="size-4" />
				Settings
			</Command.Item>
			<Command.Item
				onSelect={() => {
					palette.close();
					toggleMode();
				}}
			>
				<Sun class="size-4" />
				Toggle theme
			</Command.Item>
		</Command.Group>
		<Command.Group heading="Notes">
			{#each shell.noteTree as note (note.id)}
				<Command.Item value={note.title} onSelect={() => openNote(note)}>
					<FileText class="size-4" />
					{note.title}
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Dialog>
