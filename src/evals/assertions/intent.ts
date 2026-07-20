import type { AgentRunResult } from '../lab/run-case';

export interface IntentVerdict {
	readonly passed: boolean;
	readonly explanation: string;
	/** Per-group results for annotation granularity. */
	readonly groupResults: readonly { group: readonly string[]; matched: boolean }[];
}

export interface IntentExpectation {
	/**
	 * Groups of acceptable tool names. For each group, at least ONE tool from
	 * the group must appear in the called tools. This lets us express "the agent
	 * should do SOMETHING read-like" without prescribing the exact tool.
	 */
	readonly atLeastOneOf?: readonly (readonly string[])[];
	/** These tools MUST appear (same as scoreToolCalling required). */
	readonly required?: readonly string[];
	/** These tools must NOT appear. */
	readonly forbidden?: readonly string[];
	/** Minimum number of distinct tool names that must be called. */
	readonly minDistinctTools?: number;
	/** Maximum total calls (budget cap). */
	readonly maxCalls?: number;
}

/**
 * Scores the `intent_interpretation` archetype: given a vague prompt, did the
 * agent pick a reasonable set of tools? More flexible than scoreToolCalling
 * because it supports "any of these is acceptable" logic per group.
 */
export function scoreIntentInterpretation(
	result: AgentRunResult,
	expectation: IntentExpectation
): IntentVerdict {
	const called = new Set(result.calledToolNames);
	const problems: string[] = [];
	const groupResults: { group: readonly string[]; matched: boolean }[] = [];

	// Check each atLeastOneOf group
	if (expectation.atLeastOneOf) {
		for (const group of expectation.atLeastOneOf) {
			const matched = group.some((tool) => called.has(tool));
			groupResults.push({ group, matched });
			if (!matched) {
				problems.push(`none of [${group.join(', ')}] were called`);
			}
		}
	}

	// Required tools
	if (expectation.required) {
		const missing = expectation.required.filter((name) => !called.has(name));
		if (missing.length > 0) {
			problems.push(`did not call required: ${missing.join(', ')}`);
		}
	}

	// Forbidden tools
	if (expectation.forbidden) {
		const violating = expectation.forbidden.filter((name) => called.has(name));
		if (violating.length > 0) {
			problems.push(`called forbidden: ${violating.join(', ')}`);
		}
	}

	// Minimum distinct tools
	if (expectation.minDistinctTools !== undefined && called.size < expectation.minDistinctTools) {
		problems.push(`only ${called.size} distinct tools, needed ≥${expectation.minDistinctTools}`);
	}

	// Budget cap
	if (expectation.maxCalls !== undefined && result.toolCalls.length > expectation.maxCalls) {
		problems.push(
			`${result.toolCalls.length} total calls exceeds budget of ${expectation.maxCalls}`
		);
	}

	return {
		passed: problems.length === 0,
		explanation:
			problems.length === 0
				? `interpreted intent correctly: called ${result.calledToolNames.join(', ')}`
				: problems.join('; '),
		groupResults
	};
}
