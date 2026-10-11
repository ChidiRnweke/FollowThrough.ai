import type { MermaidDocuments } from '$lib/server/services/diagrams/mermaid';
import { ValidationError } from '$lib/errors';

/**
 * Mermaid source handling without Mermaid's parser: accepts every source except the ones a test
 * rejects, can hold a validation open, and renders a placeholder preview.
 */
export class InMemoryMermaidDocuments implements MermaidDocuments {
	readonly started = Promise.withResolvers<void>();
	readonly rejections = new Map<string, string>();
	gate: Promise<void> | undefined;
	async validate(source: string): Promise<void> {
		this.started.resolve();
		await this.gate;
		const rejection = this.rejections.get(source);
		if (rejection) throw new ValidationError(rejection);
	}
	async render(source: string): Promise<string> {
		return `<svg>${source}</svg>`;
	}
	async extract(diagram: { readonly source: string }): Promise<string> {
		return diagram.source
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
