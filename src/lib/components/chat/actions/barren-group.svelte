<script lang="ts">
	import type { SubjectPass } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { FtChevronRight, FtSearch } from '$lib/components/icons';
	import SubjectPasses from './subject-passes.svelte';
	import { CHAT_ROW_DETAIL, CHAT_ROW_ICON, CHAT_ROW_INDENT, CHAT_ROW_STATEMENT } from './chat-row';

	let {
		passes,
		label
	}: {
		passes: readonly SubjectPass[];
		/** Stated by the fold, so the count and the wording are decided in one place. */
		label: string;
	} = $props();
</script>

<!--
	The looks that found nothing, as a row rather than as a loose list.

	Everything else behind the door is a subject: a name on a statement line, its requests
	indented under it, the evidence under those. This was the one thing that was not. Its pass
	labels sat at the top of the column with no statement above them, so a request rung stood
	where a subject's name belongs, and "Nothing came back." hung underneath the whole list —
	a sentence about no particular look, in a block whose whole point is which look it was.

	So the count goes on the statement line and the looks go behind the chevron. The absence is
	still the fact worth stating, and it is now stated once, at the level that states facts.

	The geometry is `subject-row.svelte`'s, deliberately, including `min-w-0 flex-1 shrink` on
	the Button rather than on the Trigger: a Trigger hands its class to the snippet through
	`props` and the Button's own `class=` replaces it, and `buttonVariants` base contributes a
	`shrink-0` that `CHAT_ROW_STATEMENT` has nothing to cancel.
-->
<Collapsible.Root>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="{CHAT_ROW_STATEMENT} min-w-0 flex-1 shrink text-muted-foreground [&[data-state=open]>svg:first-child]:rotate-90"
			>
				<FtChevronRight
					class="{CHAT_ROW_ICON} shrink-0 transition-transform duration-(--duration-micro)"
				/>
				<FtSearch class={CHAT_ROW_ICON} />
				<span class="min-w-0 truncate">{label}</span>
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<Collapsible.Content class={CHAT_ROW_DETAIL}>
		<!-- pt-1 is the bond step: this detail belongs to the row directly above it. -->
		<div class="{CHAT_ROW_INDENT} pt-1">
			<SubjectPasses {passes} />
		</div>
	</Collapsible.Content>
</Collapsible.Root>
