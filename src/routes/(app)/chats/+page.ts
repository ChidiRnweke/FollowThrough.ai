import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	await session.resources.prepare(['conversations']);
	const query = url.searchParams.get('q')?.trim() ?? '';
	const requested = Number(url.searchParams.get('page') ?? '1');
	return { query, page: Number.isSafeInteger(requested) && requested > 0 ? requested : 1 };
};
