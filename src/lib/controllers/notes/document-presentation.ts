import type { EditorDocumentCopy } from '$lib/models/browser-workspace';
import type { NoteReferences } from '$lib/services/notes/references';
import type { SectionNumberingSetting, SectionNumberingLevel } from '$lib/models/notes';
import type { NoteSectionNumbering } from '$lib/services/notes/section-numbering';
import type { NoteReadingStatistics } from '$lib/services/notes/reading-statistics';
import type { JSONContent } from '@tiptap/core';
import type {
	ProseMirrorDocument,
	OutlineSource,
	OutlineHeading,
	OutlineOffset
} from '$lib/models/notes';
import type { NoteDocumentPresentation } from '$lib/services/notes/document-presentation';

export interface NoteDocumentsController {
	widgetReferences(documents: readonly { document: ProseMirrorDocument }[]): string[];
	diagramReferences(documents: readonly { document: ProseMirrorDocument }[]): string[];

	numberingLevel(setting: SectionNumberingSetting): SectionNumberingLevel;
	sectionNumbers(levels: readonly number[]): readonly string[];
	readingMinutes(words: number): number;
	editorContent(document: ProseMirrorDocument): JSONContent;
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[];
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined;
}
/** Prepare the document and reading aids a note editor displays. */
export class NoteDocuments implements NoteDocumentsController {
	constructor(
		private readonly presentation: NoteDocumentPresentation,
		private readonly documents: EditorDocumentCopy,
		private readonly reading: NoteReadingStatistics,
		private readonly references: NoteReferences,
		private readonly sections: NoteSectionNumbering
	) {}
	widgetReferences(documents: readonly { document: ProseMirrorDocument }[]): string[] {
		return this.references.widgets(documents);
	}
	diagramReferences(documents: readonly { document: ProseMirrorDocument }[]): string[] {
		return this.references.diagrams(documents);
	}

	numberingLevel(setting: SectionNumberingSetting): SectionNumberingLevel {
		return this.sections.toMenu(setting);
	}
	sectionNumbers(levels: readonly number[]): readonly string[] {
		return this.sections.numbers(levels);
	}
	readingMinutes(words: number): number {
		return this.reading.readingMinutes(words);
	}
	editorContent(document: ProseMirrorDocument): JSONContent {
		return this.documents.copy(this.presentation.prepare(document));
	}
	outline(items: readonly OutlineSource[]): readonly OutlineHeading[] {
		return this.presentation.outline(items);
	}
	activeHeading(offsets: readonly OutlineOffset[], line: number): string | undefined {
		return this.presentation.activeHeading(offsets, line);
	}
}
