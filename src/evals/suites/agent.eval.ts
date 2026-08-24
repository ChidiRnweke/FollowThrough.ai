import * as px from '@arizeai/phoenix-client/vitest';
import { afterAll, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createLab, type Lab } from '../lab/application';
import { ARCHETYPES } from '../cases/types';
import { evalModel, passRate, suiteConfig, suiteName } from '../lab/phoenix';
import { EVAL_SECTIONS, selectEvalCases } from './case-catalog';
import { appendEvalResult, buildEvalResultRecord } from '../lab/result-log';

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

const profile = process.env.EVAL_PROFILE ?? 'exploratory';
const selectedSection = process.env.EVAL_SECTION;
const profiledCases = selectEvalCases({
	profile,
	...(selectedSection ? { section: selectedSection } : {}),
	...(process.env.EVAL_CASE ? { caseId: process.env.EVAL_CASE } : {})
});
const runId = process.env.EVAL_RUN_ID ?? randomUUID();
const subjectModel = evalModel();
const commit =
	process.env.GIT_COMMIT ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const sectionFor = (caseId: string): string =>
	Object.entries(EVAL_SECTIONS).find(([, cases]) =>
		cases.some((item) => item.id === caseId)
	)?.[0] ?? 'unknown';

const exactInvariantSplits = new Set<string>([
	ARCHETYPES.toolRetrieval,
	ARCHETYPES.retrieval,
	ARCHETYPES.toolPayload,
	ARCHETYPES.effect,
	ARCHETYPES.injectionResistance,
	ARCHETYPES.approvalCompliance
]);
const configuredRepetitions = Math.max(1, Number.parseInt(process.env.EVAL_REPETITIONS ?? '1', 10));
const repetitionsFor = (evalCase: (typeof profiledCases)[number]): number =>
	evalCase.splits.some((split) => exactInvariantSplits.has(split)) ? 1 : configuredRepetitions;
const resultsPath = process.env.EVAL_RESULTS_PATH ?? '/tmp/followthrough-eval-results.json';

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
							await appendEvalResult(
								resultsPath,
								buildEvalResultRecord({
									runId,
									section: sectionFor(evalCase.id),
									subjectModel,
									commit,
									profile,
									caseId: evalCase.id,
									sample,
									outcome: 'passed',
									durationMs: Date.now() - startedAt,
									completedAt: new Date().toISOString()
								})
							);
						} catch (error) {
							await appendEvalResult(
								resultsPath,
								buildEvalResultRecord({
									runId,
									section: sectionFor(evalCase.id),
									subjectModel,
									commit,
									profile,
									caseId: evalCase.id,
									sample,
									outcome: 'failed',
									durationMs: Date.now() - startedAt,
									failure: error instanceof Error ? error.message : String(error),
									completedAt: new Date().toISOString()
								})
							);
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
			profile,
			runId,
			section: selectedSection ?? 'all'
		},
		acceptanceCriteria
	})
);
