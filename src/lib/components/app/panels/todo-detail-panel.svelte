<script lang="ts">
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import { todoUpdates } from '$lib/stores/todo-updates.svelte';
	import TodoTextField from '../todo-fields/todo-text-field.svelte';
	import TodoStatusField from '../todo-fields/todo-status-field.svelte';
	import TodoPriorityField from '../todo-fields/todo-priority-field.svelte';
	import TodoDueDateField from '../todo-fields/todo-due-date-field.svelte';
	import TodoResponsibilityField from '../todo-fields/todo-responsibility-field.svelte';
	import TodoSourceField from '../todo-fields/todo-source-field.svelte';
	import ConfirmDelete from '../confirm-delete.svelte';
	import { toast } from 'svelte-sonner';
	import type { NoteSummary, TodoId, TodoView } from '$lib/models';

	let {
		view,
		notes = [],
		ondeleted
	}: { view?: TodoView; notes?: readonly NoteSummary[]; ondeleted?: () => void } = $props();

	async function remove(todoId: TodoId) {
		const ok = await todoUpdates.remove(todoId);
		if (ok) {
			toast.success('Todo deleted');
			ondeleted?.();
		} else toast.error('Could not delete the todo. Try again.');
	}
	const created = $derived(
		view
			? new Intl.DateTimeFormat('en-GB', {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				}).format(new Date(view.todo.createdAt))
			: ''
	);
</script>

{#if view}
	<div class="flex flex-col gap-5 pb-6">
		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="todo-title">Title</Field.FieldLabel>
				{#key `${view.todo.id}-title-${view.todo.updatedAt}`}<TodoTextField
						todoId={view.todo.id}
						value={view.todo.title}
						field="title"
						label="Todo title"
					/>{/key}
			</Field.Field>
			<Field.Field>
				<Field.FieldLabel>Description</Field.FieldLabel>
				{#key `${view.todo.id}-description-${view.todo.updatedAt}`}<TodoTextField
						todoId={view.todo.id}
						value={view.todo.description}
						field="description"
						label="Todo description"
						multiline
					/>{/key}
			</Field.Field>
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Status</Field.FieldLabel>
				<TodoStatusField todoId={view.todo.id} value={view.todo.status} />
			</Field.Field>
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Priority</Field.FieldLabel>
				<TodoPriorityField todoId={view.todo.id} value={view.todo.priority} />
			</Field.Field>
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Due date</Field.FieldLabel>
				<TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} />
			</Field.Field>
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Responsibility</Field.FieldLabel>
				<TodoResponsibilityField todoId={view.todo.id} value={view.todo.responsibility} />
			</Field.Field>
			{#if view.todo.responsibility === 'waiting_on'}
				<Field.Field>
					<Field.FieldLabel>Counterparty (optional)</Field.FieldLabel>
					{#key `${view.todo.id}-waiting-${view.todo.updatedAt}`}<TodoTextField
							todoId={view.todo.id}
							value={view.todo.waitingOn}
							field="waitingOn"
							label="Waiting on"
						/>{/key}
				</Field.Field>
			{/if}
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Source</Field.FieldLabel>
				<TodoSourceField
					todoId={view.todo.id}
					projectId={view.todo.projectId}
					value={view.todo.linkedNoteId}
					sourceTitle={view.sourceNote?.title}
					hasOrigin={view.originNote !== undefined}
					{notes}
				/>
			</Field.Field>
			{#if view.sourceNote}
				<Field.Field orientation="responsive">
					<Field.FieldLabel>Open source</Field.FieldLabel>
					<Button href="/notes/{view.sourceNote.id}" variant="link" size="sm"
						>Open selected note<ExternalLink data-icon="inline-end" /></Button
					>
				</Field.Field>
			{/if}
			<Field.Field orientation="responsive">
				<Field.FieldLabel>Created</Field.FieldLabel>
				<p class="text-sm text-muted-foreground">{created}</p>
			</Field.Field>
		</Field.FieldGroup>

		{#if view.anchor}
			<Separator />
			<section class="flex flex-col gap-2" aria-labelledby="original-context-heading">
				<h3 id="original-context-heading" class="section-title">Original context</h3>
				<blockquote class="border-l-2 border-border pl-3 text-sm text-muted-foreground">
					{view.anchor.quote}
				</blockquote>
				{#if view.originNote}<Button
						href="/notes/{view.originNote.id}"
						variant="link"
						size="sm"
						class="self-start px-0"
						>Open {view.originNote.title}<ExternalLink data-icon="inline-end" /></Button
					>{/if}
			</section>
		{/if}

		<Separator />
		<ConfirmDelete
			title="Delete this todo?"
			description="It will be removed from every board, list, and note that references it."
			confirmLabel="Delete"
			busy={todoUpdates.isPending(view.todo.id)}
			onconfirm={() => remove(view.todo.id)}
		>
			{#snippet trigger(props)}
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="self-start text-destructive hover:bg-destructive/10 hover:text-destructive"
					>Delete todo</Button
				>
			{/snippet}
		</ConfirmDelete>

		<p class="sr-only" aria-live="polite">
			{todoUpdates.isPending(view.todo.id) ? 'Saving todo' : 'Todo saved'}
		</p>
	</div>
{:else}
	<p class="text-sm text-muted-foreground">Pick a todo to see its details.</p>
{/if}
