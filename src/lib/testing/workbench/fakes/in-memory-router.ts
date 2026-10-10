import type { WorkbenchRouter } from '$lib/controllers/workbench/contracts';

/** Router state with delayed navigation for account and restoration race tests. */
export class InMemoryWorkbenchRouter implements WorkbenchRouter {
	url: URL;
	onNavigationPending?: () => void;
	navigationGate?: Promise<void>;
	gotoCount = 0;
	private generation = 0;
	private history: URL[];
	private historyIndex = 0;
	constructor(href: string) {
		this.url = new URL(href, 'https://followthrough.test');
		this.history = [this.url];
	}
	async goto(url: string, options?: { replaceState?: boolean }): Promise<void> {
		const generation = ++this.generation;
		this.gotoCount++;
		this.onNavigationPending?.();
		await this.navigationGate;
		if (generation !== this.generation) return;
		this.url = new URL(url, 'https://followthrough.test');
		if (options?.replaceState) this.history[this.historyIndex] = this.url;
		else {
			this.history = [...this.history.slice(0, this.historyIndex + 1), this.url];
			this.historyIndex++;
		}
	}
	back(): void {
		if (this.historyIndex > 0) this.url = this.history[--this.historyIndex];
	}
	forward(): void {
		if (this.historyIndex < this.history.length - 1) this.url = this.history[++this.historyIndex];
	}
	currentUrl(): URL {
		return this.url;
	}
}
