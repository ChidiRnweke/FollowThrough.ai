import { judgeAgainstRubric, type JudgeRubricInput } from './rubric';
import { judgeInstructionAdherence, type JudgeAdherenceInput } from './instruction-adherence';
import {
	aggregateVotes,
	runWithRetry,
	type CategoricalVote,
	type ConsensusVerdict
} from './consensus-aggregate';

export type { ConsensusVerdict };

/**
 * LLM judges output categorical verdicts, never numbers. A single verdict is a
 * signal; the *score* comes from running several judges in parallel and taking
 * their consensus. That consensus — how many of how many judges agree — is the
 * number a case records.
 *
 * Start with three judges. If they do not agree unanimously, that is exactly the
 * "unsure" case: escalate with two more judges and take the majority of five.
 * A unanimous result needs no escalation, so well-formed cases stay at three
 * judge calls. The aggregation is pure and lives in `consensus-aggregate.ts`.
 */

const BASE_JUDGES = 3;
const ESCALATED_JUDGES = 5;

async function runConsensus(
	run: () => Promise<CategoricalVote>,
	followedVerdict: string
): Promise<ConsensusVerdict> {
	const judge = () => runWithRetry(run);
	let votes = await Promise.all(Array.from({ length: BASE_JUDGES }, judge));
	const unanimous = votes.every((vote) => vote.verdict === votes[0]!.verdict);
	if (!unanimous) {
		votes = [
			...votes,
			...(await Promise.all(Array.from({ length: ESCALATED_JUDGES - BASE_JUDGES }, judge)))
		];
	}
	return aggregateVotes(votes, followedVerdict);
}

/** Consensus version of `judgeInstructionAdherence`. */
export const judgeAdherenceConsensus = (input: JudgeAdherenceInput): Promise<ConsensusVerdict> =>
	runConsensus(async () => {
		const verdict = await judgeInstructionAdherence(input);
		return { verdict: verdict.verdict, reasoning: verdict.reasoning };
	}, 'followed');

/** Consensus version of `judgeAgainstRubric`. */
export const judgeRubricConsensus = (input: JudgeRubricInput): Promise<ConsensusVerdict> =>
	runConsensus(async () => {
		const verdict = await judgeAgainstRubric(input);
		return { verdict: verdict.passed ? 'pass' : 'fail', reasoning: verdict.reasoning };
	}, 'pass');
