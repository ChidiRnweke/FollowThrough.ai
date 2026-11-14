import type { FetchLike } from '$lib/server/infrastructure/network/outbound';

export type HostHandler = (request: Request) => Promise<Response>;

export interface SentRequest {
	readonly url: string;
	readonly method: string;
	readonly authorization: string | null;
}

/**
 * The internet, as far as connectors can see it: each origin answers through
 * its handler, and every request is recorded. An origin without a handler
 * fails the way an unreachable host does.
 */
export class FakeConnectorNetwork {
	readonly sent: SentRequest[] = [];
	private readonly origins = new Map<string, HostHandler>();

	route(origin: string, handle: HostHandler): this {
		this.origins.set(new URL(origin).origin, handle);
		return this;
	}

	readonly fetch: FetchLike = async (url, init) => {
		const request = new Request(url, init);
		this.sent.push({
			url: request.url,
			method: request.method,
			authorization: request.headers.get('authorization')
		});
		const handle = this.origins.get(new URL(request.url).origin);
		if (!handle) throw new TypeError('fetch failed', { cause: new Error('ENOTFOUND') });
		return handle(request);
	};
}
