import { describe, expect, it } from 'vitest';
import { rasterizeSvg } from './rasterize';

const PLAIN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#0f766e"/></svg>`;

/**
 * draw.io writes HTML labels as `foreignObject`, always inside a `switch` with a
 * plain `text` fallback beside it. Chromium refuses to rasterize a foreignObject
 * in an SVG loaded as an image, so the whole export fails — which left the agent
 * with no picture of what it had drawn.
 */
const DRAWIO_SHAPED = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#0f766e"/><g><switch><foreignObject width="80" height="20" x="10" y="10"><div xmlns="http://www.w3.org/1999/xhtml">Alpha</div></foreignObject><text x="50" y="25" text-anchor="middle">Alpha</text></switch></g></svg>`;

describe('Rasterizing SVG for the model and the exporters', () => {
	it('produces a PNG data URL', async () => {
		expect(await rasterizeSvg(PLAIN)).toMatch(/^data:image\/png;base64,/);
	});

	it('rasterizes a draw.io export despite its HTML labels', async () => {
		expect(await rasterizeSvg(DRAWIO_SHAPED)).toMatch(/^data:image\/png;base64,/);
	});

	it('returns null for markup that is not an image at all', async () => {
		expect(await rasterizeSvg('<not-svg>')).toBeNull();
	});
});
