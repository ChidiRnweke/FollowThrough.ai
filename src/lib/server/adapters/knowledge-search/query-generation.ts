import type OpenAI from 'openai';
import type {
	SearchQueryGenerator,
	SearchQueryPrompt,
	SearchQueryResult
} from '$lib/models/knowledge-search/query-generation';

export class SearchQueryGeneration implements SearchQueryGenerator {
	constructor(
		private readonly client: OpenAI,
		readonly model: string
	) {}

	async generate(prompt: SearchQueryPrompt): Promise<SearchQueryResult> {
		const completion = await this.client.chat.completions.create({
			model: this.model,
			messages: [
				{ role: 'system', content: prompt.system },
				{ role: 'user', content: prompt.user }
			]
		});
		return { raw: completion.choices[0]?.message.content ?? '' };
	}
}
