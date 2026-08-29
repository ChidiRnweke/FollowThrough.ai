<script lang="ts">
	import type { NoteId } from '$lib/models/notes';
	import type { ShellContext } from '$lib/models/workspace';
	import type { ChatToolActivity } from '$lib/stores/agent/chat-tools';
	import { workbench } from '$lib/stores/workbench/workbench.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Tip } from '$lib/components/ui/tooltip';
	import {
		FtChevronRight as ChevronRight,
		FtExternal as OpenInTab,
		FtLoader as LoaderCircle
	} from '$lib/components/icons';
	import {
		isWriteTool,
		opensInPlace,
		toolDisclosure,
		toolStatusParts
	} from '$lib/components/agent';
	import { CHAT_ROW, CHAT_ROW_DETAIL, CHAT_ROW_ICON } from './chat-row';
	import DisclosureBody from './disclosure/disclosure-body.svelte';

	let { tool, shell }: { tool: ChatToolActivity; shell?: ShellContext } = $props();

	const parts = $derived(toolStatusParts(tool, shell));

	/**
	 * What sits behind this row, if anything. Most calls in most turns are reads of one thing,
	 * and those get no chevron at all: the row already names what was read and offers to open
	 * it, and a disclosure could only restate that.
	 */
	const disclosure = $derived(toolDisclosure(tool, shell));
	const expandable = $derived(opensInPlace(disclosure));

	const tone = $derived(
		parts.failed
			? 'text-destructive'
			: isWriteTool(tool.name)
				? 'text-foreground'
				: 'text-muted-foreground'
	);
</script>

{#snippet label()}
	{#if parts.pending}
		<LoaderCircle class="{CHAT_ROW_ICON} animate-spin" />
	{/if}
	<span class="shrink-0">{parts.label}{parts.pending ? '…' : ''}</span>
	{#if parts.subject}
		<span class="shrink-0 text-muted-foreground/60" aria-hidden="true">·</span>
		<span class="min-w-0 truncate text-foreground" title={parts.subject}>{parts.subject}</span>
	{/if}
{/snippet}

{#snippet openAction()}
	{#if parts.noteId}
		<Tip text="Open in a tab">
			{#snippet children({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon-xs"
					class="shrink-0 opacity-0 transition-opacity duration-(--duration-micro) group-hover/tool:opacity-100 group-focus-within/tool:opacity-100"
					aria-label={`Open ${parts.subject ?? 'the note'} in a tab`}
					onclick={() => void workbench.openTab(parts.noteId as NoteId)}
				>
					<OpenInTab />
				</Button>
			{/snippet}
		</Tip>
	{/if}
{/snippet}

{#if expandable}
	<Collapsible.Root>
		<!--
			The disclosure and the note it names are two different actions, so the note is not
			inside the trigger: clicking a title to open it must not also toggle a panel, and a
			title concatenated into the trigger's sentence could not be either.
		-->
		<div class="group/tool flex items-center gap-1">
			<Collapsible.Trigger class="min-w-0 flex-1">
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="sm"
						class="{CHAT_ROW} min-w-0 [&[data-state=open]>svg:first-child]:rotate-90 {tone}"
					>
						<ChevronRight
							class="{CHAT_ROW_ICON} transition-transform duration-(--duration-micro)"
						/>
						{@render label()}
					</Button>
				{/snippet}
			</Collapsible.Trigger>
			{@render openAction()}
		</div>
		<Collapsible.Content class={CHAT_ROW_DETAIL}>
			<!-- No indent of its own. Inside the turn's log this row is already indented under
			     the door that opened it, and indenting again put a call's detail two steps in
			     from a list that is only two levels deep. -->
			<div class="py-1">
				<DisclosureBody {disclosure} {tool} {shell} />
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{:else}
	<!--
		Nothing behind it, so nothing that offers to be opened. The chevron used to be
		unconditional and most of them paid out a restatement of the row they hung off — which
		is what taught the reader to stop opening the ones that would have shown a real change.

		The row keeps the chevron's width as blank space so a mixed list still reads as one
		column rather than as two ragged ones.
	-->
	<div class="group/tool flex items-center gap-1">
		<div class="{CHAT_ROW} min-w-0 flex-1 {tone}">
			<span class={CHAT_ROW_ICON} aria-hidden="true"></span>
			{@render label()}
		</div>
		{@render openAction()}
	</div>
{/if}
