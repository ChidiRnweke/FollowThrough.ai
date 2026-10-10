import { MermaidDiagrams, type MermaidController } from '$lib/controllers/diagrams/mermaid';
import { BrowserMermaidRenderer } from '$lib/client/diagrams/mermaid-rendering';
import { BrowserMermaidImageOutput } from '$lib/client/diagrams/mermaid-export';
import { MermaidThemeService } from '$lib/services/diagrams/mermaid-theme';
export const createMermaidDiagrams = (): MermaidController =>
	new MermaidDiagrams(
		new MermaidThemeService(),
		new BrowserMermaidRenderer(),
		new BrowserMermaidImageOutput()
	);
