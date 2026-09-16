import type { WorkbenchRouter } from '$lib/stores/workbench/workbench.svelte';

/** Router state with delayed navigation for account and restoration race tests. */
export class InMemoryWorkbenchRouter implements WorkbenchRouter {
	url: URL;
	onNavigationPending?: () => void;
	navigationGate?: Promise<void>;
	gotoCount = 0;
	private generation = 0;
	constructor(href: string) {
		this.url = new URL(href, 'https://followthrough.test');
	}
	async goto(url: string): Promise<void> {
		const generation = ++this.generation;
		this.gotoCount++;
		this.onNavigationPending?.();
		await this.navigationGate;
		if (generation === this.generation) this.url = new URL(url, 'https://followthrough.test');
	}
	currentUrl(): URL {
		return this.url;
	}
}
