import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Document, Packer, Paragraph } from 'docx';
import { Deliverables, type DeliverablesDependencies } from './controller';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import { verifiedTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import {
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const setup = async () => {
	const storage = new InMemoryAttachmentStorage();
	const repository = new InMemoryTemplateRepository();
	const controller = new Deliverables(
		capabilityDependencies<DeliverablesDependencies>({
			templates: new DocumentTemplates(repository, () => testNow),
			templateStorage: storage,
			templateStyles: verifiedTemplateStyles,
			// Object storage does not participate in the database transaction.
			transactionRunner: new InMemoryTransactionRunner([repository])
		})
	);
	const bytes = await Packer.toBuffer(
		new Document({ sections: [{ children: [new Paragraph('Board template')] }] })
	);
	const input = {
		projectId: testProjectId(),
		name: 'Board template',
		mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		byteSize: bytes.length,
		checksumSha256: createHash('sha256').update(bytes).digest('hex')
	};
	const result = await controller.initiateTemplateUpload(testActor(), input);
	const staging = `staging/${testActor().userId}/templates/${result.templateId}`;
	const destination = `projects/${testProjectId()}/templates/${result.templateId}`;
	await storage.put(staging, bytes, input.mediaType);
	const complete = () => controller.completeTemplateUpload(testActor(), result.templateId);
	return { storage, repository, controller, bytes, input, result, staging, destination, complete };
};

describe('template upload completion', () => {
	it('keeps completed templates scoped to their project', async () => {
		const { controller, complete } = await setup();
		await complete();
		expect(await controller.listTemplates(testActor(), testProjectId(2))).toEqual([]);
	});
	it('deletes an owned completed template', async () => {
		const { controller, complete, result } = await setup();
		await complete();
		await controller.deleteTemplate(testActor(), result.templateId);
		expect(await controller.listTemplates(testActor(), testProjectId())).toEqual([]);
	});
	it('rejects a completion whose reservation does not exist', async () => {
		const { controller, result, repository } = await setup();
		repository.uploads = [];
		await expect(
			controller.completeTemplateUpload(testActor(), result.templateId)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it('keeps an unfinished upload out of the available template list', async () => {
		const { controller } = await setup();
		expect(await controller.listTemplates(testActor(), testProjectId())).toEqual([]);
	});
	it('stores the expected checksum with the upload contract', async () => {
		const { repository, result, input } = await setup();
		expect({
			checksum: repository.uploads[0]?.checksumSha256,
			headers: result.requiredHeaders
		}).toEqual({
			checksum: input.checksumSha256,
			headers: { 'content-type': input.mediaType, 'x-amz-meta-sha256': input.checksumSha256 }
		});
	});
	it('publishes verified bytes and extracted styles before removing staging', async () => {
		const { controller, complete, storage, staging, destination, bytes } = await setup();
		await complete();
		const available = await controller.listTemplates(testActor(), testProjectId());
		expect({
			names: available.map((template) => template.name),
			styles: available[0]?.extractedStyles.fonts.body.name,
			bytes: storage.objects.get(destination)?.data,
			staging: storage.objects.has(staging)
		}).toEqual({
			names: ['Board template'],
			styles: 'Calibri',
			bytes: new Uint8Array(bytes),
			staging: false
		});
	});
	it('makes repeated completion return the same usable template', async () => {
		const { complete, repository } = await setup();
		await complete();
		await complete();
		expect({ templates: repository.templates.length, uploads: repository.uploads.length }).toEqual({
			templates: 1,
			uploads: 0
		});
	});
	it('rejects bytes shorter than the reservation', async () => {
		const { complete, storage, staging, bytes, input } = await setup();
		await storage.put(staging, bytes.subarray(0, bytes.length - 1), input.mediaType);
		await expect(complete()).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('rejects bytes larger than the reservation', async () => {
		const { complete, storage, staging, bytes, input } = await setup();
		await storage.put(staging, Buffer.concat([bytes, Buffer.from('extra')]), input.mediaType);
		await expect(complete()).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('rejects changed bytes even when their length matches', async () => {
		const { complete, storage, staging, bytes, input } = await setup();
		await storage.put(staging, new Uint8Array(bytes.length), input.mediaType);
		await expect(complete()).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('retains the upload when style extraction fails', async () => {
		const { controller, repository, storage } = await setup();
		const bytes = Buffer.from('This is not a DOCX');
		const upload = await controller.initiateTemplateUpload(testActor(), {
			projectId: testProjectId(),
			name: 'Invalid',
			mediaType: 'application/octet-stream',
			byteSize: bytes.length,
			checksumSha256: createHash('sha256').update(bytes).digest('hex')
		});
		await storage.put(
			`staging/${testActor().userId}/templates/${upload.templateId}`,
			bytes,
			'application/octet-stream'
		);
		const failed = await controller.completeTemplateUpload(testActor(), upload.templateId).then(
			() => false,
			() => true
		);
		expect({
			failed,
			pending: repository.uploads.some((entry) => entry.id === upload.templateId),
			available: repository.templates.length
		}).toEqual({ failed: true, pending: true, available: 0 });
	});
	it('retries after the durable object is written but the database insert fails', async () => {
		const { complete, repository, storage, destination } = await setup();
		repository.insertFailure = new Error('Database unavailable');
		const failed = await complete().then(
			() => false,
			() => true
		);
		repository.insertFailure = undefined;
		await complete();
		expect({
			failed,
			stored: storage.objects.has(destination),
			templates: repository.templates.length,
			uploads: repository.uploads.length
		}).toEqual({ failed: true, stored: true, templates: 1, uploads: 0 });
	});
	it('retries cleanup after completion is already durable', async () => {
		const { complete, storage, staging, repository } = await setup();
		storage.removeFailure = new Error('Storage unavailable');
		const failed = await complete().then(
			() => false,
			() => true
		);
		storage.removeFailure = undefined;
		await complete();
		expect({
			failed,
			staging: storage.objects.has(staging),
			templates: repository.templates.length
		}).toEqual({ failed: true, staging: false, templates: 1 });
	});
});
