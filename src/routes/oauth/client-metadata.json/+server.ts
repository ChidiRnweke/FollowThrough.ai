import { json, type RequestHandler } from '@sveltejs/kit';
import { connectorCallbackPath, connectorClientRegistration } from '$lib/models/connectors';

/**
 * FollowThrough's OAuth client ID metadata document. An authorization server
 * that supports these documents fetches this URL, which is also the client id,
 * instead of asking FollowThrough to register (ADR 0049). Public by design.
 */
export const GET: RequestHandler = ({ url }) =>
	json(
		{
			client_id: new URL(url.pathname, url.origin).href,
			...connectorClientRegistration(
				new URL('/', url.origin).href,
				new URL(connectorCallbackPath, url.origin).href
			)
		},
		{ headers: { 'cache-control': 'public, max-age=3600' } }
	);
