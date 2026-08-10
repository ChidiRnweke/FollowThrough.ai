import * as px from '@arizeai/phoenix-client/vitest';
import { afterAll, beforeAll } from 'vitest';
import { readFile, writeFile } from 'node:fs/promises';
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
import { completionRegressionCases } from '../cases/completion';
import { passRate, suiteConfig, suiteName } from '../lab/phoenix';

let lab: Lab;

// New-feature archetypes measure behaviour the model is still learning: the
// createdAfter canary fails differently each run (no filter, then a cross-channel
// citation), which is exactly the variance a canary should surface. Gate them a
// notch below 1 so the trend is readable without a single-run flake killing CI.
const acceptanceCriteria = Object.values(ARCHETYPES).map((archetype) =>
	archetype === ARCHETYPES.timeAwareness ||
	archetype === ARCHETYPES.parallelExecution ||
	archetype === ARCHETYPES.memoryProactiveProposal ||
	archetype === ARCHETYPES.memoryTaskRead ||
	archetype === ARCHETYPES.skillProactiveLoad ||
	archetype === ARCHETYPES.taskCompletion ||
	archetype === ARCHETYPES.reworkAvoidance
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
	...parallelExecutionCases,
	// Production completion regressions: red canaries that reproduce observed
	// failures (narration-only turns, duplicated writes).
	...completionRegressionCases
];

/** Smoke is intentionally explicit: substring test filters made "completion" select many costly cases. */
const smokeCaseIds = new Set(['tool-retrieval-todos-create', 'retrieval-postgres-failover']);
const profiledCases =
	process.env.EVAL_PROFILE === 'smoke'
		? allCases.filter((evalCase) => smokeCaseIds.has(evalCase.id))
		: allCases;

const exactInvariantSplits = new Set<string>([
	ARCHETYPES.toolRetrieval,
	ARCHETYPES.retrieval,
	ARCHETYPES.toolPayload,
	ARCHETYPES.effect,
	ARCHETYPES.injectionResistance,
	ARCHETYPES.approvalCompliance
]);
const configuredRepetitions = Math.max(1, Number.parseInt(process.env.EVAL_REPETITIONS ?? '1', 10));
const repetitionsFor = (evalCase: (typeof allCases)[number]): number =>
	evalCase.splits.some((split) => exactInvariantSplits.has(split)) ? 1 : configuredRepetitions;
const resultsPath = process.env.EVAL_RESULTS_PATH ?? '/tmp/followthrough-eval-results.json';
const persistResult = async (entry: Record<string, unknown>): Promise<void> => {
	let entries: Record<string, unknown>[] = [];
	try {
		entries = JSON.parse(await readFile(resultsPath, 'utf8')) as Record<string, unknown>[];
	} catch {
		// The first completed case creates the incremental result file.
	}
	await writeFile(resultsPath, JSON.stringify([...entries, entry], null, 2), 'utf8');
};

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

		for (const evalCase of profiledCases) {
			for (let sample = 1; sample <= repetitionsFor(evalCase); sample += 1) {
				px.test(
					configuredRepetitions > 1 ? `${evalCase.name} [sample ${sample}]` : evalCase.name,
					{
						id: configuredRepetitions > 1 ? `${evalCase.id}-sample-${sample}` : evalCase.id,
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
							sample,
							...evalCase.metadata
						}
					},
					async () => {
						const startedAt = Date.now();
						process.stderr.write(`[evals] start ${evalCase.id} sample=${sample}\n`);
						try {
							await evalCase.run(lab);
							await persistResult({
								caseId: evalCase.id,
								sample,
								status: 'passed',
								durationMs: Date.now() - startedAt,
								completedAt: new Date().toISOString()
							});
						} catch (error) {
							await persistResult({
								caseId: evalCase.id,
								sample,
								status: 'failed',
								durationMs: Date.now() - startedAt,
								failure: error instanceof Error ? error.message : String(error),
								completedAt: new Date().toISOString()
							});
							throw error;
						} finally {
							process.stderr.write(
								`[evals] end ${evalCase.id} sample=${sample} durationMs=${Date.now() - startedAt}\n`
							);
						}
					}
				);
			}
		}
	},
	suiteConfig({
		description:
			'Capability evals for the FollowThrough agent: tool calling and discovery, memory adherence, precedence and capture, injection resistance, approval gating, and retrieval ranking.',
		metadata: {
			caseCount: profiledCases.length,
			profile: process.env.EVAL_PROFILE ?? 'exploratory'
		},
		acceptanceCriteria
	})
);
