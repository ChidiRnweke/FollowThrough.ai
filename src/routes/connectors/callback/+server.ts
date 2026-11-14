import { redirect, type RequestHandler } from '@sveltejs/kit';
import { DomainError } from '$lib/errors';
import { authorizationCallbackSchema } from '$lib/models/connectors';
import { AppFactory } from '$lib/server/factories/app-factory';

const settings = (parameters: Record<string, string>) =>
	`/settings?${new URLSearchParams({ tab: 'connectors', ...parameters })}`;

/**
 * Where an authorization server sends the browser back after a connector
 * sign-in. A failure the user can act on returns to the Connectors settings
 * with its message; anything else is a server error.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const callback = authorizationCallbackSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!callback.success)
		redirect(
			303,
			settings({ connectorError: 'The sign-in answer was incomplete. Connect again.' })
		);
	let connectorId: string;
	try {
		connectorId = await AppFactory.forActor(AppFactory.actor(locals))
			.connectors()
			.completeAuthorization(callback.data);
	} catch (error) {
		if (error instanceof DomainError) redirect(303, settings({ connectorError: error.message }));
		throw error;
	}
	redirect(303, settings({ connector: connectorId }));
};
