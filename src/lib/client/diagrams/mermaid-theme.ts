import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';

/** The reader's current colour mode, which copied diagrams are drawn in. */
export const currentMermaidTheme = (): MermaidTheme => ({
	base: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
});
