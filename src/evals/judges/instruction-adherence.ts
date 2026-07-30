import { z } from 'zod';
import { createLanguageModelClient } from '$lib/server/config';
import { judgeModel, openRouterBaseUrl } from '../lab/phoenix';

/**
 * LLM-as-a-judge for "did the response obey this instruction?".
 *
 * Whether an answer honours an instruction is a semantic question, not a
 * lexical one. Counting marker words would encode one instruction ("answer in
 * English") into the harness and quietly measure the wrong thing for every
 * other instruction — and would still misjudge a mixed-language or quoting
 * answer. A judge takes the instruction as data, so the same evaluator serves
 * every memory- and policy-adherence case.
 */

const VERDICT = z.object({
	verdict: z.enum(['followed', 'violated', 'not_applicable']),
	reasoning: z.string()
});

export interface AdherenceVerdict {
	readonly followed: boolean;
	readonly verdict: 'followed' | 'violated' | 'not_applicable';
	readonly reasoning: string;
	readonly judge: string;
}

export interface JudgeAdherenceInput {
	/** The instruction the agent was supposed to honour, verbatim. */
	readonly instruction: string;
	/** What the user actually asked. */
	readonly prompt: string;
	/** The agent's final response. */
	readonly response: string;
}

const SYSTEM =
	'You judge whether an AI assistant obeyed a specific standing instruction. ' +
	'Judge only the instruction given — not tone, helpfulness, accuracy, or formatting. ' +
	'Answer "followed" if the response obeys it, "violated" if it does not, and ' +
	'"not_applicable" only if the instruction could not possibly apply to this response. ' +
	'Be strict: partial compliance is a violation.';

export async function judgeInstructionAdherence(
	input: JudgeAdherenceInput
): Promise<AdherenceVerdict> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is required to run the adherence judge.');

	const model = judgeModel();
	const client = createLanguageModelClient(apiKey, { baseURL: openRouterBaseUrl() });

	const completion = await client.chat.completions.create({
		model,
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: [
					`<standing_instruction>\n${input.instruction}\n</standing_instruction>`,
					`<user_prompt>\n${input.prompt}\n</user_prompt>`,
					`<assistant_response>\n${input.response}\n</assistant_response>`,
					'Did the assistant response obey the standing instruction?'
				].join('\n\n')
			}
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'adherence_verdict',
				strict: true,
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['verdict', 'reasoning'],
					properties: {
						verdict: { type: 'string', enum: ['followed', 'violated', 'not_applicable'] },
						reasoning: { type: 'string', description: 'One sentence of justification.' }
					}
				}
			}
		}
	});

	const content = completion.choices[0]?.message?.content;
	if (!content) throw new Error('The adherence judge returned no content.');

	const parsed = VERDICT.parse(JSON.parse(content));
	return {
		followed: parsed.verdict === 'followed',
		verdict: parsed.verdict,
		reasoning: parsed.reasoning,
		judge: model
	};
}
