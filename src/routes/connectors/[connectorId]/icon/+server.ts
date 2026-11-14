import { error, type RequestHandler } from '@sveltejs/kit';
import { DomainError, DOMAIN_ERROR_STATUS } from '$lib/errors';
import { connectorIdSchema } from '$lib/models/connectors';
import { AppFactory } from '$lib/server/factories/app-factory';

/**
 * A custom connector's stored server icon (ADR 0049). The bytes came from a
 * third party, so the response may not run anything: a sandboxing policy with
 * no sources means an SVG opened directly is inert, and `nosniff` keeps the
 * browser on the type its bytes were identified as. The URL carries the
 * checksum, so a changed icon is a new URL and the old one can cache forever.
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	const id = connectorIdSchema.safeParse(params.connectorId);
	if (!id.success) error(404, 'Not found');
	try {
		const icon = await AppFactory.forActor(AppFactory.actor(locals)).connectors().icon(id.data);
		return new Response(Buffer.from(icon.bytes), {
			headers: {
				'content-type': icon.mediaType,
				'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
				'x-content-type-options': 'nosniff',
				'cache-control': 'private, max-age=31536000, immutable'
			}
		});
	} catch (failure) {
		if (failure instanceof DomainError) error(DOMAIN_ERROR_STATUS[failure.code], failure.message);
		throw failure;
	}
};
