import { workspacePresentation } from '$lib/factories/workspace/presentation';
import { prepareRoute, requireRouteResource, routeResourceId } from '$lib/client/sync/route-access';
import { projectRecordSchema } from '$lib/models/workspace-records';
import { connectorIdSchema, type ConnectorId } from '$lib/models/connectors';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
const tabs = [
	'models',
	'agents',
	'connectors',
	'documents',
	'tools',
	'mcp',
	'policies',
	'browsers'
] as const;

/**
 * The Connectors tab shows one connector, or the list with the outcome of the
 * last sign-in: the OAuth callback returns to `connector` on success and to
 * `connectorError` with its message otherwise.
 */
type ConnectorsView =
	| { readonly kind: 'list'; readonly failure: string | undefined }
	| { readonly kind: 'detail'; readonly connectorId: ConnectorId };

const connectorsView = (parameters: URLSearchParams): ConnectorsView => {
	const selected = parameters.get('connector');
	if (selected === null)
		return { kind: 'list', failure: parameters.get('connectorError') ?? undefined };
	const connectorId = connectorIdSchema.safeParse(selected);
	if (!connectorId.success) error(404, 'There is no such connector.');
	return { kind: 'detail', connectorId: connectorId.data };
};
export const load: PageLoad = async ({ parent, url }) => {
	const { session } = await parent();
	await session.resources.prepare();
	const selected = url.searchParams.get('tab');
	const scope = url.searchParams.get('project');
	const projectId = scope ? routeResourceId(projectRecordSchema.shape.id, scope) : undefined;
	const routeReady = prepareRoute(async () => {
		if (projectId) {
			const opened = await session.resources.open({ type: 'projects', id: [projectId] });
			requireRouteResource(workspacePresentation, opened, session.resources.online, 'project');
		}
	});
	return {
		routeReady,
		projectId,
		tab: tabs.find((tab) => tab === selected) ?? 'models',
		connectors: connectorsView(url.searchParams),
		mcpEndpoint: new URL('/mcp', url.origin).toString()
	};
};
