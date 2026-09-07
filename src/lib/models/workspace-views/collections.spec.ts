import { describe, expect, it } from 'vitest';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import {
	memoryEntryBuilder,
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
