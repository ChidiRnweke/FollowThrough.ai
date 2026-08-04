import type { ActorContext } from '$lib/models/identity';
import type { DateTime } from '$lib/models/workspace';
import type {
	Diagram,
	MermaidDiagram,
	ReviseInlineMermaidInput,
	ReviseInlineMermaidOutput
} from '$lib/models/diagrams';
import type { ProvenanceId } from '$lib/models/provenance';
import type { TextSelection } from '$lib/models/notes';
import { ValidationError } from '$lib/errors';

const now = (): DateTime => new Date().toISOString() as DateTime;
const escapeXml = (value: string): string =>
	value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export class DiagramContent {
	async create(
		_actor: ActorContext,
		selection: TextSelection,
		instruction?: string
	): Promise<{ title?: string; source: string; provenanceId?: ProvenanceId }> {
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
		input: ReviseInlineMermaidInput
	): Promise<ReviseInlineMermaidOutput> {
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

export type MermaidDiagramCreator = Pick<DiagramContent, 'create'>;
export type MermaidDiagramReviser = Pick<DiagramContent, 'revise'>;
export type MermaidDiagramRenderer = Pick<DiagramContent, 'render'>;
export type DiagramTextExtractor = Pick<DiagramContent, 'extract'>;
