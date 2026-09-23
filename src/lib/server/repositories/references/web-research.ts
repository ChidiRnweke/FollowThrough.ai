import OpenAI from 'openai';
import {
	openRouterReferenceOutputSchema,
	type ReferenceSource,
	type Url
} from '$lib/models/references';
import type { WebResearchTool } from '$lib/models/agent';
import { withWebResearch } from '$lib/server/repositories/agent/web-research-transport';
import type { OperationObserver } from '$lib/models/telemetry';
import { ExternalServiceError } from '$lib/errors';

export interface ReferenceSearchOptions {
	readonly model?: string;
	readonly signal?: AbortSignal;
}

export interface WebReferenceClient {
	search(
		text: string,
		options?: ReferenceSearchOptions
	): Promise<readonly ReferenceSource[] | undefined>;
}

const prompt = `Search the web for sources that directly support or clarify the selected architecture text.
Prefer standards and official documentation, then vendor documentation, then community sources.
Perform one focused search and cite directly relevant sources.
Do not write a guide or tutorial. Cite every source so its citation metadata is included in the response.
Return no sources when nothing is sufficiently relevant. Do not pad the result.`;

export class ReferenceResearch implements WebReferenceClient {
	constructor(
		private readonly apiKey: string,
		private readonly options: {
			readonly baseURL: string;
			readonly appURL: string;
			readonly defaultModel: string;
			readonly searchTool: WebResearchTool;
			readonly observer: OperationObserver;
		}
	) {}

	async search(
		text: string,
		options: ReferenceSearchOptions = {}
	): Promise<readonly ReferenceSource[]> {
		if (!this.apiKey)
			throw new ExternalServiceError('Reference search requires an OpenRouter API key');
		const model = options.model ?? this.options.defaultModel;
		const client = new OpenAI({
			apiKey: this.apiKey,
			baseURL: this.options.baseURL,
			fetch: withWebResearch(globalThis.fetch, this.options.searchTool),
			defaultHeaders: { 'HTTP-Referer': this.options.appURL, 'X-OpenRouter-Title': 'FollowThrough' }
		});
		return this.options.observer.run(
			'reference.search',
			{ input: text, metadata: { model }, tags: ['reference', 'web-search'] },
			async () => {
				const response = await client.responses.create(
					{
						model,
						input: [
							{ role: 'system', content: prompt },
							{ role: 'user', content: text }
						]
					},
					options.signal ? { signal: options.signal } : undefined
				);
				const output = openRouterReferenceOutputSchema.parse(response.output);
				const citations = output.flatMap(
					(item) =>
						item.content?.flatMap((content) =>
							(content.annotations ?? []).filter((annotation) => annotation.type === 'url_citation')
						) ?? []
				);
				const searchSources = output.flatMap((item) => item.action?.sources ?? []);
				return [...citations, ...searchSources].flatMap((citation) => {
					if (!citation.url || !URL.canParse(citation.url)) return [];
					const url = new URL(citation.url);
					if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
					return [
						{
							url: url.href as Url,
							hostname: url.hostname,
							...(citation.title ? { title: citation.title } : {}),
							...(citation.content ? { content: citation.content } : {})
						}
					];
				});
			},
			(results) => JSON.stringify(results)
		);
	}
}
