import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import { seedWorkspace, selectionFromSeededNote } from '../lab/workspace';
import { runCase } from '../lab/run-case';
import { architectureWorkspace } from '../fixtures/workspaces/architecture';
import { inspectDrawio } from '../assertions/drawio';
import { findCall } from '../assertions/tool-calls';
import { judgeRubricConsensus } from '../judges/consensus';
import { ARCHETYPES, type EvalCase } from './types';

const components = [
	'storefront',
	'checkout api',
	'payment gateway',
	'ledger service',
	'notification worker'
] as const;

export const diagramCases: readonly EvalCase[] = [
	{
		id: 'diagram-presents-faithful-editable-canvas',
		name: 'turns a described system into a faithful editable canvas diagram',
		splits: [ARCHETYPES.diagramQuality, ARCHETYPES.toolDiscovery],
		input: {
			prompt:
				'Read my "Checkout architecture" note and draw a diagram of how the components talk to each other.',
			sourceNote: 'Checkout architecture'
		},
		expected: { tool: 'present_diagram', canvasKind: 'draft' },
		metadata: {
			layer: 'agent',
			axes: 'production-valid editable artifact + component coverage + directed faithfulness'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			const sourceText = architectureWorkspace.projects?.[0]?.notes?.[0]?.body;
			if (!noteId || !sourceText) throw new Error('Checkout architecture note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: await selectionFromSeededNote(lab, workspace, noteId, sourceText)
			});
			const canvas = await lab.controllers
				.diagramStudio()
				.readCanvasDiagram(workspace.actor, { conversationId: result.conversationId });
			const inspection = canvas.kind === 'draft' ? inspectDrawio(canvas.source) : undefined;
			const labels = inspection?.kind === 'valid' ? inspection.labels : [];
			const edges = inspection?.kind === 'valid' ? inspection.edges : [];
			const normalizedLabels = labels.map((label) => label.toLocaleLowerCase());
			const namedComponentsPresent = components.every((component) =>
				normalizedLabels.some((label) => label.includes(component))
			);
			const faithful = await judgeRubricConsensus({
				subject: 'the labels and directed edges extracted from an editable draw.io diagram',
				criteria: [
					'All five named system components are represented.',
					'The Storefront flows to the Checkout API, which reaches both the Payment Gateway and Ledger Service.',
					'The order-confirmed event flows from the Checkout API to the Notification Worker.',
					'There is no direct Notification Worker to Payment Gateway edge.'
				],
				context: sourceText,
				artefact: JSON.stringify({ labels, edges })
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				canvasKind: canvas.kind,
				inspection,
				response: result.finalResponse.slice(0, 300)
			});
			px.logAnnotation({
				name: ARCHETYPES.diagramQuality,
				annotatorKind: 'LLM',
				score: faithful.followed ? 1 : 0,
				label: faithful.verdict,
				explanation: `${faithful.agreement} agreement across ${faithful.judges} judges (${faithful.votes.join(', ')}): ${faithful.reasoning}`
			});
			expect(
				{
					status: result.status,
					presented: result.calledToolNames.includes('present_diagram'),
					canvasKind: canvas.kind,
					productionValid: inspection?.kind === 'valid',
					namedComponentsPresent,
					edgeCountAtLeastFour: edges.length >= 4,
					faithful: faithful.followed
				},
				inspection?.kind === 'failure' ? inspection.reason : result.failure
			).toEqual({
				status: 'completed',
				presented: true,
				canvasKind: 'draft',
				productionValid: true,
				namedComponentsPresent: true,
				edgeCountAtLeastFour: true,
				faithful: true
			});
		}
	},
	{
		id: 'diagram-implicit-picture-reaches-canvas',
		name: 'interprets an implicit picture request as a canvas artifact rather than chat art',
		splits: [ARCHETYPES.toolDiscovery, 'ambiguity'],
		input: { prompt: 'Turn this into a picture I can move around and clean up later.' },
		expected: { tool: 'present_diagram', canvasKind: 'draft' },
		metadata: {
			layer: 'agent',
			note: 'The user names the desired affordance, not diagrams, Mermaid, draw.io, canvas, or any tool.'
		},
		async run(lab) {
			const workspace = await seedWorkspace(lab, architectureWorkspace);
			const noteId = workspace.noteIds.get('Checkout architecture');
			const sourceText = architectureWorkspace.projects?.[0]?.notes?.[0]?.body;
			if (!noteId || !sourceText) throw new Error('Checkout architecture note was not seeded');
			const result = await runCase(lab, workspace.actor, {
				prompt: this.input.prompt as string,
				mode: 'auto_accept',
				noteId,
				selection: await selectionFromSeededNote(lab, workspace, noteId, sourceText)
			});
			const canvas = await lab.controllers
				.diagramStudio()
				.readCanvasDiagram(workspace.actor, { conversationId: result.conversationId });
			const call = findCall(result, 'present_diagram');
			const inspection = canvas.kind === 'draft' ? inspectDrawio(canvas.source) : undefined;
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				canvasKind: canvas.kind,
				inspection,
				arguments: call?.arguments,
				response: result.finalResponse.slice(0, 300)
			});
			const passed =
				result.status === 'completed' &&
				Boolean(call) &&
				canvas.kind === 'draft' &&
				inspection?.kind === 'valid' &&
				inspection.edges.length >= 4;
			px.logAnnotation({
				name: ARCHETYPES.toolDiscovery,
				score: passed ? 1 : 0,
				label: passed ? 'editable_canvas_presented' : 'missing_or_invalid_canvas',
				explanation: `tools=${result.calledToolNames.join(', ')}; canvas=${canvas.kind}; inspection=${inspection?.kind ?? 'absent'}`
			});
			expect(passed, result.failure ?? JSON.stringify(inspection)).toBe(true);
		}
	}
];
