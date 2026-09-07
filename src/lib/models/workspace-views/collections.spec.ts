import { describe, expect, it } from 'vitest';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import {
	memoryEntryBuilder,
	noteBuilder,
	projectBuilder,
	diagramBuilder,
	testDiagramId,
	memorySuggestionBuilder,
	testProjectId,
	testMemoryEntryId,
	testNoteId,
	testSuggestionId,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { WorkspaceViews } from './index';

const views = (...records: WorkspaceRecord[]) =>
	new WorkspaceViews(
		new Map(
			records.map((record, index) => [
				'id' in record.value ? JSON.stringify([record.type, record.value.id]) : String(index),
				record
			])
		)
	);

describe('shared memory lists', () => {
	it('keeps profile memory separate from project memory and excludes deleted entries', () => {
		const profile = memoryEntryBuilder({ projectId: undefined });
		const project = memoryEntryBuilder({ id: testMemoryEntryId(2), projectId: testProjectId() });
		const removed = memoryEntryBuilder({
			id: testMemoryEntryId(3),
			projectId: undefined,
			deletedAt: testNow
		});
		expect(
			views(
				...[profile, project, removed].map((value) => ({ type: 'memory_entries' as const, value }))
			)
				.memories()
				.map((entry) => entry.id)
		).toEqual([profile.id]);
	});
	it('shows only proposed memory changes in the selected scope', () => {
		const suggestion = memorySuggestionBuilder({
			payload: { operation: 'add', projectId: testProjectId(), content: 'Project fact' }
		});
		expect(
			views(
				{ type: 'suggestions', value: suggestion },
				{
					type: 'provenance',
					value: resourceDataSchemas.provenance.parse({
						id: suggestion.provenanceId,
						userId: suggestion.userId,
						createdAt: testNow,
						producerKind: 'agent',
						producerName: 'FollowThrough Workbench Agent',
						pipeline: 'agent',
						runId: '00000000-0000-4000-8000-000000000510',
						model: 'fixture',
						metadata: {}
					})
				},
				{ type: 'suggestions', value: memorySuggestionBuilder({ id: testSuggestionId(2) }) }
			)
				.memorySuggestions(testProjectId())
				.map((view) => view.suggestion.id)
		).toEqual([suggestion.id]);
	});
});

const attachment = resourceDataSchemas.attachments.parse({
	id: '00000000-0000-4000-8000-000000000501',
	userId: testActor().userId,
	projectId: testProjectId(),
	path: 'brief.txt',
	currentVersionId: '00000000-0000-4000-8000-000000000502',
	createdAt: testNow,
	updatedAt: testNow
});
const version = resourceDataSchemas.attachment_versions.parse({
	id: attachment.currentVersionId,
	attachmentId: attachment.id,
	objectKey: 'brief',
	mediaType: 'text/plain',
	byteSize: 5,
	checksumSha256: 'a'.repeat(64),
	processingStatus: 'ready',
	createdAt: testNow
});

describe('shared attachment lists', () => {
	it('does not mix a notes attachments into the projects own file list', () => {
		expect(
			views(
				{ type: 'attachments', value: { ...attachment, noteId: testNoteId() } },
				{ type: 'attachment_versions', value: version }
			).attachments({ kind: 'project', id: testProjectId() })
		).toEqual([]);
	});
	it('joins the current version for an available project attachment', () => {
		expect(
			views(
				{ type: 'attachments', value: attachment },
				{ type: 'attachment_versions', value: version }
			)
				.attachments({ kind: 'project', id: testProjectId() })
				.map((item) => item.version.id)
		).toEqual([version.id]);
	});
});

describe('shared project collections', () => {
	it('keeps trash scoped to active projects and excludes skills', () => {
		const project = projectBuilder();
		expect(
			views(
				{ type: 'projects', value: project },
				...[
					noteBuilder({ archivedAt: testNow }),
					noteBuilder({ id: testNoteId(2), kind: 'skill', archivedAt: testNow }),
					noteBuilder({ id: testNoteId(3), projectId: testProjectId(2), archivedAt: testNow })
				].map((value) => ({ type: 'notes' as const, value }))
			)
				.trashedNotes()
				.map((note) => ({ id: note.id, projectName: note.projectName }))
		).toEqual([{ id: testNoteId(), projectName: project.name }]);
	});
	it('searches active project drawio content and excludes note diagrams', () => {
		const diagram = resourceDataSchemas.diagrams.parse({
			...diagramBuilder(),
			kind: 'drawio',
			currentRevision: 1,
			publishedRevision: 0
		});
		expect(
			views(
				{ type: 'diagrams', value: diagram },
				{ type: 'diagrams', value: { ...diagram, id: testDiagramId(2), archivedAt: testNow } },
				{ type: 'diagrams', value: diagramBuilder({ id: testDiagramId(3) }) }
			)
				.diagrams(testProjectId(), 'SERVICE')
				.map((item) => item.id)
		).toEqual([diagram.id]);
	});
	it('derives artifact staleness from the current source note and preserves oldest-first order', () => {
		const artifact = resourceDataSchemas.artifacts.parse({
			id: '00000000-0000-4000-8000-000000000601',
			userId: testActor().userId,
			projectId: testProjectId(),
			title: 'Report',
			format: 'pdf',
			objectKey: 'report.pdf',
			byteSize: 5,
			sourceNoteIds: [testNoteId()],
			createdAt: '2025-01-01T00:00:00.000Z'
		});
		expect(
			views(
				{ type: 'projects', value: projectBuilder() },
				{ type: 'notes', value: noteBuilder() },
				{
					type: 'artifacts',
					value: {
						...artifact,
						id: resourceDataSchemas.artifacts.shape.id.parse(
							'00000000-0000-4000-8000-000000000602'
						),
						createdAt: testNow
					}
				},
				{ type: 'artifacts', value: artifact }
			)
				.artifacts(testProjectId(), 'PDF')
				.map((item) => ({ id: item.id, stale: item.stale }))
		).toEqual([
			{ id: artifact.id, stale: true },
			{ id: '00000000-0000-4000-8000-000000000602', stale: false }
		]);
	});
});
