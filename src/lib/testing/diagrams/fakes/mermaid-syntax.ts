import type { MermaidSyntaxReader } from '$lib/server/repositories/diagrams/mermaid-syntax';
export class InMemoryMermaidSyntaxReader implements MermaidSyntaxReader {
	readonly started = Promise.withResolvers<void>();
	gate: Promise<void> | undefined;
	constructor(private readonly failure?: Error) {}
	async parse(_source: string): Promise<void> {
		this.started.resolve();
		await this.gate;
		if (this.failure) throw this.failure;
	}
}
