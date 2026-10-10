import {
	generateDocument,
	generateBundle,
	previewDocument
} from '$lib/remote/deliverables/deliverables.remote';
import type { DocumentExportRemote, DocumentPreviewUrls } from '$lib/models/browser-deliverables';
import type {
	GenerateDocumentInput,
	GenerateBundleInput,
	PreviewDocumentInput
} from '$lib/models/deliverables';
export class RemoteDocumentExport implements DocumentExportRemote {
	generate(input: GenerateDocumentInput) {
		return generateDocument(input);
	}
	bundle(input: GenerateBundleInput) {
		return generateBundle({ ...input, entries: [...input.entries] });
	}
	preview(input: PreviewDocumentInput) {
		return previewDocument(input);
	}
}
export class BrowserDocumentPreviewUrls implements DocumentPreviewUrls {
	create(data: string): string {
		const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
		return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
	}
	release(url: string): void {
		URL.revokeObjectURL(url);
	}
}
