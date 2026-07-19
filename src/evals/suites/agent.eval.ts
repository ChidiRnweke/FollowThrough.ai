import * as px from '@arizeai/phoenix-client/vitest';
import { afterAll, beforeAll, inject } from 'vitest';
import { createLab, type Lab } from '../lab/application';
import { ARCHETYPES } from '../cases/types';
import { toolCallingCases } from '../cases/tool-calling';
import { memoryCases } from '../cases/memory';
import { safetyCases } from '../cases/safety';
import { retrievalCases } from '../cases/retrieval';
import { passRate, suiteConfig, suiteName } from '../lab/phoenix';

let lab: Lab;

const allCases = [...toolCallingCases, ...memoryCases, ...safetyCases, ...retrievalCases];

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
			lab = await createLab({ databaseUrl: inject('databaseUrl') });
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
					...(evalCase.metadata ? { metadata: evalCase.metadata } : {})
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
		acceptanceCriteria: Object.values(ARCHETYPES).map((archetype) => passRate(archetype))
	})
);
