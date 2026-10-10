import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import type { ArchiveImportUpload } from '$lib/controllers/notes/archive-import';
import { readArchiveImportResponse } from './import-response';
export class BrowserArchiveImportUpload implements ArchiveImportUpload {
	async upload(archive: File, projectId: ProjectId, parentId?: NoteId) {
		const body = new FormData();
		body.set('archive', archive);
		body.set('projectId', projectId);
		if (parentId) body.set('parentId', parentId);
		const response = await fetch('/api/imports', { method: 'POST', body });
		return { accepted: response.ok, result: await readArchiveImportResponse(response) };
	}
}
