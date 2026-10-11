import type { RunConfig } from '@openai/agents';
import { toolFailure } from '$lib/models/agent/tool-failure';
/**
 * How the model reaches a suggested tool: `direct` is callable on the next
 * generation, `search_first` needs one `search_tools` call to be promoted onto
 * the enabled surface before it can be called — also directly, by its own name.
 */
type ToolInvocation = 'direct' | 'search_first';

interface RecoverableToolSuggestion {
	readonly name: string;
	readonly invokeVia: ToolInvocation;
}

const formatToolNames = (names: readonly string[]): string =>
	names.map((name) => `"${name}"`).join(', ');

const toolNameDistance = (a: string, b: string): number => {
	let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
	for (let row = 1; row <= a.length; row++) {
		const current = [row];
		for (let column = 1; column <= b.length; column++) {
			const cost = a[row - 1] === b[column - 1] ? 0 : 1;
			current[column] = Math.min(
				current[column - 1]! + 1,
				previous[column]! + 1,
				previous[column - 1]! + cost
			);
		}
		previous = current;
	}
	return previous[b.length]!;
};

const suggestToolNames = (query: string, names: readonly string[]) =>
	names
		.map((name) => ({ name, distance: toolNameDistance(query, name) }))
		.filter((suggestion) => suggestion.distance <= 3)
		.sort(
			(left, right) =>
				left.distance - right.distance ||
				(left.name < right.name ? -1 : left.name > right.name ? 1 : 0)
		);

/**
 * There is one dispatch path: a tool is either callable right now, or it must be
 * surfaced by `search_tools` first and then called directly by its own name.
 *
 * `enabledNames` must be the tools actually exposed to the model on this
 * generation, not every registered tool. The long tail is registered up front but
 * gated behind `isEnabled`, so passing the full registry would report an
 * undiscovered tool as though the model could already call it.
 */
const createToolRecoveryConfig = (
	enabledNames: readonly string[],
	catalogNames: readonly string[]
): Pick<RunConfig, 'toolNotFoundBehavior' | 'toolErrorFormatter'> => {
	const enabled = new Set(enabledNames);
	const catalog = new Set(catalogNames);
	const candidates = [...new Set([...enabled, ...catalog])];
	return {
		toolNotFoundBehavior: 'return_error_to_model',
		toolErrorFormatter: ({ kind, toolType, toolName, defaultMessage }) => {
			if (kind === 'approval_rejected' && toolType === 'function')
				return JSON.stringify(
					toolFailure(
						'APPROVAL_REJECTED',
						defaultMessage,
						'The user rejected this action. Continue without making this change.'
					)
				);
			if (kind !== 'tool_not_found' || toolType !== 'function') return undefined;
			const suggestions = suggestToolNames(toolName, candidates).map(
				(suggestion): RecoverableToolSuggestion => ({
					name: suggestion.name,
					invokeVia: enabled.has(suggestion.name) ? 'direct' : 'search_first'
				})
			);
			const undiscovered = catalog.has(toolName) && !enabled.has(toolName);
			const failure = undiscovered
				? `Tool "${toolName}" exists but has not been surfaced in this conversation yet.`
				: suggestions.length > 0
					? `Tool "${toolName}" is not available. Did you mean: ${formatToolNames(
							suggestions.map((suggestion) => suggestion.name)
						)}?`
					: `Tool "${toolName}" is not available.`;
			const recovery = undiscovered
				? `Call "search_tools" with a query describing what you want to do, then call "${toolName}" directly by that name with flat top-level arguments matching the schema it returns.`
				: suggestions.length === 0
					? 'Call "search_tools" to discover the capability, then call the name it returns directly with flat top-level arguments.'
					: 'Retry with one of the suggestions. Names marked "direct" can be called immediately; names marked "search_first" need one "search_tools" call before they become callable.';
			return JSON.stringify(
				toolFailure('TOOL_NOT_AVAILABLE', failure, recovery, {
					suggestions: suggestions.map((suggestion) => ({ ...suggestion }))
				})
			);
		}
	};
};

export interface AgentToolRecovery {
	promoted(
		historyNames: readonly string[],
		pendingNames: readonly string[],
		catalogNames: readonly string[]
	): readonly string[];
	configuration(
		enabledNames: readonly string[],
		catalogNames: readonly string[]
	): Pick<RunConfig, 'toolNotFoundBehavior' | 'toolErrorFormatter'>;
}
export class AgentToolRecoveryService implements AgentToolRecovery {
	promoted(
		historyNames: readonly string[],
		pendingNames: readonly string[],
		catalogNames: readonly string[]
	): readonly string[] {
		const catalog = new Set(catalogNames);
		return [...new Set([...historyNames, ...pendingNames].filter((name) => catalog.has(name)))];
	}

	configuration(
		enabledNames: readonly string[],
		catalogNames: readonly string[]
	): Pick<RunConfig, 'toolNotFoundBehavior' | 'toolErrorFormatter'> {
		return createToolRecoveryConfig(enabledNames, catalogNames);
	}
}
