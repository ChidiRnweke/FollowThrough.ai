import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 25;

export const load: PageServerLoad = async ({ url, locals }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requestedPage = Number(url.searchParams.get('page') ?? '1');
	const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const items = await AppFactory.controllers()
		.agent()
		.listSessions(AppFactory.actor(locals), {
			query: query || undefined,
			offset: (page - 1) * PAGE_SIZE,
			limit: PAGE_SIZE + 1
		});
	return { query, page, sessions: items.slice(0, PAGE_SIZE), hasNext: items.length > PAGE_SIZE };
};
