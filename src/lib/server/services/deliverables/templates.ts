import { randomUUID } from 'node:crypto';
import type {
	ActorContext,
	DateTime,
	ExtractedTemplateStyles,
	ProjectId,
	ProjectTemplate,
	TemplateId
} from '$lib/models';
import { NotFoundError, ValidationError } from '$lib/errors';
import type { TemplateRepository } from '$lib/server/repositories';
import type { TransactionRunner } from '$lib/server/repositories/transaction';
interface TemplateStorage {
	createUploadUrl(input: {
		objectKey: string;
		mediaType: string;
		byteSize: number;
		checksumSha256: string;
		expiresInSeconds: number;
	}): Promise<string>;
	stat(objectKey: string): Promise<{ byteSize: number; checksumSha256?: string }>;
	read(objectKey: string, maximumBytes: number): Promise<Uint8Array>;
	promote(sourceKey: string, destinationKey: string): Promise<void>;
	remove(objectKey: string): Promise<void>;
}

const now = (): DateTime => new Date().toISOString() as DateTime;

export class DocumentTemplates {
	constructor(
		private readonly storage: TemplateStorage,
		private readonly templateRepo: TemplateRepository,
		private readonly transactionRunner: TransactionRunner,
		private readonly styleExtractor: (buffer: Buffer) => Promise<ExtractedTemplateStyles>
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
		const styles = await this.styleExtractor(Buffer.from(buffer));

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
		return this.styleExtractor(Buffer.from(buffer));
	}
}
