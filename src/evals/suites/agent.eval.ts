import * as px from '@arizeai/phoenix-client/vitest';
import { afterAll, beforeAll } from 'vitest';
import { createLab, type Lab } from '../lab/application';
import { ARCHETYPES } from '../cases/types';
import { toolCallingCases } from '../cases/tool-calling';
import { toolRetrievalCases } from '../cases/tool-retrieval';
import { toolInvocationCases, toolSearchTriggerCases } from '../cases/tool-invocation';
import { memoryCases } from '../cases/memory';
import { safetyCases } from '../cases/safety';
import { diagramCases } from '../cases/diagrams';
import { effectCases } from '../cases/effects';
import { noteEditingCases } from '../cases/note-editing';
import { retrievalCases } from '../cases/retrieval';
import { groundingCases } from '../cases/grounding';
import { contextAwarenessCases } from '../cases/context-awareness';
import { multiStepCases } from '../cases/multi-step';
import { skillAdherenceCases } from '../cases/skill-adherence';
import { selectionCases } from '../cases/selection';
import { stoppingCases } from '../cases/stopping';
import { intentInterpretationCases } from '../cases/intent-interpretation';
import { correctnessCases } from '../cases/correctness';
import { multiTurnCorrectnessCases } from '../cases/multi-turn-correctness';
import { inlineSuggestionCases } from '../cases/inline-suggestion';
import { timeAwarenessCases, parallelExecutionCases } from '../cases/time-awareness';
import { passRate, suiteConfig, suiteName } from '../lab/phoenix';

let lab: Lab;

// New-feature archetypes measure behaviour the model is still learning: the
// createdAfter canary fails differently each run (no filter, then a cross-channel
// citation), which is exactly the variance a canary should surface. Gate them a
// notch below 1 so the trend is readable without a single-run flake killing CI.
const acceptanceCriteria = Object.values(ARCHETYPES).map((archetype) =>
	archetype === ARCHETYPES.timeAwareness || archetype === ARCHETYPES.parallelExecution
		? passRate(archetype, 0.8)
		: passRate(archetype)
);

const allCases = [
	// Cheapest first: catalog ranking needs no agent turn, so a broken catalog
	// surfaces in seconds rather than after the full suite has run.
	...toolRetrievalCases,
	...retrievalCases,
	...toolCallingCases,
	...stoppingCases,
	...toolInvocationCases,
	...toolSearchTriggerCases,
	...contextAwarenessCases,
	...groundingCases,
	...memoryCases,
	...skillAdherenceCases,
	...selectionCases,
	...multiStepCases,
	...safetyCases,
	...diagramCases,
	...effectCases,
	...noteEditingCases,
	// Most expensive: vague multi-intent prompts that exercise interpretation.
	...intentInterpretationCases,
	// Correctness: right-target assertions for disambiguation.
	...correctnessCases,
	// Most expensive: multi-turn cases (2-3 API calls each).
	...multiTurnCorrectnessCases,
	// Inline suggestions: drive the ghost-text controller directly, no agent turn.
	...inlineSuggestionCases,
	// Time awareness and parallelism: new-feature behaviour, cheap single turns.
	...timeAwarenessCases,
	...parallelExecutionCases
];

/**
 * Every case in the app is registered into this one suite, which is what makes
 * a single accumulating dataset possible.
 *
 * The client syncs a suite by posting `action: "update"`, replacing the
 * dataset's current version with exactly the examples that suite declared. Two
 * describe blocks sharing a dataset name therefore overwrite each other and the
 * dataset ends up holding only whichever ran last. One suite avoids that
 * entirely; `splits` carry the archetype so the dataset stays sliceable.
 *
 * To run one archetype, filter by test name — the splits are also the
 * annotation names, so `pnpm test:evals -t "memory"` and the Phoenix
 * `memory_adherence` split select the same work.
 */
px.describe(
	suiteName('capabilities'),
	() => {
		beforeAll(async () => {
			lab = await createLab();
		});

		afterAll(async () => {
			await lab?.close();
		});

		for (const evalCase of allCases) {
			px.test(
				evalCase.name,
				{
					id: evalCase.id,
					input: evalCase.input,
					expected: evalCase.expected,
					splits: [...evalCase.splits],
					// Splits are sent on upload but Phoenix 17.15.0 does not persist
					// them — every example reads back `splits: null`, so the UI has
					// nothing to filter on. Metadata does round-trip, so the archetype
					// is mirrored here to keep the dataset sliceable today. Keep both:
					// `splits` starts working the moment the server supports it.
					metadata: {
						archetype: evalCase.splits[0],
						tags: [...evalCase.splits],
						...evalCase.metadata
					}
				},
				async () => {
					await evalCase.run(lab);
				}
			);
		}
	},
	suiteConfig({
		description:
			'Capability evals for the FollowThrough agent: tool calling and discovery, memory adherence, precedence and capture, injection resistance, approval gating, and retrieval ranking.',
		metadata: { caseCount: allCases.length },
		acceptanceCriteria
	})
);
