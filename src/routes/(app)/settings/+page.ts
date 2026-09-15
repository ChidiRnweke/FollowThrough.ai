import { requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { projectRecordSchema } from '$lib/models/workspace-records';
import type { PageLoad } from './$types';
const tabs = ['models', 'agents', 'documents', 'tools', 'mcp', 'policies'] as const;
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	await session.resources.prepare();
	const selected = url.searchParams.get('tab');
	const scope = url.searchParams.get('project');
	const projectId = scope ? routeResourceId(projectRecordSchema.shape.id, scope) : undefined;
	if (projectId) {
		const opened = await session.resources.open({ type: 'projects', id: [projectId] });
		requireRouteResource(opened, session.resources.online, 'project');
	}
	return {
		projectId,
		tab: tabs.find((tab) => tab === selected) ?? 'models',
		mcpEndpoint: new URL('/mcp', url.origin).toString()
	};
};
