<script lang="ts">
	import type { SubjectPass } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import { FtExternal } from '$lib/components/icons';
	import ChatMarkdown from '../chat-markdown.svelte';
	import FileOutput from './disclosure/file-output.svelte';
	import RecordFields from './disclosure/record-fields.svelte';
	import {
		CHAT_GAP_BOND,
		CHAT_GAP_PASS,
		CHAT_TEXT_EVIDENCE,
		CHAT_TEXT_REQUEST,
		chatActionEmphasis
	} from './chat-row';

	let {
		passes,
		onexpand
	}: {
		passes: readonly SubjectPass[];
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
	one dot-joined string — `In atlas · Literal text · 1 match` — the two were the same size,
	the same colour, and separated by the same character that separated their own parts, so
	nothing on the line said which half was the question.

	Nothing here counts what it is about to show. "1 match" above one match and "1 edit" above
	one edit state the same fact twice, and the second statement is the one nobody needed.

	The pass a reader is looking for is the one that wrote. Every label used to be the same muted
	xs, so `Edited note` sat among four looks with nothing to say it was the one that touched
	their work.

	Teal now means "the agent did this", and it means nothing else on this surface. The label is
	the action and takes it; the search string beside it is the reader's own words and the excerpt
	beneath it is the note's own content, so neither does. Weight separates the actions from one
	another: a write is medium, a look is regular.
-->
<div class="flex flex-col {CHAT_GAP_PASS}">
	{#each passes as pass, index (index)}
		<div class="flex flex-col {CHAT_GAP_BOND}">
			<p class="{CHAT_TEXT_REQUEST} {chatActionEmphasis(pass.mutating)}">
				{pass.label}{#if pass.query}&nbsp;<span class="italic text-foreground">{pass.query}</span
					>{/if}
			</p>
			{#if pass.evidence.kind === 'passages'}
				<FileOutput lines={pass.evidence.lines.slice(0, INLINE_LINES)} />
				{#if pass.evidence.lines.length > INLINE_LINES && onexpand}
					<!--
						Muted, against the `link` variant's own `text-primary`: this is the one control
						in the column the reader operates, not something the agent did, and teal here
						says the opposite. `cn()` is tailwind-merge, so the caller's colour arrives last
						and cancels the variant's properly. The underline on hover still says it acts.
					-->
					<Button
						variant="link"
						size="xs"
						class="{CHAT_TEXT_EVIDENCE} h-auto self-start p-0 text-muted-foreground"
						onclick={onexpand}
					>
						Read all of it
						<FtExternal class="size-3" />
					</Button>
				{/if}
			{:else if pass.evidence.kind === 'fields'}
				<div class="{CHAT_TEXT_EVIDENCE} text-muted-foreground">
					<RecordFields changed={pass.evidence.changed} />
				</div>
			{:else if pass.evidence.kind === 'prose'}
				<!-- `surface="brand"` is not decoration: it retargets the prose plugin's secondary
				     inks (lead, counters, captions) onto `--brand-muted-foreground`, which is what
				     the wash requires of anything grey sitting on it. -->
				<div
					class="max-h-56 overflow-y-auto overscroll-contain rounded-md bg-brand/10 px-2 py-1.5 dark:bg-brand/15"
				>
					<ChatMarkdown content={pass.evidence.text} surface="brand" />
				</div>
			{:else if pass.evidence.kind === 'failure'}
				<!--
					Why it did not land, then the run's own words underneath.

					The reader-facing sentence used to be printed in a banner above the whole
					block, which stated the failure a second time — once there, naming the
					subjects, and again on each subject's own row in red. The row is the better
					of the two places, because it is the one already carrying the name, so the
					sentence moved here and the banner went.

					The ladder does the separating: the cause is a request-rung line titling the
					evidence-rung line beneath it, which is the same shape every other pass has.
					Not `role="alert"` — the row announced it when it rendered.
				-->
				<p class="{CHAT_TEXT_REQUEST} text-destructive">{pass.evidence.cause}</p>
				{#if pass.evidence.raw}
					<p class="{CHAT_TEXT_EVIDENCE} break-words text-muted-foreground">
						{pass.evidence.raw}
					</p>
				{/if}
			{/if}
		</div>
	{/each}
</div>
