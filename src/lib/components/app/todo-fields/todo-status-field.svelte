<script lang="ts">
	import type { TodoId, TodoStatus } from '$lib/models';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import { todoStatusLabels, todoStatusStyle } from '../labels';

	let {
		todoId,
		value,
		label = 'Todo status'
	}: { todoId: TodoId; value: TodoStatus; label?: string } = $props();
	const statuses: TodoStatus[] = ['backlog', 'open', 'in_progress', 'done', 'cancelled'];

	async function change(status: string): Promise<void> {
		if (status === value) return;
		if (!(await todoUpdates.setStatus(todoId, status as TodoStatus)))
			toast.error('Could not update status.');
	}
</script>

<Select.Root
	type="single"
	{value}
	onValueChange={(next) => void change(next)}
	disabled={todoUpdates.isPending(todoId)}
>
	<Select.Trigger size="sm" aria-label={label}>
		<span class={['inline-block size-1.5 rounded-full', todoStatusStyle[value].dotClass]}></span>
		{todoStatusLabels[value]}
	</Select.Trigger>
	<Select.Content>
		<Select.Group>
			{#each statuses as status (status)}<Select.Item value={status}
					>{todoStatusLabels[status]}</Select.Item
				>{/each}
		</Select.Group>
	</Select.Content>
</Select.Root>
