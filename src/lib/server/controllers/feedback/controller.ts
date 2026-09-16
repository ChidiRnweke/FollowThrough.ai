import type { ActorContext } from '$lib/models/identity';
import type { FeedbackReport } from '$lib/models/feedback';
interface FeedbackWriter {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}

/**
 * Submission succeeds only after the report is stored. Storage failures reach the
 * feedback dialog, which retains the report for retry. Submission is independent
 * of the workspace action the user is reporting.
 */
export interface FeedbackController {
	/** Persist a feedback report for later triage. */
	submit(actor: ActorContext, report: FeedbackReport): Promise<void>;
}

/** Everything the {@link FeedbackController} needs, injected so it can be built and tested without real stores. */
export interface FeedbackDependencies {
	readonly reports: FeedbackWriter;
}

export class Feedback implements FeedbackController {
	constructor(private readonly dependencies: FeedbackDependencies) {}

	submit(actor: ActorContext, report: FeedbackReport): Promise<void> {
		return this.dependencies.reports.create(actor, report);
	}
}
