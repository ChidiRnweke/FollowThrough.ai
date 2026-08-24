<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import type { ToolDisclosure } from '$lib/components/agent';
	import { summariseToolResult } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import { FtCopy as Copy } from '$lib/components/icons';
	import { toast } from 'svelte-sonner';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import EntityList from './entity-list.svelte';
	import RecordFields from './record-fields.svelte';
	import NoteDiff from './note-diff.svelte';
	import MemoryReview from './memory-review.svelte';

	let {
		disclosure,
		tool
	}: {
		disclosure: ToolDisclosure;
		tool: ChatToolActivity;
		shell?: ShellContext;
	} = $props();

	/** What a proposal that is not about memory came back with — the count, in its own words. */
	const output = $derived(toolOutput(tool));
	const summary = $derived(summariseToolResult(output, tool.name));

	async function copyRaw(): Promise<void> {
		const payload = JSON.stringify(
			{
				tool: tool.name,
				arguments: tool.arguments,
				...(output === undefined ? {} : { result: output }),
				...(toolFailure(tool) ? { failure: toolFailure(tool) } : {})
			},
			null,
			2
		);
		try {
			await navigator.clipboard.writeText(payload);
			toast.success('Copied to clipboard');
			// audit-allow: silent-catch — the user is told to copy the still-visible expanded text manually.
		} catch {
			toast.error('Could not copy. Expand the row and copy the text manually.');
		}
	}
</script>

<!--
	One body per family, and the family was chosen by what the call actually touched. A row that
	opens gets something it could not already say: the things that came back, the change that was
	made, the set a proposal has to be judged against.

	The boundary is per disclosure. A note whose history will not load must not cost the reader
	the rest of the turn.
-->
<div class="flex flex-col gap-2 text-xs text-muted-foreground">
	<ErrorBoundary label="this step" class="my-0">
		{#if disclosure.kind === 'failure'}
			<p class="break-words text-destructive" role="alert">{disclosure.explanation}</p>
		{:else if disclosure.kind === 'collection'}
			<EntityList
				entities={disclosure.entities}
				total={disclosure.total}
				empty="Nothing came back."
			/>
		{:else if disclosure.kind === 'created'}
			<EntityList entities={disclosure.entities} empty="Nothing was created." />
		{:else if disclosure.kind === 'lifecycle'}
			<div class="flex flex-col gap-1">
				<EntityList
					entities={disclosure.entity ? [disclosure.entity] : []}
					empty="Nothing was affected."
				/>
				<!-- Whether it can be undone is the only thing a reader wants from a removal, and
				     it is the one thing the row above cannot say. -->
				<p class="px-2">
					{disclosure.recoverable ? 'This can be undone.' : 'This cannot be undone.'}
				</p>
			</div>
		{:else if disclosure.kind === 'note-diff'}
			<NoteDiff noteId={disclosure.noteId} revision={disclosure.revision} />
		{:else if disclosure.kind === 'record'}
			<RecordFields entity={disclosure.entity} changed={disclosure.changed} />
		{:else if disclosure.kind === 'proposal' && disclosure.scope === 'memory'}
			<MemoryReview
				projectId={disclosure.projectId}
				operation={disclosure.operation}
				content={disclosure.content}
			/>
		{:else if disclosure.kind === 'proposal'}
			<!-- The proposals themselves are already in the turn as cards the reader can decide
			     on. Repeating them here would be the change awaiting approval listed twice. -->
			<div class="flex flex-col gap-1">
				{#if summary.headline}
					<p class="break-words text-foreground">{summary.headline}</p>
				{/if}
				<p>Anything it proposed is in this turn, above, to accept or dismiss.</p>
			</div>
		{/if}
	</ErrorBoundary>

	<!-- The one place raw payloads belong: available, never rendered. -->
	<Button variant="ghost" size="xs" class="self-start" onclick={copyRaw}>
		<Copy data-icon="inline-start" /> Copy raw
	</Button>
</div>
