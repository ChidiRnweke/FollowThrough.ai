import { todayLocalDate } from '$lib/client/todos/local-date';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent }) => {
	const { session } = await parent();
	await session.resources.prepare();

	return { today: todayLocalDate() };
};
