import { AppFactory } from '$lib/server/factories/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const factory = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	const [output, projects] = await Promise.all([
		factory.skills().list(actor),
		factory.projects().list(actor)
	]);
	// A skill created from this page names no project, because the page shows
	// none. It sends the inbox rather than letting the server pick: the project
	// carries its role, so the destination is a fact the page can read.
	const inbox = projects.projects.find((project) => project.role === 'inbox');
	// Not optional downstream: provisioning creates the inbox before any page can
	// render, so its absence is a broken workspace and says so here rather than
	// arriving as an undefined project id at the moment someone saves.
	if (!inbox) throw new Error('This workspace has no inbox; provisioning did not run.');
	return { skills: output.skills, inboxProjectId: inbox.id };
};
