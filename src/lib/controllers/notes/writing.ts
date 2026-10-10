import type { InlineSuggestion, InlineSuggestionRequest } from '$lib/models/agent';
export type NoteWritingRequest = Omit<InlineSuggestionRequest, 'requestId' | 'projectId'>;
export interface NoteWritingTransport {
	suggest(input: NoteWritingRequest, signal: AbortSignal): Promise<InlineSuggestion>;
}
export interface NoteWritingOperations {
	suggest(input: NoteWritingRequest, signal: AbortSignal): Promise<{ readonly text: string }>;
}
export class NoteWriting implements NoteWritingOperations {
	constructor(private readonly transport: NoteWritingTransport) {}
	async suggest(
		input: NoteWritingRequest,
		signal: AbortSignal
	): Promise<{ readonly text: string }> {
		try {
			const result = await this.transport.suggest(input, signal);
			return !signal.aborted && result.outcome === 'suggested'
				? { text: result.text }
				: { text: '' };
		} catch (error) {
			if (signal.aborted) return { text: '' };
			throw error;
		}
	}
}
