import type { ProjectId } from '$lib/models/projects';
import type { NoteId } from '$lib/models/notes';
import { readArchiveImportResponse } from './import-response';

/** Send a Markdown archive to the import endpoint and read its per-file report. */
export const uploadArchive = async (archive: File, projectId: ProjectId, parentId?: NoteId) => {
	const body = new FormData();
	body.set('archive', archive);
	body.set('projectId', projectId);
	if (parentId) body.set('parentId', parentId);
	const response = await fetch('/api/imports', { method: 'POST', body });
	return readArchiveImportResponse(response);
};
