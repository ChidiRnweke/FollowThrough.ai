import type { ToolSubject } from '$lib/models/agent';
import { CONNECTOR_TOOL_NAME_PATTERN, type ConnectorLogo } from '$lib/models/connectors';

/** How a call into a connected service reads in chat. */
export interface ConnectorToolLabel {
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

const actionOf = (name: string): string => sentence(name.slice(name.indexOf('__') + 2));

/**
 * A connector call as the user reads it: the service from the label frozen
 * when the call was made (ADR 0049), the action from the server's tool name.
 * Only a catalog label shows a vendor's mark; a custom server shows its
 * monogram even when its slug matches a catalog id (ADR 0051).
 */
export const connectorToolLabel = (
	subject: Extract<ToolSubject, { readonly source: 'connector' }>
): ConnectorToolLabel => ({
	service: subject.connector.title,
	action: actionOf(subject.name),
	logo:
		subject.connector.kind === 'catalog'
			? { kind: 'catalog', catalogId: subject.connector.catalogId }
			: { kind: 'monogram' }
});

/**
 * A call that failed before it ran keeps only the name the model asked for, so
 * it reads by its slug and action and never claims a vendor.
 */
export const connectorNameLabel = (name: string): string | undefined =>
	CONNECTOR_TOOL_NAME_PATTERN.test(name)
		? `${name.slice(0, name.indexOf('__'))} · ${actionOf(name)}`
		: undefined;
