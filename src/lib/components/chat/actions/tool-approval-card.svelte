<script lang="ts">
	import type { Note, NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { getNote } from '$lib/remote/notes/notes.remote';
	import { getTodo } from '$lib/remote/todos/todos.remote';
	import { noteSyncRegistry } from '$lib/stores/notes/registries/note-sync-registry.svelte';
	import { Button } from '$lib/components/ui/button';
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
		framed = true,
		busy = false
	}: {
		tool: ChatToolActivity;
		shell?: ShellContext;
		onapprove: () => void;
		onreject: () => void;
		/** False inside a bundle, where one footer answers every change at once. */
		showFooter?: boolean;
		/** False inside a bundle, where the group draws one region around them all. */
		framed?: boolean;
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
	 * is nothing else to head the block with, so it takes the title back rather than leaving
	 * the change unnamed.
	 *
	 * The action and its subject share one line. Split across two, the pair read as a note
	 * that happened to be mentioned; together they say what is about to happen to which
	 * thing, which is the whole question being asked.
	 */
	const heading = $derived(
		subject ? `${friendlyToolLabel(tool.name)} · ${subject}` : friendlyToolLabel(tool.name)
	);
	const action = $derived(subject ? friendlyToolLabel(tool.name) : undefined);

	/**
	 * A second line only where it adds something. The consequence of an archive or a version
	 * restore is not visible in the change itself; the tool's own name is, in the title
	 * directly above.
	 */
	const caption = $derived(consequence);

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
				layout={compact ? (preview.change.comparable ? 'stacked' : 'candidate') : 'split'}
				frame={compact ? 'bare' : 'box'}
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
	Flat, with no rectangle of its own — the panel is already a surface, which is why the
	thread gives the agent no bubble either, and a card here made three nested outlines in a
	384px column. What marks the region instead is a pair of teal hairlines and the air
	around them: a pending approval is the live thing on the screen, which is exactly what
	the accent is for, and a rule costs one line where a box costs four edges.

	It leads with the action and its subject on one line, so the first thing read says what
	is about to happen to which thing. The ladder inside: 4px binds the title to its caption,
	8px to the change, 24px to the actions.
-->
<div class="flex flex-col gap-2 {framed ? 'my-2 border-y border-brand/40 py-4' : ''}">
	<div class="flex min-w-0 items-baseline gap-2">
		<p class="min-w-0 flex-1 truncate text-sm font-medium">{heading}</p>
		<Tip text="Review in full">
			{#snippet children({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-xs"
					class="-my-1 shrink-0"
					aria-label="Review in full"
					onclick={() => (expanded = true)}
				>
					<Expand class="size-3.5" />
				</Button>
			{/snippet}
		</Tip>
	</div>
	{#if caption}
		<!-- Bound to the subject as one unit, so the pair reads before the change does. -->
		<p class="-mt-1 text-sm text-muted-foreground">{caption}</p>
	{/if}
	{#if loadingNote}
		<p class="text-sm text-muted-foreground">Loading the current note…</p>
	{:else}
		<!-- A baseline that failed to load is not a reason to show nothing: the preview falls
		     back to the body that would be written, and says so. Approve/Reject live outside
		     this, so a preview that fails cannot strand a pending call with no way to answer. -->
		<ErrorBoundary label="this change preview" {fallback}>
			<div class="flex flex-col gap-2">
				{@render changeBody(true)}
			</div>
		</ErrorBoundary>
	{/if}
	{#if showFooter}
		<div class="mt-4 flex gap-2">
			<Button size="sm" disabled={busy} onclick={onapprove}>Approve</Button>
			<Button size="sm" variant="ghost" disabled={busy} onclick={onreject}>Reject</Button>
		</div>
	{/if}
</div>

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
