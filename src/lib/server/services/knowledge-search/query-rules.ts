import { ExternalServiceError } from '$lib/errors';
import type {
	SearchQueryPrompt,
	SearchQueryResult
} from '$lib/models/knowledge-search/query-generation';

export interface ISearchQueryRules {
	prepare(text: string): SearchQueryPrompt;
	complete(result: SearchQueryResult): string;
}

const CONDENSE_PROMPT =
	'Rewrite the following conversation into a single, focused search-query statement that captures ' +
	'what the user is currently trying to find or accomplish. Return only the statement — no preamble, no quotes.';

export class SearchQueryRules implements ISearchQueryRules {
	prepare(text: string): SearchQueryPrompt {
		return { system: CONDENSE_PROMPT, user: text };
	}

	complete(result: SearchQueryResult): string {
		const query = result.raw.trim();
		if (!query) throw new ExternalServiceError('Search query generation returned no usable text');
		return query;
	}
}
