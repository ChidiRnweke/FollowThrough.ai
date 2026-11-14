import type {
	Connector,
	ConnectorId,
	ConnectorSlug,
	ConnectorStatus,
	ConnectorToolName,
	ConnectorToolPolicy,
	ConnectorToolSchema,
	ConnectorToolView
} from '$lib/models/connectors';
import type { DateTime } from '$lib/models/workspace';
import { ConnectorToolPolicyRules } from '$lib/services/connectors/policy';

const at = '2026-11-14T10:00:00.000Z' as DateTime;

/** Linear from the catalog, signed in with OAuth, as the controller lists it. */
export const linearConnector = (status: ConnectorStatus = { kind: 'connected' }): Connector => ({
	id: '7d1c5c1e-9f0a-4b8e-8f43-2a6c1d9e5b10' as ConnectorId,
	slug: 'linear' as ConnectorSlug,
	source: { kind: 'catalog', catalogId: 'linear' },
	title: 'Linear',
	serverUrl: 'https://mcp.linear.app/mcp',
	authentication: 'oauth',
	status,
	logo: { kind: 'catalog', catalogId: 'linear' },
	toolsRefreshedAt: at,
	createdAt: at
});

/** A custom server that needed no sign-in and publishes no icon. */
export const teamDocsConnector = (): Connector => ({
	id: '3b6f0d2a-41c7-4e59-9a08-c5e7f1a2d364' as ConnectorId,
	slug: 'teamdocs' as ConnectorSlug,
	source: { kind: 'custom' },
	title: 'Team docs',
	serverUrl: 'https://docs.acme.example/mcp',
	authentication: 'none',
	status: { kind: 'connected' },
	logo: { kind: 'monogram' },
	toolsRefreshedAt: at,
	createdAt: at
});

/**
 * A stored tool with the setting the server computes for it. The effective
 * choice comes from the shared rule, so a fixture cannot pair a policy with a
 * setting production would never show.
 */
export const connectorToolView = (
	serverName: string,
	options: {
		readonly readOnly: boolean;
		readonly policy?: ConnectorToolPolicy;
		readonly schema?: ConnectorToolSchema;
	}
): ConnectorToolView => {
	const hints = {
		readOnly: options.readOnly,
		destructive: !options.readOnly,
		idempotent: false,
		openWorld: true
	};
	const policy = options.policy ?? { kind: 'default' };
	return {
		tool: {
			connectorId: linearConnector().id,
			serverName,
			modelName: `linear__${serverName}` as ConnectorToolName,
			title: serverName,
			description: `Works with ${serverName}.`,
			schema: options.schema ?? { kind: 'usable', inputSchema: { type: 'object' } },
			hints,
			checksum: `checksum-${serverName}`,
			policy
		},
		effective: new ConnectorToolPolicyRules().effective(policy, hints)
	};
};
