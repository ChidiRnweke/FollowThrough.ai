import { describe, expect, it } from 'vitest';
import type { ArtifactId, ExportSettings } from '$lib/models';
import { defaultExportSettings } from '$lib/models';
import { ArtifactManagementService } from './management';
import {
	InMemoryArtifactRepository,
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/fakes/in-memory-deliverables';
import { InMemoryExportSettingsRepository } from '$lib/testing/fakes/in-memory-export-settings-repository';
import { InMemoryNoteContent } from '$lib/testing/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/fixtures/domain-builders';

const settings = (overrides: Partial<ExportSettings> = {}): ExportSettings => ({
	...defaultExportSettings,
	...overrides
});

const setup = () => {
	const artifacts = new InMemoryArtifactRepository();
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent();
	const templates = new InMemoryTemplateRepository();
	const exportSettings = new InMemoryExportSettingsRepository();
	const provenance = new InMemoryProvenanceRecorder();
	const service = new ArtifactManagementService(
		artifacts,
		storage,
		async () => Buffer.from('docx'),
		async () => Buffer.from('pdf'),
		provenance,
		notes,
		templates,
		new InMemoryTransactionRunner([artifacts, storage, provenance]),
		exportSettings
	);
	return { service, artifacts, storage, notes, exportSettings };
};

describe('artifact settings behavior', () => {
	it('returns the product defaults before project settings are saved', async () => {
		const { service } = setup();
		expect(await service.getSettings(testActor(), testProjectId())).toEqual(defaultExportSettings);
	});

	it('persists valid project settings', async () => {
		const { service } = setup();
		const selected = settings({ fontFamily: 'times', fontSize: 12 });
		expect(await service.updateSettings(testActor(), testProjectId(), selected)).toEqual({
			fontFamily: 'times',
			fontSize: 12,
			lineHeight: 1.35,
			margin: 72
		});
	});

	it('rejects a font size outside the supported range', async () => {
		const { service } = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ fontSize: 19 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a line height outside the supported range', async () => {
		const { service } = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ lineHeight: 0.9 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a page margin outside the supported range', async () => {
		const { service } = setup();
		await expect(
			service.updateSettings(testActor(), testProjectId(), settings({ margin: 145 }))
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});

describe('artifact generation behavior', () => {
	it('previews the selected notes without creating an artifact', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		expect(
			await service.preview(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Preview'
			})
		).toEqual(Buffer.from('pdf'));
	});

	it('rejects a preview containing an inaccessible note', async () => {
		const { service } = setup();
		await expect(
			service.preview(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Preview'
			})
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('stores generated PDF metadata and bytes', async () => {
		const { service, artifacts, storage, notes } = setup();
		notes.notes = [noteBuilder()];
		const result = await service.generate(testActor(), {
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
		const result = await service.generate(testActor(), {
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
		const generated = await service.generate(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Private export',
			format: 'pdf'
		});
		expect(await service.get(testActor(2), generated.artifact.id)).toBeUndefined();
	});

	it('rejects downloading an unknown artifact', async () => {
		const { service } = setup();
		await expect(
			service.download(testActor(), '00000000-0000-4000-8000-000000000099' as ArtifactId)
		).rejects.toMatchObject({ code: 'NOT_FOUND' });
	});

	it('regenerates from the original artifact inputs', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		const original = await service.generate(testActor(), {
			projectId: testProjectId(),
			noteIds: [testNoteId()],
			title: 'Repeatable export',
			format: 'pdf'
		});
		const regenerated = await service.regenerate(testActor(), original.artifact.id);
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
