import type { ActorContext } from '$lib/models/identity';
import type { Diagram, DiagramId, DrawioDiagram, MermaidDiagram } from '$lib/models/diagrams';
import type { Note, TextSelection } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { Skill } from '$lib/models/skills';
import { ExternalServiceError, NotFoundError } from '$lib/errors';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramPromoter,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramCreator,
	DrawioDiagramExporter,
	MermaidDiagramCreator,
	MermaidDiagramRenderer,
	MermaidDiagramReviser
} from '$lib/server/services/diagrams/contracts';
import type { SkillCreator } from '$lib/server/services/skills/contracts';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow
} from '$lib/testing/workspace/fixtures/domain-builders';
import type { SnapshotParticipant } from '$lib/testing/workspace/fakes/in-memory-transaction';

export const mermaidBuilder = (overrides: Partial<MermaidDiagram> = {}): MermaidDiagram => ({
	id: '60000000-0000-4000-8000-000000000001' as DiagramId,
	userId: testActor().userId,
	noteId: testNoteId(),
	kind: 'mermaid',
	title: 'Architecture',
	source: 'flowchart LR\nA --> B',
	searchableText: 'A B',
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export const drawioBuilder = (overrides: Partial<DrawioDiagram> = {}): DrawioDiagram => ({
	id: '60000000-0000-4000-8000-000000000002' as DiagramId,
	userId: testActor().userId,
	noteId: testNoteId(),
	kind: 'drawio',
	title: 'Architecture',
	source: '<mxfile />',
	searchableText: 'A B',
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export class InMemoryDiagrams
	implements
		DiagramFinder,
		MermaidDiagramReviser,
		MermaidDiagramRenderer,
		DrawioDiagramCreator,
		DrawioDiagramExporter,
		DiagramPromoter,
		DiagramTextExtractor,
		DiagramWriter,
		DiagramIndexer
{
	diagrams: Diagram[] = [];
	indexedIds: DiagramId[] = [];

	async get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = this.diagrams.find(
			(candidate) => candidate.id === diagramId && candidate.userId === actor.userId
		);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}

	async revise(
		_actor: ActorContext,
		diagram: MermaidDiagram,
		instruction: string
	): Promise<MermaidDiagram> {
		void _actor;
		return { ...diagram, source: `${diagram.source}\n%% ${instruction}` };
	}

	async render(source: string): Promise<string> {
		return `<svg>${source}</svg>`;
	}

	async createFromMermaid(_actor: ActorContext, diagram: MermaidDiagram): Promise<DrawioDiagram> {
		void _actor;
		return drawioBuilder({
			noteId: diagram.noteId,
			source:
				'<mxfile><diagram name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry x="0" y="0" width="80" height="30" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>',
			promotedFromId: diagram.id
		});
	}

	async exportSvg(diagram: DrawioDiagram): Promise<string> {
		return `<svg>${diagram.searchableText}</svg>`;
	}

	async promote(
		_actor: ActorContext,
		source: MermaidDiagram,
		target: DrawioDiagram
	): Promise<DrawioDiagram> {
		void _actor;
		return { ...target, promotedFromId: source.id };
	}

	async extract(diagram: Diagram): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	async create(_actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		void _actor;
		this.diagrams.push(diagram);
		return diagram;
	}

	async update(_actor: ActorContext, diagram: Diagram): Promise<Diagram> {
		void _actor;
		this.diagrams = this.diagrams.map((candidate) =>
			candidate.id === diagram.id ? diagram : candidate
		);
		return diagram;
	}

	async index(_actor: ActorContext, diagram: Diagram): Promise<void> {
		void _actor;
		this.indexedIds.push(diagram.id);
	}
}

export class InMemoryMermaidCreator implements MermaidDiagramCreator {
	async create(
		_actor: ActorContext,
		_selection: TextSelection,
		instruction?: string
	): Promise<{ title?: string; source: string }> {
		void _actor;
		void _selection;
		return {
			title: instruction ? `Diagram: ${instruction}` : 'Generated diagram',
			source: 'flowchart LR\nA --> B'
		};
	}
}

export class InMemorySkillCreator implements SkillCreator, SnapshotParticipant {
	skills: Skill[] = [];
	failCreation = false;

	async create(
		_actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill> {
		void _actor;
		if (this.failCreation) throw new ExternalServiceError('Skill creation failed');
		const skill: Skill = { note, isEnabled: true, ...input };
		this.skills.push(skill);
		return skill;
	}

	async createFromSelection(
		actor: ActorContext,
		selection: TextSelection,
		input: {
			name: string;
			description: string;
			triggerHints: readonly string[];
			provenanceId: ProvenanceId;
		}
	): Promise<Skill> {
		return this.create(
			actor,
			noteBuilder({
				id: testNoteId(90 + this.skills.length),
				kind: 'skill',
				title: input.name,
				plainText: selection.text
			}),
			input
		);
	}

	snapshot(): unknown {
		return structuredClone(this.skills);
	}

	restore(snapshot: unknown): void {
		this.skills = snapshot as Skill[];
	}
}
