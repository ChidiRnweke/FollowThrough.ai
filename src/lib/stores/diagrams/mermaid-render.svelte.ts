import type { MermaidRender } from '$lib/models/diagrams/mermaid-theme';
export class MermaidRenderStore {
	private generationValue = 0;
	private currentValue = $state.raw<MermaidRender>({ kind: 'pending' });
	get generation(): number {
		return this.generationValue;
	}
	get current(): MermaidRender {
		return this.currentValue;
	}
	begin(): number {
		this.currentValue = { kind: 'pending' };
		return ++this.generationValue;
	}
	setCurrent(value: MermaidRender): void {
		this.currentValue = value;
	}
}
