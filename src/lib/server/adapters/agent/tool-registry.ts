import type { AgentToolInvocationControl } from '$lib/server/controllers/agent/tool-invocation';
import type { AgentToolDefinitionSource } from '$lib/server/controllers/agent/tool-definitions';
import type { ApiTokenScope } from '$lib/models/identity';
import type { PendingAgentDecision, ToolClassification } from '$lib/models/agent';
import type { ToolName } from '$lib/models/agent/tool-catalog';
import type { ToolDescriptor } from '$lib/models/agent/tool-index';
import { bindToolArguments } from '$lib/server/adapters/agent/tool-call';
import type { AgentToolExecutionControl } from '$lib/server/controllers/agent/tool-execution';
import type { AgentToolAuthority } from '$lib/server/controllers/agent/tool-authority';
import type { AgentToolDiscoveryControl } from '$lib/server/controllers/agent/tool-discovery';
import { type AgentToolRegistry } from '$lib/server/controllers/agent/tool-sessions';
import type { Tool } from '@openai/agents';
import { z } from 'zod';
import type { SdkToolOptions, AgentSdkToolBuilder } from './sdk-tool';
import type { AgentToolDefinition } from './tool-definitions';
export interface AgentToolSurface extends AgentToolRegistry {
	definitions(options?: { classifications?: readonly ToolClassification[] }): AgentToolDefinition[];
	tools(options?: { classifications?: readonly ToolClassification[] }): Tool<unknown>[];
	catalog(): ToolDescriptor[];
}
type Definition = AgentToolDefinition;
export class AgentToolRegistryAdapter implements AgentToolSurface {
	constructor(
		private readonly execution: AgentToolExecutionControl,
		private readonly signal: AbortSignal,
		private readonly authority: AgentToolAuthority,
		private readonly source: AgentToolDefinitionSource<AgentToolDefinition>,
		private readonly discoveryFactory: (
			catalog: ToolDescriptor[],
			definitions: AgentToolDefinition[],
			promoted: readonly string[]
		) => AgentToolDiscoveryControl,
		private readonly sdk: AgentSdkToolBuilder,
		private readonly invocationFactory: (options: SdkToolOptions) => AgentToolInvocationControl
	) {}

	/** Carry the exact preparation used by the approval gate into the durable checkpoint. */
	reviewDecision(pending: PendingAgentDecision): PendingAgentDecision {
		return this.execution.checkpoint(pending);
	}

	tools(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): Tool<unknown>[] {
		return this.definitions(options).map((definition) => this.buildTool(definition));
	}

	/**
	 * The raw capability list, for surfaces that do their own wrapping. The
	 * in-app agent uses `tools()`/`agentTools()`; MCP builds from these.
	 *
	 * This is the one place the user's tool selection is applied, so a deselected
	 * tool disappears from the in-app agent, from `search_tools` ranking, from
	 * direct tool dispatch and from the MCP surface at once — there is no path to
	 * a capability that does not come through here.
	 */
	definitions(
		options: { classifications?: readonly Definition['classification'][] } = {}
	): AgentToolDefinition[] {
		return this.authority.select(this.source.definitions(), options.classifications);
	}

