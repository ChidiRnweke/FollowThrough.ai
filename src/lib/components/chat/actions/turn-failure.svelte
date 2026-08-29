<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { FtExternal, FtWarning } from '$lib/components/icons';
	import type { FailureGroup, TurnRow } from '$lib/components/agent';
	import { CHAT_ROW, CHAT_ROW_ICON } from './chat-row';
	import { openEntity, rowIcon } from './open-entity';

	let {
		failure,
		titleFor,
		retryable = false,
		onretry
	}: {
		/** One cause and everything it befell. A bare message cannot say what it failed on. */
		failure: FailureGroup;
		/** Resolves a row's display title, so a fetched todo name reaches this block too. */
		titleFor: (row: TurnRow) => string;
		retryable?: boolean;
		onretry?: () => void;
	} = $props();

	const headline = $derived(
		failure.subjects.length === 1
			? 'One change was not applied'
			: `${failure.subjects.length} changes were not applied`
	);
</script>

<!--
	A failure is three things, and the transcript used to carry only the first: what failed,
	why in the reader's terms, and what they can do about it.

	One block per cause, not per call. Three changes abandoned by the same stopped run are one
	piece of news about three things — printed per call it was the same red sentence three
	times down the turn, with nothing to tell them apart and nothing to click. The subjects
	carry the identity, and each one opens: a failure is the moment a link is worth most,
	because the thing is still there and the reader is about to go and look at it.

	Flat and inline, like everything else here: the glyph and the destructive headline are the
	whole signal, and a box around it would be the fourth edge in a panel that has none. The
	subject rows stay muted so the colour states the failure once.
-->
<div class="flex gap-2 text-xs" role="alert">
	<FtWarning class="mt-0.5 size-3.5 shrink-0 text-destructive" />
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		<p class="text-destructive">{headline}</p>
		{#if failure.cause}
			<p class="text-muted-foreground">{failure.cause}</p>
		{/if}

		<ul class="mt-0.5 flex flex-col">
			{#each failure.subjects as row, index (`${row.kind}-${index}`)}
				{@const Icon = rowIcon(row)}
				<li>
					{#if row.kind !== 'action' && row.id}
						<Button
							variant="ghost"
							size="sm"
							class="group/failed {CHAT_ROW}"
							onclick={() => openEntity(row)}
						>
							<Icon class="{CHAT_ROW_ICON} text-muted-foreground" />
							<span class="min-w-0 truncate">{titleFor(row)}</span>
							<span class="shrink-0 text-muted-foreground">· {row.kind}</span>
							<FtExternal
								class="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-(--duration-micro) group-hover/failed:opacity-100"
							/>
						</Button>
					{:else}
						<!-- Nothing to open, so nothing that looks like it opens. -->
						<div class="{CHAT_ROW} text-muted-foreground">
							<Icon class={CHAT_ROW_ICON} />
							<span class="min-w-0 truncate">
								{row.kind === 'action' ? row.label : titleFor(row)}
							</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>

		{#if retryable && onretry}
			<Button variant="outline" size="xs" class="mt-1 self-start" onclick={onretry}>
				Try again
			</Button>
		{/if}
	</div>
</div>
