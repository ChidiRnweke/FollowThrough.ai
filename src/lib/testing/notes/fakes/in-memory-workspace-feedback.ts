import type { NoteWorkspaceFeedback } from '$lib/controllers/notes/workspace';
export class InMemoryWorkspaceFeedback implements NoteWorkspaceFeedback {
	readonly messages: { kind: 'error' | 'success' | 'info'; message: string }[] = [];
	error(message: string): void {
		this.messages.push({ kind: 'error', message });
	}
	success(message: string): void {
		this.messages.push({ kind: 'success', message });
	}
	info(message: string): void {
		this.messages.push({ kind: 'info', message });
	}
}
