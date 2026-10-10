import type { IconSearchPages } from '$lib/server/repositories/diagrams/icon-search';
import type { DiagramIcon } from '$lib/models/diagrams';
import { ExternalServiceError, ValidationError } from '$lib/errors';

/**
 * Icon lookup for diagrams, over Iconify's public API.
 *
 * The agent had no way to name a logo. Left to guess it produced stencil names
 * that do not exist, and a diagram full of broken boxes it could not see. Iconify
 * carries the brand marks — `logos:aws-s3`, `logos:kubernetes` — and serves each
 * one as an SVG over HTTPS with permissive CORS, which is exactly what draw.io
 * needs for `shape=image;image=<url>` and what `DrawioXmlValidator` already
 * permits. No key, no account.
 */
const ICON_ORIGIN = 'https://api.iconify.design';
// Product contract: icon search returns a small candidate set for diagram selection.
const MAX_ICON_RESULTS = 12;

export interface IconSearch {
	search(query: string, limit?: number): Promise<readonly DiagramIcon[]>;
}

/** `logos:aws-s3` → `https://api.iconify.design/logos/aws-s3.svg`. */
const iconUrl = (name: string): string | undefined => {
	const [prefix, icon] = name.split(':');
	if (!prefix || !icon || !/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(icon))
		return undefined;
	return `${ICON_ORIGIN}/${prefix}/${icon}.svg`;
};

export class IconifyIconSearch implements IconSearch {
	constructor(private readonly pages: IconSearchPages) {}

	async search(query: string, limit = 8): Promise<readonly DiagramIcon[]> {
		const term = query.trim();
		if (!term) throw new ValidationError('An icon search needs something to search for.');
		if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_ICON_RESULTS)
			throw new ValidationError(
				`The icon count must be an integer between 1 and ${MAX_ICON_RESULTS}.`
			);
		const icons: DiagramIcon[] = [];
		let start = 0;
		while (icons.length < limit) {
			const page = await this.pages.page(term, start);
			if (page.start !== start || page.total !== page.icons.length)
				throw new ExternalServiceError('The icon library returned inconsistent pagination.');
			for (const name of page.icons) {
				const url = iconUrl(name);
				if (url) icons.push({ name, url });
				if (icons.length === limit) break;
			}
			if (page.total < page.limit) break;
			start += page.total;
		}
		return icons;
	}
}
