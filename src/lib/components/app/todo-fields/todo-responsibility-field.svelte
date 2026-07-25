<script lang="ts">
	import type { TodoId, TodoResponsibility } from '$lib/models';
	import * as Select from '$lib/components/ui/select';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';

	let {
		todoId,
		value,
		quiet = false
	}: { todoId: TodoId; value: TodoResponsibility; quiet?: boolean } = $props();
	async function change(next: string): Promise<void> {
		if (next === value) return;
		if (!(await todoUpdates.updateTodo(todoId, { responsibility: next as TodoResponsibility })))
			toast.error('Could not update responsibility.');
	}
</script>

<Select.Root
	type="single"
	{value}
	onValueChange={(next) => void change(next)}
	disabled={todoUpdates.isPending(todoId)}
>
	<Select.Trigger
		size="sm"
		aria-label="Todo responsibility"
		class={quiet ? 'field-quiet' : undefined}
		>{value === 'mine' ? 'Mine' : 'Waiting on'}</Select.Trigger
	>
	<Select.Content
		><Select.Group
			><Select.Item value="mine">Mine</Select.Item><Select.Item value="waiting_on"
				>Waiting on</Select.Item
			></Select.Group
		></Select.Content
	>
</Select.Root>
