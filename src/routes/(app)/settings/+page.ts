import { error } from '@sveltejs/kit';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
const tabs = ['models', 'agents', 'documents', 'tools', 'mcp', 'policies'] as const;
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	await session.resources.prepare([
		'agent_preferences',
		'user_preferences',
		'trust_policies',
		'tool_preferences',
		'project_tool_overrides'
	]);
	const selected = url.searchParams.get('tab');
	const scope = url.searchParams.get('project');
	const projectId = scope ? projectRecordSchema.shape.id.parse(scope) : undefined;
	if (projectId) {
		const opened = await session.resources.open({ type: 'projects', id: [projectId] });
		if (opened.kind !== 'ready')
			error(
				opened.kind === 'deleted' ? 410 : 503,
				opened.kind === 'failure' ? opened.message : 'This project is not available on this device'
			);
	}
	return {
		projectId,
		tab: tabs.find((tab) => tab === selected) ?? 'models',
		mcpEndpoint: new URL('/mcp', url.origin).toString()
	};
};
