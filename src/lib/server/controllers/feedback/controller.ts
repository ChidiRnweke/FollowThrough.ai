import type { ActorContext } from '$lib/models';
export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: Readonly<Record<string, unknown>>;
}
interface FeedbackWriter {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}

export interface FeedbackController {
	submit(actor: ActorContext, report: FeedbackReport): Promise<void>;
}

export interface FeedbackDependencies {
	readonly reports: FeedbackWriter;
}

export class Feedback implements FeedbackController {
	constructor(private readonly dependencies: FeedbackDependencies) {}

	submit(actor: ActorContext, report: FeedbackReport): Promise<void> {
		return this.dependencies.reports.create(actor, report);
	}
}
