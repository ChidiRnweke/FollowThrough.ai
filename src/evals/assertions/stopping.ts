import type { AgentRunResult } from '../lab/run-case';

export interface StoppingVerdict {
	readonly passed: boolean;
	readonly explanation: string;
}

export interface StoppingExpectation {
	/** Fail if total tool calls exceed this budget. */
	readonly maxCalls?: number;
	/** Fail if any single tool name appears more than this many times. Default: no limit. */
	readonly maxRepeatsPerTool?: number;
}

/**
 * Scores the `stopping_behavior` archetype: did the agent terminate cleanly
 * without over-calling tools or looping on the same capability?
 */
export function scoreStoppingBehavior(
	result: AgentRunResult,
	expectation: StoppingExpectation
): StoppingVerdict {
	const problems: string[] = [];

	if (expectation.maxCalls !== undefined && result.toolCalls.length > expectation.maxCalls) {
		problems.push(
			`${result.toolCalls.length} tool calls exceeds budget of ${expectation.maxCalls}`
		);
	}

	if (expectation.maxRepeatsPerTool !== undefined) {
		const counts = new Map<string, number>();
		for (const name of result.calledToolNames) {
			counts.set(name, (counts.get(name) ?? 0) + 1);
		}
		for (const [name, count] of counts) {
			if (count > expectation.maxRepeatsPerTool) {
				problems.push(
					`"${name}" called ${count} times, exceeds limit of ${expectation.maxRepeatsPerTool}`
				);
			}
		}
	}

	return {
		passed: problems.length === 0,
		explanation:
			problems.length === 0
				? `completed with ${result.toolCalls.length} tool calls: ${result.calledToolNames.join(', ') || 'none'}`
				: problems.join('; ')
	};
}
