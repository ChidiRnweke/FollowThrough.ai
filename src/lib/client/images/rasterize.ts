/**
 * Turn SVG markup into a PNG data URL, using a canvas.
 *
 * Browser-only by necessity: nothing on the server can rasterize anything — there
 * is no puppeteer, resvg or sharp — so every PNG in the app is produced here.
 * Shared rather than owned by one feature: the document exporters embed rasters
 * because DOCX demands them, and the diagram studio needs one so the agent can be
 * shown a picture of what it drew.
 */
/**
 * Drop HTML labels, keeping the plain-text fallback beside them.
 *
 * Chromium refuses to rasterize a `foreignObject` inside an SVG loaded as an
 * image, and it fails the whole drawing rather than that one node — which is why
 * a draw.io export produced no PNG at all. draw.io always emits the label twice,
 * as a `foreignObject` and a `text` inside the same `switch`, so removing the
 * former loses nothing a raster can show.
 */
const withoutForeignObjects = (svgMarkup: string): string =>
	svgMarkup.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, '');

/** Returns `null` on any failure, so a caller can fall back to the SVG. */
export async function rasterizeSvg(svgMarkup: string, scale = 2): Promise<string | null> {
	try {
		const drawable = withoutForeignObjects(svgMarkup);
		const url = URL.createObjectURL(new Blob([drawable], { type: 'image/svg+xml' }));
		try {
			const image = new Image();
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error('SVG rasterization failed'));
				image.src = url;
			});
			// Mermaid SVGs size themselves through max-width, not width/height, so the
			// viewBox is the only reliable natural size.
			const viewBox = /viewBox="([\d.\s-]+)"/.exec(drawable)?.[1]?.trim().split(/\s+/).map(Number);
			const baseWidth = viewBox?.[2] || image.naturalWidth || 800;
			const baseHeight = viewBox?.[3] || image.naturalHeight || 600;
			const canvas = document.createElement('canvas');
			canvas.width = Math.round(baseWidth * scale);
			canvas.height = Math.round(baseHeight * scale);
			const context2d = canvas.getContext('2d');
			if (!context2d) return null;
			// Transparent pixels print as black boxes in some Word viewers.
			context2d.fillStyle = '#ffffff';
			context2d.fillRect(0, 0, canvas.width, canvas.height);
			context2d.drawImage(image, 0, 0, canvas.width, canvas.height);
			return canvas.toDataURL('image/png');
		} finally {
			URL.revokeObjectURL(url);
		}
	} catch {
		return null;
	}
}
