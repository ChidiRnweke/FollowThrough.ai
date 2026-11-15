import { afterEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ConflictError } from '$lib/errors';
import { CHAT_WEB_SEARCH_DEFAULTS, type RunAdmissionLimits } from '$lib/models/agent';
import type { ActorContext } from '$lib/models/identity';
import {
	AgentSdkHarness,
	type AgentHarnessDependencies
} from '$lib/server/controllers/agent/controller';
import * as schema from '$lib/server/db/schema';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import {
	AgentRunDecisionRecords,
	AgentRunEventRecords
} from '$lib/server/repositories/agent/postgres/agent-runs';
import {
	AgentPreferenceRecords,
	AgentRunRecords,
	AgentSessionRecords
} from '$lib/server/repositories/agent/postgres/agent-settings';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { RunAdmissionRules } from '$lib/server/services/agent/runs/admission';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { AgentRunHarnessRecords } from '$lib/server/services/agent/runs/records';
import type { RunSignals } from '$lib/server/services/agent/runs/signals';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { testClock } from '$lib/testing/workspace/fixtures/domain-builders';
import { context, seedUser } from '../database-harness';

/** Holds each admitted run at the start of its execution, so it stays queued and keeps its place. */
class HeldRunSignals implements RunSignals {
	observe(): Promise<() => Promise<void>> {
		return new Promise(() => {});
	}
	abortOnCancel(): Promise<() => Promise<void>> {
		return new Promise(() => {});
	}
}

const connections: ReturnType<typeof postgres>[] = [];
afterEach(async () => {
	for (const connection of connections.splice(0)) await connection.end();
});

/**
 * One caller's harness on a connection of its own. A pool of one connection shared by every
 * caller would run their transactions one after another and could not show a race.
 */
const caller = (owner: ActorContext, limits: RunAdmissionLimits) => {
	const connection = postgres(context.url, { max: 1 });
	connections.push(connection);
	const { database, transactionRunner } = createTransactionContext(drizzle(connection, { schema }));
	const journal = new ConversationArchive(
		owner,
		new ConversationRecords(owner, database),
		testClock
	);
	return new AgentSdkHarness(
		owner,
		new WorkspaceCommandRulesService(),
		capabilityDependencies<AgentHarnessDependencies>({
			now: testClock,
			...agentRulesFixture(),
			conversationMessages: journal,
			conversationSessions: journal,
			records: new AgentRunHarnessRecords(
				new AgentRunRecords(owner, database),
				new AgentRunEventRecords(owner, database),
				new AgentRunDecisionRecords(owner, database),
				new AgentSessionRecords(owner, database)
			),
			preferences: new AgentPreferenceCatalog(
				owner,
				new AgentPreferenceRecords(owner, database),
				testClock
			),
			webSearchOverrides: CHAT_WEB_SEARCH_DEFAULTS,
			traceContext: { activeTraceparent: () => undefined },
			defaultModel: 'openai/test-model',
			transactionRunner,
			runAdmission: new RunAdmissionRules(limits),
			runSignals: new HeldRunSignals()
		})
	);
};

/** Submits one chat run for each caller at once and reports each outcome. */
const submitTogether = (callers: readonly AgentSdkHarness[]) =>
	Promise.all(
		callers.map((harness, index) =>
			harness.submit({ requestId: crypto.randomUUID(), input: `Question ${index}` }).then(
				() => 'admitted',
				(error: unknown) => (error instanceof ConflictError ? error.message : error)
			)
		)
	);

/** The chat runs saved as executing, read apart from the harness. */
const executingRuns = async (): Promise<readonly { readonly userId: string }[]> =>
	context.client<{ userId: string }[]>`
		select user_id as "userId" from agent_runs
		where kind = 'agent' and status in ('queued', 'running', 'cancelling')`;
const executingFor = async (owners: readonly ActorContext[]): Promise<number> =>
	(await executingRuns()).filter((run) => owners.some((owner) => owner.userId === run.userId))
		.length;

describe('admitting concurrent chat runs', () => {
	it("admits exactly the account's limit when more runs are submitted at once", async () => {
		const owner = await seedUser('53001');
		const limits = { perAccount: 3, total: 1_000_000 };
		const callers = Array.from({ length: 6 }, () => caller(owner, limits));

		const outcomes = await submitTogether(callers);

		expect({
			admitted: outcomes.filter((outcome) => outcome === 'admitted').length,
			refused: [...new Set(outcomes.filter((outcome) => outcome !== 'admitted'))],
			saved: await executingFor([owner])
		}).toEqual({
			admitted: 3,
			refused: ['You have 3 agent runs in progress. Wait for one to finish.'],
			saved: 3
		});
	});

	it('admits exactly the total across accounts when several accounts submit at once', async () => {
		const first = await seedUser('53002');
		const second = await seedUser('53003');
		// Runs that earlier contracts left executing count toward the total as well.
		const total = (await executingRuns()).length + 3;
		const limits = { perAccount: 10, total };
		const callers = [first, second, first, second, first, second].map((owner) =>
			caller(owner, limits)
		);

		const outcomes = await submitTogether(callers);

		expect({
			admitted: outcomes.filter((outcome) => outcome === 'admitted').length,
			refused: [...new Set(outcomes.filter((outcome) => outcome !== 'admitted'))],
			saved: await executingFor([first, second])
		}).toEqual({
			admitted: 3,
			refused: ['This server is running as many agent runs as it allows. Try again in a moment.'],
			saved: 3
		});
	});
});
