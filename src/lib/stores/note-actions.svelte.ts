import type {
	ExtractPromisesOutput,
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
	reviseDiagram
} from '$lib/remote/notes.remote';

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
		return this.call<GenerateMermaidDiagramOutput>(
			() => generateDiagram({ selection }),
			{ run: true }
		);
	}
	async reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string
	): Promise<ReviseInlineMermaidOutput | undefined> {
		const result = await this.call<ReviseInlineMermaidOutput>(
			() => reviseDiagram({ noteId, source, instruction }) as Promise<ReviseInlineMermaidOutput>,
			{ run: true }
		);
		if (result && 'error' in result) {
			this.lastError = result.error as string;
			return undefined;
		}
		return result;
	}

	async save(note: Note): Promise<SaveNoteOutput | undefined> {
		return this.call<SaveNoteOutput>(() => saveNote({ note }), { save: true });
	}
}

export const noteActions = new NoteActionsStore();
