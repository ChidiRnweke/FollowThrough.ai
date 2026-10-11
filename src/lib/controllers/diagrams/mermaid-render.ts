import type {
	MermaidRender,
	MermaidSvgRenderer,
	MermaidTheme
} from '$lib/models/diagrams/mermaid-theme';
import type { MermaidThemeRules } from '$lib/services/diagrams/mermaid-theme';
import type { MermaidRenderStore } from '$lib/stores/diagrams/mermaid-render.svelte';
export interface MermaidRenderController {
	readonly current: MermaidRender;
	draw(source: string, theme: MermaidTheme | boolean): Promise<void>;
	cancel(): void;
}
/** Each mounted drawing owns its generation so late SVGs cannot replace a newer source. */
export class MermaidRenderSession implements MermaidRenderController {
	constructor(
		private readonly state: MermaidRenderStore,
		private readonly themes: MermaidThemeRules,
		private readonly renderer: MermaidSvgRenderer
	) {}
	get current(): MermaidRender {
		return this.state.current;
	}
	cancel(): void {
		this.state.begin();
	}
	async draw(source: string, theme: MermaidTheme | boolean): Promise<void> {
		const generation = this.state.begin();
		const result: MermaidRender = await this.renderer
			.render(
				`chat-mermaid-${crypto.randomUUID()}`,
				source,
				this.themes.resolve(theme).config,
				'screen'
			)
			.then(
				(svg) => ({ kind: 'ready' as const, svg }),
				(): { kind: 'failure' } => {
					return { kind: 'failure' };
				}
			);
		if (generation === this.state.generation) this.state.setCurrent(result);
	}
}
