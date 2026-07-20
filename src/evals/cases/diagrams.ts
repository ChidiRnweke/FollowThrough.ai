import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { findCall, scoreToolDiscovery } from '../assertions/tool-calls';
import { validateMermaid } from '../assertions/mermaid';
import { judgeAgainstRubric } from '../judges/rubric';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Diagram generation is scored on two axes because they fail independently:
 * syntax (deterministic — it either parses as Mermaid or it does not) and
 * faithfulness (a judge — whether the picture actually describes the system).
 * A diagram can be perfectly valid Mermaid and still depict the wrong thing,
 * and a single score would let one hide the other.
 */

const extractMermaid = (result: {
	finalResponse: string;
	toolCalls: readonly { name: string; arguments: Record<string, unknown>; output?: unknown }[];
}): string => {
	// Prefer the tool payload; fall back to a fenced block in the prose.
	const call = result.toolCalls.find(
		(entry) => entry.name === 'generate_mermaid_diagram' || entry.name === 'revise_mermaid_diagram'
	);
	const fromOutput =
		call?.output && typeof call.output === 'object' && call.output !== null
			? (call.output as { source?: string; diagram?: { source?: string } })
			: undefined;
	const candidate = fromOutput?.source ?? fromOutput?.diagram?.source;
	if (typeof candidate === 'string' && candidate.trim()) return candidate;

	const fenced = result.finalResponse.match(/```mermaid\s*([\s\S]*?)```/i);
	return fenced?.[1]?.trim() ?? '';
};

export const diagramCases: readonly EvalCase[] = [
	{
		id: 'diagram-generates-valid-mermaid',
		name: 'produces syntactically valid Mermaid for a described system',
		splits: [ARCHETYPES.diagramQuality, ARCHETYPES.toolDiscovery],
		input: {
			prompt:
				'Read my "Checkout architecture" note and draw a diagram of how the components talk to each other.',
			sourceNote: 'Checkout architecture'
		},
		expected: { tool: 'generate_mermaid_diagram', syntacticallyValid: true },
		metadata: { layer: 'agent', axes: 'syntax + faithfulness' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});

			const source = extractMermaid(result);
			const syntax = validateMermaid(source);
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				mermaid: source,
				diagramType: syntax.diagramType,
				nodeCount: syntax.nodeCount,
				edgeCount: syntax.edgeCount
			});

			px.logAnnotation({
				name: 'diagram_syntax',
				score: syntax.valid ? 1 : 0,
				label: syntax.valid ? 'valid' : 'invalid',
				explanation: syntax.valid
					? `${syntax.diagramType} with ${syntax.nodeCount} elements and ${syntax.edgeCount} relationships`
					: syntax.problems.join('; ')
			});

			expect(source, 'no Mermaid source was produced').not.toBe('');
			expect(syntax.valid, syntax.problems.join('; ')).toBe(true);

			const faithful = await judgeAgainstRubric({
				subject: 'a Mermaid diagram generated from a note describing a system',
				criteria: [
					'The diagram depicts the components described in the source material, not invented ones.',
					'The direction of the relationships matches the description.',
					'No component described as central to the flow is missing.'
				],
				context: architectureWorkspace.projects?.[0]?.notes?.[0]?.body ?? '',
				artefact: source
			});
			px.logAnnotation({
				name: ARCHETYPES.diagramQuality,
				annotatorKind: 'LLM',
				score: faithful.passed ? 1 : 0,
				label: faithful.passed ? 'faithful' : 'unfaithful',
				explanation: faithful.reasoning
			});
			expect(faithful.passed, faithful.reasoning).toBe(true);
		}
	},
	{
		id: 'diagram-reaches-generation-tool',
		name: 'discovers the diagram tool rather than drawing ASCII art',
		splits: [ARCHETYPES.toolDiscovery],
		input: { prompt: 'Make me a flowchart of the checkout flow described in my notes.' },
		expected: { tool: 'generate_mermaid_diagram' },
		metadata: { layer: 'agent' },
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept'
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				arguments: findCall(result, 'generate_mermaid_diagram')?.arguments
			});

			const verdict = scoreToolDiscovery(result, 'generate_mermaid_diagram');
			px.logAnnotation({
				name: ARCHETYPES.toolDiscovery,
				score: verdict.passed ? 1 : 0,
				label: verdict.passed ? 'pass' : 'fail',
				explanation: verdict.explanation
			});
			expect(verdict.passed, verdict.explanation).toBe(true);
		}
	}
];
