<script lang="ts">
	import { capturedShot } from './screenshots';

	// A wanted screenshot, described precisely enough that a capture pass can
	// satisfy it without asking. Renders the real image once one lands in
	// `src/lib/assets/marketing/<id>.png`; until then it states what belongs here.
	let {
		id,
		route,
		viewport = '1440x900',
		theme = 'both',
		caption,
		alt
	}: {
		id: string;
		route: string;
		viewport?: string;
		theme?: 'light' | 'dark' | 'both';
		caption: string;
		alt?: string;
	} = $props();

	const shot = $derived(capturedShot(id));
</script>

{#if shot}
	<img
		src={shot}
		{alt}
		class="w-full rounded-2xl ring-1 ring-foreground/10"
		loading="lazy"
		decoding="async"
	/>
{:else}
	<div
		data-screenshot-slot={id}
		data-route={route}
		data-viewport={viewport}
		data-theme={theme}
		class="flex flex-col gap-1 rounded-2xl border border-dashed border-border px-4 py-3"
	>
		<p class="text-sm text-foreground">I want to see this there.</p>
		<p class="provenance-caption">
			{caption} · <span class="text-foreground/70">{route}</span> · {viewport} · {theme}
		</p>
	</div>
{/if}
