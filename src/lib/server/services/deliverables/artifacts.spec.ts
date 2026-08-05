import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ActorContext } from '$lib/models/identity';
import type { AttachmentId } from '$lib/models/attachments';
import type { ArtifactId, ExportSettings } from '$lib/models/deliverables';
import { defaultExportSettings } from '$lib/models/deliverables';
import type { ImageSourceResolver } from '$lib/server/repositories/deliverables/export-images';
import { ArtifactLibrary } from './artifacts';
import { packZip } from './bundle';
import {
	InMemoryArtifactRepository,
	InMemoryAttachmentStorage,
	InMemoryTemplateRepository
} from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { InMemoryExportSettingsRepository } from '$lib/testing/deliverables/fakes/in-memory-export-settings-repository';
import { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import { InMemoryProvenanceRecorder } from '$lib/testing/relationships/fakes/in-memory-pipelines';
import { InMemoryTransactionRunner } from '$lib/testing/workspace/fakes/in-memory-transaction';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const settings = (overrides: Partial<ExportSettings> = {}): ExportSettings => ({
	...defaultExportSettings,
	...overrides
});

const setup = (
	attachmentDownloader: {
		downloadById(actor: ActorContext, id: AttachmentId): Promise<{ url: string }>;
	} = {
		downloadById: async () => ({ url: 'https://storage.test/presigned' })
	}
) => {
	const artifacts = new InMemoryArtifactRepository();
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent();
	const templates = new InMemoryTemplateRepository();
	const exportSettings = new InMemoryExportSettingsRepository();
	const provenance = new InMemoryProvenanceRecorder();
	const service = new ArtifactLibrary(
		artifacts,
		storage,
		async () => Buffer.from('docx'),
		async () => Buffer.from('pdf'),
		provenance,
		notes,
		templates,
		new InMemoryTransactionRunner([artifacts, storage, provenance]),
		exportSettings,
		attachmentDownloader,
		packZip
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

describe('attachment image resolution during export', () => {
	const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

	it('resolves an app-owned attachment URL to a data URL via the actor downloader', async () => {
		const server = createServer((_req, res) => {
			res.writeHead(200, { 'content-type': 'image/png' });
			res.end(PNG_BYTES);
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		try {
			const port = (server.address() as AddressInfo).port;
			const downloader = {
				downloadById: async (_actor: ActorContext, id: AttachmentId) =>
					id === 'a1'
						? { url: `http://127.0.0.1:${port}/pic.png` }
						: { url: 'http://127.0.0.1:9/nope.png' }
			};
			let captured: ImageSourceResolver | undefined;
			const notes = new InMemoryNoteContent();
			notes.notes = [noteBuilder()];
			const artifacts = new InMemoryArtifactRepository();
			const storage = new InMemoryAttachmentStorage();
			const provenance = new InMemoryProvenanceRecorder();
			const service = new ArtifactLibrary(
				artifacts,
				storage,
				async (input) => {
					captured = input.imageResolver;
					return Buffer.from('docx');
				},
				async () => Buffer.from('pdf'),
				provenance,
				notes,
				new InMemoryTemplateRepository(),
				new InMemoryTransactionRunner([artifacts, storage, provenance]),
				new InMemoryExportSettingsRepository(),
				downloader,
				packZip
			);
			await service.generate(testActor(), {
				projectId: testProjectId(),
				noteIds: [testNoteId()],
				title: 'Export with image',
				format: 'docx'
			});
			expect(await captured?.('/api/attachments/a1/content')).toBe(
				`data:image/png;base64,${PNG_BYTES.toString('base64')}`
			);
		} finally {
			await new Promise<void>((resolve, reject) =>
				server.close((error) => (error ? reject(error) : resolve()))
			);
		}
	});
});
