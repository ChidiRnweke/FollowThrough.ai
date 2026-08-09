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
	import { Tip } from '$lib/components/ui/tooltip';
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
	const subject = $derived(
		preview.kind === 'note' ? preview.change.title : (fields.headline ?? todoTitle)
	);
	const consequence = $derived(approvalConsequence(tool.name));

	/**
	 * With a subject to lead on, the tool's own name becomes the subtitle; without one there
	 * is nothing else to head the card with, so it takes the title back rather than leaving
	 * the card unnamed.
	 */
	const heading = $derived(subject ?? friendlyToolLabel(tool.name));
	const action = $derived(subject ? friendlyToolLabel(tool.name) : undefined);

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
				baseLabel="Current note"
				candidateLabel="Proposed change"
				layout={compact ? 'candidate' : 'split'}
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
		{#each fields.details as detail (detail)}
			<p class="text-sm text-muted-foreground">{detail}</p>
		{/each}
		{@const items = fields.items ?? []}
		{@const shown = compact ? items.slice(0, 5) : items}
		{#each shown as item, index (index)}
			<div class="flex flex-col gap-0.5 {shown.length > 1 ? 'border-l-2 border-border pl-2' : ''}">
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
			<div class="flex flex-col gap-1">
				<p class="provenance-caption">{field.key}</p>
				<ChatMarkdown content={field.text} />
			</div>
		{/each}
		{#if fields.location}
			<!-- Provenance is about the whole change, so it sits a step away from it. -->
			<p class="provenance-caption pt-1">{fields.location}</p>
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

<!--
	The card leads with what is changing, not with the word "Approve": the buttons already
	say that, and the most prominent line in a review is worth more than a restatement of
	the question. The action is the subtitle, because a reader who recognises the note
	decides differently than one who only knows a verb was called.
-->
<Card.Root class="gap-3 py-4">
	<Card.Header class="px-4">
		<Card.Title class="truncate text-sm font-medium">{heading}</Card.Title>
		{#if action}
			<Card.Description>{action}</Card.Description>
		{/if}
		<Card.Action>
			<Tip text="Review in full">
				{#snippet children({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon-xs"
						aria-label="Review in full"
						onclick={() => (expanded = true)}
					>
						<Expand class="size-3.5" />
					</Button>
				{/snippet}
			</Tip>
		</Card.Action>
	</Card.Header>
	<!-- 8px between the things the preview lists; the 6px it used to use said the
	     same about a title and its value as about a diff and a warning. -->
	<Card.Content class="space-y-2 px-4">
		{#if consequence}
			<p class="text-sm text-muted-foreground">{consequence}</p>
		{/if}
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
		<Card.Footer class="gap-2 px-4 pt-1">
			<Button size="sm" disabled={busy} onclick={onapprove}>Approve</Button>
			<Button size="sm" variant="ghost" disabled={busy} onclick={onreject}>Reject</Button>
		</Card.Footer>
	{/if}
</Card.Root>

<Dialog.Root bind:open={expanded}>
	<Dialog.Content class="dialog-fill flex flex-col sm:max-w-7xl">
		<Dialog.Header>
			<Dialog.Title>{heading}</Dialog.Title>
			<Dialog.Description>
				{action ? `${action} · ` : ''}Review the change before approving it.
			</Dialog.Description>
		</Dialog.Header>
		<!-- The dialog exists to give the comparison the width the panel cannot: the diff
		     takes the height rather than sitting capped in the middle of it. -->
		<div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
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
