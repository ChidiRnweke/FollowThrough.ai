import { MermaidRenderStore } from '$lib/stores/diagrams/mermaid-render.svelte';
import {
	MermaidRenderSession,
	type MermaidRenderController
} from '$lib/controllers/diagrams/mermaid-render';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
export const createMermaidRenderSession = (): MermaidRenderController =>
	new MermaidRenderSession(
		new MermaidRenderStore(),
		new MermaidThemeService(),
		new BrowserMermaidRenderer()
	);
