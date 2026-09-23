import type { ActorContext } from '$lib/models/identity';
import type { PromiseCandidate, PromiseModelContext } from '$lib/models/todos';
import type { TextSelection } from '$lib/models/notes';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';
import type { StructuredPromiseClient } from '$lib/server/repositories/todos/classification';

export class PromiseDiscovery {
	constructor(private readonly client: StructuredPromiseClient) {}

	async extract(
		actor: ActorContext,
		selection: TextSelection,
		context: PromiseModelContext,
		signal?: AbortSignal
	): Promise<readonly PromiseCandidate[]> {
		void actor;
		try {
			const promises = await this.client.extract(selection.text, context, signal);
			if (!promises)
				throw new InvalidGeneratedContentError('The model returned no structured promise output');
			return promises.map((promise) => ({
				action: promise.action,
				...(promise.ownerName ? { ownerName: promise.ownerName } : {}),
				responsibility: promise.responsibility,
				...(promise.dueDateVerbatim ? { dueDateVerbatim: promise.dueDateVerbatim } : {}),
				...(promise.resolvedDueDate ? { resolvedDueDate: promise.resolvedDueDate } : {}),
				strength: promise.strength,
				confidence: promise.confidence
			}));
		} catch (error) {
			if (error instanceof InvalidGeneratedContentError) throw error;
			throw new ExternalServiceError('Promise extraction failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
