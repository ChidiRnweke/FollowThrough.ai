import {
	EditorSessions,
	type EditorSessionController
} from '$lib/controllers/workspace/editor-session';
import { EditorSessionStore } from '$lib/stores/workspace/editor-session.svelte';
export const createEditorSession = (active: () => boolean): EditorSessionController =>
	new EditorSessions(active, new EditorSessionStore());
