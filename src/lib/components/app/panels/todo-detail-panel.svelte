<script lang="ts">
	import * as Field from '$lib/components/ui/field';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';
	import { FtExternal as ExternalLink } from '$lib/components/icons';
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
		</Field.FieldGroup>

		<!-- A property list, not a form. `Field`'s responsive orientation switches at
		     the @md/field-group container query (448px), which this panel (max-w-sm,
		     384px) can never reach — so every row stacked label-above-input. An
		     explicit grid gives the label/value reading the width actually allows. -->
		<dl class="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-sm">
			<dt class="text-muted-foreground">Status</dt>
			<dd><TodoStatusField todoId={view.todo.id} value={view.todo.status} quiet /></dd>

			<dt class="text-muted-foreground">Priority</dt>
			<dd><TodoPriorityField todoId={view.todo.id} value={view.todo.priority} quiet /></dd>

			<dt class="text-muted-foreground">Due date</dt>
			<dd><TodoDueDateField todoId={view.todo.id} value={view.todo.dueDate} quiet /></dd>

			<dt class="text-muted-foreground">Responsibility</dt>
			<dd>
				<TodoResponsibilityField todoId={view.todo.id} value={view.todo.responsibility} quiet />
			</dd>

			{#if view.todo.responsibility === 'waiting_on'}
				<dt class="text-muted-foreground">Counterparty</dt>
				<dd>
					{#key `${view.todo.id}-waiting-${view.todo.updatedAt}`}<TodoTextField
							todoId={view.todo.id}
							value={view.todo.waitingOn}
							field="waitingOn"
							label="Waiting on"
						/>{/key}
				</dd>
			{/if}

			<dt class="text-muted-foreground">Source</dt>
			<dd>
				<TodoSourceField
					todoId={view.todo.id}
					projectId={view.todo.projectId}
					value={view.todo.linkedNoteId}
					sourceTitle={view.sourceNote?.title}
					hasOrigin={view.originNote !== undefined}
					quiet
					{notes}
				/>
			</dd>

			{#if view.sourceNote}
				<dt class="sr-only">Open source</dt>
				<dd class="col-start-2">
					<Button href="/notes/{view.sourceNote.id}" variant="link" size="sm" class="h-auto px-0"
						>Open selected note<ExternalLink data-icon="inline-end" /></Button
					>
				</dd>
			{/if}

			<dt class="text-muted-foreground">Created</dt>
			<dd class="text-muted-foreground">{created}</dd>
		</dl>

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
				<!-- Neutral until pointed at: the confirm step carries the warning, so a
				     permanently red control only competes with the todo's own content. -->
				<Button
					{...props}
					variant="ghost"
					size="sm"
					class="self-start text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
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
