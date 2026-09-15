<script lang="ts">
	import type { TodoId } from '$lib/models/todos';
	import TodoTextField from './todo-text-field.svelte';

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
</script>

<TodoTextField
	{todoId}
	{value}
	field="category"
	list={categories.length > 0 ? `${listId}-categories` : undefined}
	{label}
	placeholder={quiet ? '—' : 'Category…'}
	class={quiet
		? 'h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input hover:bg-muted/50 dark:bg-transparent dark:hover:bg-muted/50'
		: undefined}
/>
{#if categories.length > 0}
	<datalist id="{listId}-categories">
		{#each categories as category (category)}<option value={category}></option>{/each}
	</datalist>
{/if}
