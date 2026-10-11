import { randomUUID } from 'node:crypto';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { ExtractedTemplateStyles, TemplateId } from '$lib/models/deliverables';
import type { ProjectId, ProjectTemplate, TemplateUpload } from '$lib/models/projects';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { TemplateRepository } from '$lib/server/repositories/deliverables';

export interface TemplateUploadRequest {
	projectId: ProjectId;
	name: string;
	mediaType: string;
	byteSize: number;
	checksumSha256: string;
}
export interface TemplateUploadLifecycle {
	reserveUpload(input: TemplateUploadRequest): Promise<TemplateUpload>;
	upload(id: TemplateId): Promise<TemplateUpload>;
	lockUpload(id: TemplateId): Promise<TemplateUpload | undefined>;
	finishUpload(id: TemplateId): Promise<void>;
}
export interface TemplateReader {
	find(id: TemplateId): Promise<ProjectTemplate | undefined>;
	styles(id: TemplateId, projectId: ProjectId): Promise<ExtractedTemplateStyles>;
	list(projectId: ProjectId): Promise<readonly ProjectTemplate[]>;
}
export interface TemplateWriter {
	store(
		upload: TemplateUpload,
		objectKey: string,
		extractedStyles: ExtractedTemplateStyles
	): Promise<ProjectTemplate>;
}
export interface TemplateLifecycle {
	delete(id: TemplateId): Promise<void>;
}

/** Everything the deliverables controller does with stored templates. */
export interface TemplateStore
	extends TemplateUploadLifecycle, TemplateReader, TemplateWriter, TemplateLifecycle {}

export class TemplateLibrary implements TemplateStore {
	constructor(
		private readonly actor: ActorContext,
		private readonly repository: TemplateRepository,
		private readonly now: () => DateTime = () => new Date().toISOString() as DateTime
	) {}
	async reserveUpload(input: TemplateUploadRequest): Promise<TemplateUpload> {
		if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1)
			throw new ValidationError('Template must be at least 1 byte');
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Template checksum must be a SHA-256 hex digest');
		const id = randomUUID() as TemplateId;
		return this.repository.insertUpload({
			...input,
			id,
			userId: this.actor.userId,
			objectKey: `staging/${this.actor.userId}/templates/${id}`,
			checksumSha256: input.checksumSha256.toLowerCase(),
			createdAt: this.now()
		});
	}
	async upload(id: TemplateId): Promise<TemplateUpload> {
		const upload = await this.repository.findUpload(id);
		if (!upload) throw new NotFoundError('Template upload not found. Upload the file again.');
		return upload;
	}
	lockUpload(id: TemplateId) {
		return this.repository.findUploadForUpdate(id);
	}
	finishUpload(id: TemplateId) {
		return this.repository.deleteUpload(id);
	}
	find(id: TemplateId) {
		return this.repository.findById(id);
	}
	async styles(id: TemplateId, projectId: ProjectId): Promise<ExtractedTemplateStyles> {
		const template = await this.repository.findById(id);
		if (!template) throw new NotFoundError('The selected template is unavailable or not ready');
		if (template.projectId !== projectId)
			throw new ValidationError('The selected template belongs to another project');
		return template.extractedStyles;
	}
	list(projectId: ProjectId) {
		return this.repository.listByProject(projectId);
	}
	store(upload: TemplateUpload, objectKey: string, extractedStyles: ExtractedTemplateStyles) {
		return this.repository.insert({
			id: upload.id,
			userId: this.actor.userId,
			projectId: upload.projectId,
			name: upload.name,
			mediaType: upload.mediaType,
			byteSize: upload.byteSize,
			objectKey,
			extractedStyles,
			isDefault: false,
			createdAt: upload.createdAt,
			updatedAt: this.now()
		});
	}
	async delete(id: TemplateId): Promise<void> {
		if (!(await this.repository.findById(id))) throw new NotFoundError('Template not found');
		await this.repository.delete(id);
	}
}
