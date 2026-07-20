<script lang="ts">
	import { workbench } from '$lib/stores/workbench.svelte';
	import X from '@lucide/svelte/icons/x';

	// Local drag state so the divider doesn't depend on the workbench store
	// for per-pointermove bookkeeping — `workbench.setSplitRatio` is called
	// through a rAF throttle so we don't write to localStorage/IndexedDB on
	// every pixel of motion.
	let dragging = $state(false);
	let containerEl: HTMLElement | null = $state(null);
	let pendingFrame = 0;
	let pendingRatio = 0;

	function ratioFromClientX(clientX: number): number {
		if (!containerEl) return 0.5;
		const rect = containerEl.getBoundingClientRect();
		if (rect.width <= 0) return 0.5;
		return (clientX - rect.left) / rect.width;
	}

function onPointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		const target = event.currentTarget as HTMLElement | null;
		if (!target) return;
		containerEl = target.parentElement;
		if (!containerEl) return;
		dragging = true;
		event.preventDefault();
		target.setPointerCapture(event.pointerId);
		const ratio = ratioFromClientX(event.clientX);
		scheduleSetRatio(ratio);
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		event.preventDefault();
		scheduleSetRatio(ratioFromClientX(event.clientX));
	}

	function onPointerUp(event: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const target = event.currentTarget as HTMLElement | null;
		target?.releasePointerCapture?.(event.pointerId);
		flushRatio();
	}

	function scheduleSetRatio(ratio: number): void {
		pendingRatio = ratio;
		if (pendingFrame) return;
		pendingFrame = requestAnimationFrame(() => {
			pendingFrame = 0;
			workbench.setSplitRatio(pendingRatio);
		});
	}

	function flushRatio(): void {
		if (pendingFrame) {
			cancelAnimationFrame(pendingFrame);
			pendingFrame = 0;
			workbench.setSplitRatio(pendingRatio);
		}
	}

	function onDoubleClick() {
		workbench.setSplitRatio(0.5);
	}

	function onCloseSplit(event: MouseEvent) {
		event.stopPropagation();
		void workbench.setSplit(undefined);
	}
</script>

<!-- The rail is a 4px wide column with `cursor-col-resize`.  A tiny × button
     sits at its top-right so the user can collapse the split back to a
     single pane.  `touch-action: none` keeps the pointer events flowing on
     touch devices instead of letting the browser pan. -->
<div
	class="relative flex h-full w-1 shrink-0 cursor-col-resize select-none items-stretch bg-border transition-colors hover:bg-primary/30 touch-none {dragging
		? 'bg-primary'
		: ''}"
	role="separator"
	aria-orientation="vertical"
	aria-label="Resize split panes (double-click to reset; use the × to close)"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
	ondblclick={onDoubleClick}
>
	<button
		type="button"
		class="absolute -right-1.5 top-1.5 z-20 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-sm bg-background text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
		aria-label="Close split pane"
		title="Close split"
		onclick={onCloseSplit}
	>
		<X class="size-3" />
	</button>
</div>