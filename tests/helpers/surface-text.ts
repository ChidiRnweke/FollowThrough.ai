/** Runs in the browser through locator.evaluate(). It deliberately has no runtime imports. */
export function inspectSurfaceText(root: Element) {
	type Color = [number, number, number, number];
	type Sample = {
		text: string;
		element: string;
		kind: 'text' | 'icon' | 'placeholder';
		status: 'pass' | 'contrast' | 'review' | 'disabled';
		ratio: number | null;
		minimum: number;
		reasons: string[];
	};
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 1;
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) throw new Error('A canvas context is required to resolve CSS colors.');
	const color = (value: string): Color => {
		context.clearRect(0, 0, 1, 1);
		context.fillStyle = value;
		context.fillRect(0, 0, 1, 1);
		const rgba = context.getImageData(0, 0, 1, 1).data;
		return [rgba[0] / 255, rgba[1] / 255, rgba[2] / 255, rgba[3] / 255];
	};
	const over = (front: Color, back: Color): Color => {
		const alpha = front[3] + back[3] * (1 - front[3]);
		if (alpha === 0) return [0, 0, 0, 0];
		const channel = (index: number) =>
			(front[index] * front[3] + back[index] * back[3] * (1 - front[3])) / alpha;
		return [channel(0), channel(1), channel(2), alpha];
	};
	const luminance = (rgba: Color) => {
		const linear = rgba
			.slice(0, 3)
			.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
		return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
	};
	const results: Sample[] = [];
	const inspect = (element: Element, text: string, kind: Sample['kind']) => {
		const style = getComputedStyle(element, kind === 'placeholder' ? '::placeholder' : null);
		const rect = element.getBoundingClientRect();
		if (rect.width <= 1 || rect.height <= 1 || style.visibility !== 'visible') return;
		if (element.closest('[hidden], [inert], .sr-only, script, style, [contenteditable="true"]'))
			return;
		let ink = color(kind === 'icon' && style.stroke !== 'none' ? style.stroke : style.color);
		if (kind === 'placeholder') ink[3] *= Number(style.opacity);
		let background: Color = [0, 0, 0, 0];
		const reasons: string[] = [];
		for (let ancestor: Element | null = element; ancestor; ancestor = ancestor.parentElement) {
			const layer = getComputedStyle(ancestor);
			const opacity = Number(layer.opacity);
			if (opacity === 0 || layer.display === 'none' || layer.visibility === 'hidden') return;
			if (layer.backgroundImage !== 'none' && background[3] < 1)
				reasons.push('Image or gradient behind text requires visual review.');
			if (
				layer.filter !== 'none' ||
				layer.backdropFilter !== 'none' ||
				layer.mixBlendMode !== 'normal'
			)
				reasons.push('Filter or blending requires visual review.');
			for (const pseudo of ['::before', '::after']) {
				const decoration = getComputedStyle(ancestor, pseudo);
				if (
					decoration.content !== 'none' &&
					decoration.content !== 'normal' &&
					(color(decoration.backgroundColor)[3] > 0 || decoration.backgroundImage !== 'none')
				) {
					reasons.push('Painted pseudo-element requires visual review.');
				}
			}
			const fill = color(layer.backgroundColor);
			ink = over(ink, fill);
			background = over(background, fill);
			ink[3] *= opacity;
			background[3] *= opacity;
		}
		if (background[3] < 1)
			reasons.push('No opaque ancestor background; canvas color is unresolved.');
		const large =
			Number.parseFloat(style.fontSize) >= (Number(style.fontWeight) >= 700 ? 18.6667 : 24);
		const minimum = kind === 'icon' || large ? 3 : 4.5;
		const ratio = reasons.length
			? null
			: (Math.max(luminance(ink), luminance(background)) + 0.05) /
				(Math.min(luminance(ink), luminance(background)) + 0.05);
		const disabled = element.closest(
			':disabled, [aria-disabled="true"], [data-disabled="true"], [data-disabled=""]'
		);
		results.push({
			text,
			element: `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}.${Array.from(element.classList).join('.')}`,
			kind,
			status: disabled
				? 'disabled'
				: ratio === null
					? 'review'
					: ratio < minimum
						? 'contrast'
						: 'pass',
			ratio,
			minimum,
			reasons: [...new Set(reasons)]
		});
	};
	for (const element of [root, ...root.querySelectorAll('*')]) {
		const text = Array.from(element.childNodes)
			.filter((node) => node.nodeType === Node.TEXT_NODE)
			.map((node) => node.textContent?.trim())
			.filter(Boolean)
			.join(' ');
		if (text) inspect(element, text, 'text');
		if (
			element instanceof SVGSVGElement &&
			element.closest('button, [role="button"], a, [role="tab"]')
		)
			inspect(
				element,
				element.closest('[aria-label]')?.getAttribute('aria-label') ?? 'Control icon',
				'icon'
			);
		if (
			(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) &&
			element.placeholder &&
			!element.value
		)
			inspect(element, element.placeholder, 'placeholder');
	}
	return results;
}
