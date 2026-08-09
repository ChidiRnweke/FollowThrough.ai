<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';
	import { useSidebar } from './context.svelte.js';

	let {
		ref = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> = $props();

	const sidebar = useSidebar();

	/**
	 * The rail carries two gestures on one strip, which is why it already showed a
	 * resize cursor while only toggling. A pointer that travels past this threshold
	 * is a resize; one that never does is the click-to-toggle that has always been
	 * here. Past the threshold the toggle is suppressed, so a drag never collapses.
	 */
	const DRAG_THRESHOLD_PX = 4;

	let startX = 0;
	let startWidth = 0;
	let latestWidth = 0;
	let direction = 1;
	let dragging = false;
	let suppressClick = false;
	let pointerId: number | undefined;

	/** Only the expanded desktop sidebar has a width to drag; collapsed, the rail is purely a toggle. */
	const resizable = $derived(sidebar.state === 'expanded' && !sidebar.isMobile);

	function onpointerdown(event: PointerEvent & { currentTarget: HTMLButtonElement }): void {
		// Cleared here rather than trusted to the click that should have consumed it:
		// if that click never arrived, a stale flag would swallow the next real one.
		suppressClick = false;
		if (!resizable || event.button !== 0) return;
		startX = event.clientX;
		startWidth = sidebar.width;
		latestWidth = startWidth;
		// A sidebar docked on the right grows as the pointer moves left.
		direction = event.currentTarget.closest('[data-side="right"]') ? -1 : 1;
		dragging = false;
		pointerId = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		// Without this the drag selects the sidebar's labels as it passes over them.
		event.preventDefault();
	}

	function onpointermove(event: PointerEvent): void {
		if (pointerId === undefined) return;
		const delta = event.clientX - startX;
		if (!dragging) {
			if (Math.abs(delta) <= DRAG_THRESHOLD_PX) return;
			dragging = true;
			sidebar.startResize();
		}
		latestWidth = startWidth + delta * direction;
		sidebar.setWidth(latestWidth);
	}

	function onpointerup(event: PointerEvent & { currentTarget: HTMLButtonElement }): void {
		if (pointerId === undefined) return;
		event.currentTarget.releasePointerCapture(pointerId);
		pointerId = undefined;
		if (!dragging) return;
		dragging = false;
		// The click that follows this pointerup would otherwise collapse the sidebar
		// the user just finished sizing.
		suppressClick = true;
		sidebar.endResize();
		sidebar.commitWidth(latestWidth);
	}

	function onpointercancel(): void {
		pointerId = undefined;
		dragging = false;
		sidebar.endResize();
	}

	/**
	 * No double-click-to-reset here: the first click of the pair would collapse the
	 * sidebar and start its 200ms transition before the second arrived. Toggling is
	 * the far more frequent gesture and it stays instant.
	 */
	function onclick(): void {
		if (suppressClick) {
			suppressClick = false;
			return;
		}
		sidebar.toggle();
	}
</script>

<button
	bind:this={ref}
	data-sidebar="rail"
	data-slot="sidebar-rail"
	aria-label="Toggle Sidebar"
	tabindex={-1}
	{onpointerdown}
	{onpointermove}
	{onpointerup}
	{onpointercancel}
	{onclick}
	class={cn(
		'hover:after:bg-sidebar-border absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear group-data-[side=left]:-right-4 group-data-[side=right]:left-0 after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] sm:flex',
		'touch-none',
		'in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize',
		'[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize',
		'hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full',
		'[[data-side=left][data-collapsible=offcanvas]_&]:-right-2',
		'[[data-side=right][data-collapsible=offcanvas]_&]:-left-2',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</button>
