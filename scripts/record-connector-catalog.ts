import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
	StreamableHTTPClientTransport,
	StreamableHTTPError
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { discoverOAuthServerInfo } from '@modelcontextprotocol/sdk/client/auth.js';
import * as prettier from 'prettier';
import { z } from 'zod';
import { CATALOG_SOURCES, type CatalogSource } from './connector-catalog-sources.ts';
import { RECORDED_CATALOG } from '../src/lib/models/connector-catalog/index.ts';

/**
 * Records the connector catalog (ADR 0051).
 *
 * `--record` checks every vendor in `connector-catalog-sources.ts` over the
 * network and writes what it found:
 *
 * 1. Where the server is. A registry vendor's endpoint comes from the official
 *    MCP Registry and must be hosted on the domain its name claims. A documented
 *    vendor's endpoint must be named by the vendor's own documentation page.
 * 2. How it signs in, found the way production finds it: an anonymous
 *    `tools/list`, else RFC 9728 and RFC 8414 discovery through the MCP SDK.
 *    PKCE S256 and an HTTPS sign-in page are required. The result must equal the
 *    source's `expect`.
 * 3. Its logo: the SVG Logos mark when it fits a square tile, else the icon the
 *    vendor publishes in the registry, else its site's touch icon. Every file is
 *    identified by its bytes, and an SVG must be a drawing only.
 *
 * Any vendor that fails a check fails the run by name; nothing is skipped.
 * Without `--record` the script checks offline that every recorded entry has
 * its logo file and that the sources and the recorded catalog list the same
 * vendors.
 */

const catalogFile = new URL('../src/lib/models/connector-catalog/index.ts', import.meta.url);
const logoDirectory = new URL('../static/connector-logos/', import.meta.url);
const REGISTRY = 'https://registry.modelcontextprotocol.io/v0.1/servers';
/** Identifies the recorder; the `Mozilla/5.0 (compatible; …)` form is what CDNs accept from bots. */
const USER_AGENT = 'Mozilla/5.0 (compatible; FollowThrough-catalog-recorder/1.0)';
const TIMEOUT_MS = 20_000;
/** The same ceiling as a custom server's icon: Linear's 256 px PNG was 16,055 bytes. */
const MAX_LOGO_BYTES = 256 * 1024;
/** cloudflare-icon, the widest mark already on a tile, is 256 × 117 (2.19). */
const MAX_ASPECT = 2.2;
/** The largest tile is 48 CSS px; at a 2x display that is 96 device px. */
const MIN_RASTER_PX = 96;

