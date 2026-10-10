import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import type { DiagramRenderResources } from '$lib/models/deliverables';
import type { DiagramRenderResourceReader } from '$lib/server/controllers/deliverables/controller';
const require = createRequire(import.meta.url);
export class NodeDiagramRenderResources implements DiagramRenderResourceReader {
	async read(): Promise<DiagramRenderResources> {
		const fontData = (
			await readFile(
				require.resolve('@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')
			)
		).toString('base64');
		return { fontData, mermaidScript: require.resolve('mermaid/dist/mermaid.js') };
	}
}
