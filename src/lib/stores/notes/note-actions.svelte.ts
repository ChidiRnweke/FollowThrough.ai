import type { AgentRunReceipt } from '$lib/models/agent';
import type { DrawioDiagram } from '$lib/models/diagrams';
import type { SuggestionId } from '$lib/models/suggestions';
import type { Note, SaveNoteOutput, TextSelection } from '$lib/models/notes';
import {
	saveNote,
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
	saving = $state(false);
	lastError = $state<string | undefined>(undefined);

	private async call<T>(
		fn: () => Promise<T>,
		{ save = false, run = false }: { save?: boolean; run?: boolean } = {}
	): Promise<T | undefined> {
		this.lastError = undefined;
		if (save) this.saving = true;
		if (run) this.running = true;
		try {
			return await fn();
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : 'The request failed.';
			return undefined;
		} finally {
			if (save) this.saving = false;
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

	async save(note: Note): Promise<SaveNoteOutput | undefined> {
		return this.call<SaveNoteOutput>(() => saveNote({ note }), { save: true });
	}
}

export const noteActions = new NoteActionsStore();
