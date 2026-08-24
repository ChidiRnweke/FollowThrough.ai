import type { AcceptanceCriterion } from '@arizeai/phoenix-client/vitest';
import { ARCHETYPES, type EvalCase } from '../cases/types';
import { passRate } from '../lab/phoenix';

const relaxedArchetypes = new Set<string>([
	ARCHETYPES.timeAwareness,
	ARCHETYPES.parallelExecution,
	ARCHETYPES.memoryProactiveProposal,
	ARCHETYPES.memoryTaskRead,
	ARCHETYPES.skillProactiveLoad,
	ARCHETYPES.taskCompletion,
	ARCHETYPES.reworkAvoidance
]);

const knownArchetypes = new Set<string>(Object.values(ARCHETYPES));

/** Gate only annotations that the selected cases can produce. */
export const acceptanceCriteriaFor = (
	cases: readonly Pick<EvalCase, 'splits'>[]
): AcceptanceCriterion[] => {
	const selectedArchetypes = new Set(
		cases
			.map((evalCase) => evalCase.splits[0])
			.filter((split): split is string => split !== undefined && knownArchetypes.has(split))
	);

	return Object.values(ARCHETYPES)
		.filter((archetype) => selectedArchetypes.has(archetype))
		.map((archetype) => passRate(archetype, relaxedArchetypes.has(archetype) ? 0.8 : 1));
};
