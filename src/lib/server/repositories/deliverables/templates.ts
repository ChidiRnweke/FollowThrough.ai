import type { ActorContext } from '$lib/models/identity';
import type { ProjectId, ProjectTemplate } from '$lib/models/projects';
import type { TemplateId } from '$lib/models/deliverables';

/** Uploaded DOCX/PDF templates a project can generate documents from, with their extracted styles cached on the row so re-parsing isn't needed on every export. */
export interface TemplateRepository {
	insert(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate>;
	findById(actor: ActorContext, id: TemplateId): Promise<ProjectTemplate | undefined>;
	listByProject(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	update(actor: ActorContext, template: ProjectTemplate): Promise<ProjectTemplate>;
	delete(actor: ActorContext, id: TemplateId): Promise<void>;
}
