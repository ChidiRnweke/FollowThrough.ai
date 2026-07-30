import { z } from 'zod';
import { createLanguageModelClient } from '$lib/server/config';
import { judgeModel, openRouterBaseUrl } from '../lab/phoenix';

/**
 * A general pass/fail judge against an explicit rubric.
 *
 * Used where a deterministic check would be brittle rather than merely
 * inconvenient — "does this diagram represent the described system", "is this
 * summary faithful to the source". The rule of thumb across this lab: if
 * correctness can be stated as a property of the run record (which tool ran,
 * what status, what arguments), assert it in code; if it requires reading
 * meaning, use this and accept the cost.
 *
 * The rubric is passed as data so cases stay self-describing and the judge
 * itself never encodes case-specific knowledge.
 */

const VERDICT = z.object({
	verdict: z.enum(['pass', 'fail']),
	reasoning: z.string()
});

export interface RubricVerdict {
	readonly passed: boolean;
	readonly reasoning: string;
	readonly judge: string;
}

export interface JudgeRubricInput {
	/** What is being judged, e.g. "a Mermaid diagram generated from a note". */
	readonly subject: string;
	/** Numbered criteria. All must hold for a pass. */
	readonly criteria: readonly string[];
	/** Source material the artefact should be faithful to, when relevant. */
	readonly context?: string;
	/** The artefact under judgement. */
	readonly artefact: string;
}

export async function judgeAgainstRubric(input: JudgeRubricInput): Promise<RubricVerdict> {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) throw new Error('OPENROUTER_API_KEY is required to run the rubric judge.');

	const model = judgeModel();
	const client = createLanguageModelClient(apiKey, { baseURL: openRouterBaseUrl() });

	const criteria = input.criteria.map((item, index) => `${index + 1}. ${item}`).join('\n');
	const completion = await client.chat.completions.create({
		model,
		messages: [
			{
				role: 'system',
				content:
					'You grade an artefact against a fixed rubric. Every criterion must hold for a pass. ' +
					'Judge only the criteria given — not style, length, or anything unstated. ' +
					'If a criterion cannot be checked from what you were given, treat it as failed and say so.'
			},
			{
				role: 'user',
				content: [
					`<subject>${input.subject}</subject>`,
					`<criteria>\n${criteria}\n</criteria>`,
					...(input.context ? [`<source_material>\n${input.context}\n</source_material>`] : []),
					`<artefact>\n${input.artefact}\n</artefact>`,
					'Does the artefact satisfy every criterion?'
				].join('\n\n')
			}
		],
		response_format: {
			type: 'json_schema',
			json_schema: {
				name: 'rubric_verdict',
				strict: true,
				schema: {
					type: 'object',
					additionalProperties: false,
					required: ['verdict', 'reasoning'],
					properties: {
						verdict: { type: 'string', enum: ['pass', 'fail'] },
						reasoning: {
							type: 'string',
							description: 'One or two sentences naming the criterion that decided it.'
						}
					}
				}
			}
		}
	});

	const content = completion.choices[0]?.message?.content;
	if (!content) throw new Error('The rubric judge returned no content.');

	const parsed = VERDICT.parse(JSON.parse(content));
	return { passed: parsed.verdict === 'pass', reasoning: parsed.reasoning, judge: model };
}
