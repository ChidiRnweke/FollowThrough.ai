import { mode } from 'mode-watcher';

/**
 * The state of one drawing of one diagram. `svg` is already sanitized.
 */
export type MermaidRender =
	{ kind: 'pending' } | { kind: 'ready'; svg: string } | { kind: 'failure' };

/**
 * Draw a Mermaid source into an SVG string, redrawing when the source or the
 * colour mode changes.
 *
 * Each call is its own drawing. That matters where a diagram is shown twice —
 * inline in a turn and again enlarged in a dialog — because
 * `renderMermaidOffscreen` prefixes every id inside the SVG (the root node,
 * arrow markers, gradients) with the id it is given. Injecting one string in
 * two places would put duplicate ids in the document and let the second copy's
 * `url(#…)` references resolve into the first.
 *
 * `active` is the caller's own gate: a drawing that nobody can see yet, such as
 * the copy inside a closed dialog, costs nothing until it is opened.
 */
export const createMermaidRender = (
	source: () => string,
	active: () => boolean
): { readonly current: MermaidRender } => {
	let result = $state<MermaidRender>({ kind: 'pending' });

	$effect(() => {
		if (!active()) {
			result = { kind: 'pending' };
			return;
		}
		const text = source();
		const dark = mode.current === 'dark';
		let cancelled = false;
		result = { kind: 'pending' };
		void (async () => {
			const drawn = await drawMermaid(text, dark);
			if (!cancelled) result = drawn;
		})();
		return () => {
			cancelled = true;
		};
	});

	return {
		get current() {
			return result;
		}
	};
};

const drawMermaid = async (source: string, dark: boolean): Promise<MermaidRender> => {
	try {
		const { initializeMermaid, renderMermaidOffscreen, sanitizeMermaidSvg } =
			await import('$lib/components/edra/mermaid-rendering');
		initializeMermaid(dark);
		const svg = await renderMermaidOffscreen(`chat-mermaid-${crypto.randomUUID()}`, source);
		return { kind: 'ready', svg: sanitizeMermaidSvg(svg) };
	} catch {
		return { kind: 'failure' };
	}
};
