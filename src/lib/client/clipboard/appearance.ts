import type { ClipboardAppearance } from '$lib/models/clipboard';
import type { MermaidTheme } from '$lib/models/diagrams/mermaid-theme';
export class BrowserClipboardAppearance implements ClipboardAppearance {
	theme(): MermaidTheme {
		return { base: document.documentElement.classList.contains('dark') ? 'dark' : 'light' };
	}
}
