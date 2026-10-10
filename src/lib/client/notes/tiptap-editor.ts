import type { Editor, JSONContent } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import type { DiagramId } from '$lib/models/diagrams';
import type { SuggestionId } from '$lib/models/suggestions';
import { proseMirrorDocumentSchema, type ProseMirrorDocument } from '$lib/models/notes';
import type { EditorRange, NoteEditorPort } from '$lib/controllers/notes/editor-operations';
import type { ClipboardPaste } from '$lib/controllers/notes/clipboard-operations';
import { revealHeading } from '$lib/components/edra/commands/HeadingLinkSuggestion';
import { completePendingConversion } from '$lib/components/edra/commands/diagram-references';
import {
	selectRange,
	clipboardSource,
	selectionMarkdown,
	selectionPlainText
} from '$lib/components/edra/commands/clipboard-payload';
import {
	holdPendingInsertion,
	getPendingInsertion,
	releasePendingInsertion
} from '$lib/client/notes/pending-insertions-plugin';
import { selectionActionKey } from '$lib/client/notes/selection-action-plugin';
export class TiptapNoteEditor implements NoteEditorPort {
	constructor(private readonly editor: Editor) {}
	get active(): boolean {
		return !this.editor.isDestroyed;
	}
	getDocument(): ProseMirrorDocument {
		return proseMirrorDocumentSchema.parse(this.editor.state.doc.toJSON());
	}
	getPlainText(): string {
		return this.editor.getText({ blockSeparator: '\n\n' });
	}
	initializeDocument(document: JSONContent): void {
		// Loading a saved note is not an authored edit. Otherwise an immediate first
		// paste can join this transaction and Undo removes the entire loaded document.
		this.editor.chain().setContent(document).setMeta('addToHistory', false).run();
	}
	setDocument(document: JSONContent): void {
		this.editor.commands.setContent(document);
	}
	focus(at: 'start' | 'end'): void {
		this.editor.commands.focus(at);
	}
	scrollToHeading(id: string): void {
		revealHeading(this.editor.view.dom, id);
	}
	selection(): EditorRange | undefined {
		const { from, to, empty } = this.editor.state.selection;
		return empty ? undefined : { from, to };
	}
	copySource(range: EditorRange | undefined) {
		const state = selectRange(this.editor.state, range);
		return state.selection.empty ? undefined : clipboardSource(state);
	}
	markdown(range: EditorRange | undefined): string | undefined {
		const state = selectRange(this.editor.state, range);
		return state.selection.empty
			? undefined
			: selectionMarkdown(state) || selectionPlainText(state);
	}
	paste(content: ClipboardPaste, range: EditorRange | undefined): void {
		this.editor.view.focus();
		if (range) {
			const restored = selectRange(this.editor.state, range);
			if (!restored.selection.empty)
				this.editor.view.dispatch(this.editor.state.tr.setSelection(restored.selection));
		}
		if (content.kind === 'html') this.editor.view.pasteHTML(content.text);
		else this.editor.view.pasteText(content.text);
	}
	collapseSelection(): void {
		const { doc, selection } = this.editor.state;
		if (selection.empty) return;
		const { from, to } = selection;
		this.editor.view.dispatch(
			this.editor.state.tr
				.setSelection(TextSelection.near(doc.resolve(from)))
				.setMeta(selectionActionKey, { from, to, variant: 'held' })
		);
	}
	holdInsertionPoint(runId: string, at: number): void {
		this.editor.view.dispatch(holdPendingInsertion(this.editor.state.tr, runId, at));
	}

	/**
	 * Where a pending diagram's node goes right now, and stops tracking it.
	 * `'lost'` means the location was deleted or replaced while the run was in
	 * flight; `undefined` means this editor never held it (e.g. after a refresh).
	 */
	consumeInsertionPoint(runId: string): number | 'lost' | undefined {
		const point = getPendingInsertion(this.editor.state, runId);
		this.editor.view.dispatch(releasePendingInsertion(this.editor.state.tr, runId));
		return point;
	}

	/** Insert a mermaid diagram node at the given ProseMirror position, if it is valid. */
	insertMermaid(at: number, source: string): boolean {
		// The captured position can be stale (the author kept typing while the run
		// was in flight): out of bounds positions throw on resolve, so bail out and
		// let the caller fall back to the suggestion tray.
		if (!Number.isFinite(at) || at < 0 || at > this.editor.state.doc.content.size) return false;
		try {
			this.editor
				.chain()
				.focus()
				.insertContentAt(at, {
					type: 'mermaid',
					content: source ? [{ type: 'text', text: source }] : []
				})
				.run();
			return true;
			// audit-allow: silent-catch — false is the typed decision outcome consumed by the suggestion UI, which keeps the action available.
		} catch {
			return false;
		}
	}

	/**
	 * Swap one mermaid node's source for a revised one, matched by its current text.
	 *
	 * The live revision path applies the result inside the node view that asked for
	 * it. This is for the other path: after a refresh that node view is a fresh
	 * component with no memory of the request, so the source it had when the
	 * revision started is the only handle left on it. Returns whether a node matched.
	 */
	replaceMermaid(previousSource: string, source: string): boolean {
		let target: number | undefined;
		this.editor.state.doc.descendants((node, pos) => {
			if (target !== undefined) return false;
			if (node.type.name === 'mermaid' && node.textContent === previousSource) target = pos;
			return true;
		});
		if (target === undefined) return false;
		this.editor
			.chain()
			.focus()
			.insertContentAt(
				{ from: target, to: target + (this.editor.state.doc.nodeAt(target)?.nodeSize ?? 0) },
				{ type: 'mermaid', content: source ? [{ type: 'text', text: source }] : [] }
			)
			.run();
		return true;
	}

	completeDrawioConversion(suggestionId: SuggestionId, diagramId: DiagramId): void {
		const completed = completePendingConversion(
			{
				state: this.editor.state,
				schema: this.editor.schema,
				dispatch: (transaction) => this.editor.view.dispatch(transaction)
			},
			suggestionId,
			diagramId
		);
		if (!completed) throw new Error('The pending draw.io conversion is no longer in this note.');
	}
}
