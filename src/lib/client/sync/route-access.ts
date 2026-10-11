import { error, isHttpError, isRedirect } from '@sveltejs/kit';
import type { z } from 'zod';
import { type CacheAccess } from '$lib/models/sync';
import type { WorkspacePresentationController } from '$lib/controllers/workspace/presentation';

export const routeResourceId = <T>(schema: z.ZodType<T>, value: string): T => {
	const parsed = schema.safeParse(value);
	if (!parsed.success) error(404, 'Item not found');
	return parsed.data;
};

export const requireRouteResource = <T>(
	presentation: WorkspacePresentationController,
	access: CacheAccess<T>,
	online: boolean,
	name: string
): T => {
	if (access.kind === 'ready') return access.value;
	if (access.kind === 'unavailable' && online) error(404, `This ${name} was not found`);
	error(access.kind === 'deleted' ? 410 : 503, presentation.accessMessage(access, name));
};

export type RouteReadiness =
	| { kind: 'ready' }
	| { kind: 'redirect'; location: string }
	| { kind: 'failure'; status: number; message: string };

/** Handle failures immediately even when the outlet has not mounted yet. */
export async function prepareRoute(work: () => Promise<void>): Promise<RouteReadiness> {
	try {
		await work();
		return { kind: 'ready' };
	} catch (cause) {
		if (isRedirect(cause)) return { kind: 'redirect', location: cause.location };
		return {
			kind: 'failure',
			status: isHttpError(cause) ? cause.status : 503,
			message: isHttpError(cause)
				? cause.body.message
				: cause instanceof Error
					? cause.message
					: 'This screen could not be loaded'
		};
	}
}
