import { describe, expect, it } from 'vitest';
import type { GenerateDocumentInput, PreparedExport } from '$lib/models/deliverables';
import { defaultExportSettings } from '$lib/models/deliverables';
import { exportControllerFixture } from '$lib/testing/deliverables/fixtures/export-controller';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const input: GenerateDocumentInput = {
	projectId: testProjectId(),
	noteIds: [testNoteId()],
	title: 'Report',
	format: 'pdf'
};
describe('durable document exports', () => {
	it('rolls back provenance and removes the uploaded file when the artifact insert fails', async () => {
		const { service, notes, artifacts, provenance, storage } = exportControllerFixture();
		notes.notes = [noteBuilder()];
		artifacts.insertFailure = new Error('Database unavailable');
		const outcome = await service.generateDocument(testActor(), input).then(
			() => 'success',
			(error) => error.message
		);
		expect({
			outcome,
			artifacts: artifacts.artifacts,
			provenance: provenance.records,
			objects: storage.objects.size
		}).toEqual({ outcome: 'Database unavailable', artifacts: [], provenance: [], objects: 0 });
	});
	it('preserves the original export when regeneration fails to persist', async () => {
		const { service, notes, artifacts, provenance, storage } = exportControllerFixture();
		notes.notes = [noteBuilder()];
		const original = await service.generateDocument(testActor(), input);
		artifacts.insertFailure = new Error('Database unavailable');
		const outcome = await service.regenerateArtifact(testActor(), original.artifact.id).then(
			() => 'success',
			(error) => error.message
		);
		expect({
			outcome,
			ids: artifacts.artifacts.map((artifact) => artifact.id),
			provenance: provenance.records.length,
			keys: [...storage.objects.keys()]
		}).toEqual({
			outcome: 'Database unavailable',
			ids: [original.artifact.id],
			provenance: 1,
			keys: [original.artifact.objectKey]
		});
	});
	it('creates no durable export when download signing fails', async () => {
		const { service, notes, artifacts, provenance, storage } = exportControllerFixture();
		notes.notes = [noteBuilder()];
		storage.downloadFailure = new Error('Signing unavailable');
		const outcome = await service.generateDocument(testActor(), input).then(
			() => 'success',
			(error) => error.message
		);
		expect({
			outcome,
			artifacts: artifacts.artifacts,
			provenance: provenance.records,
			objects: storage.objects.size
		}).toEqual({ outcome: 'Signing unavailable', artifacts: [], provenance: [], objects: 0 });
	});
	it('reports both persistence and storage cleanup failures', async () => {
		const { service, notes, artifacts, storage } = exportControllerFixture();
		notes.notes = [noteBuilder()];
		const persistence = new Error('Database unavailable');
		const cleanup = new Error('Storage unavailable');
		artifacts.insertFailure = persistence;
		storage.removeFailure = cleanup;
		await expect(service.generateDocument(testActor(), input)).rejects.toMatchObject({
			errors: [persistence, cleanup]
		});
	});
	it('regenerates with current note content and saved title and diagram settings', async () => {
		const rendered: PreparedExport[] = [];
		const pdfGenerator = async (value: PreparedExport) => {
			rendered.push(value);
			return Buffer.from('pdf');
		};
		const { service, notes } = exportControllerFixture({ pdfGenerator });
		notes.notes = [noteBuilder({ title: 'Before' })];
		const original = await service.generateDocument(testActor(), input);
		notes.notes = [noteBuilder({ title: 'After' })];
		const settings = {
			...defaultExportSettings,
			includeTitle: true,
			diagramTheme: { base: 'dark' as const, colors: { primaryColor: '#123456' } }
		};
		await service.updateExportSettings(testActor(), testProjectId(), settings);
		await service.regenerateArtifact(testActor(), original.artifact.id);
		expect({ title: rendered[1]?.notes[0]?.title, settings: rendered[1]?.settings }).toEqual({
			title: 'After',
			settings
		});
	});
});
