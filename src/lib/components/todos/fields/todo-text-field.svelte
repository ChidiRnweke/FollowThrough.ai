<script lang="ts">
	import { untrack } from 'svelte';
	import type { TodoId } from '$lib/models/todos';
	import { Input } from '$lib/components/ui/input';
	import { Textarea } from '$lib/components/ui/textarea';
	import { toast } from 'svelte-sonner';
	import { todoUpdates } from '$lib/stores/todos/todo-updates.svelte';

	let {
		todoId,
		value = '',
		field,
		multiline = false,
		label,
		id,
		class: className
	}: {
		todoId: TodoId;
		value?: string;
		field: 'title' | 'waitingOn';
		multiline?: boolean;
		label: string;
		id?: string;
		class?: string;
	} = $props();
	const resourceDraft = untrack(() => {
		const editor = todoUpdates.editor(todoId);
		editor.capture();
		return editor;
	});

	const initialValue = (): string => value;
	let saved = $state(initialValue());
	let draft = $state(initialValue());
	$effect(() => {
		const next = value;
		if (untrack(() => draft === saved)) {
			untrack(() => resourceDraft.capture());
			saved = next;
			draft = next;
		}
	});

	async function commit(): Promise<void> {
		if (draft === saved) return;
		const next = field === 'waitingOn' ? draft.trim() || null : draft;
		if (await todoUpdates.save(resourceDraft, { [field]: next })) saved = draft;
		else {
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
		{id}
		aria-label={label}
		class={className}
		bind:value={draft}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{:else}<Input
		{id}
		aria-label={label}
		class={className}
		bind:value={draft}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{/if}
