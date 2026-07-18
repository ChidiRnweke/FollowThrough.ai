import type { ActorContext, DateTime, Diagram, MermaidDiagram, TextSelection } from '$lib/models';
import { ValidationError } from '$lib/models';
import type {
	DiagramTextExtractor,
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

	async reviseInline(
		_actor: ActorContext,
		input: import('$lib/models').ReviseInlineMermaidInput
	): Promise<import('$lib/models').ReviseInlineMermaidOutput> {
		void _actor;
		return { source: `${input.source}\n%% ${input.instruction}` };
	}
	async render(source: string): Promise<string> {
		if (!/^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram)/m.test(source))
			throw new ValidationError('Generated Mermaid is invalid');
		return `<svg xmlns="http://www.w3.org/2000/svg" role="img"><text x="8" y="20">${escapeXml(source)}</text></svg>`;
	}
	async extract(diagram: Diagram): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/[^a-z0-9 _.-]+/gi, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
