import type { ActorContext } from '$lib/models/identity';
/** A user-submitted feedback report: free text, the URL it was filed from, and an app-context snapshot to reproduce the issue. */
export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: Readonly<Record<string, unknown>>;
}
interface FeedbackWriter {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}

/**
 * Application boundary for user-submitted feedback. Minimal on purpose — feedback is
 * fire-and-forget and must never block or fail the action it was filed from.
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
