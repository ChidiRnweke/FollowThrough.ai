import type { NoteId } from '$lib/models';
import { AppFactory } from '$lib/server/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	const factory = AppFactory.controllerFactory();
	const noteId = params.id as NoteId;
	const [view, versions, raw, attachments, projectsOutput] = await Promise.all([
		factory.skills().get(AppFactory.actor(locals), { noteId }),
		factory.skills().listVersions(AppFactory.actor(locals), { noteId }),
		factory.skills().serialize(AppFactory.actor(locals), { noteId }),
		factory.attachments().list(AppFactory.actor(locals), noteId),
		factory.projects().list(AppFactory.actor(locals))
	]);
	const projectSkills = await Promise.all(
		projectsOutput.projects.map(async (project) => ({
			project,
			skills: (await factory.skills().list(AppFactory.actor(locals), { projectId: project.id }))
				.skills
		}))
	);
	return {
		view,
		versions,
		raw,
		attachments,
		projectPins: projectSkills.map(({ project, skills }) => ({
			project,
			pinned: skills.some((skill) => skill.noteId === noteId && skill.isPinned)
		}))
	};
};
