import { describe, expect, it } from 'vitest';
import { WorkspaceViews } from './index';
import { resourceDataSchemas, type WorkspaceRecord } from '$lib/models/workspace-records';
import { testActor, testProjectId, testNow } from '$lib/testing/workspace/fixtures/domain-builders';

const userId = testActor().userId;
const preference = resourceDataSchemas.agent_preferences.parse({
	userId,
	defaultModel: 'old/model',
	executionMode: 'auto_accept',
	inlineSuggestionsEnabled: false,
	createdAt: testNow,
	updatedAt: testNow
});
describe('synchronized settings', () => {
	it('resolves deleted preferences to account defaults without reviving old model or approval overrides', () => {
		const records = new Map<string, WorkspaceRecord>([
			[
				JSON.stringify(['agent_preferences', userId]),
				{ type: 'agent_preferences', value: preference }
			]
		]);
		const views = new WorkspaceViews(records);
		records.delete(JSON.stringify(['agent_preferences', userId]));
		expect(views.agentPreferences(userId)).toEqual({
			userId,
			executionMode: 'approval_required',
			inlineSuggestionsEnabled: true
		});
	});
	it('uses a project override before the account-wide tool setting', () => {
		const toolName = 'create_note';
		const records = new Map<string, WorkspaceRecord>([
			[
				'user',
				{
					type: 'tool_preferences',
					value: { userId, toolName, enabled: false, createdAt: testNow, updatedAt: testNow }
				}
			],
			[
				'project',
				{
					type: 'project_tool_overrides',
					value: {
						userId,
						projectId: testProjectId(),
						toolName,
						enabled: true,
						createdAt: testNow,
						updatedAt: testNow
					}
				}
			]
		]);
		const tools = new WorkspaceViews(records).toolPreferences(userId, testProjectId());
		expect(tools.find((tool) => tool.name === toolName)).toMatchObject({
			enabled: true,
			source: 'project'
		});
	});
	it('returns to the account setting when the project override is deleted', () => {
		const toolName = 'create_note';
		const records = new Map<string, WorkspaceRecord>([
			[
				'user',
				{
					type: 'tool_preferences',
					value: { userId, toolName, enabled: false, createdAt: testNow, updatedAt: testNow }
				}
			]
		]);
		expect(
			new WorkspaceViews(records)
				.toolPreferences(userId, testProjectId())
				.find((tool) => tool.name === toolName)
		).toMatchObject({ enabled: false, source: 'user' });
	});
	it('keeps tools required for account recovery enabled without a stored preference', () => {
		expect(
			new WorkspaceViews(new Map())
				.toolPreferences(userId)
				.find((tool) => tool.name === 'set_tool_enabled')
		).toMatchObject({ enabled: true, locked: true, source: 'default' });
	});
});
