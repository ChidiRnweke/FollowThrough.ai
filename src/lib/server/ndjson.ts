export function ndjsonResponse(iterable: AsyncIterable<unknown>): Response {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			try {
				for await (const item of iterable) {
					controller.enqueue(encoder.encode(`${JSON.stringify(item)}\n`));
				}
				controller.close();
			} catch (error) {
				controller.error(error);
			}
		}
	});
	return new Response(stream, {
		headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' }
	});
}
