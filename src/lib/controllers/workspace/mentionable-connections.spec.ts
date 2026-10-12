import { describe, expect, it } from 'vitest';
import { createWorkspaceViews } from '$lib/factories/workspace/views';
import { type WorkspaceRecord } from '$lib/models/workspace-records';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import {
	projectBuilder,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';

const { workspaceRecordIdentity, workspaceResourceKey } = new WorkspaceCommandRulesService();

const launch = projectBuilder({ name: 'Launch' });
const archived = projectBuilder({ id: testProjectId(2), name: 'Old launch', archivedAt: testNow });
const views = () => {
	const records: WorkspaceRecord[] = [
		{ type: 'projects', value: launch },
		{ type: 'projects', value: archived }
	];
	return createWorkspaceViews(
		new Map(records.map((r) => [workspaceResourceKey(workspaceRecordIdentity(r)), r]))
	);
};
const named = (query: string) =>
	views()
		.mentionableResources(query)
		.projects.map((project) => project.name);

describe('mentionable connection maps', () => {
	it('matches an active project by its name', () => {
		expect(named('laun')).toEqual(['Launch']);
	});

	it('matches every active project on the word connections', () => {
		expect(named('conn')).toEqual(['Launch']);
	});

	it('leaves out a project whose name and the word connections both miss', () => {
		expect(named('budget')).toEqual([]);
	});
});
