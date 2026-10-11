import type { ActorContext } from '$lib/models/identity';
import type { Database } from '$lib/server/db';
import { feedbackReports } from '$lib/server/db/schema/feedback';
import type { FeedbackReport } from '$lib/models/feedback';
import type { FeedbackRepository } from '../feedback';

export class FeedbackRecords implements FeedbackRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async create(report: FeedbackReport): Promise<void> {
		await this.database.insert(feedbackReports).values({
			userId: this.actor.userId,
			body: report.body,
			url: report.url,
			appContext: report.appContext
		});
	}
}
