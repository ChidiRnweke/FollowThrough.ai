import { describe, expect, it } from 'vitest';
import { Agent, type AgentDependencies } from '$lib/server/controllers/agent/controller';
import { ConversationArchive } from '$lib/server/services/agent/conversations/archive';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { createTransactionContext } from '$lib/server/db/transaction-context';
import { createSyncCapability } from '$lib/server/factories/capabilities/sync-capability-factory';
import { workspaceRecordSchema } from '$lib/models/workspace-records';
import { capabilityDependencies } from '$lib/testing/workspace/fakes/dependency-builder';
import { context, seedNote } from '../database-harness';

const setup = async (suffix: string) => {
	const { owner } = await seedNote(suffix);
	const { database, transactionRunner } = createTransactionContext(context.db);
	const sync = createSyncCapability({ db: database, transactionRunner });
	const records = new ConversationRecords(database);
	const parsed = workspaceRecordSchema.parse({
		type: 'conversations',
		value: {
			id: crypto.randomUUID(),
			userId: owner.userId,
			kind: 'chat',
			title: 'Original chat',
			createdAt: '2026-09-08T00:00:00Z',
			updatedAt: '2026-09-08T00:00:00Z'
		}
	});
	if (parsed.type !== 'conversations') throw new Error('Expected a conversation');
	const conversation = await records.insert(owner, parsed.value);
	const controller = new Agent(
		capabilityDependencies<AgentDependencies>({
			conversationJournal: new ConversationArchive(records),
			syncMutations: sync.mutations
		})
	);
	const base = await sync.objects.read(
		owner,
		{ type: 'conversations', id: [conversation.id] },
		null
	);
	if (base.kind !== 'found') throw new Error('Expected a stored conversation');
	const input = {
		operationId: crypto.randomUUID(),
		baseEtag: base.snapshot.etag,
		command: {
			kind: 'renameConversation' as const,
			conversationId: conversation.id,
			title: 'Saved name'
		}
	};
	return { owner, controller, records, conversation, input };
};

describe('guarded chat names', () => {
	it('replays a rename without losing its acknowledgement', async () => {
		const { owner, controller, input } = await setup('9421');
		const first = await controller.synchronize(owner, input);
		expect(await controller.synchronize(owner, input)).toEqual(first);
	});
	it('preserves a newer chat name when an offline rename arrives', async () => {
		const { owner, controller, records, conversation, input } = await setup('9422');
		await controller.renameSession(owner, conversation.id, 'Another client');
		const result = await controller.synchronize(owner, input);
		expect({
			kind: result.kind,
			title: (await records.findById(owner, conversation.id))?.title
		}).toEqual({ kind: 'conflict', title: 'Another client' });
	});
});
