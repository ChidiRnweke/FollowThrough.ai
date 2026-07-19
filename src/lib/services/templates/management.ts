import { randomUUID } from 'node:crypto';
import type { ActorContext, DateTime, ProjectId, ProjectTemplate, TemplateId } from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/models';
import type { TemplateRepository } from '$lib/repositories';
import type { AttachmentStorage } from '$lib/server/domain/attachment-storage';
import type { TransactionRunner } from '$lib/repositories/transaction';
import { extractTemplateStyles } from '$lib/server/domain/template-style-extractor';
import type {
	TemplateDeleter,
	TemplateLister,
	TemplateStyleExtractor,
	TemplateUploader
} from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;

export class TemplateManagementService
	implements TemplateUploader, TemplateLister, TemplateDeleter, TemplateStyleExtractor
{
	constructor(
		private readonly storage: AttachmentStorage,
		private readonly templateRepo: TemplateRepository,
		private readonly transactionRunner: TransactionRunner
	) {}

	async initiateUpload(
		actor: ActorContext,
		input: {
			projectId: ProjectId;
			name: string;
			mediaType: string;
			byteSize: number;
			checksumSha256: string;
		}
	): Promise<{
		templateId: TemplateId;
		uploadUrl: string;
		requiredHeaders: Record<string, string>;
	}> {
		if (!Number.isSafeInteger(input.byteSize) || input.byteSize < 1)
			throw new ValidationError('Template must be at least 1 byte');
		if (!/^[a-f0-9]{64}$/i.test(input.checksumSha256))
			throw new ValidationError('Template checksum must be a SHA-256 hex digest');

		const templateId = randomUUID() as TemplateId;
		const timestamp = now();
		const objectKey = `staging/${actor.userId}/templates/${templateId}`;

		const template: ProjectTemplate = {
			id: templateId,
			userId: actor.userId,
			projectId: input.projectId,
			name: input.name,
			objectKey,
			mediaType:
				input.mediaType ||
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			byteSize: input.byteSize,
			isDefault: false,
			createdAt: timestamp,
			updatedAt: timestamp
		};

		await this.transactionRunner.run(async () => {
			await this.templateRepo.insert(actor, template);
		});

		const uploadUrl = await this.storage.createUploadUrl({
			objectKey,
			mediaType: template.mediaType,
			byteSize: template.byteSize,
			checksumSha256: input.checksumSha256,
			expiresInSeconds: 600
		});

		return {
			templateId,
			uploadUrl,
			requiredHeaders: {
				'content-type': template.mediaType,
				'x-amz-meta-sha256': input.checksumSha256.toLowerCase()
			}
		};
	}

	async completeUpload(actor: ActorContext, templateId: TemplateId): Promise<ProjectTemplate> {
		const template = await this.templateRepo.findById(actor, templateId);
		if (!template) throw new NotFoundError('Template not found');

		const stored = await this.storage.stat(template.objectKey);
		if (!stored || stored.byteSize === 0)
			throw new ValidationError('Uploaded template could not be verified');

		const destinationKey = `projects/${template.projectId}/templates/${templateId}`;
		await this.storage.promote(template.objectKey, destinationKey);

		const buffer = await this.storage.read(destinationKey, 50 * 1024 * 1024);
		const styles = await extractTemplateStyles(Buffer.from(buffer));

		const updated = await this.templateRepo.update(actor, {
			...template,
			objectKey: destinationKey,
			byteSize: stored.byteSize,
			extractedStyles: styles as unknown as Record<string, unknown>,
			isDefault: template.isDefault,
			updatedAt: now()
		});

		return updated;
	}

	async list(actor: ActorContext, projectId: ProjectId): Promise<readonly ProjectTemplate[]> {
		return this.templateRepo.listByProject(actor, projectId);
	}

	async delete(actor: ActorContext, templateId: TemplateId): Promise<void> {
		const template = await this.templateRepo.findById(actor, templateId);
		if (!template) throw new NotFoundError('Template not found');
		await this.templateRepo.delete(actor, templateId);
	}

	async extractStyles(actor: ActorContext, templateId: TemplateId) {
		const template = await this.templateRepo.findById(actor, templateId);
		if (!template) throw new NotFoundError('Template not found');
		if (template.extractedStyles)
			return template.extractedStyles as unknown as import('$lib/models').ExtractedTemplateStyles;
		const buffer = await this.storage.read(template.objectKey, 50 * 1024 * 1024);
		return extractTemplateStyles(Buffer.from(buffer));
	}
}
