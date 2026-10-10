import { expect, it } from 'vitest';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import { type WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
const { workspaceRecordIdentity } = new WorkspaceCommandRulesService();

const { workspaceResourceKey } = new WorkspaceCommandRulesService();
import {
	projectBuilder,
	diagramBuilder,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
const diagram = diagramBuilder();
const setup = (archived: boolean) => {
	const records: WorkspaceRecord[] = [
		{ type: 'projects', value: projectBuilder(archived ? { archivedAt: testNow } : {}) },
		{ type: 'diagrams', value: diagram }
	];
	return createWorkspaceViews(
		new Map(records.map((r) => [workspaceResourceKey(workspaceRecordIdentity(r)), r]))
	);
};
it('hides the archived project diagram without discarding its stored record', () => {
	const views = setup(true);
	expect({ detail: views.diagram(diagram.id), stored: views.get('diagrams', diagram.id) }).toEqual({
		detail: null,
		stored: diagram
	});
});
it('opens the stored diagram again when its project is active', () => {
	expect(setup(false).diagram(diagram.id)).toEqual(diagram);
});
