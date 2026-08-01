<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';
	import ChatMarkdown from './chat-markdown.svelte';
	import { parseReasoning, reasoningTitle } from './chat-reasoning';

	let { text, streaming = false }: { text: string; streaming?: boolean } = $props();

	let sections = $derived(parseReasoning(text));
	let title = $derived(reasoningTitle(sections));

	// Reasoning is the model's scratch work, not the answer, so it stays folded and the
	// row's title carries what happened. `open` is state rather than derived: the previous
	// version bound a `$derived(streaming)`, so every delta threw away the user's click.
	let open = $state(false);
</script>

<Collapsible.Root bind:open>
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
	<Collapsible.Content>
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
