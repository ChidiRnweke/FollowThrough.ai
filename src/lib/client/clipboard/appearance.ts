import type { ClipboardAppearance } from '$lib/controllers/notes/clipboard-operations';
import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
export class BrowserClipboardAppearance implements ClipboardAppearance {
	theme(): MermaidTheme {
		return { base: document.documentElement.classList.contains('dark') ? 'dark' : 'light' };
	}
}
