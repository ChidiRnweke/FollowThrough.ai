import { afterAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { Document, Packer, Paragraph } from 'docx';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { TemplateId } from '$lib/models/deliverables';
import {
	Deliverables,
	type DeliverablesDependencies
} from '$lib/server/controllers/deliverables/controller';
import { DocumentTemplates } from '$lib/server/services/deliverables/templates';
import { verifiedTemplateStyles } from '$lib/server/services/deliverables/template-styles';
import { TemplateRecords } from '$lib/server/repositories/deliverables/postgres/templates';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import * as schema from '$lib/server/db/schema';
import { InMemoryAttachmentStorage } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { actor, context, now, seedNote } from '../database-harness';

const clients: ReturnType<typeof postgres>[] = [];
afterAll(async () => {
	await Promise.all(clients.map((client) => client.end()));
});
const setup = async (suffix: string) => {
	const { owner, project } = await seedNote(suffix);
	const client = postgres(context.url, { max: 4 });
	clients.push(client);
	const transaction = createTransactionContext(drizzle(client, { schema }));
	const repository = new TemplateRecords(transaction.database);
	const storage = new InMemoryAttachmentStorage();
	const controller = new Deliverables(
		capabilityDependencies<DeliverablesDependencies>({
			templates: new DocumentTemplates(repository, () => now),
			templateStorage: storage,
			templateStyles: verifiedTemplateStyles,
			transactionRunner: transaction.transactionRunner
		})
	);
	const bytes = await Packer.toBuffer(
		new Document({ sections: [{ children: [new Paragraph('Contract template')] }] })
	);
	const input = {
		projectId: project.id,
		name: 'Board template',
		mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		byteSize: bytes.length,
		checksumSha256: createHash('sha256').update(bytes).digest('hex')
	};
	const upload = await controller.initiateTemplateUpload(owner, input);
	await storage.put(
		`staging/${owner.userId}/templates/${upload.templateId}`,
		bytes,
		input.mediaType
	);
	return { controller, repository, owner, project, upload, input, storage };
};

describe('durable template upload lifecycle', () => {
	it('keeps a reservation invisible until completion', async () => {
		const { controller, owner, project } = await setup('9761');
		expect(await controller.listTemplates(owner, project.id)).toEqual([]);
	});
	it('publishes one usable template for concurrent completion deliveries', async () => {
		const { controller, repository, owner, project, upload } = await setup('9762');
		await Promise.all([
			controller.completeTemplateUpload(owner, upload.templateId),
			controller.completeTemplateUpload(owner, upload.templateId)
		]);
		const listed = await controller.listTemplates(owner, project.id);
		expect({
			ids: listed.map((entry) => entry.id),
			pending: await repository.findUpload(owner, upload.templateId)
		}).toEqual({ ids: [upload.templateId], pending: undefined });
	});
	it('refuses completion by another account', async () => {
		const { controller, upload } = await setup('9763');
		await expect(
			controller.completeTemplateUpload(actor('9764'), upload.templateId)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});
	it('refuses a reservation in another account’s project', async () => {
		const { controller, input } = await setup('9765');
		await expect(controller.initiateTemplateUpload(actor('9766'), input)).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
	});
	it('preserves old incomplete rows without listing them or blocking a new upload of that name', async () => {
		const { controller, owner, project, upload, input } = await setup('9767');
		const legacyId = crypto.randomUUID() as TemplateId;
		await context.db.insert(schema.projectTemplates).values({
			id: legacyId,
			userId: owner.userId,
			projectId: project.id,
			name: input.name,
			objectKey: `staging/legacy/${legacyId}`,
			mediaType: input.mediaType,
			byteSize: input.byteSize
		});
		await controller.completeTemplateUpload(owner, upload.templateId);
		expect((await controller.listTemplates(owner, project.id)).map((entry) => entry.id)).toEqual([
			upload.templateId
		]);
	});
	it('requires a new upload for legacy incomplete rows with no saved checksum', async () => {
		const { controller, owner, project, input } = await setup('9768');
		const legacyId = crypto.randomUUID() as TemplateId;
		await context.db.insert(schema.projectTemplates).values({
			id: legacyId,
			userId: owner.userId,
			projectId: project.id,
			name: 'Legacy',
			objectKey: `staging/legacy/${legacyId}`,
			mediaType: input.mediaType,
			byteSize: input.byteSize
		});
		await expect(controller.completeTemplateUpload(owner, legacyId)).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'Template upload not found. Upload the file again.'
		});
	});
});
