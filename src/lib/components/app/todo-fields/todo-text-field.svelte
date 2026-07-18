<script lang="ts">
	import type { TodoId } from '$lib/models';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';

	let {
		todoId,
		value = '',
		field,
		multiline = false,
		label
	}: {
		todoId: TodoId;
		value?: string;
		field: 'title' | 'description' | 'waitingOn';
		multiline?: boolean;
		label: string;
	} = $props();
	const initialValue = (): string => value;
	let saved = $state(initialValue());
	let draft = $state(initialValue());
	async function commit(): Promise<void> {
		if (draft === saved) return;
		const next = field === 'description' || field === 'waitingOn' ? draft.trim() || null : draft;
		if (await todoUpdates.updateTodo(todoId, { [field]: next })) saved = draft;
		else {
			draft = saved;
			toast.error(`Could not update ${label.toLowerCase()}.`);
		}
	}
	function keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			draft = saved;
			(event.currentTarget as HTMLElement).blur();
		}
		if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
			event.preventDefault();
			void commit();
			(event.currentTarget as HTMLElement).blur();
		}
	}
</script>

{#if multiline}<Textarea
		aria-label={label}
		bind:value={draft}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{:else}<Input
		aria-label={label}
		bind:value={draft}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{/if}
