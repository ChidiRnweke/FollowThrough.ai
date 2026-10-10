import { inlineSuggestionSchema, type InlineSuggestion } from '$lib/models/agent';
import type { NoteWritingRequest, NoteWritingTransport } from '$lib/controllers/notes/writing';
export class BrowserNoteWriting implements NoteWritingTransport {
	async suggest(input: NoteWritingRequest, signal: AbortSignal): Promise<InlineSuggestion> {
		const response = await fetch('/api/inline-suggestions', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ requestId: crypto.randomUUID(), ...input }),
			signal
		});
		if (!response.ok) throw new Error(`Writing suggestion failed with status ${response.status}`);
		return inlineSuggestionSchema.parse(await response.json());
	}
}
