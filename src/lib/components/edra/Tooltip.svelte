<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import type { Snippet } from 'svelte';

	interface Props {
		tooltip: string;
		children: Snippet<[]>;
		shortCut?: string;
	}

	const { tooltip, children, shortCut }: Props = $props();
</script>

<!-- Editor-toolbar shorthand. Kept on its own signature because its 15 call sites nest
     their own triggers; the surface and timing are matched to `Tooltip.Tip` so the two
     read as one tooltip everywhere in the app. -->
<Tooltip.Provider delayDuration={350}>
	<Tooltip.Root>
		<Tooltip.Trigger>
			{@render children()}
		</Tooltip.Trigger>
		<Tooltip.Content>
			<span>{tooltip}</span>
			{#if shortCut}
				<kbd data-slot="kbd" class="px-1 py-0.5 font-sans text-[0.6875rem]">{shortCut}</kbd>
			{/if}
		</Tooltip.Content>
	</Tooltip.Root>
</Tooltip.Provider>
