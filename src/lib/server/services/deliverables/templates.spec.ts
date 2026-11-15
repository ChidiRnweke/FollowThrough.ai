import { describe, expect, it } from 'vitest';
import { TemplateLibrary } from './templates';
import { InMemoryTemplateRepository } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { testActor, testNow, testProjectId } from '$lib/testing/workspace/fixtures/domain-builders';
import { templateLimitsFixture } from '$lib/testing/deliverables/fixtures/template-limits';

const input = {
	projectId: testProjectId(),
	name: 'Board template',
	mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	byteSize: 100,
	checksumSha256: 'a'.repeat(64)
};
describe('template upload reservations', () => {
	it('rejects an empty upload reservation', async () => {
		const templates = new TemplateLibrary(
			testActor(),
			new InMemoryTemplateRepository(testActor()),
			() => testNow,
			templateLimitsFixture()
		);
		await expect(templates.reserveUpload({ ...input, byteSize: 0 })).rejects.toMatchObject({
			code: 'VALIDATION'
		});
	});
	it('rejects a reservation one byte over the template size limit', async () => {
		const templates = new TemplateLibrary(
			testActor(),
			new InMemoryTemplateRepository(testActor()),
			() => testNow,
			templateLimitsFixture({ maxBytes: 99 })
		);
		await expect(templates.reserveUpload(input)).rejects.toMatchObject({
			code: 'VALIDATION',
			message: expect.stringContaining('TEMPLATE_MAX_BYTES')
		});
	});
	it('reserves an upload exactly at the template size limit', async () => {
		const templates = new TemplateLibrary(
			testActor(),
			new InMemoryTemplateRepository(testActor()),
			() => testNow,
			templateLimitsFixture({ maxBytes: 100 })
		);
		expect((await templates.reserveUpload(input)).byteSize).toBe(100);
	});
	it('rejects a malformed checksum', async () => {
		const templates = new TemplateLibrary(
			testActor(),
			new InMemoryTemplateRepository(testActor()),
			() => testNow,
			templateLimitsFixture()
		);
		await expect(
			templates.reserveUpload({ ...input, checksumSha256: 'invalid' })
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
	it('normalizes the checksum and retains the declared size in the reservation', async () => {
		const templates = new TemplateLibrary(
			testActor(),
			new InMemoryTemplateRepository(testActor()),
			() => testNow,
			templateLimitsFixture()
		);
		const upload = await templates.reserveUpload({
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
