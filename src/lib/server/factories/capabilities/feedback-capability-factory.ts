import type { Database } from '$lib/server/db';
import { FeedbackRecords } from '$lib/server/repositories/feedback/postgres/feedback';
import type { FeedbackRepository } from '$lib/server/repositories/feedback/feedback';

export interface FeedbackCapabilityInput {
	readonly db: Database;
}

export interface FeedbackCapability {
	readonly reports: FeedbackRepository;
}

export const createFeedbackCapability = (input: FeedbackCapabilityInput): FeedbackCapability => ({
	reports: new FeedbackRecords(input.db)
});
