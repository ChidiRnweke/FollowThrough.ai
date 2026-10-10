import { MermaidRenderStore } from '$lib/stores/diagrams/mermaid-render.svelte';
import {
	MermaidRenderSession,
	type MermaidRenderController
} from '$lib/controllers/diagrams/mermaid-render';
import { createMermaidDiagrams } from './mermaid';
export const createMermaidRenderSession = (): MermaidRenderController =>
	new MermaidRenderSession(new MermaidRenderStore(), createMermaidDiagrams());
