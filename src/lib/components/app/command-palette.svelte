<script lang="ts">
	import type { NoteSummary, ShellContext } from '$lib/models';
	import * as Command from '$lib/components/ui/command';
	import { FtDocument as FileText } from '$lib/components/icons';
	import { commandRegistry } from '$lib/commands/registry';
	import { palette } from '$lib/stores/palette.svelte';
	import { workbench } from '$lib/stores/workbench.svelte';

	let { shell }: { shell: ShellContext } = $props();

	function openNote(note: NoteSummary): void {
		palette.close();
		void workbench.openTab(note.id);
	}
</script>

<Command.Dialog
	bind:open={palette.isOpen}
	title="Command palette"
	description="Search notes, todos and commands"
>
	<Command.Input placeholder="Search notes, todos and commands…" />
	<Command.List>
		<Command.Empty>Nothing found.</Command.Empty>
		<Command.Group heading="Actions">
			{#each commandRegistry as command (command.id)}
				<Command.Item onSelect={() => void command.run()}>
					<command.icon />
					{command.label}
					{#if command.shortcut}<Command.Shortcut>{command.shortcut}</Command.Shortcut>{/if}
				</Command.Item>
			{/each}
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
