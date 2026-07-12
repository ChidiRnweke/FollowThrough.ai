import type {
	ActorContext,
	DateTime,
	Diagram,
	DiagramId,
	DrawioDiagram,
	MermaidDiagram,
	TextSelection
} from '$lib/models';
import { ValidationError } from '$lib/models';
import type {
	DiagramPromoter,
	DiagramTextExtractor,
	DrawioDiagramCreator,
	DrawioDiagramExporter,
	MermaidDiagramCreator,
	MermaidDiagramRenderer,
	MermaidDiagramReviser
} from './contracts';

const now = (): DateTime => new Date().toISOString() as DateTime;
const escapeXml = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export class DiagramTransformationService
	implements
		MermaidDiagramCreator,
		MermaidDiagramReviser,
		MermaidDiagramRenderer,
		DrawioDiagramCreator,
		DrawioDiagramExporter,
		DiagramPromoter,
		DiagramTextExtractor
{
	async create(
		_actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<{ title?: string; source: string }> {
		if (!selection.text.trim()) throw new ValidationError('Diagram source text is required');
		const labels = selection.text
			.split(/(?:->|calls|to)/i)
			.map((label) => label.trim().replace(/[.!]+$/, ''))
			.filter(Boolean);
		return {
			title: instruction ? `Diagram: ${instruction}` : 'Generated diagram',
			source: `flowchart LR\n${labels.map((label, index) => `  N${index}["${label}"]`).join('\n')}\n${labels
				.slice(1)
				.map((_, index) => `  N${index} --> N${index + 1}`)
				.join('\n')}`
		};
	}
	async revise(
		_actor: ActorContext,
		diagram: MermaidDiagram,
		instruction: string
	): Promise<MermaidDiagram> {
		return { ...diagram, source: `${diagram.source}\n%% ${instruction}`, updatedAt: now() };
	}
	async render(source: string): Promise<string> {
		if (!/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)/m.test(source))
			throw new ValidationError('Generated Mermaid is invalid');
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(source)}</text></svg>`;
	}
	async createFromMermaid(actor: ActorContext, diagram: MermaidDiagram): Promise<DrawioDiagram> {
		return {
			...diagram,
			id: crypto.randomUUID() as DiagramId,
			userId: actor.userId,
			kind: 'drawio',
			source: `<mxfile><diagram name="Page-1">${escapeXml(diagram.source)}</diagram></mxfile>`,
			promotedFromId: diagram.id,
			createdAt: now(),
			updatedAt: now()
		};
	}
	async exportSvg(diagram: DrawioDiagram): Promise<string> {
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(diagram.searchableText || diagram.title || 'Draw.io diagram')}</text></svg>`;
	}
	async promote(
		_actor: ActorContext,
		source: MermaidDiagram,
		target: DrawioDiagram
	): Promise<DrawioDiagram> {
		return { ...target, promotedFromId: source.id };
	}
	async extract(diagram: Diagram): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/[^a-z0-9 _.-]+/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
