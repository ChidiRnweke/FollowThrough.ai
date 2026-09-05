<script lang="ts">
	import type { ShellContext } from '$lib/models/workspace';
	import { toolFailure, toolOutput, type ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import type { ToolDisclosure } from '$lib/components/agent';
	import { summariseToolResult } from '$lib/components/agent';
	import ErrorBoundary from '$lib/components/layout/error-boundary.svelte';
	import EntityList from './entity-list.svelte';
	import RecordFields from './record-fields.svelte';
	import NoteDiff from './note-diff.svelte';
	import FileOutput from './file-output.svelte';
	import MemoryReview from './memory-review.svelte';

	let {
		disclosure,
		tool
	}: {
		disclosure: ToolDisclosure;
		tool: ChatToolActivity;
		shell?: ShellContext;
	} = $props();

	// The raw failure the run produced. `toolFailure` also reads a `failure` key carried on
	// a succeeded call's output, which is how `edit_note` reports "No edits were applied."

	/** What a proposal that is not about memory came back with — the count, in its own words. */
	const output = $derived(toolOutput(tool));
	const summary = $derived(summariseToolResult(output, tool.name));
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
			<!--
				The raw message the run produced, not the reader-facing sentence. `TurnFailure`
				has already said what went wrong in the reader's terms, above; repeating its
				words here printed the same line twice, ten pixels apart. This is the log, and
				the log is evidence — which is exactly what `turn-failure.svelte` says it is.

				Not `role="alert"`: the alert was announced once when the failure was stated.
			-->
			<p class="break-words">{toolFailure(tool) ?? disclosure.explanation}</p>
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
			<!--
				The note itself leads, and it opens: when the version this call wrote has since
				left the note's history, the name and the door to the note are the useful thing
				that remains — the diff's own message below says the rest.
			-->
			<EntityList entities={[disclosure.entity]} empty="The note could not be named." />
			<NoteDiff noteId={disclosure.noteId} revision={disclosure.revision} />
		{:else if disclosure.kind === 'file-output'}
			<FileOutput headline={disclosure.headline} lines={disclosure.lines} />
		{:else if disclosure.kind === 'record'}
			<RecordFields entity={disclosure.entity} changed={disclosure.changed} />
		{:else if disclosure.kind === 'proposal' && disclosure.scope === 'memory'}
			<MemoryReview
				projectId={disclosure.projectId}
				operation={disclosure.operation}
				content={disclosure.content}
			/>
		{:else if disclosure.kind === 'proposal'}
			<!--
				The proposal itself is already in the turn as a card the reader can decide on, so
				it is not repeated here. What the line says depends on whether it is still waiting:
				"Anything it proposed is in this turn, above, to accept or dismiss" was hedged
				("anything"), made a spatial claim the layout does not keep — this body lives
				inside the log, which is the last row — and was shown for calls that had already
				been decided, so an accepted suggestion invited you to accept it.
			-->
			<div class="flex flex-col gap-1">
				{#if summary.headline}
					<p class="break-words text-foreground">{summary.headline}</p>
				{/if}
				{#if tool.status === 'approval_required'}
					<p>Waiting for your decision in this turn.</p>
				{/if}
			</div>
		{/if}
	</ErrorBoundary>
</div>
