import { describe, expect, it } from 'vitest';
import type { ArtifactId, TemplateId } from '$lib/models/deliverables';
import { exportControllerFixture as setup } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
describe('artifact generation behavior', () => {
	it('rejects an explicitly selected template that is unavailable', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		await expect(
			service.generateDocument(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Board report',
				format: 'pdf',
				templateId: '00000000-0000-4000-8000-000000000091' as TemplateId
			})
		).rejects.toMatchObject({
			code: 'NOT_FOUND',
			message: 'The selected template is unavailable or not ready'
		});
	});

	it('previews the selected notes without creating an artifact', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		expect(
			await service.previewDocument(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Preview'
			})
		).toEqual({ data: Buffer.from('pdf').toString('base64') });
	});

	it('rejects a preview containing an inaccessible note', async () => {
		const { service } = setup();
		await expect(
			service.previewDocument(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Preview'
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('stores generated PDF metadata and bytes', async () => {
		const { service, artifacts, storage, notes } = setup();
		notes.notes = [noteBuilder()];
		const result = await service.generateDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Architecture export',
			format: 'pdf'
		});
		expect({
			format: result.artifact.format,
			persisted: artifacts.artifacts[0]?.id,
			stored: storage.objects.get(result.artifact.objectKey)?.data
		}).toEqual({
			format: 'pdf',
			persisted: result.artifact.id,
			stored: new Uint8Array(Buffer.from('pdf'))
		});
	});

	it('uses the document generator selected by the requested format', async () => {
		const { service, storage, notes } = setup();
		notes.notes = [noteBuilder()];
		const result = await service.generateDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Architecture export',
			format: 'docx'
		});
		expect(storage.objects.get(result.artifact.objectKey)?.data).toEqual(
			new Uint8Array(Buffer.from('docx'))
		);
	});

	it('does not reveal an artifact belonging to another actor', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const generated = await service.generateDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Private export',
			format: 'pdf'
		});
		expect(await service.getArtifact(testActor(2), generated.artifact.id)).toBeUndefined();
	});

	it('rejects downloading an unknown artifact', async () => {
		const { service } = setup();
		await expect(
			service.downloadArtifact(testActor(), '00000000-0000-4000-8000-000000000099' as ArtifactId)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('regenerates from the original artifact inputs', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const original = await service.generateDocument(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Repeatable export',
			format: 'pdf'
		});
		const regenerated = await service.regenerateArtifact(testActor(), original.artifact.id);
		expect({
			title: regenerated.artifact.title,
			format: regenerated.artifact.format,
			sources: regenerated.artifact.sourceNoteIds
		}).toEqual({
			title: 'Repeatable export',
			format: 'pdf',
			sources: [testNoteId()]
		});
	});
});
