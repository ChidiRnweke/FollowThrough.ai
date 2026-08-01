<script lang="ts">
	import type { TodoId } from '$lib/models';
	import { Input } from '$lib/components/ui/input';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';

	let {
		todoId,
		value = '',
		categories = [],
		label = 'Category',
		quiet = false
	}: {
		todoId: TodoId;
		value?: string;
		/** Existing categories, offered as datalist suggestions so spellings stay reusable. */
		categories?: readonly string[];
		label?: string;
		quiet?: boolean;
	} = $props();

	const listId = $props.id();
	const initialValue = (): string => value;
	let saved = $state(initialValue());
	let draft = $state(initialValue());

	async function commit(): Promise<void> {
		if (draft === saved) return;
		const category = draft.trim() || null;
		if (await todoUpdates.updateTodo(todoId, { category })) saved = draft;
		else {
			draft = saved;
			toast.error('Could not update category.');
		}
	}

	function keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			draft = saved;
			(event.currentTarget as HTMLElement).blur();
		}
		if (event.key === 'Enter') {
			event.preventDefault();
			void commit();
			(event.currentTarget as HTMLElement).blur();
		}
	}
</script>

<Input
	list={categories.length > 0 ? `${listId}-categories` : undefined}
	aria-label={label}
	placeholder={quiet ? '—' : 'Category…'}
	class={quiet
		? 'h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input hover:bg-muted/50 dark:bg-transparent dark:hover:bg-muted/50'
		: undefined}
	bind:value={draft}
	onblur={() => void commit()}
	onkeydown={keydown}
	disabled={todoUpdates.isPending(todoId)}
/>
{#if categories.length > 0}
	<datalist id="{listId}-categories">
		{#each categories as category (category)}<option value={category}></option>{/each}
	</datalist>
{/if}
