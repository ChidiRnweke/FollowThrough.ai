import * as px from '@arizeai/phoenix-client/vitest';
import { expect } from 'vitest';
import type { NoteId } from '$lib/models/notes';
import type { Lab } from '../lab/application';
import { seedWorkspace, selectionFromSeededNote } from '../lab/workspace';
import { runCase, type ToolCall } from '../lab/run-case';
import { inspectDrawio } from '../assertions/drawio';
import {
	blemishPoints,
	blockingFindings,
	describeFindings,
	type DiagramFinding
} from '../assertions/diagram/finding';
import { describeGraph, reviewDiagram, summariseGraph } from '../assertions/diagram/review';
import { findCall } from '../assertions/tool-calls';
import { judgeRubricConsensus } from '../judges/consensus';
import { azureOpenAiChat } from '../fixtures/diagrams/azure-openai-chat';
import { checkoutArchitecture } from '../fixtures/diagrams/checkout';
import { callCentreAnalytics } from '../fixtures/diagrams/call-center-analytics';
import { searchIndexArchitecture } from '../fixtures/diagrams/search-index';
import { imageClassification } from '../fixtures/diagrams/image-classification';
import { iotEdgeInference } from '../fixtures/diagrams/iot-edge-inference';
import { documentClassification } from '../fixtures/diagrams/document-classification';
import { manyModels } from '../fixtures/diagrams/many-models';
import { databricksMlops } from '../fixtures/diagrams/databricks-mlops';
import { customDocumentModels } from '../fixtures/diagrams/custom-document-models';
import { agentsAtScale } from '../fixtures/diagrams/agents-at-scale';
import { sourceTextOf, type DiagramFixture } from '../fixtures/diagrams/fixture';
import { ARCHETYPES, type EvalCase } from './types';

/**
 * Run the fixture's prompt and read back whatever the agent put on the canvas.
 *
 * Shared because every diagram case needs the same five steps and the
 * interesting part of each case is what it then asserts, not how it got there.
 */
async function drawFor(lab: Lab, fixture: DiagramFixture, prompt: string) {
	const workspace = await seedWorkspace(lab, fixture.workspace);
	const noteId = workspace.noteIds.get(fixture.noteTitle);
	const sourceText = sourceTextOf(fixture);
	if (!noteId) throw new Error(`"${fixture.noteTitle}" was not seeded`);
	const result = await runCase(lab, workspace.actor, {
		prompt,
		mode: 'auto_accept',
		noteId,
		selection: await selectionFromSeededNote(lab, workspace, noteId, sourceText)
	});
	const canvas = await lab.controllers
		.diagramStudio()
		.readCanvasDiagram(workspace.actor, { conversationId: result.conversationId });
	const review =
		canvas.kind === 'present' ? reviewDiagram(canvas.source, fixture.expectations) : undefined;
	const { skills } = await lab.controllers.skills().list(workspace.actor);
	const skillNoteId = skills.find((skill) => skill.name === DIAGRAMMING_SKILL_NAME)?.noteId;
	return { result, canvas, review, sourceText, skillNoteId };
}

/** The built-in's name, as `skillsForSurface` and the skill catalogue both spell it. */
const DIAGRAMMING_SKILL_NAME = 'Diagramming';

/**
 * How much untidiness a diagram may carry and still be worth publishing.
 *
 * One. Derived rather than chosen: across four full runs of this section the
 * diagrams a reviewer would send back carried several blemishes at once — three
 * colliding pairs and three shapes off the page in one case — while the ones
 * that read cleanly carried at most a single arrow clipping a box it had no
 * business near. A budget of one converted four such cases in the two runs it
 * was measured against and left every diagram with a second defect still red.
 *
 * Nothing about *what the diagram says* is budgeted. Missing components, wrong
 * connections, a product wearing someone else's logo all block outright, so the
 * budget can never buy a diagram of the wrong system.
 */
const BLEMISH_BUDGET = 1;

/**
 * The failure message carries the tool calls as well as the findings.
 *
 * A diagram case fails on what the artifact looks like, but the reason is
 * almost always something the agent did or skipped several steps earlier —
 * never loading the skill, never searching for an icon. Without the call list
 * in the message, every red case costs a re-run just to see that.
 */
