<script lang="ts">
	import { mode } from 'mode-watcher';
	import { capturedShot } from './screenshots';
	import Surface from './surface.svelte';

	// A real product screenshot inside the Surface frame. The marketing bundle
	// holds a light and a dark JPEG of the same screen (`<id>-light`, and
	// `<id>-dark` — falling back to the bare `<id>`, since some sets name the
	// dark capture without a suffix); this swaps between them with the page
	// theme so the shot never glares against the surrounding page.
	let { id, label, alt }: { id: string; label: string; alt: string } = $props();

	const light = $derived(capturedShot(`${id}-light`) ?? capturedShot(id));
	const dark = $derived(capturedShot(`${id}-dark`) ?? capturedShot(id));
	const src = $derived(mode.current === 'dark' ? dark : light);
</script>

<Surface {label}>
	{#if src}
		<img {src} {alt} class="w-full" loading="lazy" decoding="async" />
	{/if}
</Surface>
