import type { InlineSuggestion } from '$lib/models/agent';
import type { NoteWritingRequest, NoteWritingTransport } from '$lib/controllers/notes/writing';
export class InMemoryNoteWriting implements NoteWritingTransport {
	result: InlineSuggestion = {
		outcome: 'suggested',
		text: ' next words',
		grounding: { currentNote: true, userMemoryCount: 0, projectPassageCount: 0 }
	};
	failure: Error | undefined;
	pending: Promise<void> = Promise.resolve();
	async suggest(_input: NoteWritingRequest, _signal: AbortSignal): Promise<InlineSuggestion> {
		await this.pending;
		if (this.failure) throw this.failure;
		return this.result;
	}
}
