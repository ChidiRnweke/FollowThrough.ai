import type { MermaidSyntaxReader } from '$lib/server/repositories/diagrams/mermaid-syntax';
import { ValidationError } from '$lib/errors';

export class MermaidSubmissionValidator implements MermaidSourceValidator {
	/** The injected parse raises on invalid source; its result is not read. */
	constructor(private readonly syntax: MermaidSyntaxReader) {}

	async validate(source: string): Promise<void> {
		if (source.includes('```'))
			throw new ValidationError('Submit Mermaid source without code fences.');
		if (/%%\s*\{/i.test(source))
			throw new ValidationError(
				'Mermaid initialization and configuration directives are not allowed.'
			);
		if (/^\s*(?:click|href)\s+/im.test(source) || /javascript:/i.test(source))
			throw new ValidationError('Links and click handlers are not allowed in Mermaid diagrams.');
		if (/<\/?[a-z][^>]*>/i.test(source))
			throw new ValidationError(
				'HTML labels are not allowed in Mermaid diagrams. Use escaped \\n inside quoted labels instead.'
			);
		try {
			await this.syntax.parse(source);
		} catch (error) {
			throw new ValidationError(
				`Invalid Mermaid syntax: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}

export interface MermaidSourceValidator {
	validate(source: string): Promise<void>;
}
