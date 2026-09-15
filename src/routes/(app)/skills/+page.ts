import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent }) => {
	const { session } = await parent();
	await session.resources.prepare();
	const inbox = session.resources.views.projects.find((project) => project.role === 'inbox');
	if (!inbox) throw new Error('The inbox is not available on this device');
	return { inboxProjectId: inbox.id };
};
