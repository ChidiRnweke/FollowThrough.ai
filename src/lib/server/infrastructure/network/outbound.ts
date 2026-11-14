import { lookup as systemLookup, type LookupAddress } from 'node:dns';
import { BlockList, isIPv4 } from 'node:net';
import { context } from '@opentelemetry/api';
import { suppressTracing } from '@opentelemetry/core';
import { Agent } from 'undici';
import { ExternalServiceError } from '$lib/errors';

/** The `fetch` shape the MCP SDK's transport and OAuth functions accept. */
export type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

/** Resolves a host to every address it has. */
export type AddressLookup = (hostname: string) => Promise<readonly LookupAddress[]>;

/**
 * Addresses FollowThrough never connects to on a user's behalf: this host, its
 * private networks, link-local (including the cloud metadata address
 * 169.254.169.254), carrier-grade NAT, benchmarking, multicast and reserved
 * ranges. A user names a connector's URL, so without this a URL could reach a
 * service that trusts the network instead of a credential.
 */
const forbidden = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 4],
	['240.0.0.0', 4]
] as const)
	forbidden.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
	['::', 128],
	['::1', 128],
	['64:ff9b::', 96],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8]
] as const)
	forbidden.addSubnet(network, prefix, 'ipv6');

const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

const isForbidden = ({ address, family }: LookupAddress): boolean => {
	const mapped = IPV4_MAPPED.exec(address)?.[1];
	if (mapped && isIPv4(mapped)) return forbidden.check(mapped, 'ipv4');
	return forbidden.check(address, family === 6 ? 'ipv6' : 'ipv4');
};

const resolveAll: AddressLookup = (hostname) =>
	new Promise((resolve, reject) =>
		systemLookup(hostname, { all: true }, (error, addresses) =>
			error ? reject(error) : resolve(addresses)
		)
	);

type Vetting =
	| { readonly kind: 'public'; readonly addresses: readonly LookupAddress[] }
	| { readonly kind: 'failure'; readonly error: Error };

const vet = async (hostname: string, lookup: AddressLookup): Promise<Vetting> => {
	try {
		const addresses = await lookup(hostname);
		const blocked = addresses.find(isForbidden);
		if (addresses.length > 0 && !blocked) return { kind: 'public', addresses };
		return {
			kind: 'failure',
			error: new ExternalServiceError(
				`${hostname} resolves to an address FollowThrough does not connect to.`,
				{ cause: blocked ? blocked.address : 'no address' }
			)
		};
	} catch (error) {
		return { kind: 'failure', error: error instanceof Error ? error : new Error(String(error)) };
	}
};

/**
 * A fetch that resolves each connection's host itself and connects only when
 * every address is public. The check runs inside the socket's own lookup, so the
 * address it vets is the address it connects to: a host that answers with a
 * public address and then a private one (DNS rebinding) cannot slip between a
 * check and a connect.
 */
export const publicAddressFetch = (lookup: AddressLookup = resolveAll): FetchLike => {
	const dispatcher = new Agent({
		connect: {
			lookup: (hostname, options, callback) => {
				void vet(hostname, lookup).then((vetting) => {
					if (vetting.kind === 'failure') return callback(vetting.error, '');
					if (options.all) return callback(null, [...vetting.addresses]);
					const [first] = vetting.addresses;
					return callback(null, first!.address, first!.family);
				});
			}
		}
	});
	return async (url, init) => {
		// Node's fetch takes an undici dispatcher; the DOM's RequestInit has no field for it.
		const options: RequestInit & { readonly dispatcher: Agent } = { ...init, dispatcher };
		try {
			return await fetch(url, options);
		} catch (error) {
			// fetch reports every connect failure as "fetch failed"; the refusal is the cause.
			if (error instanceof TypeError && error.cause instanceof ExternalServiceError)
				throw error.cause;
			throw error;
		}
	};
};

/** The fetch standard's redirect limit. */
const MAX_REDIRECTS = 20;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * The one way out to a connector, its authorization server or its icon.
 *
 * - HTTPS only.
 * - A redirect is followed only within the same origin and only for a GET or a
 *   HEAD; a redirect elsewhere fails, because a server cannot hand FollowThrough
 *   to a host the user did not name.
 * - No cookies: the platform fetch keeps none.
 * - No trace context: these requests run with tracing suppressed, so neither a
 *   span nor a `traceparent` header reaches a third party (ADR 0049).
 */
export class OutboundGuard {
	constructor(private readonly transport: FetchLike) {}

	readonly fetch: FetchLike = (url, init) =>
		context.with(suppressTracing(context.active()), () => this.follow(new URL(url), init));

	private async follow(url: URL, init: RequestInit | undefined): Promise<Response> {
		const method = (init?.method ?? 'GET').toUpperCase();
		for (let hop = 0; ; hop++) {
			if (url.protocol !== 'https:')
				throw new ExternalServiceError(`FollowThrough connects to connectors over HTTPS only.`, {
					cause: url.origin
				});
			const response = await this.transport(url, { ...init, redirect: 'manual' });
			const location = response.headers.get('location');
			if (!REDIRECT_STATUSES.has(response.status) || location === null) return response;
			const next = new URL(location, url);
			if (next.origin !== url.origin)
				throw new ExternalServiceError(`${url.host} redirected to another host.`, {
					cause: next.origin
				});
			if (method !== 'GET' && method !== 'HEAD')
				throw new ExternalServiceError(`${url.host} redirected a ${method} request.`, {
					cause: next.pathname
				});
			if (hop === MAX_REDIRECTS)
				throw new ExternalServiceError(`${url.host} redirected too many times.`);
			url = next;
		}
	}
}
