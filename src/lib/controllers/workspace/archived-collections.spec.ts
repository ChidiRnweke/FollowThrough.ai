import type { WorkspaceViewsController } from './views';
import { widgetBuilder, testWidgetId } from '$lib/testing/widgets/fixtures/widgets';
import { expect, it } from 'vitest';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceRecordIdentity } = new WorkspaceCommandRulesService();

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import {
	memorySuggestionBuilder,
	testDiagramId,
	projectBuilder,
	memoryEntryBuilder,
	testProjectId,
	testActor,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import { drawioBuilder } from '$lib/testing/diagrams/fakes/in-memory-diagram-skills';
import { createWorkspaceViews } from '$lib/factories/workspace/views';

const diagram = drawioBuilder({ sourceNoteId: undefined });
const artifact = resourceDataSchemas.artifacts.parse({
	id: '00000000-0000-4000-8000-000000000601',
	userId: testActor().userId,
	projectId: testProjectId(),
	title: 'Report',
	format: 'pdf',
	objectKey: 'report.pdf',
	byteSize: 5,
	sourceNoteIds: [],
	createdAt: testNow
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
const suggestion = memorySuggestionBuilder({
	payload: {
		scope: 'project',
		operation: 'add',
		projectId: testProjectId(),
		content: 'Project convention'
	}
});
const views = (archived: boolean) => {
	const records: WorkspaceRecord[] = [
		{ type: 'projects', value: projectBuilder(archived ? { archivedAt: testNow } : {}) },
		{ type: 'diagrams', value: diagram },
		{
			type: 'diagrams',
			value: {
				...diagram,
				id: testDiagramId(2),
				archivedAt: testNow
			}
		},
		{ type: 'widgets', value: widgetBuilder({ projectId: testProjectId() }) },
		{
			type: 'widgets',
			value: widgetBuilder({ id: testWidgetId(2), projectId: testProjectId(), archivedAt: testNow })
		},
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
		{ type: 'artifacts', value: artifact },
		{ type: 'attachments', value: attachment },
		{ type: 'attachment_versions', value: version },
		{ type: 'memory_entries', value: memoryEntryBuilder({ projectId: testProjectId() }) }
	];
	return createWorkspaceViews(
		new Map(
			records.map((record) => [workspaceResourceKey(workspaceRecordIdentity(record)), record])
		)
	);
};
const collections = [
	{
		name: 'project memory suggestions',
		read: (data: WorkspaceViewsController) => data.memorySuggestions(testProjectId())
	},
	{
		name: 'diagram gallery',
		read: (data: WorkspaceViewsController) => data.diagrams(testProjectId())
	},
	{
		name: 'widget gallery',
		read: (data: WorkspaceViewsController) => data.widgets(testProjectId())
	},
	{ name: 'diagram trash', read: (data: WorkspaceViewsController) => data.trashedDiagrams() },
	{ name: 'widget trash', read: (data: WorkspaceViewsController) => data.trashedWidgets() },
	{
		name: 'artifact gallery',
		read: (data: WorkspaceViewsController) => data.artifacts(testProjectId())
	},
	{
		name: 'project files',
		read: (data: WorkspaceViewsController) =>
			data.attachments({ kind: 'project', id: testProjectId() })
	},
	{
		name: 'project memory',
		read: (data: WorkspaceViewsController) => data.memories(testProjectId())
	}
];
it.each(collections)('hides archived-project content from $name', ({ read }) => {
	expect(read(views(true))).toEqual([]);
});
it.each(collections)('keeps $name available while its project is active', ({ read }) => {
	expect(read(views(false))).toHaveLength(1);
});
