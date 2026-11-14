import { ValidationError } from '$lib/errors';
import type { ConnectorAgentTool, ConnectorToolBuild } from '$lib/models/agent-tool-protocol';
import {
	agentPayloadObjectResultSchema,
	type AgentPayload,
	type AgentPayloadObject
} from '$lib/models/agent/payload';
import { toolFailure } from '$lib/models/agent/tool-failure';
import type { ConnectorCallOutcome, ConnectorContent } from '$lib/models/connectors';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { compileJsonSchema } from '$lib/server/infrastructure/json-schema/compile';

/** A withdrawn tool still needs a schema for the saved run to resume against. */
const ANY_OBJECT: AgentPayloadObject = { type: 'object' };

/**
 * Connector tools for one run (ADR 0049). Each one checks the model's
 * arguments against the server's own schema and calls the one controller
 * operation behind every connector tool, `connectors.callTool`.
 */
export const createConnectorTools = (
	controllers: ControllerFactory,
	builds: readonly ConnectorToolBuild[]
): readonly ConnectorAgentTool[] =>
	builds.map((build) =>
		build.kind === 'available' ? available(controllers, build) : withdrawn(build)
	);

const available = (
	controllers: ControllerFactory,
	build: Extract<ConnectorToolBuild, { kind: 'available' }>
): ConnectorAgentTool => {
	const { tool, connector } = build;
	const connectorTitle = connector.title;
	const compiled = compileJsonSchema(build.inputSchema);
	// The snapshot keeps a schema only when this compiler accepted it (ADR 0049).
	if (compiled.kind === 'failure')
		throw new Error(`Stored connector tool ${tool.modelName} has a schema that does not compile`);
	return {
		name: tool.modelName,
		connector,
		description: `[${connectorTitle}] ${tool.title}. ${tool.description}`.trim(),
		checksum: tool.checksum,
		inputSchema: build.inputSchema,
		approval: build.approval,
		prepare: (input, callId) => {
			const parsed = agentPayloadObjectResultSchema.parse(input);
			if (parsed.kind === 'corrupt') throw new ValidationError(parsed.message);
			const check = compiled.check(parsed.value);
			if (check.kind === 'invalid')
				throw new ValidationError(
					`These arguments do not match ${connectorTitle}'s schema for ${tool.title}: ${check.problems.join('; ')}.`
				);
			return {
				arguments: parsed.value,
				execute: async (signal) =>
					projected(
						await controllers.connectors().callTool(
							{
								connectorId: tool.connectorId,
								serverName: tool.serverName,
								checksum: tool.checksum,
								arguments: parsed.value,
								callId
							},
							signal
						)
					)
			};
		}
	};
};

const withdrawn = (
	build: Extract<ConnectorToolBuild, { kind: 'withdrawn' }>
): ConnectorAgentTool => ({
	name: build.name,
	connector: build.connector,
	description: 'This connector tool is no longer available.',
	checksum: build.checksum,
	inputSchema: ANY_OBJECT,
	approval: 'ready',
	prepare: () => {
		throw new ValidationError(build.reason);
	}
});

const textOf = (content: readonly ConnectorContent[]): string =>
	content
		.flatMap((block) =>
			block.kind === 'text'
				? [block.text]
				: block.kind === 'resource' && block.body.kind === 'text'
					? [block.body.text]
					: []
		)
		.join('\n');

/** One content block as the model reads it; binary data is described, never sent. */
const blockOf = (block: ConnectorContent): AgentPayload => {
	switch (block.kind) {
		case 'text':
			return { type: 'text', text: block.text };
		case 'binary':
			return {
				type: 'omitted',
				media: block.media,
				mime_type: block.mimeType,
				bytes: block.byteSize,
				note: 'Binary content is not shown to the model.'
			};
		case 'resource_link':
			return {
				type: 'resource_link',
				uri: block.uri,
				name: block.name,
				...(block.mimeType === undefined ? {} : { mime_type: block.mimeType })
			};
		case 'resource':
			return block.body.kind === 'text'
				? { type: 'resource', uri: block.uri, text: block.body.text }
				: {
						type: 'omitted',
						uri: block.uri,
						bytes: block.body.byteSize,
						note: 'Binary content is not shown to the model.'
					};
	}
};

/**
 * The tool's result. A connector's answer is wrapped in `connector_result`, so a
 * server that answers `{ "kind": "failure" }` cannot pass for this app's own
 * failure envelope.
 */
const projected = (outcome: ConnectorCallOutcome): AgentPayload => {
	switch (outcome.kind) {
		case 'withdrawn':
			return toolFailure(
				'TOOL_NOT_AVAILABLE',
				outcome.reason,
				'Search for the tool again with search_tools, or tell the user it changed.'
			);
		case 'reauthorization_required':
			return toolFailure(
				'EXTERNAL_SERVICE',
				`${outcome.connectorTitle} needs the user to sign in again.`,
				`Do not retry. Tell the user to reconnect ${outcome.connectorTitle} in Settings → Connectors.`
			);
		case 'returned': {
			const { result, connectorTitle } = outcome;
			if (result.isError)
				return toolFailure(
					'EXTERNAL_SERVICE',
					`${connectorTitle} answered with an error: ${textOf(result.content) || 'it gave no message'}`,
					'Read the error. Correct the arguments if they caused it; otherwise tell the user what the service said.'
				);
			return {
				kind: 'connector_result',
				connector: connectorTitle,
				content: result.content.map(blockOf),
				...(result.structured.kind === 'present' ? { structured: result.structured.value } : {})
			};
		}
	}
};
