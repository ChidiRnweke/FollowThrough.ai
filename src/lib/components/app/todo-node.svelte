<script lang="ts">
	import type { NodeViewProps } from '@tiptap/core';
	import type { TodoId } from '$lib/models';
	import type { PerNoteEditorSlot } from '$lib/components/edra/commands/CoreEditor.js';
	import NodeViewWrapper from '$lib/components/edra/NodeViewWrapper.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { rightPanel } from '$lib/stores/right-panel.svelte';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import { formatDate, todayLocalDate } from './labels';

	let { node, editor }: NodeViewProps = $props();

	// TipTap's NodeViewProps types `editor` as the base TiptapEditor; our
	// `perNote` slot lives on the subclass in `CoreEditor.ts`.  Cast through
	// `unknown` so we read the per-note stores that the owning NoteEditor
	// attached on mount.
	const perNote = $derived((editor as unknown as { perNote?: PerNoteEditorSlot }).perNote);
	const todoId = $derived(node.attrs.todoId as TodoId | null);
	const view = $derived(todoId !== null ? perNote?.todos.get(todoId) : undefined);
	const done = $derived(view?.todo.status === 'done');
	const overdue = $derived(
		view !== undefined &&
			!done &&
			view.todo.dueDate !== undefined &&
			view.todo.dueDate < todayLocalDate()
	);
</script>

<NodeViewWrapper class="my-1">
	{#if view}
		<span
			class="flex items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-accent/50"
			contenteditable="false"
		>
			<Checkbox
				checked={done}
				aria-label={done ? 'Reopen todo' : 'Complete todo'}
				onCheckedChange={(checked) =>
					void todoUpdates.setStatus(view.todo.id, checked ? 'done' : 'open')}
			/>
			<Button
				variant="link"
				class="h-auto p-0 font-normal text-foreground {done
					? 'text-muted-foreground line-through'
					: ''}"
				onclick={() => rightPanel.openTodo(view)}
			>
				{view.todo.title}
			</Button>
			{#if view.todo.dueDate}
				<Badge
					variant="ghost"
					class={overdue ? 'bg-warning/15 text-warning' : 'text-muted-foreground'}
				>
					{formatDate(view.todo.dueDate)}
				</Badge>
			{/if}
		</span>
	{:else}
		<span class="text-sm text-muted-foreground" contenteditable="false">
			This todo is no longer available.
		</span>
	{/if}
</NodeViewWrapper>
