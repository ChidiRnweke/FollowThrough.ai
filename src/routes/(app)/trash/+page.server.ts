import { AppFactory } from '$lib/server/factories/app-factory';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const controllers = AppFactory.controllers();
	const actor = AppFactory.actor(locals);
	// Notes and diagrams are the two things that can be trashed, and they land in
	// one list. Project names are resolved here rather than per row: the diagram
	// rows need them too, and a diagram carries a project id and no name.
	const [notes, diagrams, projects] = await Promise.all([
		controllers.notes().listTrash(actor, {}),
		controllers.diagramStudio().listTrashedProjectDiagrams(actor, {}),
		controllers.projects().list(actor)
	]);
	const projectNames = new Map(projects.projects.map((project) => [project.id, project.name]));
	return {
		trashedNotes: notes.notes,
		trashedDiagrams: diagrams.map((diagram) => ({
			diagram,
			projectName: projectNames.get(diagram.projectId) ?? 'Unknown project'
		}))
	};
};
