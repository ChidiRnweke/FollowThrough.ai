import {
	AgentSettings,
	type AgentSettingsDependencies
} from '$lib/server/controllers/agent/settings/controller';
import { connectPostgresTestDatabase } from '$lib/server/db/postgres-test-context';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { AgentPreferenceRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { AgentPreferenceEditingService } from '$lib/services/agent/preferences';
import { WorkspaceCommandRulesService } from '$lib/services/workspace/commands';
import { agentRulesFixture } from '$lib/testing/agent/fixtures/rules';
import { agentToolResultsFixture } from '$lib/testing/agent/fixtures/tool-results';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { expect, it, vi } from 'vitest';
import { context, now, seedUser } from '../database-harness';

it('serializes synchronized creation behind an ordinary absent-row preference write', async () => {
	const owner = await seedUser('16903');
	const first = connectPostgresTestDatabase(context.url);
	const second = connectPostgresTestDatabase(context.url);
	const ready = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const setup = (connection: typeof first) => {
		const { database, transactionRunner } = createTransactionContext(connection.db);
		const sync = createSyncCapability({ db: database });
		const settings = new AgentSettings(
			new WorkspaceCommandRulesService(),
			capabilityDependencies<AgentSettingsDependencies>({
				...agentToolResultsFixture(),
				...agentRulesFixture(),
				preferenceEditing: new AgentPreferenceEditingService(),
				preferences: new AgentPreferenceCatalog(new AgentPreferenceRecords(database)),
				transactionRunner,
				now: () => now,
				syncMutations: sync.mutations,
				syncRetry: sync.mutationRetry
			})
		);
		return { settings, transactionRunner };
	};
	const normal = setup(first);
	const synchronized = setup(second);
	const input = {
		operationId: crypto.randomUUID(),
		baseEtag: null,
		command: {
			kind: 'updateAgentPreferences' as const,
			userId: owner.userId,
			patch: { inlineSuggestionsEnabled: false }
		}
	};
	const writing = normal.transactionRunner.run(async () => {
		await normal.settings.updatePreferences(owner, { webSearchMaxResults: 17 });
		ready.resolve();
		await release.promise;
	});
	try {
		await Promise.race([ready.promise, writing]);
		const [backend] = await second.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
		const syncing = synchronized.settings.synchronize(owner, input);
		await vi.waitFor(async () => {
			const waiting = await context.client<
				{ pid: number }[]
			>`select pid from pg_locks where pid = ${backend!.pid} and locktype = 'advisory' and not granted`;
			if (waiting.length !== 1)
				throw new Error('Synchronized creation must wait on the ordinary resource advisory lock');
		});
		release.resolve();
		await writing;
		const result = await syncing;
		const saved = await new AgentPreferenceRecords(context.db).get(owner);
		expect({
			result: result.kind,
			results: saved?.webSearchMaxResults,
			inline: saved?.inlineSuggestionsEnabled
		}).toEqual({ result: 'conflict', results: 17, inline: true });
	} finally {
		release.resolve();
		await writing;
		await Promise.all([first.close(), second.close()]);
	}
});
