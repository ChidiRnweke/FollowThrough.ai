<script lang="ts">
	import type { Attachment } from 'svelte/attachments';
	import type { Snippet } from 'svelte';

	// One settle, once, when the figure first comes into view. The page stays calm
	// because nothing loops and nothing re-plays on scroll-back. Without JS the
	// content renders in its final state — `armed` only becomes true in the
	// browser, so the hidden start never reaches a reader who cannot undo it.
	let {
		children,
		delay = 0,
		class: className,
		id
	}: { children: Snippet; delay?: number; class?: string; id?: string } = $props();

	let armed = $state(typeof window !== 'undefined');
	let shown = $state(false);

	const revealOnce: Attachment<HTMLElement> = (node) => {
		if (shown) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					shown = true;
					observer.disconnect();
				}
			},
			{ rootMargin: '0px 0px -12% 0px' }
		);
		observer.observe(node);
		return () => observer.disconnect();
	};
</script>

<div
	{@attach revealOnce}
	{id}
	class="reveal {className ?? ''}"
	data-armed={armed}
	data-shown={shown}
	style:--reveal-delay="{delay}ms"
>
	{@render children()}
</div>

<style>
	.reveal {
		transition:
			opacity 600ms var(--ease-standard) var(--reveal-delay),
			transform 600ms var(--ease-standard) var(--reveal-delay);
	}

	.reveal[data-armed='true'][data-shown='false'] {
		opacity: 0;
		transform: translateY(0.5rem);
	}

	@media (prefers-reduced-motion: reduce) {
		.reveal {
			transition: opacity 200ms linear;
		}

		.reveal[data-armed='true'][data-shown='false'] {
			transform: none;
		}
	}
</style>
