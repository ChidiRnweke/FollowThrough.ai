import type { DiagramRenderResources } from '$lib/models/deliverables';
type ResourceState =
	| { readonly kind: 'empty' }
	| { readonly kind: 'loading'; readonly pending: Promise<DiagramRenderResources> }
	| { readonly kind: 'ready'; readonly resources: DiagramRenderResources };
/** Process-scoped immutable assets and the outstanding read that will populate them. */
export interface DiagramRenderCache {
	readonly current: ResourceState;
	setLoading(pending: Promise<DiagramRenderResources>): void;
	setReady(resources: DiagramRenderResources): void;
	clear(): void;
}
export class DiagramRenderResourceStore implements DiagramRenderCache {
	private value: ResourceState = { kind: 'empty' };
	get current(): ResourceState {
		return this.value;
	}
	setLoading(pending: Promise<DiagramRenderResources>): void {
		this.value = { kind: 'loading', pending };
	}
	setReady(resources: DiagramRenderResources): void {
		this.value = { kind: 'ready', resources };
	}
	clear(): void {
		this.value = { kind: 'empty' };
	}
}
