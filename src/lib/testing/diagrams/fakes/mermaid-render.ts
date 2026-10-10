import type { MermaidSvgRenderer, MermaidRenderConfig } from '$lib/models/diagrams/mermaid-theme';
export class InMemoryMermaidRenderer implements MermaidSvgRenderer {
	private readonly pending = new Map<
		string,
		{ resolve: (svg: string) => void; reject: (error: Error) => void }
	>();
	readonly renderedIds: string[] = [];
	readonly requests: {
		source: string;
		config: MermaidRenderConfig;
		mode: 'screen' | 'document';
	}[] = [];
	render(
		id: string,
		source: string,
		_config: MermaidRenderConfig,
		_mode: 'screen' | 'document'
	): Promise<string> {
		this.requests.push({ source, config: _config, mode: _mode });
		this.renderedIds.push(id);
		return new Promise((resolve, reject) => {
			this.pending.set(source, { resolve, reject });
		});
	}
	complete(source: string, svg: string): void {
		this.operation(source).resolve(svg);
		this.pending.delete(source);
	}
	fail(source: string): void {
		this.operation(source).reject(new Error('Invalid Mermaid'));
		this.pending.delete(source);
	}
	private operation(source: string) {
		const operation = this.pending.get(source);
		if (!operation) throw new Error(`No pending diagram for ${source}`);
		return operation;
	}
}