const explain = (
	failure: string | undefined,
	findings: readonly DiagramFinding[],
	toolCalls: readonly string[] = [],
	graph?: string
): string =>
	[
		failure,
		toolCalls.length ? `tools: ${toolCalls.join(', ')}` : '',
		describeFindings(findings),
		findings.length && graph ? graph : ''
	]
		.filter(Boolean)
		.join('\n');

/**
 * Did the agent read the Diagramming skill before drawing?
 *
 * The first live run found every product box drawn as a grey rectangle, and the
 * cause was upstream of the model: the skill carried `allowImplicitInvocation:
 * false` and was requested only on the `diagram_studio` surface, so a request
 * arriving from a note or from chat never saw it advertised and could not load
 * it. The agent was drawing with no diagramming guidance at all, and no
 * assertion said so — the diagram was merely bad.
 *
 * Three states, not a boolean: "the skill is not installed" and "the skill was
 * installed and ignored" are different failures with different fixes, and a
 * boolean would hide the first behind the second.
 */
type DiagrammingSkill = 'loaded' | 'not-loaded' | 'not-installed';

const loadedDiagrammingSkill = (result: {
	readonly toolCalls: readonly ToolCall[];
	readonly skillNoteId: NoteId | undefined;
}): DiagrammingSkill => {
	if (!result.skillNoteId) return 'not-installed';
	const loaded = result.toolCalls.some(
		(call) => call.name === 'load_skill' && call.arguments.noteId === result.skillNoteId
	);
	return loaded ? 'loaded' : 'not-loaded';
};

/**
 * One architecture, graded with no LLM anywhere.
 *
 * Every case built this way asks the same question — would a professional open
 * this diagram, recognise the system, and be able to edit it — and answers it
 * from the graph and from what the source note states. `shape` records why this
 * architecture is in the set at all, so a case is never a duplicate of another
 * with different product names.
 */
const professionalDiagramCase = (
	fixture: DiagramFixture,
	spec: { readonly id: string; readonly name: string; readonly shape: string }
): EvalCase => ({
	id: spec.id,
	name: spec.name,
	splits: [ARCHETYPES.diagramQuality],
	input: {
		prompt: `Read my "${fixture.noteTitle}" note and draw the architecture diagram for it.`,
		sourceNote: fixture.noteTitle
	},
	expected: { tool: 'create_diagram', canvasKind: 'present', findings: [] },
	metadata: {
		layer: 'agent',
		shape: spec.shape,
		axes: 'structure and layout rules + declared components, edges, brand marks and boundaries',
		note: 'No LLM judge. Every check is a property of the graph or a fact the source note states.'
	},
	async run(lab) {
		const { result, canvas, review, skillNoteId } = await drawFor(
			lab,
			fixture,
			this.input.prompt as string
		);
		const findings = review?.findings ?? [];
		const points = blemishPoints(findings);
		const skill = loadedDiagrammingSkill({ toolCalls: result.toolCalls, skillNoteId });
		px.logOutput({
			model: result.model,
			toolCalls: result.calledToolNames,
			diagrammingSkill: skill,
			canvasKind: canvas.kind,
			graph: review ? summariseGraph(review.graph) : undefined,
			findings,
			blemishPoints: points,
			response: result.finalResponse.slice(0, 300)
		});
		const blocked = blockingFindings(findings);
		const clean = canvas.kind === 'present' && blocked.length === 0 && points <= BLEMISH_BUDGET;
		px.logAnnotation({
			name: ARCHETYPES.diagramQuality,
			score: clean ? 1 : 0,
			label: clean
				? 'professional'
				: (blocked[0]?.rule ?? (points > BLEMISH_BUDGET ? 'over_blemish_budget' : 'no_canvas')),
			explanation: describeFindings(findings)
		});
		expect(
			{
				status: result.status,
				diagrammingSkill: skill,
				canvasKind: canvas.kind,
				blocking: blockingFindings(findings).map((finding) => finding.rule),
				overBudget: points > BLEMISH_BUDGET
			},
			explain(
				result.failure,
				findings,
				result.calledToolNames,
				review ? describeGraph(review.graph) : undefined
			)
		).toEqual({
			status: 'completed',
			diagrammingSkill: 'loaded',
			canvasKind: 'present',
			blocking: [],
			overBudget: false
		});
	}
});

