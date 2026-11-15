import { request } from 'node:https';
import { lookup, type LookupAddress } from 'node:dns';
import type { LookupFunction } from 'node:net';
import { clientMetadataDocumentSchema } from '$lib/models/mcp-authorization';
import {
	hasSpecialUseLiteralHost,
	isSpecialUseAddress
} from '$lib/server/infrastructure/network/special-use';
import type {
	ClientMetadataDocumentRepository,
	ClientMetadataFetch
} from '$lib/server/repositories/identity';

/** CIMD §6.6: the recommended maximum response size for a client metadata document. */
const MAX_DOCUMENT_BYTES = 5 * 1024;
/** A metadata host that does not answer within this time fails the authorization request. */
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Resolves the host, then refuses the connection if any address is special-use. The check
 * runs in the socket's own lookup, so the address that is checked is the address that is used.
 */
const publicOnlyLookup: LookupFunction = (hostname, options, callback) =>
	lookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
		if (error) return callback(error, '', 0);
		const refused = addresses.find((entry) => isSpecialUseAddress(entry.address));
		if (refused || addresses.length === 0)
			return callback(new Error(`${hostname} resolves to a special-use address`), '', 0);
		if (options.all) return callback(null, addresses);
		return callback(null, addresses[0].address, addresses[0].family);
	});

/** CIMD §3: an https URL with a path, and no fragment, dot segments or credentials. */
const urlProblem = (url: URL): string | null => {
	if (url.protocol !== 'https:') return 'the client_id must use https';
	if (url.pathname === '/' || url.pathname === '') return 'the client_id must have a path';
	if (url.hash !== '') return 'the client_id must not have a fragment';
	if (url.username !== '' || url.password !== '') return 'the client_id must not carry credentials';
	if (url.pathname.split('/').some((segment) => segment === '.' || segment === '..'))
		return 'the client_id must not have dot segments';
	// CIMD §6.5: a socket skips the lookup for an address literal, so a literal is checked here.
	if (hasSpecialUseLiteralHost(url)) return 'the client_id host is a special-use address';
	return null;
};

const download = (url: URL): Promise<ClientMetadataFetch> =>
	new Promise((resolve) => {
		const failure = (reason: string) => resolve({ kind: 'failure', reason });
		const call = request(
			url,
			{
				method: 'GET',
				headers: { accept: 'application/json' },
				lookup: publicOnlyLookup,
				timeout: FETCH_TIMEOUT_MS
			},
			(response) => {
				// CIMD §4: redirects are not followed, so any status other than 200 is a failure.
				if (response.statusCode !== 200) {
					response.resume();
					return failure(`the metadata document answered ${response.statusCode}`);
				}
				const chunks: Buffer[] = [];
				let size = 0;
				response.on('data', (chunk: Buffer) => {
					size += chunk.length;
					if (size > MAX_DOCUMENT_BYTES) {
						response.destroy();
						return failure(`the metadata document is larger than ${MAX_DOCUMENT_BYTES} bytes`);
					}
					chunks.push(chunk);
				});
				response.on('error', (error) => failure(`the metadata document failed: ${error.message}`));
				response.on('end', () => resolve(readDocument(Buffer.concat(chunks).toString('utf8'))));
			}
		);
		call.on('timeout', () => call.destroy(new Error('timed out')));
		call.on('error', (error) =>
			failure(`the metadata document could not be fetched: ${error.message}`)
		);
		call.end();
	});

const readDocument = (text: string): ClientMetadataFetch => {
	try {
		const parsed = clientMetadataDocumentSchema.safeParse(JSON.parse(text));
		return parsed.success
			? { kind: 'document', document: parsed.data }
			: { kind: 'failure', reason: 'the metadata document is not valid client metadata' };
	} catch (error) {
		return { kind: 'failure', reason: `the metadata document is not JSON: ${String(error)}` };
	}
};

export class ClientMetadataDocuments implements ClientMetadataDocumentRepository {
	async fetch(url: URL): Promise<ClientMetadataFetch> {
		const problem = urlProblem(url);
		if (problem) return { kind: 'failure', reason: problem };
		const fetched = await download(url);
		if (fetched.kind === 'failure') return fetched;
		// CIMD §4.1: the document must name the URL it was fetched from.
		if (fetched.document.client_id !== url.href)
			return { kind: 'failure', reason: 'the document client_id does not match its URL' };
		return fetched;
	}
}
