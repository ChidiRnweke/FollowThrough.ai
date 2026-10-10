import type { DocumentExportRemote, DocumentPreviewUrls } from '$lib/models/browser-deliverables';
import type { ExportDiagramImageAdapter } from '$lib/models/browser-deliverables';
import type {
	GenerateDocumentInput,
	GenerateBundleInput,
	PreviewDocumentInput,
	GenerateBundleOutput
} from '$lib/models/deliverables';
export class InMemoryDocumentExportRemote implements DocumentExportRemote {
	readonly documents: GenerateDocumentInput[] = [];
	readonly bundles: GenerateBundleInput[] = [];
	readonly previews: PreviewDocumentInput[] = [];
	failure: Error | undefined;
	private gate: { readonly started: () => void; readonly wait: Promise<void> } | undefined;
	pause(): { started: Promise<void>; release(): void } {
		const started = Promise.withResolvers<void>();
		const ready = Promise.withResolvers<void>();
		this.gate = { started: started.resolve, wait: ready.promise };
		return { started: started.promise, release: ready.resolve };
	}
	private async respond(): Promise<void> {
		const gate = this.gate;
		this.gate = undefined;
		if (gate) {
			gate.started();
			await gate.wait;
		}
		if (this.failure) throw this.failure;
	}
	async generate(input: GenerateDocumentInput) {
		this.documents.push(input);
		await this.respond();
		return { downloadUrl: 'https://storage.test/document.pdf' };
	}
	async bundle(input: GenerateBundleInput): Promise<GenerateBundleOutput> {
		this.bundles.push(input);
		await this.respond();
		return {
			downloadUrl: 'https://storage.test/bundle.zip',
			fileCount: input.entries.length,
			byteSize: 12
		};
	}
	async preview(input: PreviewDocumentInput) {
		this.previews.push(input);
		await this.respond();
		return { data: 'JVBERi0=' };
	}
}
export class InMemoryDocumentPreviewUrls implements DocumentPreviewUrls {
	readonly active = new Map<string, string>();
	private sequence = 0;
	create(data: string): string {
		const url = `blob:preview-${++this.sequence}`;
		this.active.set(url, data);
		return url;
	}
	release(url: string): void {
		this.active.delete(url);
	}
}
export class InMemoryExportDiagramImages implements ExportDiagramImageAdapter {
	png: string | null = 'data:image/png;base64,cG5n';
	failure: Error | undefined;
	async rasterize(_svg: string): Promise<string | null> {
		void _svg;
		if (this.failure) throw this.failure;
		return this.png;
	}
	async hash(value: string): Promise<string> {
		const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
		return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
	}
}
