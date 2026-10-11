import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import type { TemplateId } from '$lib/models/deliverables';

/** Uploaded DOCX/PDF templates a project can generate documents from, with their extracted styles cached on the row so re-parsing isn't needed on every export. */
export interface TemplateRepository {
	insertUpload(upload: TemplateUpload): Promise<TemplateUpload>;
	findUpload(id: TemplateId): Promise<TemplateUpload | undefined>;
	findUploadForUpdate(id: TemplateId): Promise<TemplateUpload | undefined>;
	deleteUpload(id: TemplateId): Promise<void>;
	insert(template: ProjectTemplate): Promise<ProjectTemplate>;
	findById(id: TemplateId): Promise<ProjectTemplate | undefined>;
	listByProject(projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
	update(template: ProjectTemplate): Promise<ProjectTemplate>;
	delete(id: TemplateId): Promise<void>;
}
