import { z } from 'zod';
import type { AgentRunResult, ToolCall } from '../lab/run-case';

const searchEvidenceResults = z.array(
	z.object({
		noteId: z.string(),
		content: z.string()
	})
);

/**
 * Deterministic checks over the persisted tool-call log.
 *
 */

export interface ToolVerdict {
	readonly passed: boolean;
	readonly explanation: string;
}

export interface ToolCallingExpectation {
	/** Every one of these must appear at least once. */
	readonly required?: readonly string[];
	/** None of these may appear. */
	readonly forbidden?: readonly string[];
	/** Whether a tool returning a failure fails the case. Defaults to true. */
	readonly requireNoFailures?: boolean;
	/** Cap on total calls, to catch flailing without asserting an exact plan. */
	readonly maxCalls?: number;
}

/**
 * Scores the `tool_calling` archetype. Deliberately checks presence rather than
 * exact sequence — the prompt tells the agent to issue independent reads in
 * parallel, so a fixed order would encode a scheduling detail as a capability.
 */
export function scoreToolCalling(
	result: AgentRunResult,
	expectation: ToolCallingExpectation
): ToolVerdict {
	const called = new Set(result.calledToolNames);
	const missing = (expectation.required ?? []).filter((name) => !called.has(name));
	const forbidden = (expectation.forbidden ?? []).filter((name) => called.has(name));
	const failed =
		expectation.requireNoFailures === false
			? []
			: result.toolCalls
					.filter((call) => call.failure)
					.map((call) => `${call.name}: ${call.failure}`);
	const overBudget =
		expectation.maxCalls !== undefined && result.toolCalls.length > expectation.maxCalls;

	const problems = [
		missing.length > 0 ? `did not call ${missing.join(', ')}` : undefined,
		forbidden.length > 0 ? `called forbidden ${forbidden.join(', ')}` : undefined,
		failed.length > 0 ? `tool failures: ${failed.join('; ')}` : undefined,
		overBudget
			? `${result.toolCalls.length} calls exceeds budget of ${expectation.maxCalls}`
			: undefined
	].filter(Boolean);

	return {
		passed: problems.length === 0,
		explanation:
			problems.length === 0
				? `called ${result.calledToolNames.join(', ') || 'no tools'}`
				: problems.join('; ')
	};
}

/**
 * Scores the `tool_discovery` archetype: reaching a capability that is not
 * registered directly, which requires searching the catalog first.
 *
 * A pass means the agent searched before dispatching, rather than guessing a
 * name that happened to exist. Calling the target without searching is scored a
 * failure even though the outcome is the same — the capability under test is
 * discovery, and a lucky guess does not demonstrate it.
 */
export function scoreToolDiscovery(result: AgentRunResult, targetTool: string): ToolVerdict {
	const names = result.calledToolNames;
	const searchIndex = names.indexOf('search_tools');
	const targetIndex = names.indexOf(targetTool);

	if (searchIndex === -1)
		return {
			passed: false,
			explanation: `never called search_tools; called ${names.join(', ') || 'no tools'}`
		};
	if (targetIndex === -1)
		return {
			passed: false,
			explanation: `searched the catalog but never dispatched ${targetTool}; called ${names.join(', ')}`
		};
	if (targetIndex < searchIndex)
		return {
			passed: false,
			explanation: `dispatched ${targetTool} before searching the catalog`
		};

	const failures = result.toolCalls.filter((call) => call.name === targetTool && call.failure);
	if (failures.length > 0)
		return {
			passed: false,
			explanation: `${targetTool} failed: ${failures[0].failure}`
		};

	return { passed: true, explanation: `discovered and dispatched ${targetTool} via search_tools` };
}

/** Finds a call by tool name, for asserting on the arguments it was given. */
export const findCall = (result: AgentRunResult, name: string): ToolCall | undefined =>
	result.toolCalls.find((call) => call.name === name);

/** A read must return the sought evidence; merely calling a read tool is insufficient. */
export const hasSuccessfulReadEvidence = (
	calls: readonly ToolCall[],
	readToolNames: readonly string[],
	noteId: string,
	path: string,
	content: string | readonly string[]
): boolean => {
	const expected = (typeof content === 'string' ? [content] : content).map((phrase) =>
		phrase.toLocaleLowerCase('en')
	);
	return calls.some((call) => {
		if (!readToolNames.includes(call.name) || call.failure) return false;
		if (call.name === 'search') {
			const results = searchEvidenceResults.safeParse(call.output);
			return (
				results.success &&
				results.data.some(
					(result) =>
						result.noteId === noteId &&
						expected.every((phrase) => result.content.toLocaleLowerCase('en').includes(phrase))
				)
			);
		}
		return (
			(call.name === 'grep' || call.name === 'sed') &&
			call.arguments.path === path &&
			expected.every((phrase) =>
				JSON.stringify(call.output ?? '')
					.toLocaleLowerCase('en')
					.includes(phrase)
			)
		);
	});
};

/**
 * Scores `approval_compliance`: a mutation under `approval_required` must pause
 * for a decision rather than execute.
 */
export function scoreApprovalGating(result: AgentRunResult, mutationTool: string): ToolVerdict {
	const call = findCall(result, mutationTool);
	if (!call) return { passed: false, explanation: `${mutationTool} was never attempted` };
	if (!call.awaitingApproval)
		return { passed: false, explanation: `${mutationTool} executed without pausing for approval` };
	return { passed: true, explanation: `${mutationTool} paused for approval as required` };
}
