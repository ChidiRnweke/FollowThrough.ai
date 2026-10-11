import { expect, it } from 'vitest';
import { ArtifactFileService } from './artifact-files';

it('preserves readable Unicode titles while stripping filename punctuation', () => {
	expect(new ArtifactFileService().describe('  Résumé: Q4/2026?  ', 'docx')).toEqual({
		name: 'Résumé Q42026.docx',
		mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
	});
});
it('gives an empty sanitized title the existing document filename', () => {
	expect(new ArtifactFileService().describe('?!/', 'pdf')).toEqual({
		name: 'document.pdf',
		mediaType: 'application/pdf'
	});
});
it('describes a document bundle as a ZIP file', () => {
	expect(new ArtifactFileService().describe('Project notes', 'zip')).toEqual({
		name: 'Project notes.zip',
		mediaType: 'application/zip'
	});
});
