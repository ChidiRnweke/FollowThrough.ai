<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';

	// Click-to-zoom for images the caller cannot wrap in a trigger. Markdown
	// rendered through `{@html}` produces plain DOM images with nothing to mount
	// a Svelte component onto, so the caller opens this by setting `image` from a
	// delegated click instead. Where a trigger *can* wrap the thumbnail, use
	// `chat/image-lightbox.svelte` instead.
	let { image, onclose }: { image?: { src: string; alt: string }; onclose: () => void } = $props();
</script>

<Dialog.Root open={image !== undefined} onOpenChange={(open) => !open && onclose()}>
	<Dialog.Content
		class="max-h-dvh w-full max-w-full gap-0 overflow-auto border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-7xl"
	>
		<Dialog.Title class="sr-only">{image?.alt ?? ''}</Dialog.Title>
		<Dialog.Description class="sr-only">{image?.alt ?? ''}</Dialog.Description>
		{#if image}
			<img src={image.src} alt={image.alt} class="max-h-dvh w-full object-contain" />
		{/if}
	</Dialog.Content>
</Dialog.Root>
