/**
 * Pure logic for judge consensus — no model, no configuration, no environment.
 * Kept in its own module so the aggregation rules are unit-testable in the
 * ordinary Node lane without pulling in the evals lab or its env handling.
 */

export interface ConsensusVerdict {
	/** True when the majority (or unanimous) verdict is the pass verdict. */
	readonly followed: boolean;
	/** The consensus verdict, or 'split' when no verdict commands a majority. */
	readonly verdict: string;
	/** Fraction of judges that agreed with the consensus, e.g. 1 or 2/3. */
	readonly agreement: number;
	/** Every judge's verdict, in call order. */
	readonly votes: readonly string[];
	/** How many judges actually ran (3, or 5 after escalation). */
	readonly judges: number;
	/** The reasoning of the first judge that voted for the consensus verdict. */
	readonly reasoning: string;
}

export interface CategoricalVote {
	readonly verdict: string;
	readonly reasoning: string;
}

/**
 * Parallel judges multiply the surface for transient provider failures (an empty
 * completion, a timeout), so each judge call is retried before its vote is
 * allowed to fail the whole consensus.
 */
export async function runWithRetry(
	run: () => Promise<CategoricalVote>,
	attempts = 3
): Promise<CategoricalVote> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await run();
		} catch (error) {
			if (attempt >= attempts) throw error;
			await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
		}
	}
}

/**
 * Pure majority aggregation over the collected votes. A tied top verdict is
 * reported as `split` and never rounded to a fake majority; the score a case
 * records is the agreement fraction, never a number the model emitted.
 */
export function aggregateVotes(
	votes: readonly CategoricalVote[],
	followedVerdict: string
): ConsensusVerdict {
	const tally = new Map<string, number>();
	for (const vote of votes) tally.set(vote.verdict, (tally.get(vote.verdict) ?? 0) + 1);
	const ranked = [...tally.entries()].sort((left, right) => right[1] - left[1]);
	const [verdict, count] = ranked[0]!;
	const tied = ranked[1] !== undefined && ranked[1][1] === count;
	if (tied)
		return {
			followed: false,
			verdict: 'split',
			agreement: count / votes.length,
			votes: votes.map((vote) => vote.verdict),
			judges: votes.length,
			reasoning: 'The judges could not reach a majority verdict.'
		};
	const reasoning = votes.find((vote) => vote.verdict === verdict)?.reasoning ?? '';
	return {
		followed: verdict === followedVerdict,
		verdict,
		agreement: count / votes.length,
		votes: votes.map((vote) => vote.verdict),
		judges: votes.length,
		reasoning
	};
}
