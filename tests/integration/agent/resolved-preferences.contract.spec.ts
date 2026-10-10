import { expect, it } from 'vitest';
import type { Conversation, ConversationId, TrustPolicy } from '$lib/models/agent';
import { ConversationRecords } from '$lib/server/repositories/agent/postgres/conversations';
import { TrustPolicyRecords } from '$lib/server/repositories/agent/postgres/trust-policies';
import { context, now, seedNote } from '../database-harness';

it('clears resolved conversation overrides instead of retaining their stored values', async () => {
	const { owner } = await seedNote('32701');
	const records = new ConversationRecords(context.db);
	const conversation: Conversation = {
		id: crypto.randomUUID() as ConversationId,
		userId: owner.userId,
		kind: 'chat',
		modelOverride: 'vendor/chat',
		visionModelOverride: 'vendor/vision',
		executionModeOverride: 'auto_accept',
		createdAt: now,
		updatedAt: now
	};
	await records.insert(owner, conversation);
	await records.update(owner, {
		...conversation,
		modelOverride: undefined,
		visionModelOverride: undefined,
		executionModeOverride: undefined
	});
	const saved = await records.findById(owner, conversation.id);
	expect({
		exists: saved !== undefined,
		model: saved?.modelOverride,
		vision: saved?.visionModelOverride,
		mode: saved?.executionModeOverride
	}).toEqual({ exists: true, model: undefined, vision: undefined, mode: undefined });
});

it('clears the confidence threshold when replacing a trust policy without one', async () => {
	const { owner } = await seedNote('32702');
	const records = new TrustPolicyRecords(context.db);
	const policy: TrustPolicy = {
		userId: owner.userId,
		pipeline: 'extract_promises',
		autoAcceptEnabled: true,
		minimumConfidence: 80 as NonNullable<TrustPolicy['minimumConfidence']>,
		createdAt: now,
		updatedAt: now
	};
	await records.upsert(owner, policy);
	await records.upsert(owner, { ...policy, minimumConfidence: undefined });
	expect((await records.find(owner, policy.pipeline))?.minimumConfidence).toBeUndefined();
});
