import { describe, expect, it } from 'vitest';
import { DocumentTemplates } from './templates';
import { InMemoryTemplateRepository } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';

const input = {
	projectId: testProjectId(),
	name: 'Board template',
	mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	byteSize: 100,
	checksumSha256: 'a'.repeat(64)
};
describe('template upload reservations', () => {
	it('rejects an empty upload reservation', async () => {
		const templates = new DocumentTemplates(new InMemoryTemplateRepository(), () => testNow);
		await expect(
			templates.reserveUpload(testActor(), { ...input, byteSize: 0 })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('rejects a malformed checksum', async () => {
		const templates = new DocumentTemplates(new InMemoryTemplateRepository(), () => testNow);
		await expect(
			templates.reserveUpload(testActor(), { ...input, checksumSha256: 'invalid' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('normalizes the checksum and retains the declared size in the reservation', async () => {
		const templates = new DocumentTemplates(new InMemoryTemplateRepository(), () => testNow);
		const upload = await templates.reserveUpload(testActor(), {
			...input,
			checksumSha256: 'A'.repeat(64)
		});
		expect({
			checksum: upload.checksumSha256,
			size: upload.byteSize,
			createdAt: upload.createdAt
		}).toEqual({ checksum: 'a'.repeat(64), size: 100, createdAt: testNow });
	});
});
