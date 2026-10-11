import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import { FeedbackRecords } from '$lib/server/repositories/feedback/postgres/feedback';
import type { FeedbackRepository } from '$lib/server/repositories/feedback/feedback';

export interface FeedbackCapabilityInput {
	readonly db: Database;
}

export interface FeedbackCapability {
	readonly reports: FeedbackRepository;
}

export const createFeedbackCapability = (
	actor: ActorContext,
	input: FeedbackCapabilityInput
): FeedbackCapability => ({
	reports: new FeedbackRecords(actor, input.db)
});
