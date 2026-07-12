import type {
	ExtractPromisesOutput,
	FindReferencesOutput,
	GenerateMermaidDiagramOutput,
	Note,
	RelateSelectionOutput,
	SaveNoteOutput,
	TextSelection
} from '$lib/models';

class NoteActionsStore {
	running = $state(false);
	saving = $state(false);

	private async post<T>(path: string, body: unknown): Promise<T | undefined> {
		try {
			const response = await fetch(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			return response.ok ? ((await response.json()) as T) : undefined;
		} catch {
			return undefined;
		}
	}

	private async run<T>(path: string, selection: TextSelection): Promise<T | undefined> {
		this.running = true;
		try {
			return await this.post<T>(path, { selection });
		} finally {
			this.running = false;
		}
	}

	extractPromises(selection: TextSelection): Promise<ExtractPromisesOutput | undefined> {
		return this.run('/api/ai/extract-promises', selection);
	}
	relate(selection: TextSelection): Promise<RelateSelectionOutput | undefined> {
		return this.run('/api/ai/relate', selection);
	}
	findReferences(selection: TextSelection): Promise<FindReferencesOutput | undefined> {
		return this.run('/api/ai/reference', selection);
	}
	generateDiagram(selection: TextSelection): Promise<GenerateMermaidDiagramOutput | undefined> {
		return this.run('/api/ai/diagram', selection);
	}

	async save(note: Note): Promise<SaveNoteOutput | undefined> {
		this.saving = true;
		try {
			return await this.post<SaveNoteOutput>('/api/notes', { note });
		} finally {
			this.saving = false;
		}
	}
}

export const noteActions = new NoteActionsStore();
