import { describe, expect, it } from 'vitest';
import { ToolPreferences } from '$lib/server/controllers/agent/tool-preferences/controller';
import { TrustPolicies } from '$lib/server/controllers/agent/trust-policies/controller';
import { ToolPreferenceRecords } from '$lib/server/repositories/agent/postgres/tool-preferences';
import { TrustPolicyRecords } from '$lib/server/repositories/agent/postgres/trust-policies';
import { ToolAccess } from '$lib/server/services/agent/tools/preferences';
import { ToolTrust } from '$lib/server/services/agent/runs/tool-trust';
import { workspaceCommandSchema } from '$lib/models/workspace-mutations';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { actor, context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const seeded = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const preferences = new ToolPreferenceRecords(database);
	const tools = new ToolPreferences({
		syncMutations: sync.mutations,
		preferences: new ToolAccess(preferences, {
			entries: () => [
				{
					name: 'archive_project',
					description: 'Archive a project',
					classification: 'mutation',
					locked: false
				}
			]
		})
	});
	const policies = new TrustPolicies({
		syncMutations: sync.mutations,
		trustPolicyStore: new ToolTrust(new TrustPolicyRecords(database))
	});
	return { ...seeded, sync, preferences, tools, policies };
};

describe('guarded tool and policy preferences', () => {
	it('replays a tool preference once after a lost response', async () => {
		const { owner, tools, preferences } = await setup('9411');
		const input = {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command: {
				kind: 'setToolPreference' as const,
				userId: owner.userId,
				toolName: 'archive_project',
				enabled: false
			}
		};
		await tools.synchronize(owner, input);
		await tools.synchronize(owner, input);
		expect(await preferences.listForUser(owner)).toEqual([
			{ toolName: 'archive_project', enabled: false }
		]);
	});
	it('rejects a stale reset instead of deleting a newer project override', async () => {
		const { owner, project, tools, preferences, sync } = await setup('9412');
		await tools.setEnabled(owner, {
			projectId: project.id,
			toolName: 'archive_project',
			enabled: false
		});
		const base = await sync.objects.read(
			owner,
			{ type: 'project_tool_overrides', id: [owner.userId, project.id, 'archive_project'] },
			null
		);
		if (base.kind !== 'found') throw new Error('The override must exist');
		await tools.setEnabled(owner, {
			projectId: project.id,
			toolName: 'archive_project',
			enabled: true
		});
		const result = await tools.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: {
				kind: 'resetProjectToolOverride',
				userId: owner.userId,
				projectId: project.id,
				toolName: 'archive_project'
			}
		});
		expect({
			kind: result.kind,
			overrides: await preferences.listForProject(owner, project.id)
		}).toEqual({ kind: 'conflict', overrides: [{ toolName: 'archive_project', enabled: true }] });
	});
	it('returns a durable tombstone when resetting a project override', async () => {
		const { owner, project, tools, sync } = await setup('9413');
		await tools.setEnabled(owner, {
			projectId: project.id,
			toolName: 'archive_project',
			enabled: false
		});
		const base = await sync.objects.read(
			owner,
			{ type: 'project_tool_overrides', id: [owner.userId, project.id, 'archive_project'] },
			null
		);
		if (base.kind !== 'found') throw new Error('The override must exist');
		const result = await tools.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: base.snapshot.etag,
			command: {
				kind: 'resetProjectToolOverride',
				userId: owner.userId,
				projectId: project.id,
				toolName: 'archive_project'
			}
		});
		expect(result.kind === 'applied' ? result.receipt.resource.kind : result.kind).toBe('deleted');
	});
	it('round-trips a whole-percent policy threshold through the guarded resource boundary', async () => {
		const { owner, policies, sync } = await setup('9414');
		const command = workspaceCommandSchema.parse({
			kind: 'updateTrustPolicy',
			userId: owner.userId,
			pipeline: 'agent',
			autoAcceptEnabled: true,
			minimumConfidence: 85
		});
		if (command.kind !== 'updateTrustPolicy') throw new Error('Expected a policy command');
		await policies.synchronize(owner, {
			operationId: crypto.randomUUID(),
			baseEtag: null,
			command
		});
		const stored = await sync.objects.read(
			owner,
			{ type: 'trust_policies', id: [owner.userId, 'agent'] },
			null
		);
		expect(
			stored.kind === 'found' && stored.snapshot.value.type === 'trust_policies'
				? stored.snapshot.value.value.minimumConfidence
				: stored.kind
		).toBe(85);
	});
});

it('rejects a project override for a project owned by another account', async () => {
	const { project, tools } = await setup('9415');
	const other = await actor('9416');
	const result = await tools.synchronize(other, {
		operationId: crypto.randomUUID(),
		baseEtag: null,
		command: {
			kind: 'setProjectToolOverride',
			userId: other.userId,
			projectId: project.id,
			toolName: 'archive_project',
			enabled: false
		}
	});
	expect(result.kind).toBe('rejected');
});
