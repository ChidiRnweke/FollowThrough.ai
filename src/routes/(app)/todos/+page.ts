import { readTodoListFilter } from '$lib/client/todos/list-filter';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, url }) => {
	const filter = readTodoListFilter(url.searchParams);
	const { session } = await parent();
	await session.resources.prepare(['todos', 'source_anchors', 'provenance']);
	return { filter, view: url.searchParams.get('view') ?? 'board' };
};
