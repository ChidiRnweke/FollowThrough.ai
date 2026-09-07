<script lang="ts">
	import type { SubjectPass } from '$lib/components/agent';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { FtChevronRight } from '$lib/components/icons';
	import {
		CHAT_ROW_DETAIL,
		CHAT_ROW_ICON,
		CHAT_ROW_INDENT,
		CHAT_ROW_STATEMENT,
		CHAT_TEXT_EVIDENCE,
		chatActionEmphasis
	} from './chat-row';

	let { pass }: { pass: SubjectPass } = $props();
</script>

<!--
	One look that came back with nothing.

	Named by what it did — "Read project memory" — because that is the only identity it has.
	Every other row behind the door is titled by its subject, and a look that found nothing has
	no subject to be titled by; the request is what the reader recognises, and counting the looks
	instead ("3 looks came back with nothing") named a quantity where every neighbouring row
	names a thing.

	The absence goes behind the chevron, on the same `bg-brand/10` wash every other piece of
	evidence sits on. An empty result is still a result: it is what the block would show if there
	had been anything, so it belongs where that would have been rather than in a sentence hanging
	under the list.

	No `· nothing` suffix on the statement. Membership of this group is the fact — everything
	rendered here came back empty — and the door's own label already says the reader is looking
	at what the turn only looked at.

	Geometry is `subject-row.svelte`'s, including `min-w-0 flex-1 shrink` on the Button rather
	than on the Trigger: a Trigger hands its class to the snippet through `props` and the
	Button's own `class=` replaces it, and `buttonVariants` base contributes a `shrink-0` that
	`CHAT_ROW_STATEMENT` has nothing to cancel.
-->
<Collapsible.Root>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="{CHAT_ROW_STATEMENT} min-w-0 flex-1 shrink [&[data-state=open]>svg:first-child]:rotate-90"
			>
				<FtChevronRight
					class="{CHAT_ROW_ICON} shrink-0 text-muted-foreground transition-transform duration-(--duration-micro)"
				/>
				<!-- The label is what the agent did, so it takes the teal; the query beside it is
				     the reader's own words, so it does not. -->
				<span class="min-w-0 truncate {chatActionEmphasis(pass.mutating)}">
					{pass.label}{#if pass.query}&nbsp;<span class="italic text-foreground">{pass.query}</span
						>{/if}
				</span>
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<Collapsible.Content class={CHAT_ROW_DETAIL}>
		<!-- pt-1 is the bond step: this detail belongs to the row directly above it. -->
		<div class="{CHAT_ROW_INDENT} pt-1">
			<div class="rounded-md bg-brand/10 px-2 py-1.5 dark:bg-brand/15">
				<p class="{CHAT_TEXT_EVIDENCE} text-brand-muted-foreground">Nothing came back.</p>
				{#if pass.evidence.kind === 'prose'}
					<!-- Why it came back empty, when the tool troubled to say. -->
					<p class="{CHAT_TEXT_EVIDENCE} pt-1 text-foreground">{pass.evidence.text}</p>
				{/if}
			</div>
		</div>
	</Collapsible.Content>
</Collapsible.Root>
