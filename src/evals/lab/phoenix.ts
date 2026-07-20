import { config as loadDotenv } from 'dotenv';
import type { AcceptanceCriterion, SuiteConfig } from '@arizeai/phoenix-client/vitest';
import {
	DEFAULT_GENERATION_MODEL,
	DEFAULT_OPENROUTER_BASE_URL
} from '$lib/server/domain/openrouter-client';

loadDotenv({ quiet: true });

/**
 * The Phoenix client reads `PHOENIX_HOST`, while this repo's OTel setup already
 * standardised on `PHOENIX_BASE_URL`. Bridge them rather than asking for the
 * same endpoint twice under two names.
 */
if (!process.env.PHOENIX_HOST && process.env.PHOENIX_BASE_URL)
	process.env.PHOENIX_HOST = process.env.PHOENIX_BASE_URL;

/**
 * This Phoenix instance is shared across applications, so everything the agent
 * lab creates is namespaced. All suites write examples into one dataset for the
 * app — cases from every archetype live together and each run is an experiment
 * over that dataset, which is what makes cross-archetype comparison possible.
 */
export const DATASET_NAME = process.env.PHOENIX_DATASET ?? 'followthrough-agent';

/** Suite names double as experiment names, so they carry the app prefix too. */
export const suiteName = (archetype: string): string => `followthrough/agent · ${archetype}`;

/** The model under evaluation. A sweep is the same suite under a different value. */
export const evalModel = (): string =>
	process.env.EVAL_MODEL ?? process.env.OPENROUTER_DEFAULT_MODEL ?? DEFAULT_GENERATION_MODEL;

/**
 * The judge is pinned separately from the model under test, and to a stronger
 * model than the default subject: a judge no better than the system it grades
 * cannot reliably catch that system's mistakes. Changing it changes every
 * historical comparison, so it should be a deliberate act.
 */
export const judgeModel = (): string => process.env.EVAL_JUDGE_MODEL ?? 'deepseek/deepseek-v4-pro';

export const openRouterBaseUrl = (): string =>
	process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL;

/** Phoenix tracking is skipped unless an endpoint is actually configured. */
export const phoenixConfigured = (): boolean => Boolean(process.env.PHOENIX_HOST);

/** Gate a capability on the pass rate across repetitions rather than one sample. */
export const passRate = (annotationName: string, minPassRate = 1): AcceptanceCriterion => ({
	annotationName,
	metric: 'passRate',
	passFn: (annotation) => annotation.score === 1,
	minPassRate
});

/**
 * Shared suite configuration. Keeping it in one place means every suite lands in
 * the same dataset and carries the model/commit that produced it — without
 * those, two experiments are indistinguishable in the UI.
 */
export const suiteConfig = (options: {
	readonly description: string;
	readonly acceptanceCriteria?: AcceptanceCriterion[];
	readonly metadata?: Record<string, unknown>;
}): SuiteConfig => ({
	datasetName: DATASET_NAME,
	description: options.description,
	metadata: {
		model: evalModel(),
		judgeModel: judgeModel(),
		commit: process.env.GIT_COMMIT ?? 'working-tree',
		...options.metadata
	},
	dryRun: !phoenixConfigured(),
	// Gates are for recorded baselines and CI, not for exploratory runs. A
	// filtered run (`-t "memory"`) produces no samples for the other archetypes,
	// and gating those would report a wall of spurious failures that buries the
	// one result the developer actually asked for.
	...(gatingEnabled() && options.acceptanceCriteria
		? { acceptanceCriteria: options.acceptanceCriteria }
		: {})
});

/** Acceptance gating: on in CI, or locally with `EVAL_GATE=1`. */
export const gatingEnabled = (): boolean =>
	process.env.EVAL_GATE === '1' || process.env.CI === 'true';
