import { createHash } from 'node:crypto';
import type { ConnectorIcon, ServerIcon } from '$lib/models/connectors';
import type { FetchLike } from '$lib/server/infrastructure/network/outbound';

/**
 * 16 times the largest icon a registry server published when this was written
 * (Linear's 256 px PNG, 16,055 bytes, on 2026-11-14). An icon is a tile, so a
 * larger one is not an icon this page needs.
 */
const MAX_ICON_BYTES = 256 * 1024;

export type IconFetch =
	| { readonly kind: 'icon'; readonly icon: ConnectorIcon }
	/** The server published no icon this app accepts; the connector shows a monogram. */
	| { readonly kind: 'none'; readonly reason: string };

export interface ConnectorIconFetching {
	/** The first acceptable icon the server published, fetched and identified by its bytes. */
	fetch(serverUrl: string, icons: readonly ServerIcon[]): Promise<IconFetch>;
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[]) =>
	prefix.every((byte, index) => bytes[index] === byte);

/** The media type from the bytes themselves; a declared type is only a hint (MCP 2025-11-25). */
const sniff = (bytes: Uint8Array): ConnectorIcon['mediaType'] | undefined => {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	if (
		startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
		new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP'
	)
		return 'image/webp';
	const head = new TextDecoder().decode(bytes.subarray(0, 512)).trimStart();
	if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(head)) return 'image/svg+xml';
	return undefined;
};

/**
 * Fetches a custom server's own icon (ADR 0049). The specification's
 * precautions apply: only HTTPS from the server's origin or a `data:` URI, no
 * credentials, a size bound, and a type read from the bytes. The bytes are
 * served back from this origin with a sandboxing policy, so an SVG cannot run.
 */
export class ConnectorIcons implements ConnectorIconFetching {
	constructor(private readonly outbound: FetchLike) {}

	async fetch(serverUrl: string, icons: readonly ServerIcon[]): Promise<IconFetch> {
		const origin = new URL(serverUrl).origin;
		// The connector tile is light in both themes, so an icon drawn for a light background wins.
		const ordered = [...icons].sort(
			(left, right) => Number(left.theme === 'dark') - Number(right.theme === 'dark')
		);
		for (const icon of ordered) {
			const bytes = await this.bytes(icon.src, origin);
			if (bytes.kind === 'failure') continue;
			const mediaType = sniff(bytes.value);
			if (!mediaType) continue;
			return {
				kind: 'icon',
				icon: {
					mediaType,
					bytes: bytes.value,
					checksum: createHash('sha256').update(bytes.value).digest('hex')
				}
			};
		}
		return {
			kind: 'none',
			reason:
				icons.length === 0
					? 'The server publishes no icon.'
					: 'None of the server’s icons is an image from its own origin within the size limit.'
		};
	}

	private async bytes(
		src: string,
		origin: string
	): Promise<
		{ readonly kind: 'bytes'; readonly value: Uint8Array } | { readonly kind: 'failure' }
	> {
		if (src.startsWith('data:')) {
			const match = /^data:[^;,]*(;base64)?,(.*)$/s.exec(src);
			if (!match) return { kind: 'failure' };
			const value = match[1]
				? new Uint8Array(Buffer.from(match[2]!, 'base64'))
				: new TextEncoder().encode(decodeURIComponent(match[2]!));
			return value.byteLength <= MAX_ICON_BYTES ? { kind: 'bytes', value } : { kind: 'failure' };
		}
		const url = URL.canParse(src) ? new URL(src) : undefined;
		if (!url || url.protocol !== 'https:' || url.origin !== origin) return { kind: 'failure' };
		try {
			const response = await this.outbound(url, { credentials: 'omit' });
			if (!response.ok || !response.body) return { kind: 'failure' };
			return await bounded(response.body);
			// An icon is the connector's face, not its function: one that cannot be fetched is skipped for the next.
		} catch {
			return { kind: 'failure' };
		}
	}
}

/** Reads at most MAX_ICON_BYTES and stops the stream at the first byte over. */
const bounded = async (
	body: ReadableStream<Uint8Array>
): Promise<
	{ readonly kind: 'bytes'; readonly value: Uint8Array } | { readonly kind: 'failure' }
> => {
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > MAX_ICON_BYTES) {
			await reader.cancel();
			return { kind: 'failure' };
		}
		chunks.push(value);
	}
	const value = new Uint8Array(size);
	let offset = 0;
	for (const chunk of chunks) {
		value.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return { kind: 'bytes', value };
};
