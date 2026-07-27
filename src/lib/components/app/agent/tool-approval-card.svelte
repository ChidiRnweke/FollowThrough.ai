<script lang="ts">
	import type { Note, NoteId } from '$lib/models';
	import type { ChatToolActivity } from '$lib/stores/chat-tools';
	import { getNote } from '$lib/remote/notes.remote';
	import { noteSyncRegistry } from '$lib/stores/registries/note-sync-registry.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Dialog from '$lib/components/ui/dialog';
	import { FtExternal as Expand } from '$lib/components/icons';
	import NoteVersionDiff from '../note-version-diff.svelte';
	import ChatMarkdown from './chat-markdown.svelte';
	import { friendlyToolLabel } from './tool-presentation';
	import { approvalPreview, isNoteBodyTool, targetNoteId } from './tool-approval-preview';

	let {
		tool,
		onapprove,
		onreject
	}: {
		tool: ChatToolActivity;
		onapprove: () => void;
		onreject: () => void;
	} = $props();

	const noteId = $derived(targetNoteId(tool.name, tool.arguments));
	let baseline = $state<Note | undefined>(undefined);
	let baselineError = $state(false);
	let expanded = $state(false);

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

	/**
	 * Long string payloads are prose the model wrote, so they read as prose. The raw
	 * JSON stays one disclosure away rather than being the only representation.
	 */
	const proseFields = $derived(
		isNoteBodyTool(tool.name)
			? []
			: Object.entries(tool.arguments)
					.filter(([, value]) => typeof value === 'string' && value.length > 120)
					.map(([key, value]) => ({ key: friendlyToolLabel(key), text: value as string }))
	);
</script>

{#snippet changeBody(compact: boolean)}
	{#if preview.kind === 'note'}
		<p class="truncate text-sm font-medium">{preview.change.title}</p>
		{#if preview.change.titleChange}
			<p class="text-xs">
				<span class="text-muted-foreground">Title:</span>
				{preview.change.titleChange.from} → {preview.change.titleChange.to}
			</p>
		{/if}
		{#each preview.change.problems as problem (problem)}
			<p class="text-xs text-destructive">{problem}</p>
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
			<p class="text-xs text-muted-foreground">{notice}</p>
		{/each}
		{#if !preview.change.body && preview.change.problems.length === 0 && preview.change.notices.length === 0}
			<p class="text-xs text-muted-foreground">No visible note changes.</p>
		{/if}
	{:else}
		{#each preview.summaries as summary (summary)}
			<p class="text-xs">{summary}</p>
		{/each}
		{#each proseFields as field (field.key)}
			<div class="text-xs">
				<span class="text-muted-foreground">{field.key}</span>
				<ChatMarkdown content={field.text} />
			</div>
		{/each}
	{/if}
{/snippet}

<Card.Root>
	<Card.Header>
		<Card.Title class="text-sm">Approve {friendlyToolLabel(tool.name)}?</Card.Title>
		<Card.Description>This action changes saved workspace data.</Card.Description>
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
	<Card.Content class="flex flex-col gap-3">
		{#if loadingNote}
			<p class="text-xs text-muted-foreground">Loading the current note…</p>
		{:else if baselineError}
			<p class="text-xs text-muted-foreground">
				The current note could not be loaded for comparison.
			</p>
		{:else}
			{@render changeBody(true)}
		{/if}
		<details class="text-xs text-muted-foreground">
			<summary class="cursor-pointer select-none">Technical details</summary>
			<pre
				class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-2">{JSON.stringify(
					tool.arguments,
					null,
					2
				)}</pre>
		</details>
	</Card.Content>
	<Card.Footer class="gap-2">
		<Button size="sm" onclick={onapprove}>Approve</Button>
		<Button size="sm" variant="outline" onclick={onreject}>Reject</Button>
	</Card.Footer>
</Card.Root>

<Dialog.Root bind:open={expanded}>
	<Dialog.Content class="flex max-h-dvh flex-col sm:max-w-4xl">
		<Dialog.Header>
			<Dialog.Title>{friendlyToolLabel(tool.name)}</Dialog.Title>
			<Dialog.Description>Review the change before approving it.</Dialog.Description>
		</Dialog.Header>
		<div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
			{@render changeBody(false)}
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
				variant="outline"
				onclick={() => {
					expanded = false;
					onreject();
				}}>Reject</Button
			>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
