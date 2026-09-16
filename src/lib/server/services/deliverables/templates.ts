import { randomUUID } from 'node:crypto';
import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type { ExtractedTemplateStyles, TemplateId } from '$lib/models/deliverables';
import type { ProjectId, TemplateUpload } from '$lib/models/projects';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { TemplateRepository } from '$lib/server/repositories/deliverables';

export class DocumentTemplates {
	constructor(
		private readonly repository: TemplateRepository,
		private readonly now: () => DateTime = () => new Date().toISOString() as DateTime
	) {}

	async reserveUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	): Promise<TemplateUpload> {
		if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1)
			throw new ValidationError('Template must be at least 1 byte');
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Template checksum must be a SHA-256 hex digest');
		const id = randomUUID() as TemplateId;
		return this.repository.insertUpload(actor, {
			...input,
			id,
			userId: actor.userId,
			objectKey: `staging/${actor.userId}/templates/${id}`,
			checksumSha256: input.checksumSha256.toLowerCase(),
			createdAt: this.now()
		});
	}

	async upload(actor: ActorContext, id: TemplateId): Promise<TemplateUpload> {
		const upload = await this.repository.findUpload(actor, id);
		if (!upload) throw new NotFoundError('Template upload not found. Upload the file again.');
		return upload;
	}
	lockUpload(actor: ActorContext, id: TemplateId) {
		return this.repository.findUploadForUpdate(actor, id);
	}
	finishUpload(actor: ActorContext, id: TemplateId) {
		return this.repository.deleteUpload(actor, id);
	}
	find(actor: ActorContext, id: TemplateId) {
		return this.repository.findById(actor, id);
	}
	async styles(
		actor: ActorContext,
		id: TemplateId,
		projectId: ProjectId
	): Promise<ExtractedTemplateStyles> {
		const template = await this.repository.findById(actor, id);
		if (!template) throw new NotFoundError('The selected template is unavailable or not ready');
		if (template.projectId !== projectId)
			throw new ValidationError('The selected template belongs to another project');
		return template.extractedStyles;
	}
	list(actor: ActorContext, projectId: ProjectId) {
		return this.repository.listByProject(actor, projectId);
	}
	async delete(actor: ActorContext, id: TemplateId): Promise<void> {
		if (!(await this.repository.findById(actor, id))) throw new NotFoundError('Template not found');
		await this.repository.delete(actor, id);
	}
	store(
		actor: ActorContext,
		upload: TemplateUpload,
		objectKey: string,
		extractedStyles: ExtractedTemplateStyles
	) {
		return this.repository.insert(actor, {
			id: upload.id,
			userId: actor.userId,
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
}
