import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent }) => {
	const { session } = await parent();
	await session.resources.prepare(['notes', 'projects', 'diagrams']);
};
