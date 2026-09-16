import type { RelationshipClassification } from '$lib/models/relationships';
import type { StructuredRelationshipClient } from '$lib/server/repositories/relationships/classification';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';

export class RelationshipDiscovery {
	constructor(private readonly client: StructuredRelationshipClient) {}
	async classify(
		sourceText: string,
		targetText: string,
		model: string,
		signal?: AbortSignal
	): Promise<RelationshipClassification> {
		try {
			const result = await this.client.classify(sourceText, targetText, model, signal);
			if (!result)
				throw new InvalidGeneratedContentError(
					'The model returned no structured relationship output'
				);
			return result;
		} catch (error) {
			if (signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError || error instanceof ExternalServiceError)
				throw error;
			throw new ExternalServiceError('Relationship classification failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
