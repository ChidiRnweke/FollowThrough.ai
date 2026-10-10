import { ValidationError } from '$lib/errors';
import type { Project } from '$lib/models/projects';
export interface AgentProjectChoiceRules {
	requireChoice(projects: readonly Project[], action: string): never;
}
export class AgentProjectChoiceService implements AgentProjectChoiceRules {
	requireChoice(projects: readonly Project[], action: string): never {
		if (!projects.length)
			throw new ValidationError(
				`projectId is required to ${action}, and this workspace has no projects yet. Call create_project first, then retry with its id.`
			);
		const candidates = projects.map((project) => `${project.name} (${project.id})`).join(', ');
		throw new ValidationError(
			`projectId is required to ${action}. Retry naming one of these projects: ${candidates}.`
		);
	}
}
