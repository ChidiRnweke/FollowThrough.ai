import { DomainError } from '$lib/models';

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
				const failure =
					error instanceof DomainError
						? { code: error.code, message: error.message, details: error.details }
						: { code: 'INTERNAL', message: 'The stream failed unexpectedly' };
				controller.enqueue(
					encoder.encode(`${JSON.stringify({ type: 'failed', ...failure, retryable: false })}\n`)
				);
				controller.close();
			}
		}
	});
	return new Response(stream, {
		headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' }
	});
}
