import { toast } from 'svelte-sonner';
import type { NoteWorkspaceFeedback } from '$lib/controllers/notes/workspace';
export class BrowserNoteWorkspaceFeedback implements NoteWorkspaceFeedback {
	error(message: string): void {
		toast.error(message);
	}
	success(message: string): void {
		toast.success(message);
	}
	info(message: string): void {
		toast.info(message);
	}
}
