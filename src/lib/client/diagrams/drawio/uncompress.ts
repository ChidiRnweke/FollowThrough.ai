/**
 * Undo draw.io's own compression of a `<diagram>` body.
 *
 * The embed serializes each diagram as base64 of raw-deflated, URI-encoded XML
 * unless it is told otherwise, and the server refuses to store an opaque blob it
 * cannot validate — so every save failed with "Each draw.io diagram requires one
 * uncompressed mxGraphModel". `compressed=0` on the embed URL is the real fix;
 * this is the guarantee that a payload the server cannot read never leaves the
 * browser, whatever a future embed build decides to send.
 *
 * `DecompressionStream` is a platform API, so this costs no dependency. The
 * transform is exactly draw.io's `Graph.decompress`: base64 → inflateRaw →
 * `decodeURIComponent`.
 */

/** Matches one `<diagram …>body</diagram>` element, capturing its body. */
const DIAGRAM_BODY = /(<diagram\b[^>]*>)([\s\S]*?)(<\/diagram>)/gi;

const isXml = (body: string): boolean => body.trimStart().startsWith('<');

const inflateRaw = async (bytes: Uint8Array): Promise<string> => {
	const stream = new Blob([bytes as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'));
	return new Response(stream).text();
};

/**
 * An inflated body, or the news that this one is not inflatable.
 *
 * A value rather than a throw, because the caller's answer to "this will not
 * inflate" is to keep what it already had — which it cannot do from inside a
 * rejected promise. `atob` throws on anything that is not base64, and
 * `DecompressionStream` throws on bytes that are not a deflate stream; both used
 * to escape `uncompressDrawioXml` and fail the save with a decode error, in
 * place of the server message that actually says what is wrong with the payload.
 */
type Inflated = { readonly kind: 'inflated'; readonly body: string } | { readonly kind: 'corrupt' };

const decompressBody = async (body: string): Promise<Inflated> => {
	try {
		const binary = atob(body.trim());
		const inflated = await inflateRaw(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
		return { kind: 'inflated', body: decodeURIComponent(inflated) };
	} catch {
		return { kind: 'corrupt' };
	}
};

/**
 * Returns `xml` with every compressed diagram body inflated in place.
 *
 * A body that is already XML is left exactly as it was, so this is a no-op on the
 * output of an embed that honoured `compressed=0`. A body that cannot be inflated
 * is left alone too: the server's validator is what reports it, and it says more
 * about the payload than a decode error here could.
 */
export async function uncompressDrawioXml(xml: string): Promise<string> {
	const matches = Array.from(xml.matchAll(DIAGRAM_BODY));
	if (matches.length === 0 || matches.every((match) => isXml(match[2]!))) return xml;
	const bodies = await Promise.all(
		matches.map(async (match) => {
			const body = match[2]!;
			if (isXml(body) || !body.trim()) return body;
			const inflated = await decompressBody(body);
			// Untouched, so the server's validator is what reports it — it can say what
			// is wrong with the payload, and a decode error here cannot.
			return inflated.kind === 'inflated' ? inflated.body : body;
		})
	);
	let index = 0;
	return xml.replace(DIAGRAM_BODY, (_full, open: string, _body: string, close: string) => {
		const replacement = bodies[index]!;
		index += 1;
		return `${open}${replacement}${close}`;
	});
}
