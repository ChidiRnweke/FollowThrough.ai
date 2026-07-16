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

class NoteActionsStore {
	running = $state(false);
	saving = $state(false);
	lastError = $state<string | undefined>(undefined);

	private async post<T>(path: string, body: unknown): Promise<T | undefined> {
		this.lastError = undefined;
		try {
			const response = await fetch(path, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const payload = (await response.json().catch(() => undefined)) as
				T | { message?: string } | undefined;
			if (response.ok) return payload as T;
			this.lastError =
				payload && typeof payload === 'object' && 'message' in payload
					? payload.message
					: 'The request failed.';
			return undefined;
		} catch (error) {
			this.lastError = error instanceof Error ? error.message : 'The request failed.';
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
	async reviseDiagram(
		noteId: Note['id'],
		source: string,
		instruction: string
	): Promise<ReviseInlineMermaidOutput | undefined> {
		this.running = true;
		try {
			return await this.post<ReviseInlineMermaidOutput>('/api/ai/diagram/revise', {
				noteId,
				source,
				instruction
			});
		} finally {
			this.running = false;
		}
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
