import { z } from 'zod';
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
const SEARCH_URL = 'https://api.iconify.design/search';
const ICON_ORIGIN = 'https://api.iconify.design';
const REQUEST_TIMEOUT_MS = 8000;
// Provider request bounds: https://iconify.design/docs/api/search.html
const PROVIDER_MIN_LIMIT = 32;
// Product contract: icon search returns a small candidate set for diagram selection.
const MAX_ICON_RESULTS = 12;

export interface DiagramIcon {
	/** Iconify's own name, `prefix:icon`, which is what a follow-up query uses. */
	readonly name: string;
	/** Ready to drop into a draw.io style as `shape=image;image=<url>`. */
	readonly url: string;
}

export interface IconSearch {
	search(query: string, limit?: number): Promise<readonly DiagramIcon[]>;
}

/** Pagination metadata is required so a short page cannot hide further matches. */
const iconSearchResponseSchema = z.object({
	icons: z.array(z.string()),
	total: z.number().int().nonnegative(),
	limit: z.number().int().positive(),
	start: z.number().int().nonnegative()
});

/** `logos:aws-s3` → `https://api.iconify.design/logos/aws-s3.svg`. */
const iconUrl = (name: string): string | undefined => {
	const [prefix, icon] = name.split(':');
	if (!prefix || !icon || !/^[a-z0-9-]+$/i.test(prefix) || !/^[a-z0-9-]+$/i.test(icon))
		return undefined;
	return `${ICON_ORIGIN}/${prefix}/${icon}.svg`;
};

export class IconifyIconSearch implements IconSearch {
	constructor(private readonly fetchImpl: typeof fetch = fetch) {}

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
			const page = await this.page(term, start);
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

	private async page(term: string, start: number) {
		const url = new URL(SEARCH_URL);
		url.searchParams.set('query', term);
		url.searchParams.set('start', String(start));
		url.searchParams.set('limit', String(PROVIDER_MIN_LIMIT));
		const response = await this.fetchImpl(url, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		}).catch((cause) => {
			throw new ExternalServiceError('The icon library could not be reached.', {
				cause: cause instanceof Error ? cause.message : String(cause)
			});
		});
		if (!response.ok)
			throw new ExternalServiceError(`The icon library answered ${response.status}.`);
		let parsed: unknown;
		try {
			parsed = await response.json();
		} catch (cause) {
			throw new ExternalServiceError('The icon library returned something unreadable.', {
				cause: cause instanceof Error ? cause.message : String(cause)
			});
		}
		const result = iconSearchResponseSchema.safeParse(parsed);
		if (!result.success)
			throw new ExternalServiceError('The icon library returned an unexpected search result.', {
				cause: z.prettifyError(result.error)
			});
		return result.data;
	}
}
