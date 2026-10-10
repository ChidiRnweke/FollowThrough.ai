import type { MermaidSyntaxReader } from '$lib/server/repositories/diagrams/mermaid-syntax';
export class InMemoryMermaidSyntaxReader implements MermaidSyntaxReader {
	constructor(private readonly failure?: Error) {}
	async parse(_source: string): Promise<void> {
		if (this.failure) throw this.failure;
	}
}
