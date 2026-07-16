import type {
	ActorContext,
	ExtractedTemplateStyles,
	ProjectId,
	ProjectTemplate,
	TemplateId
} from '$lib/models';

export interface TemplateUploader {
	initiateUpload(
		actor: ActorContext,
		input: { projectId: ProjectId; name: string; mediaType: string; byteSize: number; checksumSha256: string }
	): Promise<{ templateId: TemplateId; uploadUrl: string; requiredHeaders: Record<string, string> }>;
	completeUpload(actor: ActorContext, templateId: TemplateId): Promise<ProjectTemplate>;
}

export interface TemplateLister {
	list(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
}

export interface TemplateDeleter {
	delete(actor: ActorContext, templateId: TemplateId): Promise<void>;
}

export interface TemplateStyleExtractor {
	extractStyles(actor: ActorContext, templateId: TemplateId): Promise<ExtractedTemplateStyles>;
}
