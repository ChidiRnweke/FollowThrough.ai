import type { PdfFontResources } from '$lib/models/deliverables';
type FontState =
	| { readonly kind: 'empty' }
	| { readonly kind: 'loading'; readonly pending: Promise<PdfFontResources> }
	| { readonly kind: 'ready'; readonly resources: PdfFontResources };
export interface PdfFontCache {
	readonly current: FontState;
	setLoading(pending: Promise<PdfFontResources>): void;
	setReady(resources: PdfFontResources): void;
	clear(): void;
}
export class PdfFontStore implements PdfFontCache {
	private value: FontState = { kind: 'empty' };
	get current(): FontState {
		return this.value;
	}
	setLoading(pending: Promise<PdfFontResources>): void {
		this.value = { kind: 'loading', pending };
	}
	setReady(resources: PdfFontResources): void {
		this.value = { kind: 'ready', resources };
	}
	clear(): void {
		this.value = { kind: 'empty' };
	}
}
