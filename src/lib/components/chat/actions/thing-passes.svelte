<script lang="ts">
	import type { ThingPass } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import { FtExternal } from '$lib/components/icons';
	import ChatMarkdown from '../chat-markdown.svelte';
	import FileOutput from './disclosure/file-output.svelte';
	import RecordFields from './disclosure/record-fields.svelte';

	let {
		passes,
		onexpand
	}: {
		passes: readonly ThingPass[];
		/** Offered only where there is more to read than the column can hold. */
		onexpand?: () => void;
	} = $props();

	/**
	 * How much of a passage the panel shows before the dialog is the better place to read it.
	 * The panel is 384px wide and file content is mono, so a long excerpt here is a column of
	 * six-word lines; the number is what fits without the block becoming its own scroll region.
	 */
	const INLINE_LINES = 6;
</script>

<!--
	What the agent did to this thing, in the order it did it.

	One pass is a request and what came back, and they are told apart by structure rather than
	by punctuation: the request is the caption line, the answer is indented under it. Written as
	one dot-joined string — `In rossel · Literal text · 1 match` — the two were the same size,
	the same colour, and separated by the same character that separated their own parts, so
	nothing on the line said which half was the question.

	Nothing here counts what it is about to show. "1 match" above one match and "1 edit" above
	one edit state the same fact twice, and the second statement is the one nobody needed.
-->
<div class="flex flex-col gap-2">
	{#each passes as pass, index (index)}
		<div class="flex flex-col gap-1">
			<p class="provenance-caption">
				{pass.label}{#if pass.query}&nbsp;<span class="italic text-foreground">{pass.query}</span
					>{/if}
			</p>
			{#if pass.evidence.kind === 'passages'}
				<FileOutput lines={pass.evidence.lines.slice(0, INLINE_LINES)} />
				{#if pass.evidence.lines.length > INLINE_LINES && onexpand}
					<Button variant="link" size="xs" class="h-auto self-start p-0" onclick={onexpand}>
						Read all of it
						<FtExternal class="size-3" />
					</Button>
				{/if}
			{:else if pass.evidence.kind === 'fields'}
				<div class="text-xs text-muted-foreground">
					<RecordFields changed={pass.evidence.changed} />
				</div>
			{:else if pass.evidence.kind === 'prose'}
				<div class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-muted/40 px-2 py-1.5">
					<ChatMarkdown content={pass.evidence.text} />
				</div>
			{:else if pass.evidence.kind === 'failure'}
				<!--
					The run's own words, not the reader-facing sentence. `TurnFailure` has already
					said what went wrong in the reader's terms, above; repeating it here printed the
					same line twice, ten pixels apart. This is the evidence.

					Not `role="alert"`: the alert was announced once when the failure was stated.
				-->
				<p class="break-words text-xs text-destructive">{pass.evidence.raw}</p>
			{/if}
		</div>
	{/each}
</div>
