<script lang="ts">
	// One cloud, five states. The dot says where your work is: resting in the cloud when it is
	// saved, rising while it saves, falling while it downloads, dropped out when offline. A
	// problem turns the line and dot into an exclamation mark; colour it at the call site.
	import type { SVGAttributes } from 'svelte/elements';
	import type { syncIndicator } from '$lib/services/sync/indicator';
	import Glyph from './glyph.svelte';

	type SyncState = ReturnType<typeof syncIndicator>['kind'];

	let { state, ...props }: SVGAttributes<SVGSVGElement> & { state: SyncState } = $props();

	const cloud = 'M7 18.5h10.3a4.2 4.2 0 0 0 .6-8.36A6.2 6.2 0 0 0 6 9.4a4.6 4.6 0 0 0 1 9.1z';
	const motion = $derived(
		state === 'saving' ? 'rise' : state === 'downloading' ? 'fall' : undefined
	);
</script>

<Glyph {...props} data-ft-motion={motion} data-sync-state={state}>
	{#if state === 'offline'}
		<path class="ft-broken" d={cloud} pathLength="1" />
		<circle class="ft-accent" cx="20.2" cy="21.4" r="1.45" fill="currentColor" stroke="none" />
	{:else}
		<path class="ft-stroke" pathLength="1" d={cloud} />
		{#if state === 'attention'}
			<path class="ft-stroke" pathLength="1" d="M12 10.2v3.4" />
			<circle class="ft-accent" cx="12" cy="16.3" r="1.3" fill="currentColor" stroke="none" />
		{:else if state === 'saving'}
			<path class="ft-stroke" pathLength="1" d="M12 17v-1.4" opacity="0.5" />
			<circle class="ft-accent" cx="12" cy="13.6" r="1.6" fill="currentColor" stroke="none" />
		{:else if state === 'downloading'}
			<path class="ft-stroke" pathLength="1" d="M12 11.4v1.4" opacity="0.5" />
			<circle class="ft-accent" cx="12" cy="14.8" r="1.6" fill="currentColor" stroke="none" />
		{:else}
			<circle class="ft-accent" cx="12" cy="14.2" r="1.6" fill="currentColor" stroke="none" />
		{/if}
	{/if}
</Glyph>
