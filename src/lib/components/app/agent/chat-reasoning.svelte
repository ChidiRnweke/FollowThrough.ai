<script lang="ts">
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { Button } from '$lib/components/ui/button';
	import { FtChevronRight as ChevronRight } from '$lib/components/icons';

	let { text, streaming = false }: { text: string; streaming?: boolean } = $props();

	// While the model is thinking the block stays open so the stream is visible;
	// once the turn settles it folds away behind the summary row.
	let open = $derived(streaming);
</script>

<Collapsible.Root bind:open>
	<Collapsible.Trigger>
		{#snippet child({ props })}
			<Button
				{...props}
				variant="ghost"
				size="sm"
				class="h-7 gap-1 px-1.5 text-xs text-muted-foreground [&[data-state=open]>svg]:rotate-90"
			>
				<ChevronRight class="size-3.5 transition-transform duration-(--duration-micro)" />
				Reasoning
			</Button>
		{/snippet}
	</Collapsible.Trigger>
	<Collapsible.Content>
		<p class="pl-6 text-xs break-words whitespace-pre-wrap text-muted-foreground">{text}</p>
	</Collapsible.Content>
</Collapsible.Root>
