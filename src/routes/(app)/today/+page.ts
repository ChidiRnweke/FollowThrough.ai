import { todayLocalDate } from '$lib/client/todos/local-date';
import type { PageLoad } from './$types';
export const load: PageLoad = async ({ parent }) => {
	const { session } = await parent();
	await session.resources.prepare(['todos', 'source_anchors', 'provenance', 'suggestions']);
	const inbox = session.resources.views.projects.find((project) => project.role === 'inbox');
	if (!inbox) throw new Error('This workspace has no inbox; provisioning did not run.');
	return { today: todayLocalDate(), inboxProjectId: inbox.id };
};
