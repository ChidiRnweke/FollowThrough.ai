import type { ArtifactFile } from '$lib/models/deliverables';
const safeFilename = (title: string, extension: string): string =>
	`${title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'document'}.${extension}`;
export interface ArtifactFiles {
	describe(title: string, format: 'docx' | 'pdf' | 'zip'): ArtifactFile;
}
export class ArtifactFileService implements ArtifactFiles {
	describe(title: string, format: 'docx' | 'pdf' | 'zip'): ArtifactFile {
		return {
			name: safeFilename(title, format),
			mediaType:
				format === 'docx'
					? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
					: format === 'pdf'
						? 'application/pdf'
						: 'application/zip'
		};
	}
}
