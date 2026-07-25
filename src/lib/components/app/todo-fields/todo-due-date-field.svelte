<script lang="ts">
	import type { LocalDate, TodoId } from '$lib/models';
	import * as Popover from '$lib/components/ui/popover';
	import { Calendar } from '$lib/components/ui/calendar';
	import { Button } from '$lib/components/ui/button';
	import { FtCalendar as CalendarIcon, FtClose as X } from '$lib/components/icons';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import { formatDate } from '../labels';

	let {
		todoId,
		value,
		quiet = false
	}: { todoId: TodoId; value?: LocalDate; quiet?: boolean } = $props();
	let open = $state(false);
	const calendarValue = $derived(value ? parseDate(value) : undefined);
	async function commit(next: DateValue | undefined): Promise<void> {
		open = false;
		const dueDate = next ? (next.toString() as LocalDate) : null;
		if (!(await todoUpdates.updateTodo(todoId, { dueDate })))
			toast.error('Could not update due date.');
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}<Button
				{...props}
				variant="ghost"
				size="sm"
				disabled={todoUpdates.isPending(todoId)}
				aria-label={value ? `Due ${formatDate(value)}` : 'No due date'}
				class={quiet ? 'field-quiet' : undefined}
				data-empty={value ? undefined : 'true'}
				>{#if value}<CalendarIcon data-icon="inline-start" />{formatDate(
						value
					)}{:else if quiet}—{:else}<CalendarIcon data-icon="inline-start" />No due date{/if}</Button
			>{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-auto p-0" align="start">
		<Calendar value={calendarValue} onValueChange={(next) => void commit(next)} />
		{#if value}<div class="border-t p-2">
				<Button variant="ghost" size="sm" class="w-full" onclick={() => void commit(undefined)}
					><X data-icon="inline-start" />Clear due date</Button
				>
			</div>{/if}
	</Popover.Content>
</Popover.Root>
