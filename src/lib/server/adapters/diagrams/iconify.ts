import { z } from 'zod';
import { iconSearchResponseSchema, type IconSearchPage } from '$lib/models/diagrams';
import type { IconSearchPages } from '$lib/server/repositories/diagrams/icon-search';
import { ExternalServiceError } from '$lib/errors';
const SEARCH_URL = 'https://api.iconify.design/search';
const REQUEST_TIMEOUT_MS = 8000;
// Provider request bounds: https://iconify.design/docs/api/search.html
const PROVIDER_MIN_LIMIT = 32;
export class IconifySearchPages implements IconSearchPages {
	constructor(private readonly fetchImpl: typeof fetch = fetch) {}

	async page(term: string, start: number): Promise<IconSearchPage> {
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
