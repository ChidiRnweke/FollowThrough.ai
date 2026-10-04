<script lang="ts">
	import Input from './input/input.svelte';
	import * as Tooltip from './tooltip';

	let { kind }: { kind: 'input' | 'tooltip-trigger' } = $props();
	let nativeRef: HTMLInputElement | undefined = $state();
	let forwardedRef: HTMLElement | null = $state(null);
</script>

{#if kind === 'input'}
	<Input bind:ref={nativeRef} />
{:else}
	<Tooltip.Provider>
		<Tooltip.Root>
			<Tooltip.Trigger bind:ref={forwardedRef}>Tooltip trigger</Tooltip.Trigger>
		</Tooltip.Root>
	</Tooltip.Provider>
{/if}

<output aria-label="bound element">{(nativeRef ?? forwardedRef)?.tagName ?? 'unset'}</output>
