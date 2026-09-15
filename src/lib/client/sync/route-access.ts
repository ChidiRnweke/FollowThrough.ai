import { error } from '@sveltejs/kit';
import type { z } from 'zod';
import { accessMessage, type CacheAccess } from '$lib/models/sync';

export const routeResourceId = <T>(schema: z.ZodType<T>, value: string): T => {
	const parsed = schema.safeParse(value);
	if (!parsed.success) error(404, 'Item not found');
	return parsed.data;
};

export const requireRouteResource = <T>(
	access: CacheAccess<T>,
	online: boolean,
	name: string
): T => {
	if (access.kind === 'ready') return access.value;
	if (access.kind === 'unavailable' && online) error(404, `This ${name} was not found`);
	error(access.kind === 'deleted' ? 410 : 503, accessMessage(access, name));
};
