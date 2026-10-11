import type { AgentExecutionMode, PendingAgentDecision } from '$lib/models/agent';
import type { AgentToolContext, McpToolContext } from '$lib/models/agent-tool-context';
import type {
	AgentTool,
	AgentToolCompletion,
	AgentToolPlan,
	AgentToolset,
	McpToolSession
} from '$lib/models/agent-tool-protocol';
import type { AgentPayload } from '$lib/models/agent/payload';
import { FIRST_CLASS_TOOL_NAMES, type ToolName } from '$lib/models/agent/tool-catalog';
import type { ApiTokenScope } from '$lib/models/identity';
import type { TokenCounter } from '$lib/models/tokenization';
import type { ControllerFactory } from '$lib/server/factories/controller-factory';
import { createAgentTools, createMcpTools } from '$lib/server/factories/agent/tools/definitions';
import { createAgentToolset } from '$lib/server/factories/agent/tools/toolset';
import { readToolFailure } from '$lib/server/repositories/agent/tool-failure';
import type { ToolRanking } from '$lib/server/services/agent/tools/tool-search';
import { AgentToolApprovalRules } from '$lib/services/agent/tool-approval';
import { AgentToolCatalogService } from '$lib/services/agent/tool-catalog';
import type { Tool } from '@openai/agents';

export interface ToolAccessPolicy {
	isEnabled(toolName: string): boolean;
}
export interface ToolCompletionRecorder {
	completed(call: AgentToolCompletion, output: AgentPayload): Promise<void>;
}

const catalog = new AgentToolCatalogService();
const approval = new AgentToolApprovalRules();

const permittedTools = (
	tools: readonly AgentTool[],
	access: ToolAccessPolicy,
	classifications?: readonly AgentTool['classification'][]
) =>
	tools.filter(
		(tool) =>
			(!classifications || classifications.includes(tool.classification)) &&
			(catalog.isLocked(tool.name) || access.isEnabled(tool.name))
	);

const planFor = (permitted: readonly AgentTool[], mode?: AgentExecutionMode): AgentToolPlan => {
	const names = permitted.map((tool) => tool.name);
	return {
		initial: FIRST_CLASS_TOOL_NAMES.filter((name) => names.includes(name)),
		discoverable: names.filter((name) => !catalog.isFirstClass(name)),
		approvalRequired: mode
			? catalog
					.entries()
					.filter(
						(entry) => approval.requirement(entry.classification, mode) === 'approval_required'
					)
					.map((entry) => entry.name)
			: []
	};
};

const rank = async (
	retriever: ToolRanking,
	permitted: readonly AgentTool[],
	candidates: readonly string[],
	query: string,
	limit: number
): Promise<readonly ToolName[]> => {
	const pool = candidates.filter((name) => !catalog.isFirstClass(name));
	if (!pool.length) return [];
	const ranked = await retriever.rank(pool, query, limit);
	return ranked.flatMap((name) => permitted.find((tool) => tool.name === name)?.name ?? []);
};

/**
 * One in-app run's tool surface, built the way the agent harness builds it: the real tool
 * list and tool set, with the run's approval and discovery policy.
 */
export const createAgentToolSurface = (
	_tokens: TokenCounter,
	controllers: ControllerFactory,
	mode: AgentExecutionMode,
	context: AgentToolContext,
	recorder: ToolCompletionRecorder,
	retriever: ToolRanking,
	access: ToolAccessPolicy,
	parked: readonly PendingAgentDecision[] = [],
	signal: AbortSignal = new AbortController().signal
) => {
	const tools = createAgentTools(controllers, context);
	const discoveryCatalog = catalog
		.discoverable()
		.filter((entry) => catalog.isLocked(entry.name) || access.isEnabled(entry.name))
		.map((entry) => entry.name);
	const toolsetFor = (
		permitted: readonly AgentTool[],
		plan: AgentToolPlan,
		discovered: Set<string>
	) =>
		createAgentToolset(tools, {
			plan,
			isDiscovered: (name) => discovered.has(name),
			discover: async (query, limit) => {
				const found = await rank(retriever, permitted, discoveryCatalog, query, limit);
				for (const name of found) discovered.add(name);
				return found;
			},
			completed: (call, output) => recorder.completed(call, output),
			parked,
			signal
		});
	const permittedAll = permittedTools(tools, access);
	// `agentTools()` builds a fresh tool set each time, as each run does; a review prepared by
	// any build is found by asking the builds in turn, newest first.
	const built: AgentToolset[] = [];
	const build = (plan: AgentToolPlan, discovered: Set<string>) => {
		const set = toolsetFor(permittedAll, plan, discovered);
		built.unshift(set);
		return set;
	};
	// Opening the surface restores the parked reviews, as resuming a run does.
	build(planFor(permittedAll, mode), new Set());
	// `tools()` is one run's tool set, reused so approval and execution share its reviews.
	let direct: AgentToolset | undefined;
	return {
		definitions(options: { classifications?: readonly AgentTool['classification'][] } = {}) {
			return permittedTools(tools, access, options.classifications);
		},
		/** Every permitted tool registered directly, as a host without discovery would see them. */
		tools(
			options: { classifications?: readonly AgentTool['classification'][] } = {}
		): Tool<unknown>[] {
			const names = permittedTools(tools, access, options.classifications).map((tool) => tool.name);
			direct ??= build(
				{
					...planFor(permittedAll, mode),
					initial: permittedAll.map((tool) => tool.name),
					discoverable: []
				},
				new Set()
			);
			return direct.tools.filter((tool) => names.includes(tool.name as ToolName));
		},
		/** The surface the model is offered, with `promoted` tools already discovered. */
		agentTools(promoted: readonly string[] = []): Tool<unknown>[] {
			return build(planFor(permittedAll, mode), new Set(promoted)).tools;
		},
		offeredToolNames(promoted: readonly string[] = []): ToolName[] {
			return permittedAll
				.map((tool) => tool.name)
				.filter((name) => catalog.isFirstClass(name) || promoted.includes(name));
		},
		catalog(): { name: string }[] {
			return discoveryCatalog.map((name) => ({ name }));
		},
		/** The parked call with the review its approval prepared, as the checkpoint records it. */
		reviewDecision(pending: PendingAgentDecision): PendingAgentDecision {
			for (const set of built) {
				try {
					return set.checkpoint(pending);
				} catch (error) {
					if (set === built.at(-1)) throw error;
				}
			}
			return pending;
		}
	};
};
export type AgentToolSurface = ReturnType<typeof createAgentToolSurface>;

/** The tools an MCP request reaches, built the way the agent harness opens them. */
export const createMcpToolDefinitions = (
	_tokens: TokenCounter,
	controllers: ControllerFactory,
	context: McpToolContext,
	access: ToolAccessPolicy,
	retriever: ToolRanking
) => {
	const tools = createMcpTools(controllers, context);
	const open = (scope: ApiTokenScope): McpToolSession => {
		const permitted = permittedTools(tools, access, scope === 'read' ? ['read'] : undefined);
		return {
			tools,
			plan: planFor(permitted),
			discover: (query, limit) =>
				rank(
					retriever,
					permitted,
					permitted.map((tool) => tool.name),
					query,
					limit
				),
			failed: (value) => readToolFailure(value) !== undefined
		};
	};
	return {
		open,
		definitions(options: { classifications?: readonly AgentTool['classification'][] } = {}) {
			return permittedTools(tools, access, options.classifications);
		}
	};
};
