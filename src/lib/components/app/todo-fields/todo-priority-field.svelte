<script lang="ts">
	import type { TodoId, TodoPriority } from '$lib/models';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import { todoPriorityLabels, todoPriorityStyle } from '../labels';

	let {
		todoId,
		value,
		label = 'Todo priority'
	}: { todoId: TodoId; value?: TodoPriority; label?: string } = $props();
	const priorities: TodoPriority[] = ['low', 'medium', 'high'];
	const none = 'none';

	async function change(next: string): Promise<void> {
		if (next === (value ?? none)) return;
		const priority = next === none ? null : (next as TodoPriority);
		if (!(await todoUpdates.updateTodo(todoId, { priority })))
			toast.error('Could not update priority.');
	}
</script>

<Select.Root
	type="single"
	value={value ?? none}
	onValueChange={(next) => void change(next)}
	disabled={todoUpdates.isPending(todoId)}
>
	<Select.Trigger size="sm" aria-label={label}>
		{#if value}
			<span class={['inline-block size-1.5 rounded-full', todoPriorityStyle[value].dotClass]}
			></span>
			{todoPriorityLabels[value]}
		{:else}
			<span class="text-muted-foreground">No priority</span>
		{/if}
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			<Select.Item value={none}>No priority</Select.Item>
			{#each priorities as priority (priority)}<Select.Item value={priority}
					>{todoPriorityLabels[priority]}</Select.Item
				>{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>
