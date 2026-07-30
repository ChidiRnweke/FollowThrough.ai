import type { ActorContext } from '$lib/models';

export interface FeedbackReport {
	readonly body: string;
	readonly url: string;
	readonly appContext: Readonly<Record<string, unknown>>;
}

export interface FeedbackRepository {
	create(actor: ActorContext, report: FeedbackReport): Promise<void>;
}
