import { ProjectChoiceRequiredError } from '$lib/errors';
import type { Project } from '$lib/models/projects';
export interface ProjectChoiceRules {
	/** Fails an operation that needs a project, naming every project the caller can choose. */
	requireChoice(projects: readonly Project[], action: string): never;
}
export class ProjectChoiceService implements ProjectChoiceRules {
	requireChoice(projects: readonly Project[], action: string): never {
		// One project is still a choice: picking it silently would write somewhere the caller never named.
		throw new ProjectChoiceRequiredError(
			action,
			projects.map((project) => ({ id: project.id, name: project.name }))
		);
	}
}
