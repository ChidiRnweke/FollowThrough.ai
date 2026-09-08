import type { AgentRunReceipt } from '$lib/models/agent';
import type { DrawioDiagram } from '$lib/models/diagrams';
import type { SuggestionId } from '$lib/models/suggestions';
import type { Note, TextSelection } from '$lib/models/notes';
import {
	extractPromises,
	relateNote,
	findReferences,
	generateDiagram,
	reviseDiagram,
	convertDiagram
} from '$lib/remote/notes/notes.remote';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions/suggestions.remote';

class NoteActionsStore {
	running = $state(false);
	lastError = $state<string | undefined>(undefined);

	private async call<T>(
		fn: () => Promise<T>,
		{ run = false }: { run?: boolean } = {}
	): Promise<T | undefined> {
		this.lastError = undefined;
		if (run) this.running = true;
		try {
			return await fn();
			// audit-allow: silent-catch — undefined is the typed action failure outcome and lastError supplies the caller's user-visible message.
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : 'The request failed.';
			return undefined;
		} finally {
			if (run) this.running = false;
		}
	}

	extractPromises(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(() => extractPromises({ selection }));
	}
	relate(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(() => relateNote({ selection }));
	}
	findReferences(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(() => findReferences({ selection }));
	}
	generateDiagram(selection: TextSelection): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(() => generateDiagram({ selection }));
	}
	reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string,
		renderedPngDataUrl?: string
	): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(
			() =>
				reviseDiagram({
					noteId,
					source,
					instruction,
					renderedPngDataUrl
				}) as Promise<AgentRunReceipt>
		);
	}

	convertDiagram(
		noteId: Note['id'],
		source: string,
		instruction?: string
	): Promise<AgentRunReceipt | undefined> {
		return this.call<AgentRunReceipt>(() => convertDiagram({ noteId, source, instruction }));
	}

	async acceptDrawio(
		noteId: Note['id'],
		suggestionId: SuggestionId,
		source: string,
		renderedSvg: string
	): Promise<DrawioDiagram | undefined> {
		return this.call<DrawioDiagram>(
			async () => {
				const accepted = await acceptSuggestion({
					suggestionId,
					drawioReview: { noteId, source, renderedSvg }
				});
				if (accepted.suggestion.kind !== 'diagram' || accepted.suggestion.payload.kind !== 'drawio')
					throw new Error('The accepted suggestion did not create the expected draw.io diagram.');
				return accepted.artifact as DrawioDiagram;
			},
			{ run: true }
		);
	}

	rejectDrawio(suggestionId: SuggestionId): Promise<unknown | undefined> {
		return this.call(() => rejectSuggestion({ suggestionId }), { run: true });
	}
}

export const noteActions = new NoteActionsStore();
