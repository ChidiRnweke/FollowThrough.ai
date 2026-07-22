/**
 * Shared drag-resize logic for media-like node views (images, videos, mermaid
 * diagrams). Tracks a horizontal drag from a left/right handle and reports the
 * new width as a percentage of the parent element, clamped to sensible bounds.
 *
 * Usage: create in component setup, call `attach()` in `onMount` and
 * `detach()` in `onDestroy`, and wire `startResize` / `handleTouchStart` to
 * the handle elements.
 */

export interface MediaResizeOptions {
	/** The element whose rendered width seeds the drag (e.g. the img or wrapper). */
	getMediaEl?: () => HTMLElement | null | undefined;
	/** The element whose width defines 100% (usually the node view's parent). */
	getParentEl: () => HTMLElement | null | undefined;
	/**
	 * Current width percent to seed the drag from. Preferred over measuring
	 * `getMediaEl` — required when the width may exceed 100% (zoom), since the
	 * rendered element is then clamped to the parent and can't be measured.
	 */
	getWidthPercent?: () => number;
	/** Called with the clamped width percentage while dragging. */
	onWidth: (widthPercent: number) => void;
	minWidthPercent?: number;
	maxWidthPercent?: number;
}

export function createMediaResize(options: MediaResizeOptions) {
	const minWidthPercent = options.minWidthPercent ?? 20;
	const maxWidthPercent = options.maxWidthPercent ?? 100;

	let resizing = $state(false);
	let initialWidthPercent = 0;
	let initialClientX = 0;
	let position: 'left' | 'right' = 'left';

	function begin(clientX: number, side: 'left' | 'right') {
		const parentEl = options.getParentEl();
		if (!parentEl) return;
		if (options.getWidthPercent) {
			initialWidthPercent = options.getWidthPercent();
		} else {
			const mediaEl = options.getMediaEl?.();
			if (!mediaEl) return;
			initialWidthPercent = (mediaEl.offsetWidth / parentEl.offsetWidth) * 100;
		}
		resizing = true;
		position = side;
		initialClientX = clientX;
	}

	function move(clientX: number) {
		if (!resizing) return;
		const parentEl = options.getParentEl();
		if (!parentEl) return;
		let dx = clientX - initialClientX;
		if (position === 'left') dx = -dx;
		const deltaPercent = (dx / parentEl.offsetWidth) * 100;
		const newWidthPercent = Math.max(
			Math.min(initialWidthPercent + deltaPercent, maxWidthPercent),
			minWidthPercent
		);
		options.onWidth(newWidthPercent);
	}

	function end() {
		resizing = false;
		initialClientX = 0;
		initialWidthPercent = 0;
	}

	function startResize(e: MouseEvent, side: 'left' | 'right') {
		e.preventDefault();
		begin(e.clientX, side);
	}

	function handleTouchStart(e: TouchEvent, side: 'left' | 'right') {
		e.preventDefault();
		begin(e.touches[0].clientX, side);
	}

	const onMouseMove = (e: MouseEvent) => move(e.clientX);
	const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientX);

	function attach() {
		window.addEventListener('mousemove', onMouseMove);
		window.addEventListener('mouseup', end);
		window.addEventListener('touchmove', onTouchMove);
		window.addEventListener('touchend', end);
	}

	function detach() {
		window.removeEventListener('mousemove', onMouseMove);
		window.removeEventListener('mouseup', end);
		window.removeEventListener('touchmove', onTouchMove);
		window.removeEventListener('touchend', end);
	}

	return {
		get resizing() {
			return resizing;
		},
		startResize,
		handleTouchStart,
		attach,
		detach
	};
}
