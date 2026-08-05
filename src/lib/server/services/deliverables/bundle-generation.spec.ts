import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import type { NoteId } from '$lib/models/notes';
import { MAX_BUNDLE_ENTRIES } from '$lib/models/deliverables';
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

const setup = () => {
	const artifacts = new InMemoryArtifactRepository();
	const storage = new InMemoryAttachmentStorage();
	const notes = new InMemoryNoteContent();
	const provenance = new InMemoryProvenanceRecorder();
	const service = new ArtifactLibrary(
		artifacts,
		storage,
		async (input) => Buffer.from(`docx:${input.title}`),
		async (input) => Buffer.from(`pdf:${input.title}`),
		provenance,
		notes,
		new InMemoryTemplateRepository(),
		new InMemoryTransactionRunner([artifacts, storage, provenance]),
		new InMemoryExportSettingsRepository(),
		{ downloadById: async () => ({ url: 'https://storage.test/presigned' }) },
		packZip
	);
	return { service, artifacts, storage, notes, provenance };
};

/** Two notes, one of them a folder deeper, as a folder export would hand them over. */
const twoNotes = (notes: InMemoryNoteContent) => {
	notes.notes = [
		noteBuilder({ id: testNoteId(1), title: 'Kickoff' }),
		noteBuilder({ id: testNoteId(2), title: 'Findings' })
	];
	return [
		{ noteId: testNoteId(1), path: 'Kickoff' },
		{ noteId: testNoteId(2), path: 'Interviews/Findings' }
	];
};

const archiveOf = (storage: InMemoryAttachmentStorage): AdmZip =>
	new AdmZip(Buffer.from([...storage.objects.values()][0]!.data));

describe('Document bundle invariants', () => {
	it('writes one document per selected note', async () => {
		const { service, storage, notes } = setup();
		await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(
			archiveOf(storage)
				.getEntries()
				.map((entry) => entry.entryName)
				.sort()
		).toEqual(['Interviews/Findings.pdf', 'Kickoff.pdf']);
	});

	it('renders each document from its own note rather than the whole selection', async () => {
		const { service, storage, notes } = setup();
		await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(archiveOf(storage).getEntry('Kickoff.pdf')?.getData().toString()).toBe('pdf:Kickoff');
	});

	it('packs the chosen format', async () => {
		const { service, storage, notes } = setup();
		await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'docx'
		});
		expect(
			archiveOf(storage)
				.getEntries()
				.map((entry) => entry.entryName)
				.sort()
		).toEqual(['Interviews/Findings.docx', 'Kickoff.docx']);
	});

	it('reports how many documents the bundle holds', async () => {
		const { service, notes } = setup();
		const output = await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(output.fileCount).toBe(2);
	});

	it('returns a download url for the archive', async () => {
		const { service, notes } = setup();
		const output = await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(output.downloadUrl).toContain('bundles/');
	});

	it('records no artifact, because a bundle is a download and not a deliverable', async () => {
		const { service, artifacts, notes } = setup();
		await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(artifacts.artifacts).toEqual([]);
	});

	it('records no provenance, because nothing was persisted to trace', async () => {
		const { service, provenance, notes } = setup();
		await service.generateBundle(testActor(), {
			projectId: testProjectId(),
			entries: twoNotes(notes),
			title: 'Research',
			format: 'pdf'
		});
		expect(provenance.records).toEqual([]);
	});

	it('rejects an empty selection', async () => {
		const { service } = setup();
		await expect(
			service.generateBundle(testActor(), {
				projectId: testProjectId(),
				entries: [],
				title: 'Research',
				format: 'pdf'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});

	it('rejects a selection past the batch cap', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		await expect(
			service.generateBundle(testActor(), {
				projectId: testProjectId(),
				entries: Array.from({ length: MAX_BUNDLE_ENTRIES + 1 }, (_, index) => ({
					noteId: testNoteId() as NoteId,
					path: `Note ${index}`
				})),
				title: 'Research',
				format: 'pdf'
			})
		).rejects.toMatchObject({ code: 'VALIDATION' });
	});
});
