import type { IndexingResult } from '$lib/models/knowledge-search';
import type { ActorContext } from '$lib/models/identity';
import type {
	Diagram,
	DiagramContentWrite,
	DiagramId,
	DrawioDiagram,
	MermaidDiagram
} from '$lib/models/diagrams';
import type { Note, TextSelection } from '$lib/models/notes';
import type { ProvenanceId } from '$lib/models/provenance';
import type { Skill } from '$lib/models/skills';
import { ExternalServiceError, NotFoundError, StaleRevisionError } from '$lib/errors';
import type {
	DiagramFinder,
	DiagramIndexer,
	DiagramPromoter,
	DiagramTextExtractor,
	DiagramWriter,
	DrawioDiagramExporter,
	MermaidDiagramRenderer
} from '$lib/server/services/diagrams/contracts';
import type { SkillCreator } from '$lib/server/services/skills/contracts';
import {
	noteBuilder,
	testActor,
	testNoteId,
	testNow,
	testProjectId
} from '$lib/testing/workspace/fixtures/domain-builders';
import type {
	RestoreSnapshot,
	SnapshotParticipant
} from '$lib/testing/workspace/fakes/in-memory-transaction';

export const mermaidBuilder = (overrides: Partial<MermaidDiagram> = {}): MermaidDiagram => ({
	id: '60000000-0000-4000-8000-000000000001' as DiagramId,
	userId: testActor().userId,
	projectId: testProjectId(),
	sourceNoteId: testNoteId(),
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
	projectId: testProjectId(),
	sourceNoteId: testNoteId(),
	kind: 'drawio',
	title: 'Architecture',
	source: '<mxfile />',
	searchableText: 'A B',
	currentRevision: 1,
	publishedRevision: 1,
	publishedAt: testNow,
	createdAt: testNow,
	updatedAt: testNow,
	...overrides
});

export class InMemoryDiagrams
	implements
		DiagramFinder,
		MermaidDiagramRenderer,
		DrawioDiagramExporter,
		DiagramPromoter,
		DiagramTextExtractor,
		DiagramWriter,
		DiagramIndexer,
		SnapshotParticipant
{
	diagrams: Diagram[] = [];
	indexedIds: DiagramId[] = [];
	failIndex = false;

	snapshot(): RestoreSnapshot {
		const diagrams = structuredClone(this.diagrams);
		const indexedIds = [...this.indexedIds];
		return () => {
			this.diagrams = diagrams;
			this.indexedIds = indexedIds;
		};
	}

	async get(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		const diagram = this.diagrams.find(
			(candidate) => candidate.id === diagramId && candidate.userId === actor.userId
		);
		if (!diagram) throw new NotFoundError('Diagram was not found');
		return diagram;
	}

	getForWrite(actor: ActorContext, diagramId: DiagramId): Promise<Diagram> {
		return this.get(actor, diagramId);
	}

	async render(source: string): Promise<string> {
		return `<svg>${source}</svg>`;
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

	async extract(diagram: { readonly source: string }): Promise<string> {
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

	async persistContent(actor: ActorContext, write: DiagramContentWrite): Promise<Diagram> {
		const current = this.diagrams.find(
			(item) => item.id === write.diagramId && item.userId === actor.userId
		);
		if (
			!current ||
			current.kind !== write.kind ||
			current.archivedAt ||
			current.updatedAt !== write.expectedUpdatedAt ||
			(write.kind === 'drawio' &&
				(current.kind !== 'drawio' ||
					current.currentRevision !== write.expectedRevision ||
					current.publishedRevision !== write.expectedPublishedRevision))
		)
			throw new StaleRevisionError('The diagram changed before its content could be saved');
		const saved: Diagram = {
			...current,
			source: write.source,
			renderedSvg: write.renderedSvg,
			searchableText: write.searchableText,
			updatedAt: write.updatedAt,
			...(write.kind === 'mermaid' ? { title: write.title, provenanceId: write.provenanceId } : {})
		};
		this.diagrams = this.diagrams.map((item) => (item.id === saved.id ? saved : item));
		return saved;
	}
	async index(_actor: ActorContext, diagram: Diagram): Promise<IndexingResult> {
		if (this.failIndex) throw new ExternalServiceError('Indexing failed');
		void _actor;
		this.indexedIds.push(diagram.id);
		return { kind: 'stored' };
	}
}

export class InMemorySkillCreator implements SkillCreator, SnapshotParticipant {
	skills: Skill<Note>[] = [];
	failCreation = false;

	async create(
		_actor: ActorContext,
		note: Note,
		input: { name: string; description: string; triggerHints: readonly string[] }
	): Promise<Skill<Note>> {
		void _actor;
		if (this.failCreation) throw new ExternalServiceError('Skill creation failed');
		const skill: Skill<Note> = { note, isEnabled: true, ...input };
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
	): Promise<Skill<Note>> {
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

	snapshot(): RestoreSnapshot {
		const skills = structuredClone(this.skills);
		return () => {
			this.skills = skills;
		};
	}
}
