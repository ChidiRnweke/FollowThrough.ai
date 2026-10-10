import type { AgentGrepResult, AgentLsResult, AgentSedResult } from '$lib/models/agent-files';
import { toolFailure, type ToolFailure } from '$lib/models/agent/tool-failure';
import { z } from 'zod';

export function projectFileResult(
	result: AgentLsResult
): Exclude<AgentLsResult, { kind: 'error' }> | ToolFailure;
export function projectFileResult(
	result: AgentGrepResult
): Exclude<AgentGrepResult, { kind: 'error' }> | ToolFailure;
export function projectFileResult(
	result: AgentSedResult
): Exclude<AgentSedResult, { kind: 'error' }> | ToolFailure;
export function projectFileResult(result: AgentLsResult | AgentGrepResult | AgentSedResult) {
	if (result.kind !== 'error') return result;
	return toolFailure(result.code, result.message, 'Follow the exact nextActions below.', {
		...('requestedPath' in result
			? { requestedPath: result.requestedPath }
			: { pattern: result.pattern }),
		...('lineCount' in result ? { lineCount: result.lineCount } : {}),
		nextActions: result.nextActions.map((action) => ({
			reason: action.reason,
			tool: action.tool,
			arguments: z.json().parse(action.arguments)
		}))
	});
}
