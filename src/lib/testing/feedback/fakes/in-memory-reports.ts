import type { FeedbackReport } from '$lib/models/feedback';
import type { ActorContext, UserId } from '$lib/models/identity';
import type { FeedbackRepository } from '$lib/server/repositories/feedback';

export class InMemoryFeedbackReports implements FeedbackRepository {
	readonly reports: { readonly userId: UserId; readonly report: FeedbackReport }[] = [];
	failure: Error | null = null;

	async create(actor: ActorContext, report: FeedbackReport): Promise<void> {
		if (this.failure) throw this.failure;
		this.reports.push({ userId: actor.userId, report: structuredClone(report) });
	}
}
