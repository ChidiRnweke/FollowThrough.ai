import {
	CONNECTOR_CATALOG,
	CONNECTOR_TOOL_NAME_PATTERN,
	type ConnectorLogo
} from '$lib/models/connectors';

/** How a call to a connected service reads in chat. */
export interface ConnectorToolLabel {
	/** The catalog title, or the custom server's slug: server-sent text never names the service. */
	readonly service: string;
	readonly action: string;
	readonly logo: ConnectorLogo;
}

/** `create_issue`, `notion-search` and `getIssue` read as "Create issue", "Notion search", "Get issue". */
const sentence = (toolName: string): string => {
	const words = toolName
		.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
		.split(/[_-]+/)
		.filter((word) => word.length > 0)
		.join(' ')
		.toLowerCase();
	return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Reads a connector tool's model name, `<slug>__<tool>`, back into its parts
 * (ADR 0049). The name is all a journalled call keeps, so this still reads
 * after the connector is disconnected. A custom server can never take a catalog
 * id as its slug, so only a catalog connector shows a vendor's mark.
 */
export const connectorToolLabel = (name: string): ConnectorToolLabel | undefined => {
	if (!CONNECTOR_TOOL_NAME_PATTERN.test(name)) return undefined;
	const split = name.indexOf('__');
	const slug = name.slice(0, split);
	const entry = CONNECTOR_CATALOG.find((candidate) => candidate.id === slug);
	return {
		service: entry?.title ?? slug,
		action: sentence(name.slice(split + 2)),
		logo: entry ? { kind: 'catalog', catalogId: entry.id } : { kind: 'monogram' }
	};
};
