<script lang="ts">
	import { mode } from 'mode-watcher';
	import * as Dialog from '$lib/components/ui/dialog';
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
		<Dialog.Root>
			<Dialog.Trigger class="block w-full cursor-zoom-in transition-opacity hover:opacity-90">
				<img {src} {alt} class="w-full" loading="lazy" decoding="async" />
			</Dialog.Trigger>
			<Dialog.Content
				class="max-h-[95vh] w-full max-w-[calc(100vw-1rem)] gap-0 overflow-auto border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-[90rem]"
			>
				<Dialog.Title class="sr-only">{label}</Dialog.Title>
				<Dialog.Description class="sr-only">{alt}</Dialog.Description>
				<img {src} {alt} class="max-h-[92vh] w-full object-contain" />
			</Dialog.Content>
		</Dialog.Root>
	{/if}
</Surface>
