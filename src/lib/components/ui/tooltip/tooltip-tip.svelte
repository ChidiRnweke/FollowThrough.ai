<script lang="ts">
	import { Tooltip as TooltipPrimitive } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import Root from './tooltip.svelte';
	import Trigger from './tooltip-trigger.svelte';
	import Content from './tooltip-content.svelte';
	import Provider from './tooltip-provider.svelte';

	type Props = {
		/** Label shown in the tooltip. An empty string renders the trigger untooltipped. */
		text: string;
		/** Optional keyboard hint rendered as a chip after the label. */
		shortcut?: string;
		side?: TooltipPrimitive.ContentProps['side'];
		align?: TooltipPrimitive.ContentProps['align'];
		sideOffset?: number;
		delayDuration?: number;
		/** Renders the trigger without a tooltip — for conditionally-labelled controls. */
		disabled?: boolean;
		children: Snippet<[{ props: Record<string, unknown> }]>;
	};

	let {
		text,
		shortcut,
		side = 'top',
		align = 'center',
		sideOffset,
		// The app-wide provider in `sidebar-provider.svelte` runs at 0ms, which suits
		// icon-collapsed sidebar rows but fires far too eagerly for ordinary chrome.
		// Nesting a provider here gives every `Tip` its own, calmer delay.
		delayDuration = 350,
		disabled = false,
		children
	}: Props = $props();
</script>

{#if disabled || !text}
	{@render children({ props: {} })}
{:else}
	<Provider {delayDuration}>
		<Root>
			<Trigger>
				{#snippet child({ props })}
					{@render children({ props })}
				{/snippet}
			</Trigger>
			<Content {side} {align} {sideOffset}>
				<span>{text}</span>
				{#if shortcut}
					<kbd data-slot="kbd" class="px-1 py-0.5 font-sans text-[0.6875rem]">{shortcut}</kbd>
				{/if}
			</Content>
		</Root>
	</Provider>
{/if}
