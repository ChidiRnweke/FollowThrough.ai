<script lang="ts">
	import type { Note, NoteId } from '$lib/models';
	import type { ChatToolActivity } from '$lib/stores/chat-tools';
	import { getNote } from '$lib/remote/notes.remote';
	import { noteSyncRegistry } from '$lib/stores/registries/note-sync-registry.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import NoteVersionDiff from '../note-version-diff.svelte';
	import { friendlyToolLabel, scalarSummaries } from './tool-presentation';

	let {
		tool,
		onapprove,
		onreject
	}: {
		tool: ChatToolActivity;
		onapprove: () => void;
		onreject: () => void;
	} = $props();

	const candidate = $derived(
		tool.name === 'save_note' && tool.arguments.note
			? (tool.arguments.note as unknown as Note)
			: undefined
	);
	let baseline = $state<Note | undefined>(undefined);
	let baselineError = $state(false);

	$effect(() => {
		const note = candidate;
		if (!note) return;
		const mounted = noteSyncRegistry.peek(note.id as NoteId)?.record?.local;
		if (mounted) {
			baseline = mounted;
			return;
		}
		let cancelled = false;
		void getNote(note.id)
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

	const titleChanged = $derived(
		Boolean(candidate && baseline && candidate.title !== baseline.title)
	);
	const bodyChanged = $derived(
		Boolean(candidate && baseline && candidate.plainText !== baseline.plainText)
	);
	const formattingChanged = $derived(
		Boolean(
			candidate &&
			baseline &&
			candidate.plainText === baseline.plainText &&
			JSON.stringify(candidate.document) !== JSON.stringify(baseline.document)
		)
	);
	const pinChanged = $derived(
		Boolean(candidate && baseline && candidate.isPinned !== baseline.isPinned)
	);
</script>

<Card.Root>
	<Card.Header>
		<Card.Title class="text-sm">Approve {friendlyToolLabel(tool.name)}?</Card.Title>
		<Card.Description>This action changes saved workspace data.</Card.Description>
	</Card.Header>
	<Card.Content class="flex flex-col gap-3">
		{#if candidate}
			<p class="truncate text-sm font-medium">{candidate.title || 'Untitled'}</p>
			{#if baseline}
				{#if titleChanged}
					<p class="text-xs">
						<span class="text-muted-foreground">Title:</span>
						{baseline.title} → {candidate.title}
					</p>
				{/if}
				{#if bodyChanged}
					<NoteVersionDiff
						base={baseline.plainText}
						candidate={candidate.plainText}
						label="Proposed note changes"
						compact
					/>
				{/if}
				{#if formattingChanged}<p class="text-xs">Formatting will change.</p>{/if}
				{#if pinChanged}<p class="text-xs">
						The note will be {candidate.isPinned ? 'pinned' : 'unpinned'}.
					</p>{/if}
				{#if !titleChanged && !bodyChanged && !formattingChanged && !pinChanged}
					<p class="text-xs text-muted-foreground">No visible note changes.</p>
				{/if}
			{:else if baselineError}
				<p class="text-xs text-muted-foreground">
					The current note could not be loaded for comparison.
				</p>
			{:else}
				<p class="text-xs text-muted-foreground">Loading the current note…</p>
			{/if}
		{:else}
			{#each scalarSummaries(tool.arguments) as summary (summary)}
				<p class="text-xs">{summary}</p>
			{/each}
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
