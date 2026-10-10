import type { IconSearchPage } from '$lib/models/diagrams';
export interface IconSearchPages {
	page(term: string, start: number): Promise<IconSearchPage>;
}
