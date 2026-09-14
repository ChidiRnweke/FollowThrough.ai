<script lang="ts">
	import { EditorSession } from '$lib/stores/workspace/editor-session.svelte';
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
		list,
		placeholder,
		class: className
	}: {
		todoId: TodoId;
		value?: string;
		field: 'title' | 'waitingOn' | 'category';
		multiline?: boolean;
		label: string;
		id?: string;
		list?: string;
		placeholder?: string;
		class?: string;
	} = $props();
	const resourceDraft = untrack(() => {
		const editor = todoUpdates.editor(todoId);
		editor.capture();
		return editor;
	});

	const editorSession = new EditorSession(() => resourceDraft.active);
	$effect(() => () => editorSession.close());
	const initialValue = (): string => value;
	let saved = $state(initialValue());
	let draft = $state(initialValue());
	$effect(() => {
		const next = value;
		if (untrack(() => !editorSession.dirty && !editorSession.saving)) {
			untrack(() => {
				resourceDraft.capture();
				editorSession.accept();
			});
			saved = next;
			draft = next;
		}
	});

	async function commit(): Promise<void> {
		if (!editorSession.dirty) return;
		await editorSession.save(
			async () => {
				const submitted = draft;
				const patch = { [field]: field !== 'title' ? submitted.trim() || null : submitted };
				return (await todoUpdates.save(resourceDraft, patch))
					? { kind: 'saved', value: submitted }
					: { kind: 'failure', message: todoUpdates.lastError ?? 'The edit could not be saved' };
			},
			(value) => {
				saved = value;
			}
		);
		if (editorSession.failure) {
			toast.error(`Could not update ${label.toLowerCase()}.`);
		}
	}

	function keydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			draft = saved;
			editorSession.accept();
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
		{placeholder}
		aria-label={label}
		class={className}
		bind:value={draft}
		oninput={() => editorSession.changed()}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{:else}<Input
		{list}
		{id}
		{placeholder}
		aria-label={label}
		class={className}
		bind:value={draft}
		oninput={() => editorSession.changed()}
		onblur={() => void commit()}
		onkeydown={keydown}
		disabled={todoUpdates.isPending(todoId)}
	/>{/if}
