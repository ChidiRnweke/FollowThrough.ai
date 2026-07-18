<script lang="ts">
	import type { NoteId, NoteSummary, ProjectId, TodoId } from '$lib/models';
	import * as Popover from '$lib/components/ui/popover';
	import * as Command from '$lib/components/ui/command';
	import { Button } from '$lib/components/ui/button';
	import ChevronsUpDown from '@lucide/svelte/icons/chevrons-up-down';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';

	let {
		todoId,
		projectId,
		value,
		sourceTitle,
		hasOrigin,
		notes = []
	}: {
		todoId: TodoId;
		projectId: ProjectId;
		value?: NoteId;
		sourceTitle?: string;
		hasOrigin?: boolean;
		notes?: readonly NoteSummary[];
	} = $props();
	let open = $state(false);
	const choices = $derived(
		notes.filter((note) => note.projectId === projectId && note.kind === 'note' && !note.archivedAt)
	);
	async function choose(linkedNoteId: NoteId | null): Promise<void> {
		open = false;
		if (!(await todoUpdates.updateTodo(todoId, { linkedNoteId })))
			toast.error('Could not update source.');
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger
		>{#snippet child({ props })}<Button
				{...props}
				variant="ghost"
				size="sm"
				disabled={todoUpdates.isPending(todoId)}
				class="max-w-48 justify-between"
				><span class="truncate">{sourceTitle ?? 'No source'}</span><ChevronsUpDown
					data-icon="inline-end"
				/></Button
			>{/snippet}</Popover.Trigger
	>
	<Popover.Content class="w-72 p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Search notes…" />
			<Command.List>
				<Command.Empty>No notes found.</Command.Empty>
				<Command.Group heading="Source">
					<Command.Item value="__original" onSelect={() => void choose(null)}
						>{hasOrigin ? 'Original source' : 'No source'}</Command.Item
					>
					{#each choices as note (note.id)}<Command.Item
							value={`${note.title} ${note.id}`}
							onSelect={() => void choose(note.id)}>{note.title}</Command.Item
						>{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
