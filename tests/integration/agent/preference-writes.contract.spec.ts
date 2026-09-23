import { expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { workspaceResourceKey } from '$lib/models/workspace-sync';
import { connectPostgresTestDatabase } from '$lib/server/db/testcontainer';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { AgentPreferenceRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import {
	AgentSettings,
	type AgentSettingsDependencies
} from '$lib/server/controllers/agent/settings/controller';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, now, seedNote } from '../database-harness';

it.each([false, true])(
	'retains concurrent independent preference edits (existing row: %s)',
	async (existing) => {
		const { owner } = await seedNote(existing ? '16901' : '16902');
		const records = new AgentPreferenceRecords(context.db);
		if (existing)
			await records.upsert(owner, {
				userId: owner.userId,
				defaultModel: 'vendor/retained',
				executionMode: 'approval_required',
				inlineSuggestionsEnabled: true,
				createdAt: now,
				updatedAt: now
			});
		const first = connectPostgresTestDatabase(context.url);
		const second = connectPostgresTestDatabase(context.url);
		const controller = (connection: typeof first) => {
			const { database, transactionRunner } = createTransactionContext(connection.db);
			return new AgentSettings(
				capabilityDependencies<AgentSettingsDependencies>({
					preferences: new AgentPreferenceCatalog(new AgentPreferenceRecords(database)),
					transactionRunner,
					now: () => now
				})
			);
		};
		const blocker = postgres(context.url, { max: 2 });
		const locked = Promise.withResolvers<void>();
		const release = Promise.withResolvers<void>();
		const key =
			'resource:' + workspaceResourceKey({ type: 'agent_preferences', id: [owner.userId] });
		const holding = blocker.begin(async (transaction) => {
			await transaction`select pg_advisory_xact_lock(hashtext(${owner.userId}), hashtext(${key}))`;
			locked.resolve();
			await release.promise;
		});
		try {
			await locked.promise;
			const [firstBackend] = await first.client<{ pid: number }[]>`select pg_backend_pid() as pid`;
			const [secondBackend] = await second.client<
				{ pid: number }[]
			>`select pg_backend_pid() as pid`;
			const updates = Promise.all([
				controller(first).updatePreferences(owner, { inlineSuggestionsEnabled: false }),
				controller(second).updatePreferences(owner, { webSearchMaxResults: 17 })
			]);
			await vi.waitFor(async () => {
				const waiting = await blocker<
					{ pid: number }[]
				>`select pid from pg_stat_activity where pid in (${firstBackend!.pid}, ${secondBackend!.pid}) and wait_event_type = 'Lock'`;
				if (waiting.length !== 2)
					throw new Error('Both preference edits must reach the account lock');
			});
			release.resolve();
			await holding;
			await updates;
			const saved = await records.get(owner);
			expect({
				inline: saved?.inlineSuggestionsEnabled,
				results: saved?.webSearchMaxResults,
				model: saved?.defaultModel
			}).toEqual({
				inline: false,
				results: 17,
				model: existing ? 'vendor/retained' : undefined
			});
		} finally {
			release.resolve();
			await holding;
			await Promise.all([first.close(), second.close(), blocker.end()]);
		}
	}
);
