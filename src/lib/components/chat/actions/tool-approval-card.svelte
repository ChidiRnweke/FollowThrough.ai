<script lang="ts">
	import type { Note, NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { getNote } from '$lib/remote/notes/notes.remote';
	import { getTodo } from '$lib/remote/todos/todos.remote';
	import { noteSyncRegistry } from '$lib/stores/notes/registries/note-sync-registry.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { FtExternal as Expand } from '$lib/components/icons';
	import NoteVersionDiff from '../../notes/note-version-diff.svelte';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import ChatMarkdown from '../chat-markdown.svelte';
	import { approvalConsequence, friendlyToolLabel } from '../../agent/actions/tool-presentation';
	import { approvalPreview, isNoteBodyTool, targetNoteId } from './tool-approval-preview';
	import { approvalFields, argumentLabel } from './tool-approval-fields';

	let {
		tool,
		shell,
		onapprove,
		onreject,
		showFooter = true,
		busy = false
	}: {
		tool: ChatToolActivity;
		shell?: ShellContext;
		onapprove: () => void;
		onreject: () => void;
		/** False inside a bundle, where one footer answers every card at once. */
		showFooter?: boolean;
		busy?: boolean;
	} = $props();

	const noteId = $derived(targetNoteId(tool.name, tool.arguments));
	let baseline = $state<Note | undefined>(undefined);
	let baselineError = $state(false);
	let expanded = $state(false);

	/** An update_todo call names its subject by id alone; resolve it to a title. */
	const todoSubjectId = $derived(
		tool.name === 'update_todo' && typeof tool.arguments.todoId === 'string'
			? tool.arguments.todoId
			: undefined
	);
	let todoTitle = $state<string | undefined>(undefined);

	$effect(() => {
		const id = todoSubjectId;
		if (!id) return;
		let cancelled = false;
		void getTodo(id)
			.then((todo) => {
				if (!cancelled) todoTitle = todo.title;
			})
			.catch(() => {
				/* a missing title degrades to the detail lines, as before */
			});
		return () => {
			cancelled = true;
		};
	});

	$effect(() => {
		const id = noteId;
		if (!id) return;
		const mounted = noteSyncRegistry.peek(id as NoteId)?.record?.local;
		if (mounted) {
			baseline = mounted;
			return;
		}
		let cancelled = false;
		void getNote(id)
			.then((loaded) => {
				if (!cancelled) baseline = loaded;
			})
			.catch(() => {
				if (!cancelled) baselineError = true;
			});
		return () => {
			cancelled = true;
		};
	});

	const preview = $derived(approvalPreview(tool.name, tool.arguments, baseline));
	const loadingNote = $derived(Boolean(noteId) && !baseline && !baselineError);
	const fields = $derived(approvalFields(tool.arguments, shell));
	const subject = $derived(fields.headline ?? todoTitle);
	const consequence = $derived(approvalConsequence(tool.name));

	/** Long string payloads are prose the model wrote, so they read as prose. */
	const proseFields = $derived(
		isNoteBodyTool(tool.name)
			? []
			: Object.entries(tool.arguments)
					.filter(([, value]) => typeof value === 'string' && value.length > 120)
					.map(([key, value]) => ({ key: argumentLabel(key), text: value as string }))
	);
</script>

{#snippet changeBody(compact: boolean)}
	{#if preview.kind === 'note'}
		<p class="truncate text-sm font-medium">{preview.change.title}</p>
		{#if preview.change.titleChange}
			<p class="text-sm">
				<span class="text-muted-foreground">Title:</span>
				{preview.change.titleChange.from} → {preview.change.titleChange.to}
			</p>
		{/if}
		{#each preview.change.problems as problem (problem)}
			<p class="text-sm text-destructive">{problem}</p>
		{/each}
		{#if preview.change.body}
			<NoteVersionDiff
				base={preview.change.body.base}
				candidate={preview.change.body.candidate}
				label="Proposed note changes"
				{compact}
			/>
		{/if}
		{#each preview.change.notices as notice (notice)}
			<p class="text-sm text-muted-foreground">{notice}</p>
		{/each}
		{#if !preview.change.body && preview.change.problems.length === 0 && preview.change.notices.length === 0}
			<p class="text-sm text-muted-foreground">No visible note changes.</p>
		{/if}
	{:else}
		{#if subject}
			<p class="text-sm">{subject}</p>
		{/if}
		{#each fields.details as detail (detail)}
			<p class="text-sm text-muted-foreground">{detail}</p>
		{/each}
		{@const items = fields.items ?? []}
		{@const shown = compact ? items.slice(0, 5) : items}
		{#each shown as item, index (index)}
			<div class={shown.length > 1 ? 'border-l-2 border-border pl-2' : ''}>
				{#if item.headline}
					<p class="text-sm">{item.headline}</p>
				{/if}
				{#each item.details as detail (detail)}
					<p class="text-sm text-muted-foreground">{detail}</p>
				{/each}
			</div>
		{/each}
		{#if compact && items.length > shown.length}
			<p class="text-sm text-muted-foreground">…and {items.length - shown.length} more</p>
		{/if}
		{#each proseFields as field (field.key)}
			<div>
				<p class="provenance-caption">{field.key}</p>
				<ChatMarkdown content={field.text} />
			</div>
		{/each}
		{#if fields.location}
			<p class="provenance-caption">{fields.location}</p>
		{/if}
	{/if}
{/snippet}

{#snippet fallback(error: App.Error, reset: () => void)}
	<div class="flex flex-col gap-1.5">
		<p class="text-sm text-destructive" role="alert">
			This change could not be previewed, so there is nothing to review. Reject it, or try again.
		</p>
		<p class="provenance-caption">{error.message}</p>
		<Button variant="ghost" size="xs" class="self-start" onclick={reset}>Try again</Button>
	</div>
{/snippet}

<Card.Root class="gap-2 py-3">
	<Card.Header class="px-4">
		<Card.Title class="text-sm font-medium">Approve · {friendlyToolLabel(tool.name)}</Card.Title>
		{#if consequence}
			<Card.Description>{consequence}</Card.Description>
		{/if}
		<Card.Action>
			<Button
				variant="ghost"
				size="icon-xs"
				aria-label="Review in full"
				onclick={() => (expanded = true)}
			>
				<Expand class="size-3.5" />
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="space-y-1.5 px-4">
		{#if loadingNote}
			<p class="text-sm text-muted-foreground">Loading the current note…</p>
		{:else if baselineError}
			<p class="text-sm text-muted-foreground">
				The current note could not be loaded for comparison.
			</p>
		{:else}
			<!-- Approve/Reject live outside this, in the footer: a preview that fails
			     must not strand a pending tool call with no way to answer it. -->
			<ErrorBoundary label="this change preview" {fallback}>
				{@render changeBody(true)}
			</ErrorBoundary>
		{/if}
	</Card.Content>
	{#if showFooter}
		<Card.Footer class="gap-2 px-4">
			<Button size="sm" disabled={busy} onclick={onapprove}>Approve</Button>
			<Button size="sm" variant="ghost" disabled={busy} onclick={onreject}>Reject</Button>
		</Card.Footer>
	{/if}
</Card.Root>

<Dialog.Root bind:open={expanded}>
	<Dialog.Content class="flex max-h-dvh flex-col sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>{friendlyToolLabel(tool.name)}</Dialog.Title>
			<Dialog.Description>Review the change before approving it.</Dialog.Description>
		</Dialog.Header>
		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
			<ErrorBoundary label="this change preview" {fallback}>
				{@render changeBody(false)}
			</ErrorBoundary>
		</div>
		<Dialog.Footer>
			<Button
				size="sm"
				onclick={() => {
					expanded = false;
					onapprove();
				}}>Approve</Button
			>
			<Button
				size="sm"
				variant="ghost"
				onclick={() => {
					expanded = false;
					onreject();
				}}>Reject</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
