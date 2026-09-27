import { expect, it } from 'vitest';
import { WorkspaceViews } from './views';
import { workspaceRecordIdentity, type WorkspaceRecord } from '$lib/models/workspace-records';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
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
	return new WorkspaceViews(
		new Map(records.map((r) => [workspaceResourceKey(workspaceRecordIdentity(r)), r]))
	);
};
it('hides a cached diagram detail when its project is archived', () => {
	expect(setup(true).diagram(diagram.id)).toBeNull();
});
it('keeps the archived project’s stored diagram unchanged', () => {
	expect(setup(true).get('diagrams', diagram.id)).toEqual(diagram);
});
it('opens the stored diagram again when its project is active', () => {
	expect(setup(false).diagram(diagram.id)).toEqual(diagram);
});
