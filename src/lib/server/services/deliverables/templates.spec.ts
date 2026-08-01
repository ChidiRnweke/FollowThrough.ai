import { describe, expect, it } from 'vitest';
import type { ExtractedTemplateStyles, TemplateId } from '$lib/models/deliverables';
import type { ProjectTemplate } from '$lib/models/projects';
import { DocumentTemplates } from './templates';
import {
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const templateId = '00000000-0000-4000-8000-000000000091' as TemplateId;
const template = (overrides: Partial<ProjectTemplate> = {}): ProjectTemplate => ({
	id: templateId,
	userId: testActor().userId,
	projectId: testProjectId(),
	name: 'Board template',
	objectKey: `staging/${testActor().userId}/templates/${templateId}`,
	mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	byteSize: 4,
	isDefault: false,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});
const extractedStyles: ExtractedTemplateStyles = {
	fonts: {
		heading: {
			Heading1: { name: 'Aptos', size: 16, bold: true, italic: false }
		},
		body: { name: 'Aptos', size: 11 }
	},
	pageMargins: { top: 720, bottom: 720, left: 720, right: 720 },
	themeColors: {}
};

const setup = () => {
	const storage = new InMemoryAttachmentStorage();
	const templates = new InMemoryTemplateRepository();
	const service = new DocumentTemplates(
		storage,
		templates,
		new InMemoryTransactionRunner([templates, storage]),
		async () => extractedStyles
	);
	return { service, storage, templates };
};

const uploadInput = () => ({
	projectId: testProjectId(),
	name: 'Board template',
	mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	byteSize: 4,
	checksumSha256: 'a'.repeat(64)
});

describe('template upload behavior', () => {
	it('rejects an empty template', async () => {
		const { service } = setup();
		await expect(
			service.initiateUpload(testActor(), { ...uploadInput(), byteSize: 0 })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a checksum that is not a SHA-256 digest', async () => {
		const { service } = setup();
		await expect(
			service.initiateUpload(testActor(), { ...uploadInput(), checksumSha256: 'invalid' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('creates a pending template and a signed upload contract', async () => {
		const { service, templates } = setup();
		const result = await service.initiateUpload(testActor(), uploadInput());
		expect({
			persisted: templates.templates[0]?.id,
			url: result.uploadUrl,
			headers: result.requiredHeaders
		}).toEqual({
			persisted: result.templateId,
			url: `https://storage.test/upload/staging/${testActor().userId}/templates/${result.templateId}`,
			headers: {
				'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
				'x-amz-meta-sha256': 'a'.repeat(64)
			}
		});
	});

	it('rejects completing an unknown template', async () => {
		const { service } = setup();
		await expect(service.completeUpload(testActor(), templateId)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});

	it('rejects completing a template whose upload is empty', async () => {
		const { service, templates } = setup();
		templates.templates = [template()];
		await expect(service.completeUpload(testActor(), templateId)).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});

	it('promotes a verified upload and stores its extracted styles', async () => {
		const { service, storage, templates } = setup();
		const pending = template();
		templates.templates = [pending];
		await storage.put(pending.objectKey, Buffer.from('docx'), pending.mediaType);
		const completed = await service.completeUpload(testActor(), templateId);
		expect({
			objectKey: completed.objectKey,
			byteSize: completed.byteSize,
			styles: completed.extractedStyles
		}).toEqual({
			objectKey: `projects/${testProjectId()}/templates/${templateId}`,
			byteSize: 4,
			styles: extractedStyles
		});
	});
});

describe('template library behavior', () => {
	it('lists only templates in the requested project', async () => {
		const { service, templates } = setup();
		templates.templates = [
			template(),
			template({
				id: '00000000-0000-4000-8000-000000000092' as TemplateId,
				projectId: testProjectId(2)
			})
		];
		expect(await service.list(testActor(), testProjectId())).toEqual([template()]);
	});

	it('deletes an owned template', async () => {
		const { service, templates } = setup();
		templates.templates = [template()];
		await service.delete(testActor(), templateId);
		expect(templates.templates).toEqual([]);
	});

	it('returns already extracted styles without reading the object again', async () => {
		const { service, templates } = setup();
		templates.templates = [
			template({ extractedStyles: extractedStyles as unknown as Record<string, unknown> })
		];
		expect(await service.extractStyles(testActor(), templateId)).toEqual(extractedStyles);
	});
});
