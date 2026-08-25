import { AppFactory } from '$lib/server/factories/app-factory';
import { todayLocalDate } from '$lib/client/todos/local-date';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [view, projects] = await Promise.all([
		factory.workspace().getTodayView(actor, { today: todayLocalDate() }),
		factory.projects().list(actor)
	]);
	// Quick capture names no project, so the page names one for it: the inbox,
	// found by role rather than by a name anyone can change.
	const inbox = projects.projects.find((project) => project.role === 'inbox');
	if (!inbox) throw new Error('This workspace has no inbox; provisioning did not run.');
	return { view, inboxProjectId: inbox.id };
};
