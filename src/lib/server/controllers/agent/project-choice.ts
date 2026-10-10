import { ValidationError } from '$lib/errors';
import type { ActorContext } from '$lib/models/identity';
import type { ProjectsController } from '../projects/controller';
export interface AgentProjectChoice {
	requireChoice(actor: ActorContext, action: string): Promise<never>;
}
export class AgentProjectChoices implements AgentProjectChoice {
	constructor(private readonly projects: Pick<ProjectsController, 'list'>) {}
	async requireChoice(actor: ActorContext, action: string): Promise<never> {
		const { projects } = await this.projects.list(actor);
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