	/**
	 * Context-reducing surface for the agent. Frequently used grounding tools are
	 * registered directly; `search_tools` discovers every long-tail capability and
	 * promotes it to a direct, flat-schema tool.
	 *
	 * `alreadyPromoted` re-enables tools an earlier turn in the same conversation
	 * discovered. Without it the promotion set is rebuilt empty on every user
	 * message while the model's own transcript still shows it calling those tools
	 * directly — so it repeats the call and gets `Tool not found`, which is exactly
	 * the production failure where a request was retried six times and the edit
	 * never landed.
	 */
	agentTools(alreadyPromoted: readonly string[] = []): Tool<unknown>[] {
		const definitions = this.definitions();
		const direct = this.authority
			.initial(definitions)
			.map((definition) => this.buildTool(definition));

		// Every long-tail tool is registered with its real flat schema but gated
		// behind `isEnabled`. The SDK drops disabled function tools in
		// `Agent.getAllTools` before serializing the request, so a gated tool costs
		// no prompt tokens, and `isEnabled` is re-evaluated before every generation
		// — so a tool `search_tools` promotes is callable on the very next one.
		// That is what lets the whole catalog be directly callable without paying
		// for the whole catalog, and it is why there is no `use_tool` envelope here:
		// the envelope's free-form `payload` renders as a property-less JSON schema,
		// so the model was asked to fill a shape it had never been shown, and
		// several model families answered with an empty object forever.
		const discovery = this.discoveryFactory(this.catalog(), definitions, alreadyPromoted);
		const discoverable = this.authority
			.discoverable(definitions)
			.map((definition) =>
				this.buildTool(definition, { isEnabled: () => discovery.isEnabled(definition.name) })
			);

		const searchParameters = z
			.object({
				query: z.string().min(1),
				limit: z.number().int().min(1).max(15).optional()
			})
			.strict();
		const searchTools = this.protocolTool({
			name: 'search_tools',
			description:
				'Find more FollowThrough tools relevant to what you want to do, when the tool you need is not already available directly. Each match comes back with its exact input schema and becomes a direct tool from your next message onward: call it by its own name with its arguments as flat top-level fields, exactly as the schema describes. There is no wrapper tool and no nested payload.',
			parameters: searchParameters,
			signal: this.signal,
			execute: (_action, _callId, run) => run(),
			prepare: async (input) => ({
				kind: 'ready',
				action: bindToolArguments(searchParameters, input, ({ query, limit }) =>
					discovery.search(query, limit ?? 5)
				)
			})
		});

		return [...direct, ...discoverable, searchTools];
	}

	/**
	 * The catalog tools the model can call on the next generation: the first-class
	 * set, plus whatever `search_tools` has already promoted in this conversation.
	 * It takes the same `alreadyPromoted` list as {@link agentTools} and answers
	 * about the same surface.
	 *
	 * Answered here because this is where the gate is decided. The caller used to
	 * read it back off the built SDK values by testing
	 * `typeof tool.isEnabled !== 'function'`, but `tool()` gives every tool an
	 * `isEnabled` function, so the test was always false and the answer was only
	 * ever the promoted tools — never the first-class ones. Tool recovery was
	 * therefore telling the model to discover `save_note`, which it already held.
	 *
	 * `search_tools` is offered too and is deliberately absent: it is built here
	 * rather than defined, so it has no catalog name to report.
	 */
	offeredToolNames(alreadyPromoted: readonly string[] = []): ToolName[] {
		return this.authority.offered(this.definitions(), alreadyPromoted);
	}
	catalog(): ToolDescriptor[] {
		return this.authority.catalog();
	}

	private protocolTool(options: SdkToolOptions): Tool<unknown> {
		return this.sdk.create(options, this.invocationFactory(options));
	}

	private buildTool(
		definition: Definition,
		options: { isEnabled?: () => boolean } = {}
	): Tool<unknown> {
		return this.protocolTool({
			name: definition.name,
			description: definition.description,
			parameters: definition.parameters,
			signal: this.signal,
			...options,
			prepare: (input, callId, phase) => this.execution.prepare(definition, input, callId, phase),
			execute: (action, callId, run) => this.execution.execute(definition, action, callId, run)
		});
	}
}
export interface McpToolSurface {
	forScope(scope: ApiTokenScope): AgentToolDefinition[];
	definitions(options?: { classifications?: readonly ToolClassification[] }): AgentToolDefinition[];
}
export class McpToolRegistryAdapter implements McpToolSurface {
	constructor(
		private readonly authority: AgentToolAuthority,
		private readonly source: AgentToolDefinitionSource<AgentToolDefinition>
	) {}
	forScope(scope: ApiTokenScope): AgentToolDefinition[] {
		return this.authority.selectMcp(this.source.definitions(), scope);
	}

	definitions(
		options: { classifications?: readonly ToolClassification[] } = {}
	): AgentToolDefinition[] {
		return this.authority.select(this.source.definitions(), options.classifications);
	}
}
