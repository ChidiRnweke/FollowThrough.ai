import { webSearchEngines, type WebSearchEngine, type WebResearchOptions } from '$lib/models/agent';

const webSearchEngineFrom = (value: string | undefined): WebSearchEngine | undefined =>
	webSearchEngines.includes(value as WebSearchEngine) ? (value as WebSearchEngine) : undefined;

const positiveWebSearchIntegerFrom = (value: string | undefined): number | undefined => {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const webSearchOptionsFromEnvironment = (
	environment: Readonly<Record<string, string | undefined>>
): WebResearchOptions => {
	const engine = webSearchEngineFrom(environment.OPENROUTER_WEB_SEARCH_ENGINE);
	const maxResults = positiveWebSearchIntegerFrom(environment.OPENROUTER_WEB_SEARCH_MAX_RESULTS);
	const maxTotalResults = positiveWebSearchIntegerFrom(
		environment.OPENROUTER_WEB_SEARCH_MAX_TOTAL_RESULTS
	);
	return {
		...(engine ? { engine } : {}),
		...(maxResults ? { maxResults } : {}),
		...(maxTotalResults ? { maxTotalResults } : {})
	};
};
