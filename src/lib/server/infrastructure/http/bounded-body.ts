/** A request body read in full, or why it was not: it ran past its limit, or its stream failed. */
export type BoundedBody =
	| { readonly kind: 'text'; readonly text: string }
	| { readonly kind: 'failure'; readonly reason: 'too_large' | 'interrupted' };

/**
 * Reads a request body as UTF-8 text and counts its bytes as they arrive. `Content-Length` is
 * not consulted, because a client can declare one length and send another. At the first byte
 * over `maxBytes` the stream is cancelled, so the rest of the body is never read or buffered.
 * A stream that fails part-way, such as a client that aborts its request, is `interrupted`.
 */
export const readBoundedText = async (request: Request, maxBytes: number): Promise<BoundedBody> => {
	if (request.body === null) return { kind: 'text', text: '' };
	const reader = request.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	for (;;) {
		let chunk: ReadableStreamReadResult<Uint8Array>;
		try {
			chunk = await reader.read();
		} catch {
			return { kind: 'failure', reason: 'interrupted' };
		}
		const { done, value } = chunk;
		if (done) break;
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel();
			return { kind: 'failure', reason: 'too_large' };
		}
		text += decoder.decode(value, { stream: true });
	}
	return { kind: 'text', text: text + decoder.decode() };
};
