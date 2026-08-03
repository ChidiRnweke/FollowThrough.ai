<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';

	// Click-to-fullscreen for chat images: the thumbnail stays sized by the
	// caller (`class` prop), clicking it opens a fullscreen dialog with the
	// image contained to the viewport. Same technique as marketing/shot.svelte.
	let { src, alt, class: thumbClass }: { src: string; alt: string; class?: string } = $props();
</script>

<Dialog.Root>
	<Dialog.Trigger class="cursor-zoom-in transition-opacity hover:opacity-90">
		<img {src} {alt} class={thumbClass} />
	</Dialog.Trigger>
	<Dialog.Content
		class="max-h-dvh w-full max-w-full gap-0 overflow-auto border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-7xl"
	>
		<Dialog.Title class="sr-only">{alt}</Dialog.Title>
		<Dialog.Description class="sr-only">{alt}</Dialog.Description>
		<img {src} {alt} class="max-h-dvh w-full object-contain" />
	</Dialog.Content>
</Dialog.Root>
