import {
	ArchiveImports,
	type ArchiveImportController
} from '$lib/controllers/notes/archive-import';
import { ArchiveImportStore } from '$lib/stores/notes/archive-import.svelte';
import { BrowserArchiveImportUpload } from '$lib/client/notes/archive-import';
import { workspaceSession } from '$lib/factories/workspace/session';
export const createArchiveImports = (): ArchiveImportController =>
	new ArchiveImports(new ArchiveImportStore(), workspaceSession, new BrowserArchiveImportUpload());
