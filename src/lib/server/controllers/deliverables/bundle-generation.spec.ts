import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import type { NoteId } from '$lib/models/notes';
import type { InMemoryNoteContent } from '$lib/testing/notes/fakes/in-memory-content';
import type { InMemoryAttachmentStorage } from '$lib/testing/attachments/fakes/in-memory-deliverables';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
const setup = () =>
	exportControllerFixture({
		docxGenerator: async (input) => Buffer.from(`docx:${input.title}`),
		pdfGenerator: async (input) => Buffer.from(`pdf:${input.title}`)
	});
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
		const { service, storage, notes, artifacts, provenance } = setup();
		const output = await service.generateBundle(testActor(), {
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

		expect(archiveOf(storage).getEntry('Kickoff.pdf')?.getData().toString()).toBe('pdf:Kickoff');
		expect(output.fileCount).toBe(2);
		expect(output.downloadUrl).toContain('bundles/');
		expect(artifacts.artifacts).toEqual([]);
		expect(provenance.records).toEqual([]);
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

	it('exports every document beyond fifty', async () => {
		const { service, notes } = setup();
		notes.notes = [noteBuilder()];
		await expect(
			service.generateBundle(testActor(), {
				projectId: testProjectId(),
				entries: Array.from({ length: 51 }, (_, index) => ({
					noteId: testNoteId() as NoteId,
					path: `Note ${index}`
				})),
				title: 'Research',
				format: 'pdf'
			})
		).resolves.toMatchObject({ fileCount: 51 });
	});
});
