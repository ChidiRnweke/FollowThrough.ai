<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import ChatMarkdown from './chat-markdown.svelte';
	import { parseReasoning, reasoningTitle } from './chat-reasoning';

	let { text, streaming = false }: { text: string; streaming?: boolean } = $props();

	let sections = $derived(parseReasoning(text));
	let title = $derived(reasoningTitle(sections));

	/**
	 * The reader's own decision, once they have made one. `undefined` until then.
	 *
	 * What is remembered is the *choice*, not the open state. Binding
	 * `$derived(streaming)` — the version before this one — recomputed on every
	 * delta and threw the reader's click away each time; holding plain state
	 * instead meant the panel could never open itself. Keeping the choice apart
	 * from the default lets both hold: the default follows the turn, and a reader
	 * who has decided overrules it in either direction, for good.
	 */
	let choice = $state<boolean | undefined>(undefined);

	/**
	 * Open while the turn is thinking, folded once it has finished.
	 *
	 * Reasoning is scratch work rather than the answer, so at rest it stays folded
	 * behind its title. While it is being written it is the only thing happening,
	 * and a collapsed row cannot show that — the label is the last bold heading the
	 * model wrote, or the first sentence of its first block, so on unstructured
	 * reasoning it is one line that never changes. Streaming was working and looked
	 * identical to not streaming.
	 */
	const open = $derived(choice ?? streaming);
</script>

<Collapsible.Root {open} onOpenChange={(next) => (choice = next)}>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				{title}
				class="h-7 max-w-full gap-1 px-1.5 text-xs text-muted-foreground [&[data-state=open]>svg]:rotate-90"
			>
				<ChevronRight class="size-3.5 shrink-0 transition-transform duration-(--duration-micro)" />
				<span class="truncate {streaming ? 'animate-pulse' : ''}">{title}</span>
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<!-- The turn's own opening and closing is a block of content arriving, which is what
	     `--duration-disclosure` is the budget for. Pure CSS, so the reduced-motion guard
	     in `@layer base` already neutralises it. -->
	<Collapsible.Content class="chat-disclosure">
		<div class="flex flex-col gap-2 pl-6 text-muted-foreground">
			{#each sections as section, index (index)}
				<div class="flex flex-col gap-0.5">
					{#if section.title}
						<p class="text-xs font-medium text-foreground/80">{section.title}</p>
					{/if}
					{#if section.body}
						<div class="text-xs [&_.prose]:text-xs [&_.prose]:text-muted-foreground">
							<ChatMarkdown content={section.body} />
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Collapsible.Content>
</Collapsible.Root>