/**
 * What this section measures, and what it does not.
 *
 * One turn. The agent writes draw.io XML and cannot see the result, so the
 * diagram graded here is a blind first draft — and that is faithful, because
 * production is blind on turn one too: the canvas render rides back on the
 * *next user message* as `contextImages` (`takeCanvasRender`), so a single
 * "draw me a diagram" request gets exactly this, a drawing made without looking.
 *
 * What is deliberately out of scope is the repair loop that follows. In a real
 * conversation the picture arrives with the user's next message and the agent
 * fixes what it can now see — a broken icon, an overlapping label. Reproducing
 * that here needs a browser to rasterise the XML, since nothing on the server
 * can, and no case below attempts it. A regression in that loop would not show
 * up in this section.
 *
 * Ten architectures, spanning ten diagram shapes rather than ten Azure product
 * sets. Read from the published AI and machine learning listing in the Azure
 * Architecture Center and rewritten as source notes; nothing of Microsoft's is
 * reproduced or stored here.
 */
const minedArchitectureCases: readonly EvalCase[] = [
	professionalDiagramCase(azureOpenAiChat, {
		id: 'diagram-azure-chat-is-professional',
		name: 'draws a branded cloud architecture that would survive being opened and edited',
		shape: 'actor outside two nested resource boundaries, with monitoring to one side'
	}),
	professionalDiagramCase(searchIndexArchitecture, {
		id: 'diagram-search-index-is-professional',
		name: 'draws a four-box index architecture with nowhere to hide a defect',
		shape: 'the smallest architecture in the set: two sources converging on one service'
	}),
	professionalDiagramCase(imageClassification, {
		id: 'diagram-image-classification-is-professional',
		name: 'draws an event-driven pipeline whose one forbidden path stays undrawn',
		shape: 'a linear event chain with a single branch'
	}),
	professionalDiagramCase(callCentreAnalytics, {
		id: 'diagram-call-centre-is-professional',
		name: 'draws a long batch chain without routing an arrow through a later stage',
		shape: 'a seven-stage chain that returns to its own storage'
	}),
	professionalDiagramCase(iotEdgeInference, {
		id: 'diagram-iot-edge-is-professional',
		name: 'draws the edge device as a real container rather than a row of boxes',
		shape: 'a physical boundary separating on-device parts from cloud services'
	}),
	professionalDiagramCase(documentClassification, {
		id: 'diagram-document-classification-is-professional',
		name: 'draws the widest fan-out in the set without piling the callees up',
		shape: 'one orchestrator calling four services, plus a second entry path'
	}),
	professionalDiagramCase(manyModels, {
		id: 'diagram-many-models-is-professional',
		name: 'draws the most conventional pipeline in the set',
		shape: 'ingest, train, score, serve, left to right, with one loop back to storage'
	}),
	professionalDiagramCase(databricksMlops, {
		id: 'diagram-databricks-mlops-is-professional',
		name: 'draws three sibling environments as three containers',
		shape: 'three peer boundaries with a promotion path running through them'
	}),
	professionalDiagramCase(customDocumentModels, {
		id: 'diagram-custom-models-is-professional',
		name: 'groups two named phases instead of arranging eight loose boxes',
		shape: 'two labelled phases feeding a deployment target outside both'
	}),
	professionalDiagramCase(agentsAtScale, {
		id: 'diagram-agents-at-scale-is-professional',
		name: 'draws nested network and platform boundaries with egress through a firewall',
		shape: 'the largest and most nested architecture: a boundary inside a boundary'
	})
];

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
		expected: { tool: 'create_diagram', canvasKind: 'present' },
		metadata: {
			layer: 'agent',
			axes: 'deterministic structure and layout rules + declared components and edges + judged faithfulness',
			note: 'The one case that keeps an LLM judge. It grades whether the drawing means what the prose means; the rules beside it grade whether the drawing is usable.'
		},
		async run(lab) {
			const { result, canvas, review, sourceText, skillNoteId } = await drawFor(
				lab,
				checkoutArchitecture,
				this.input.prompt as string
			);
			const findings = review?.findings ?? [];
			const points = blemishPoints(findings);
			const skill = loadedDiagrammingSkill({ toolCalls: result.toolCalls, skillNoteId });
			const faithful = await judgeRubricConsensus({
				subject: 'the labels and directed edges extracted from an editable draw.io diagram',
				criteria: [
					'All five named system components are represented.',
					'The Storefront flows to the Checkout API, which reaches both the Payment Gateway and Ledger Service.',
					'The order-confirmed event flows from the Checkout API to the Notification Worker.',
					'There is no direct Notification Worker to Payment Gateway edge.'
				],
				context: sourceText,
				artefact: JSON.stringify(canvas.kind === 'present' ? inspectDrawio(canvas.source) : {})
			});
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				diagrammingSkill: skill,
				canvasKind: canvas.kind,
				graph: review ? summariseGraph(review.graph) : undefined,
				findings,
				blemishPoints: points,
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
					presented: result.calledToolNames.includes('create_diagram'),
					diagrammingSkill: skill,
					canvasKind: canvas.kind,
					faithful: faithful.followed,
					blocking: blockingFindings(findings).map((finding) => finding.rule),
					overBudget: points > BLEMISH_BUDGET
				},
				explain(
					result.failure,
					findings,
					result.calledToolNames,
					review ? describeGraph(review.graph) : undefined
				)
			).toEqual({
				status: 'completed',
				presented: true,
				diagrammingSkill: 'loaded',
				canvasKind: 'present',
				faithful: true,
				blocking: [],
				overBudget: false
			});
		}
	},
	...minedArchitectureCases,
	{
		id: 'diagram-implicit-picture-reaches-canvas',
		name: 'interprets an implicit picture request as a canvas artifact rather than chat art',
		splits: [ARCHETYPES.toolDiscovery, 'ambiguity'],
		input: { prompt: 'Turn this into a picture I can move around and clean up later.' },
		expected: { tool: 'create_diagram', canvasKind: 'present' },
		metadata: {
			layer: 'agent',
			note: 'The user names the desired affordance, not diagrams, Mermaid, draw.io, canvas, or any tool.'
		},
		async run(lab) {
			const { result, canvas, review, skillNoteId } = await drawFor(
				lab,
				checkoutArchitecture,
				this.input.prompt as string
			);
			const findings = review?.findings ?? [];
			const points = blemishPoints(findings);
			const skill = loadedDiagrammingSkill({ toolCalls: result.toolCalls, skillNoteId });
			const call = findCall(result, 'create_diagram');
			px.logOutput({
				model: result.model,
				toolCalls: result.calledToolNames,
				diagrammingSkill: skill,
				canvasKind: canvas.kind,
				graph: review ? summariseGraph(review.graph) : undefined,
				findings,
				arguments: call?.arguments,
				response: result.finalResponse.slice(0, 300)
			});
			const reached = result.status === 'completed' && Boolean(call) && canvas.kind === 'present';
			px.logAnnotation({
				name: ARCHETYPES.toolDiscovery,
				score: reached ? 1 : 0,
				label: reached ? 'editable_canvas_presented' : 'missing_or_invalid_canvas',
				explanation: `tools=${result.calledToolNames.join(', ')}; canvas=${canvas.kind}`
			});
			expect(
				{
					reached,
					diagrammingSkill: skill,
					blocking: blockingFindings(findings).map((finding) => finding.rule),
					overBudget: points > BLEMISH_BUDGET
				},
				explain(
					result.failure,
					findings,
					result.calledToolNames,
					review ? describeGraph(review.graph) : undefined
				)
			).toEqual({
				reached: true,
				diagrammingSkill: 'loaded',
				blocking: [],
				overBudget: false
			});
		}
	}
];
