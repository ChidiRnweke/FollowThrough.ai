import type { ProseMirrorDocument, ProseMirrorNode } from '$lib/models/notes';
import type {
	NoteComparison,
	NoteComparisonOptions,
	RenderedBlock,
	RenderedAlignment
} from '$lib/models/note-comparison';
import type { NoteComparisonRules } from '$lib/services/notes/note-diff';
export interface NoteComparisonController {
	compare(
		base: ProseMirrorDocument,
		candidate: ProseMirrorDocument,
		options: NoteComparisonOptions
	): NoteComparison;
	align(stored: readonly ProseMirrorNode[], rendered: readonly RenderedBlock[]): RenderedAlignment;
	textblocks(block: ProseMirrorNode): readonly string[];
}
export class NoteComparisons implements NoteComparisonController {
	constructor(private readonly rules: NoteComparisonRules) {}
	compare(
		base: ProseMirrorDocument,
		candidate: ProseMirrorDocument,
		options: NoteComparisonOptions
	): NoteComparison {
		return this.rules.compare(base, candidate, options);
	}
	align(stored: readonly ProseMirrorNode[], rendered: readonly RenderedBlock[]): RenderedAlignment {
		return this.rules.align(stored, rendered);
	}
	textblocks(block: ProseMirrorNode): readonly string[] {
		return this.rules.textblocks(block);
	}
}
