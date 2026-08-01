<script lang="ts">
	import type { NoteSummary } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import * as Command from '$lib/components/ui/command';
	import { FtDocument as FileText } from '$lib/components/icons';
	import { commandRegistry } from '$lib/commands/registry';
	import { palette } from '$lib/stores/shell/palette.svelte';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';

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
				<!-- The id keeps the value unique: bits-ui keys its item registry by
			     `value`, and two same-titled notes would delete each other's entry. -->
				<Command.Item value={`${note.title} ${note.id}`} onSelect={() => openNote(note)}>
					<FileText class="size-4" />
					{note.title}
				</Command.Item>
			{/each}
		</Command.Group>
	</Command.List>
</Command.Dialog>
