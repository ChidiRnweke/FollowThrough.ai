import { rasterizeSvg } from '$lib/client/images/rasterize';
import type { ExportDiagramImageAdapter } from '$lib/controllers/deliverables/diagrams';
export class BrowserExportDiagramImages implements ExportDiagramImageAdapter {
	rasterize(svg: string): Promise<string | null> {
		return rasterizeSvg(svg);
	}
	async hash(value: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	}
}
