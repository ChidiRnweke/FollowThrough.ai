import type { ActorContext, ProjectId, ProjectTemplate, TemplateId } from '$lib/models';

export interface TemplateRepository {
	insert(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate>;
	findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined>;
	listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	update(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate>;
	delete(actor: ActorContext, id: TemplateId): Promise<void>;
}
