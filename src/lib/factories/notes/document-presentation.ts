import { NoteReadingStatisticsService } from '$lib/services/notes/reading-statistics';
import {
	NoteDocuments,
	type NoteDocumentsController
} from '$lib/controllers/notes/document-presentation';
import { NoteDocumentPresentationService } from '$lib/services/notes/document-presentation';
import { TiptapDocumentCopy } from '$lib/client/notes/editor-document';
export const noteDocuments: NoteDocumentsController = new NoteDocuments(
	new NoteDocumentPresentationService(),
	new TiptapDocumentCopy(),
	new NoteReadingStatisticsService()
);
