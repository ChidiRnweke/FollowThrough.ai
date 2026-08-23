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
const MAX_RESPONSE_BYTES = 512 * 1024;
// Deliberately small. A run that searched eight terms came back with two
// hundred names, which is a lot of prompt for a choice between a handful.
const MAX_LIMIT = 12;

export interface DiagramIcon {
	/** Iconify's own name, `prefix:icon`, which is what a follow-up query uses. */
	readonly name: string;
	/** Ready to drop into a draw.io style as `shape=image;image=<url>`. */
	readonly url: string;
}

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
	constructor(private readonly fetchImpl: typeof fetch = fetch) {}

	async search(query: string, limit = 8): Promise<readonly DiagramIcon[]> {
		const term = query.trim();
		if (!term) throw new ValidationError('An icon search needs something to search for.');
		const url = new URL(SEARCH_URL);
		url.searchParams.set('query', term);
		url.searchParams.set('limit', String(Math.min(Math.max(limit, 1), MAX_LIMIT)));

		const response = await this.fetchImpl(url, {
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
		}).catch((cause) => {
			throw new ExternalServiceError('The icon library could not be reached.', { cause });
		});
		if (!response.ok)
			throw new ExternalServiceError(`The icon library answered ${response.status}.`);

		const body = await response.text();
		// Capped rather than streamed: a search result is a short list of names, and
		// anything larger is a sign the endpoint is not answering what we asked.
		if (body.length > MAX_RESPONSE_BYTES)
			throw new ExternalServiceError('The icon library returned more than expected.');

		let parsed: unknown;
		try {
			parsed = JSON.parse(body);
		} catch (cause) {
			throw new ExternalServiceError('The icon library returned something unreadable.', { cause });
		}
		const names = (parsed as { icons?: unknown }).icons;
		if (!Array.isArray(names)) return [];
		return names
			.filter((name): name is string => typeof name === 'string')
			.map((name) => ({ name, url: iconUrl(name) }))
			.filter((icon): icon is DiagramIcon => icon.url !== undefined);
	}
}
