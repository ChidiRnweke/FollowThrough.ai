<script lang="ts">
	import { Dialog as SheetPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: SheetPrimitive.OverlayProps = $props();
</script>

<!-- audit-allow: no-pure-black — Overlay scrim: dimming the page is mode-independent black; the token set has no scrim token. -->
<SheetPrimitive.Overlay
	bind:ref
	data-slot="sheet-overlay"
	class={cn('bg-black/80 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50', className)}
	{...restProps}
/>