/** A vendored mark is drawing only: no script, no handlers, nothing fetched from elsewhere. */
const unsafe = /<script|<foreignObject|\son[a-z]+=|(?:href|src)=["']?(?:https?:|\/\/|data:)/i;

type Signal =
	| { readonly kind: 'ok'; readonly value: string }
	| { readonly kind: 'failure'; readonly reason: string };

interface Logo {
	readonly extension: 'svg' | 'png' | 'jpg' | 'webp';
	readonly bytes: Uint8Array;
	readonly source: string;
}

interface Recorded {
	readonly source: CatalogSource;
	readonly serverUrl: string;
	readonly signIn: CatalogSource['expect'];
	readonly logo: Logo;
}

const registryEntrySchema = z.object({
	server: z.object({
		remotes: z
			.array(
				z.object({
					type: z.string(),
					url: z.string(),
					headers: z
						.array(z.object({ name: z.string(), isRequired: z.boolean().optional() }))
						.optional()
				})
			)
			.optional(),
		icons: z.array(z.object({ src: z.string(), theme: z.string().optional() })).optional()
	})
});

const registrationSupportSchema = z.object({
	client_id_metadata_document_supported: z.boolean().optional(),
	registration_endpoint: z.string().optional()
});

const registrable = (host: string): string => {
	const parts = host.split('.');
	const secondLevel = parts.at(-2) ?? '';
	return parts.length >= 3 &&
		['co', 'com', 'org', 'net', 'ac'].includes(secondLevel) &&
		parts.at(-1)!.length === 2
		? parts.slice(-3).join('.')
		: parts.slice(-2).join('.');
};

/** Waits out a rate limit or a passing server error: three tries, 2 s then 4 s apart. */
const fetchWithin = async (url: string, init: RequestInit = {}): Promise<Response> => {
	for (let attempt = 1; ; attempt++) {
		const response = await fetch(url, {
			...init,
			headers: { 'user-agent': USER_AGENT, ...init.headers },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		if ((response.status !== 429 && response.status < 500) || attempt === 3) return response;
		await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 1000));
	}
};

/** Reads at most the cap, so an oversized answer fails without being held whole. */
const boundedBytes = async (response: Response): Promise<Uint8Array | undefined> => {
	if (!response.body) return undefined;
	const chunks: Uint8Array[] = [];
	let total = 0;
	for await (const chunk of response.body) {
		total += chunk.byteLength;
		if (total > MAX_LOGO_BYTES) return undefined;
		chunks.push(chunk);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

const sniff = (bytes: Uint8Array): Logo['extension'] | undefined => {
	const starts = (...signature: number[]) =>
		signature.every((byte, index) => bytes[index] === byte);
	if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'png';
	if (starts(0xff, 0xd8, 0xff)) return 'jpg';
	if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP')
		return 'webp';
	const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart();
	if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'svg';
	return undefined;
};

/** A raster's pixel size from its header; undefined for a format this does not read. */
const rasterSize = (bytes: Uint8Array): number | undefined => {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (sniff(bytes) === 'png' && bytes.byteLength >= 24)
		return Math.min(view.getUint32(16), view.getUint32(20));
	return undefined;
};

/** The largest PNG image inside an ICO container, which many sites serve as their only icon. */
const pngFromIco = (bytes: Uint8Array): Uint8Array | undefined => {
	if (!(bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0)) return undefined;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const count = view.getUint16(4, true);
	const images = Array.from({ length: count }, (_, index) => {
		const entry = 6 + index * 16;
		const size = view.getUint32(entry + 8, true);
		const offset = view.getUint32(entry + 12, true);
		return bytes.slice(offset, offset + size);
	}).filter((image) => sniff(image) === 'png');
	return images.sort((left, right) => (rasterSize(right) ?? 0) - (rasterSize(left) ?? 0))[0];
};

const aspectOf = (svg: string): number | undefined => {
	const box = /viewBox="\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
	if (!box) return undefined;
	const width = Number(box[1]);
	const height = Number(box[2]);
	return height > 0 ? Math.max(width / height, height / width) : undefined;
};

/** Where the server is, and the registry entry's icons when it came from there. */
const locate = async (
	source: CatalogSource
): Promise<
	| {
			readonly kind: 'located';
			readonly url: string;
			readonly icons: readonly string[];
			readonly site: string;
	  }
	| { readonly kind: 'failure'; readonly reason: string }
> => {
	if (source.from.kind === 'documented') {
		const endpoint = new URL(source.from.endpoint);
		const page = await fetchWithin(source.from.documentation);
		if (!page.ok) return { kind: 'failure', reason: `documentation answered ${page.status}` };
		const text = await page.text();
		if (!text.includes(endpoint.host))
			return { kind: 'failure', reason: `documentation does not name ${endpoint.host}` };
		return {
			kind: 'located',
			url: endpoint.href,
			icons: [],
			site: `https://${registrable(new URL(source.from.documentation).host)}/`
		};
	}
	const answer = await fetchWithin(
		`${REGISTRY}/${encodeURIComponent(source.from.name)}/versions/latest`
	);
	if (!answer.ok) return { kind: 'failure', reason: `registry answered ${answer.status}` };
	const entry = registryEntrySchema.parse(await answer.json());
	const domain = registrable(source.from.name.split('/')[0]!.split('.').reverse().join('.'));
	const remote = (entry.server.remotes ?? []).find(
		(candidate) =>
			candidate.type === 'streamable-http' &&
			!candidate.url.includes('{') &&
			registrable(new URL(candidate.url).hostname) === domain &&
			// A required Authorization header is the OAuth bearer; any other is an API key.
			(candidate.headers ?? []).every(
				(header) => !header.isRequired || header.name.toLowerCase() === 'authorization'
			)
	);
	if (!remote)
		return { kind: 'failure', reason: `no Streamable HTTP remote on ${domain} without a key` };
	const icons = (entry.server.icons ?? [])
		.filter((icon) => icon.theme !== 'dark' && icon.src.startsWith('https://'))
		.map((icon) => icon.src);
	return { kind: 'located', url: remote.url, icons, site: `https://${domain}/` };
};

/** How the server signs in, the way production's connect finds it. */
const probe = async (url: string): Promise<Signal> => {
	const client = new Client({ name: 'FollowThrough catalog recorder', version: '1.0.0' });
	const anonymous = await client
		.connect(new StreamableHTTPClientTransport(new URL(url)), { timeout: TIMEOUT_MS })
		.then(() => client.listTools(undefined, { timeout: TIMEOUT_MS }))
		.then(
			() => ({ kind: 'listed' }) as const,
			(error: Error) =>
				error instanceof StreamableHTTPError && error.code === 401
					? ({ kind: 'challenged' } as const)
					: ({ kind: 'refused', message: error.message.slice(0, 160) } as const)
		);
	await client.close();
	if (anonymous.kind === 'listed') return { kind: 'ok', value: 'none' };
	if (anonymous.kind === 'refused')
		return { kind: 'failure', reason: `anonymous listing failed: ${anonymous.message}` };
	const info = await discoverOAuthServerInfo(url).then(
		(value) => value,
		(error: Error) => error
	);
	if (info instanceof Error)
		return { kind: 'failure', reason: `discovery failed: ${info.message}` };
	const metadata = info.authorizationServerMetadata;
	if (!metadata) return { kind: 'failure', reason: 'no authorization server metadata' };
	if (!metadata.code_challenge_methods_supported?.includes('S256'))
		return { kind: 'failure', reason: 'no PKCE S256' };
	if (new URL(metadata.authorization_endpoint).protocol !== 'https:')
		return { kind: 'failure', reason: 'sign-in page is not HTTPS' };
	const support = registrationSupportSchema.parse(metadata);
	const discovered =
		support.client_id_metadata_document_supported === true ||
		support.registration_endpoint !== undefined;
	return { kind: 'ok', value: discovered ? 'discovered' : 'preregistered' };
};

const iconifySetSchema = z.object({
	width: z.number().optional(),
	height: z.number().optional(),
	icons: z.record(
		z.string(),
		z.object({
			body: z.string(),
			width: z.number().optional(),
			height: z.number().optional(),
			left: z.number().optional(),
			top: z.number().optional()
		})
	),
	not_found: z.array(z.string()).optional()
});

/**
 * Every requested SVG Logos mark in one request, so a run is not throttled one
 * mark at a time. Each is rebuilt the way Iconify's single-icon endpoint serves it.
 */
const fetchSvgLogos = async (names: readonly string[]): Promise<ReadonlyMap<string, string>> => {
	const answer = await fetchWithin(
		`https://api.iconify.design/logos.json?icons=${names.map(encodeURIComponent).join(',')}`
	);
	if (!answer.ok) throw new Error(`SVG Logos answered ${answer.status}; record again later.`);
	const set = iconifySetSchema.parse(await answer.json());
	return new Map(
		Object.entries(set.icons).map(([name, icon]) => {
			const box = [
				icon.left ?? 0,
				icon.top ?? 0,
				icon.width ?? set.width ?? 16,
				icon.height ?? set.height ?? 16
			];
			const xlink = icon.body.includes('xlink:')
				? ' xmlns:xlink="http://www.w3.org/1999/xlink"'
				: '';
			// Iconify keeps the height at 1em and scales the width to the box, rounded up to two places.
			const width = Math.ceil((box[2]! / box[3]!) * 100) / 100;
			return [
				name,
				`<svg xmlns="http://www.w3.org/2000/svg"${xlink} width="${width}em" height="1em" viewBox="${box.join(' ')}">${icon.body}</svg>`
			];
		})
	);
};

const svgLogo = (marks: ReadonlyMap<string, string>, name: string): Logo | string => {
	const svg = marks.get(name);
	if (svg === undefined) return `SVG Logos has no ${name}`;
	const aspect = aspectOf(svg);
	if (unsafe.test(svg)) return `SVG Logos ${name} is not a plain drawing`;
	if (aspect === undefined || aspect > MAX_ASPECT)
		return `SVG Logos ${name} is too wide for a tile`;
	return {
		extension: 'svg',
		bytes: new TextEncoder().encode(`${svg}\n`),
		source: `SVG Logos ${name}`
	};
};

const publishedLogo = async (url: string, label: string): Promise<Logo | undefined> => {
	const answer = await fetchWithin(url).catch(() => undefined);
	if (!answer?.ok) return undefined;
	const fetched = await boundedBytes(answer);
	if (!fetched) return undefined;
	const bytes = pngFromIco(fetched) ?? fetched;
	const extension = sniff(bytes);
	if (!extension) return undefined;
	if (extension === 'svg' && unsafe.test(new TextDecoder().decode(bytes))) return undefined;
	// A raster too small for the tile would blur; an SVG scales.
	if (extension !== 'svg' && (rasterSize(bytes) ?? MIN_RASTER_PX) < MIN_RASTER_PX) return undefined;
	return { extension, bytes, source: `${label} ${url}` };
};

/**
 * The icons a vendor's home page links, largest first: an SVG, then rasters by
 * their declared size, then the conventional touch-icon path.
 */
const siteLogo = async (site: string): Promise<Logo | undefined> => {
	const page = await fetchWithin(site).catch(() => undefined);
	const html = page?.ok ? await page.text() : '';
	const base = page?.url || site;
	const linked = [...html.matchAll(/<link\b[^>]*>/gi)]
		.map((match) => match[0])
		.filter((tag) => /rel=["'][^"']*\bicon\b[^"']*["']|rel=["'][^"']*apple-touch-icon/i.test(tag))
		// A mask icon is a one-colour silhouette for pinned tabs, not the vendor's logo.
		.filter((tag) => !/rel=["'][^"']*mask-icon/i.test(tag))
		.flatMap((tag) => {
			const href = /href=["']([^"']+)["']/i.exec(tag)?.[1]?.replaceAll('&amp;', '&');
			if (!href) return [];
			const svg = /image\/svg\+xml|\.svg(?:[?#]|$)/i.test(tag);
			const size = Number(/sizes=["'](\d+)x\d+["']/i.exec(tag)?.[1] ?? 0);
			return [{ url: new URL(href, base).href, rank: svg ? Infinity : size }];
		})
		.sort((left, right) => right.rank - left.rank)
		.map((candidate) => candidate.url);
	for (const candidate of [...new Set([...linked, new URL('/apple-touch-icon.png', base).href])]) {
		const logo = await publishedLogo(candidate, 'site icon');
		if (logo) return logo;
	}
	return undefined;
};

const logoFor = async (
	source: CatalogSource,
	located: { readonly icons: readonly string[]; readonly site: string },
	marks: ReadonlyMap<string, string>,
	tried: string[]
): Promise<Logo | undefined> => {
	if (source.logo) {
		const mark = svgLogo(marks, source.logo);
		if (typeof mark !== 'string') return mark;
		tried.push(mark);
	}
	if (source.icon) {
		const published = await publishedLogo(source.icon, 'vendor icon');
		if (published) return published;
	}
	for (const icon of located.icons) {
		const logo = await publishedLogo(icon, 'registry icon');
		if (logo) return logo;
	}
	return siteLogo(located.site);
};

const record = async (
	source: CatalogSource,
	marks: ReadonlyMap<string, string>
): Promise<Recorded | { readonly failure: string }> => {
	const located = await locate(source);
	if (located.kind === 'failure') return { failure: `${source.id}: ${located.reason}` };
	const signIn = await probe(located.url);
	if (signIn.kind === 'failure') return { failure: `${source.id}: ${signIn.reason}` };
	if (signIn.value !== source.expect)
		return { failure: `${source.id}: signs in as ${signIn.value}, expected ${source.expect}` };
	const tried: string[] = [];
	const logo = await logoFor(source, located, marks, tried);
	if (!logo)
		return {
			failure: `${source.id}: no logo from SVG Logos, the registry or the site (${[...tried, 'no usable registry or site icon'].join('; ')})`
		};
	return { source, serverUrl: located.url, signIn: source.expect, logo };
};

const authentication = (signIn: CatalogSource['expect']) =>
	signIn === 'none' ? { kind: 'none' } : { kind: 'oauth', registration: signIn };

const writeCatalog = async (recorded: readonly Recorded[]) => {
	const entries = recorded.map(({ source, serverUrl, signIn, logo }) => ({
		id: source.id,
		title: source.title,
		description: source.description,
		category: source.category,
		serverUrl,
		authentication: authentication(signIn),
		logo: { file: `${source.id}.${logo.extension}`, source: logo.source },
		provenance:
			source.from.kind === 'registry'
				? { kind: 'registry', name: source.from.name }
				: { kind: 'documented', documentation: source.from.documentation }
	}));
	const text = [
		'// Generated by scripts/record-connector-catalog.ts from scripts/connector-catalog-sources.ts.',
		'// Do not edit by hand: change the sources and run `pnpm record:connector-catalog` (ADR 0051).',
		'',
		`export const CATALOG_RECORDED_ON = '${new Date().toISOString().slice(0, 10)}';`,
		'',
		`export const RECORDED_CATALOG = ${JSON.stringify(entries, null, '\t')} as const;`,
		''
	].join('\n');
	const options = await prettier.resolveConfig(catalogFile.pathname);
	await writeFile(
		catalogFile,
		await prettier.format(text, { ...options, filepath: catalogFile.pathname })
	);
	await rm(logoDirectory, { recursive: true, force: true });
	await mkdir(logoDirectory, { recursive: true });
	for (const { source, logo } of recorded)
		await writeFile(new URL(`${source.id}.${logo.extension}`, logoDirectory), logo.bytes);
};

/** Records in small batches: a vendor's endpoint is not the place to test our concurrency. */
const recordAll = async () => {
	const marks = await fetchSvgLogos(
		CATALOG_SOURCES.flatMap((source) => (source.logo ? [source.logo] : []))
	);
	const results: (Recorded | { readonly failure: string })[] = [];
	for (let index = 0; index < CATALOG_SOURCES.length; index += 6)
		results.push(
			...(await Promise.all(
				CATALOG_SOURCES.slice(index, index + 6).map((source) => record(source, marks))
			))
		);
	const failures = results.flatMap((result) => ('failure' in result ? [result.failure] : []));
	const recorded = results.flatMap((result) => ('failure' in result ? [] : [result]));
	for (const entry of recorded)
		process.stdout.write(
			`${entry.source.id.padEnd(16)} ${entry.signIn.padEnd(14)} ${entry.logo.source}\n`
		);
	if (failures.length > 0) {
		process.stderr.write(`\nNot recorded; fix or remove these sources:\n${failures.join('\n')}\n`);
		process.exitCode = 1;
		return;
	}
	await writeCatalog(recorded);
	process.stdout.write(`\nRecorded ${recorded.length} connectors.\n`);
};

const check = async () => {
	const files = new Set(await readdir(logoDirectory));
	const recorded = new Set<string>(RECORDED_CATALOG.map((entry) => entry.id));
	const problems: string[] = [];
	for (const source of CATALOG_SOURCES)
		if (!recorded.has(source.id)) problems.push(`${source.id} is a source but was never recorded.`);
	for (const entry of RECORDED_CATALOG) {
		if (!CATALOG_SOURCES.some((source) => source.id === entry.id))
			problems.push(`${entry.id} is recorded but no longer a source.`);
		if (!files.has(entry.logo.file)) {
			problems.push(`${entry.id} has no logo file ${entry.logo.file}.`);
			continue;
		}
		const bytes = new Uint8Array(await readFile(new URL(entry.logo.file, logoDirectory)));
		const extension = sniff(bytes);
		if (`${entry.id}.${extension}` !== entry.logo.file)
			problems.push(`${entry.logo.file} does not hold the image its name says.`);
		if (extension === 'svg' && unsafe.test(new TextDecoder().decode(bytes)))
			problems.push(`${entry.logo.file} holds more than a drawing.`);
	}
	const known = new Set<string>(RECORDED_CATALOG.map((entry) => entry.logo.file));
	for (const file of files) if (!known.has(file)) problems.push(`${file} belongs to no entry.`);
	if (problems.length > 0) {
		process.stderr.write(`${problems.join('\n')}\nRe-run with --record.\n`);
		process.exitCode = 1;
	} else process.stdout.write(`All ${RECORDED_CATALOG.length} catalog connectors are recorded.\n`);
};

await (process.argv.includes('--record') ? recordAll() : check());
