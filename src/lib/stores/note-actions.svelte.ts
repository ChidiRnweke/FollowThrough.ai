import type {
	ExtractPromisesOutput,
	ConvertInlineMermaidOutput,
	DrawioDiagram,
	SuggestionId,
	FindReferencesOutput,
	GenerateMermaidDiagramOutput,
	Note,
	RelateSelectionOutput,
	ReviseInlineMermaidOutput,
	SaveNoteOutput,
	TextSelection
} from '$lib/models';
import {
	saveNote,
	extractPromises,
	relateNote,
	findReferences,
	generateDiagram,
	reviseDiagram,
	convertDiagram
} from '$lib/remote/notes.remote';
import { acceptSuggestion, rejectSuggestion } from '$lib/remote/suggestions.remote';

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

	extractPromises(selection: TextSelection): Promise<ExtractPromisesOutput | undefined> {
		return this.call<ExtractPromisesOutput>(() => extractPromises({ selection }), { run: true });
	}
	relate(selection: TextSelection): Promise<RelateSelectionOutput | undefined> {
		return this.call<RelateSelectionOutput>(() => relateNote({ selection }), { run: true });
	}
	findReferences(selection: TextSelection): Promise<FindReferencesOutput | undefined> {
		return this.call<FindReferencesOutput>(() => findReferences({ selection }), { run: true });
	}
	generateDiagram(selection: TextSelection): Promise<GenerateMermaidDiagramOutput | undefined> {
		return this.call<GenerateMermaidDiagramOutput>(() => generateDiagram({ selection }), {
			run: true
		});
	}
	async reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string,
		renderedPngDataUrl?: string
	): Promise<ReviseInlineMermaidOutput | undefined> {
		const result = await this.call<ReviseInlineMermaidOutput>(
			() =>
				reviseDiagram({
					noteId,
					source,
					instruction,
					renderedPngDataUrl
				}) as Promise<ReviseInlineMermaidOutput>,
			{ run: true }
		);
		if (result && 'error' in result) {
			this.lastError = result.error as string;
			return undefined;
		}
		return result;
	}

	convertDiagram(
		noteId: Note['id'],
		source: string,
		instruction?: string
	): Promise<ConvertInlineMermaidOutput | undefined> {
		return this.call<ConvertInlineMermaidOutput>(
			() => convertDiagram({ noteId, source, instruction }),
			{ run: true }
		);
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
