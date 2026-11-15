import { expect, it } from 'vitest';
import { readBoundedText } from './bounded-body';

/** A body that arrives in the given chunks, recording how far the reader pulled it. */
const streamed = (chunks: readonly Uint8Array[], headers: Record<string, string> = {}) => {
	const seen = { pulled: 0, cancelled: false };
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks[seen.pulled];
			seen.pulled += 1;
			if (chunk) controller.enqueue(chunk);
			else controller.close();
		},
		cancel() {
			seen.cancelled = true;
		}
	});
	// Node requires `duplex` for a streamed request body; the DOM typings do not name it.
	const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, headers, duplex: 'half' };
	const request = new Request('http://localhost/api', init);
	return { request, seen };
};

const bytes = (text: string) => new TextEncoder().encode(text);

it('returns a body that fills the limit exactly, across chunks', async () => {
	const { request } = streamed([bytes('{"a"'), bytes(':1}')]);
	expect(await readBoundedText(request, 7)).toEqual({ kind: 'text', text: '{"a":1}' });
});

it('decodes a character whose bytes are split between chunks', async () => {
	const euro = bytes('€');
	const { request } = streamed([euro.slice(0, 1), euro.slice(1)]);
	expect(await readBoundedText(request, 3)).toEqual({ kind: 'text', text: '€' });
});

it('refuses a body one byte past the limit and stops reading it, whatever its declared length', async () => {
	const { request, seen } = streamed([bytes('1234'), bytes('5678'), bytes('never read')], {
		'content-length': '4'
	});
	const read = await readBoundedText(request, 7);
	expect({ read, seen }).toEqual({
		read: { kind: 'failure', reason: 'too_large' },
		seen: { pulled: 2, cancelled: true }
	});
});

it('reports a body whose stream fails part-way as interrupted, not as an error', async () => {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(bytes('{"message"'));
			controller.error(new Error('the client went away'));
		}
	});
	const init: RequestInit & { duplex: 'half' } = { method: 'POST', body, duplex: 'half' };
	expect(await readBoundedText(new Request('http://localhost/api', init), 1024)).toEqual({
		kind: 'failure',
		reason: 'interrupted'
	});
});
