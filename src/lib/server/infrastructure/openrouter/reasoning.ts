import { z } from 'zod';

type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

const reasoningRequestSchema = z.looseObject({ reasoning: z.json().optional() });

const requestUrl = (input: string | URL | Request): URL =>
	new URL(input instanceof Request ? input.url : input.toString());

/** OpenRouter's switch for a model's thinking: on for the agent, off for autocomplete. */
export interface ReasoningSetting {
	readonly enabled: boolean;
}

/**
 * What OpenRouter needs before it will stream a model's thinking.
 *
 * Without it a reasoning-capable model still reasons, but the tokens never
 * appear on the wire: `AgentReasoningEvents` finds no `delta.reasoning` on
 * any chunk, so its per-token channel never fires and the whole turn falls to
 * the `reasoning_item_created` fallback — one block, emitted after the model
 * finishes. With tools that is once per tool round, which is why reasoning
 * arrived in lumps and never typed itself out.
 */
const REASONING_STREAMED: ReasoningSetting = { enabled: true };

const withReasoningRequested = (body: string, reasoning: ReasoningSetting): string => {
	const request = reasoningRequestSchema.parse(JSON.parse(body));
	// A caller that already asked for reasoning has said what it wants — an effort
	// level, or off — and this must not overwrite it.
	if (request.reasoning !== undefined) return body;
	return JSON.stringify({ ...request, reasoning });
};

/**
 * Sets OpenRouter's reasoning switch on every generation, at the HTTP boundary.
 *
 * Here rather than on the `Agent`, because the agents SDK has no field for it:
 * `reasoning` is OpenRouter's own extension to the chat-completions body, and
 * the sibling `withWebResearch` already establishes that this is where such
 * fields go in. The default streams reasoning, which is what the agent wants;
 * the inline completion passes `enabled: false`, because a model that thinks
 * first spends its whole output budget doing so — measured on
 * `deepseek/deepseek-v4-flash`: 256 of 256 completion tokens were reasoning,
 * the content was empty, and every ghost-text request came back with nothing.
 *
 * Sent to every model rather than only to those advertising the capability.
 * That is measured, not assumed: `openai/gpt-4o-mini`, which does not support
 * reasoning, accepts the parameter and answers normally with `reasoning: null`,
 * so gating it would mean threading the model catalogue through this service to
 * prevent nothing. `/chat/completions` only, which is the protocol the provider
 * is configured for (`useResponses: false`) and the one this was verified
 * against.
 */
export const withReasoning =
	(delegate: Fetch = globalThis.fetch, reasoning: ReasoningSetting = REASONING_STREAMED): Fetch =>
	async (input, init) => {
		const pathname = requestUrl(input).pathname;
		if (!pathname.endsWith('/chat/completions') || typeof init?.body !== 'string')
			return delegate(input, init);
		return delegate(input, { ...init, body: withReasoningRequested(init.body, reasoning) });
	};
