import type { ActorContext } from '$lib/models/identity';
import type { TextSelection } from '$lib/models/notes';
import type {
	ReferenceCandidate,
	ReferenceSource,
	ReferenceSearchOptions
} from '$lib/models/references';
import {
	REFERENCE_WEB_SEARCH_DEFAULTS,
	type WebResearchOptions,
	type WebResearchSettings
} from '$lib/models/agent';
import type { AgentRunSettings } from '$lib/services/agent/run-settings';
import type { ReferenceCandidatePreparation } from '$lib/server/services/references/discovery';
import { ExternalServiceError, InvalidGeneratedContentError } from '$lib/errors';

export interface WebReferenceClient {
	search(
		text: string,
		research: WebResearchSettings,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceSource[] | undefined>;
}
export interface ReferenceFinder {
	find(
		actor: ActorContext,
		selection: TextSelection,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceCandidate[]>;
}
export class ReferenceSearch implements ReferenceFinder {
	constructor(
		private readonly client: WebReferenceClient,
		private readonly candidates: ReferenceCandidatePreparation,
		private readonly settings: AgentRunSettings,
		private readonly overrides: WebResearchOptions
	) {}
	async find(
		_actor: ActorContext,
		selection: TextSelection,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceCandidate[]> {
		void _actor;
		try {
			const research = this.settings.research(this.overrides, REFERENCE_WEB_SEARCH_DEFAULTS);
			const sources = await this.client.search(selection.text, research, options);
			if (!sources)
				throw new InvalidGeneratedContentError('The provider returned no usable reference output');
			return this.candidates.prepare(sources, selection.text);
		} catch (error) {
			if (options.signal?.aborted) throw error;
			if (error instanceof InvalidGeneratedContentError || error instanceof ExternalServiceError)
				throw error;
			throw new ExternalServiceError('Reference search failed', {
				cause: error instanceof Error ? error.message : String(error)
			});
		}
	}
}
