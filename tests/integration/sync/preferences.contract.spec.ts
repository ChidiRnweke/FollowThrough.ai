import { describe, expect, it } from 'vitest';
import {
	AgentSettings,
	type AgentSettingsDependencies
} from '$lib/server/controllers/agent/settings/controller';
import {
	UserSettings,
	type UserSettingsDependencies
} from '$lib/server/controllers/user-settings/controller';
import { AgentPreferenceRecords } from '$lib/server/repositories/agent/postgres/agent-settings';
import { UserPreferencesRecords } from '$lib/server/repositories/identity/postgres/user-preferences';
import { AgentPreferenceCatalog } from '$lib/server/services/agent/runs/preferences';
import { UserPreferenceStore } from '$lib/server/services/identity/user-preferences';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const preferences = new AgentPreferenceCatalog(new AgentPreferenceRecords(database));
	const agent = new AgentSettings(
		capabilityDependencies<AgentSettingsDependencies>({
			preferences,
			syncMutations: sync.mutations
		})
	);
	const user = new UserSettings(
		capabilityDependencies<UserSettingsDependencies>({
			preferences: new UserPreferenceStore(new UserPreferencesRecords(database)),
			syncMutations: sync.mutations
		})
	);
	return { owner, sync, preferences, agent, user };
};

describe('guarded account preferences', () => {
	it('replays creation of document defaults after a lost response', async () => {
		const { owner, user } = await setup('9401');
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'updateUserPreferences' as const,
				userId: owner.userId,
				sectionNumberingDefault: true
			}
		};
		await user.synchronize(owner, input);
		await user.synchronize(owner, input);
		expect(await user.getPreferences(owner)).toEqual({ sectionNumberingDefault: true });
	});
	it('clears a model override while retaining settings from another tab', async () => {
		const { owner, preferences, sync, agent } = await setup('9402');
		await preferences.update(owner, { defaultModel: 'retired/model', webSearchMaxResults: 12 });
		const base = await sync.objects.read(
			owner,
			{ type: 'agent_preferences', id: [owner.userId] },
			null
		);
		if (base.kind !== 'found') throw new Error('Preferences must exist');
		const result = await agent.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: {
				kind: 'updateAgentPreferences',
				userId: owner.userId,
				patch: { defaultModel: null }
			}
		});
		const saved = await preferences.get(owner);
		expect({
			kind: result.kind,
			model: saved.defaultModel,
			results: saved.webSearchMaxResults
		}).toEqual({ kind: 'applied', model: undefined, results: 12 });
	});
	it('rejects stale preference writes instead of silently rebasing a second form', async () => {
		const { owner, preferences, sync, agent } = await setup('9403');
		await preferences.update(owner, { webSearchMaxResults: 12 });
		const base = await sync.objects.read(
			owner,
			{ type: 'agent_preferences', id: [owner.userId] },
			null
		);
		if (base.kind !== 'found') throw new Error('Preferences must exist');
		await preferences.update(owner, { webSearchMaxResults: 15 });
		const result = await agent.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: {
				kind: 'updateAgentPreferences',
				userId: owner.userId,
				patch: { inlineSuggestionsEnabled: false }
			}
		});
		const saved = await preferences.get(owner);
		expect({
			kind: result.kind,
			suggestions: saved.inlineSuggestionsEnabled,
			results: saved.webSearchMaxResults
		}).toEqual({ kind: 'conflict', suggestions: true, results: 15 });
	});
	it('keeps validation failures out of the persisted preferences', async () => {
		const { owner, sync, agent } = await setup('9404');
		const result = await agent.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'updateAgentPreferences',
				userId: owner.userId,
				patch: { webSearchMaxResults: 500 }
			}
		});
		const stored = await sync.objects.read(
			owner,
			{ type: 'agent_preferences', id: [owner.userId] },
			null
		);
		expect({ kind: result.kind, stored: stored.kind }).toEqual({
			kind: 'rejected',
			stored: 'unavailable'
		});
	});
});
