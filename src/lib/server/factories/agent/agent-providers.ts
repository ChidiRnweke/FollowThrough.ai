import OpenAI from 'openai';
import { OpenAIProvider } from '@openai/agents';
import type { WebResearchSettings } from '$lib/models/agent';
import { withWebResearch } from '$lib/server/infrastructure/openrouter/web-research';
import { withReasoning } from '$lib/server/infrastructure/openrouter/reasoning';
import type { AgentTurnDependencies } from '$lib/server/services/agent/runs/turns';

export interface AgentProviderConfig {
	readonly apiKey: string;
	readonly baseURL: string;
	readonly appURL: string;
}

const timeout = () => Number(process.env.PROVIDER_REQUEST_TIMEOUT_MS ?? 120_000);

/** OpenRouter as the agents SDK model provider, and as the vision client that describes images. */
export const createAgentProviders = (config: AgentProviderConfig): AgentTurnDependencies => ({
	models: (webSearch: WebResearchSettings) =>
		new OpenAIProvider({
			openAIClient: new OpenAI({
				apiKey: config.apiKey,
				baseURL: config.baseURL,
				timeout: timeout(),
				// Two OpenRouter-only body fields, both added at the transport because the
				// agents SDK has nowhere to put them. Reasoning is what makes the model's
				// thinking arrive as deltas rather than one block per generation.
				fetch: withReasoning(withWebResearch(globalThis.fetch, webSearch)),
				defaultHeaders: { 'HTTP-Referer': config.appURL, 'X-OpenRouter-Title': 'FollowThrough' }
			}),
			useResponses: false,
			strictFeatureValidation: true
		}),
	images: new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: timeout() })
});
