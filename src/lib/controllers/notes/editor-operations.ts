import type { AgentRunId } from '$lib/models/agent';
import type {
	NoteEditorEvents,
	NoteEditorIdentity,
	NoteEditorPort,
	NoteEditorState
} from '$lib/models/browser-workspace';
import type { DiagramId } from '$lib/models/diagrams';
import type { ProseMirrorDocument } from '$lib/models/notes';
import type { SuggestionId } from '$lib/models/suggestions';
import type { ClipboardFeedback, NoteClipboardOperations } from './clipboard-operations';
import type { NoteDocumentsController } from './document-presentation';
export type {
	EditorRange,
	NoteEditorEvents,
	NoteEditorPort,
	NoteEditorState
} from '$lib/models/browser-workspace';

export interface NoteEditorView {
	readonly canCopy: boolean;
}
export interface NoteEditorOperations {
	readonly identity: NoteEditorIdentity;
	getDocument(): ProseMirrorDocument;
	getPlainText(): string;
	replaceDocument(document: ProseMirrorDocument, previous?: ProseMirrorDocument): void;
	focusStart(): void;
	focusEnd(): void;
	scrollToHeading(id: string): void;
	holdInsertionPoint(runId: string, at: number): void;
	consumeInsertionPoint(runId: string): number | 'lost' | undefined;
	insertMermaid(at: number, source: string): boolean;
	replaceMermaid(previous: string, source: string): boolean;
	completeDrawioConversion(suggestion: SuggestionId, diagram: DiagramId): void;
}
/** Vendor mechanics only; the application never receives the Tiptap instance. */

export interface NoteEditorLifecycle {
	initialize(document: ProseMirrorDocument): void;
	release(): void;
	rememberContextRange(): void;
	copy(format: 'markdown' | 'formatted'): Promise<void | { readonly kind: 'failure' }>;
	paste(format: 'raw' | 'formatted'): Promise<void | { readonly kind: 'failure' }>;
	changed(): void;
	blur(actionRunning: boolean): void;
	reportInsertions(points: Readonly<Record<string, number | 'lost'>>): void;
}

export class NoteEditor implements NoteEditorOperations, NoteEditorLifecycle {
	constructor(
		private readonly state: NoteEditorState,
		private readonly editor: NoteEditorPort,
		private readonly documents: NoteDocumentsController,
		private readonly clipboard: NoteClipboardOperations,
		private readonly events: NoteEditorEvents,
		private readonly feedback: Pick<ClipboardFeedback, 'error'>,
		readonly identity: NoteEditorIdentity = { key: Symbol('note-editor') }
	) {}
	initialize(document: ProseMirrorDocument): void {
		this.editor.initializeDocument(this.documents.editorContent(document));
		this.state.initialize();
	}
	release(): void {
		this.state.release();
	}
	changed(): void {
		if (this.state.active && this.state.initialized) this.events.changed();
	}
	rememberContextRange(): void {
		this.state.rememberRange(this.editor.selection());
	}
	async copy(format: 'markdown' | 'formatted'): Promise<void | { readonly kind: 'failure' }> {
		if (!this.active) return;
		try {
			if (format === 'markdown') {
				const text = this.editor.markdown(this.state.contextRange);
				if (text !== undefined) await this.clipboard.copyMarkdown(text);
			} else {
				const source = this.editor.copySource(this.state.contextRange);
				if (source) await this.clipboard.copy(source);
			}
		} catch {
			this.feedback.error('The clipboard could not be written');
			return { kind: 'failure' };
		}
	}
	async paste(format: 'raw' | 'formatted'): Promise<void | { readonly kind: 'failure' }> {
		if (!this.active) return;
		const range = this.state.contextRange;
		const content = await this.clipboard.read(format);
		if (!this.active || content.kind === 'failure' || !content.text) return;
		try {
			this.editor.paste(content, range);
		} catch {
			this.feedback.error('The clipboard could not be read');
			return { kind: 'failure' };
		}
	}

	blur(actionRunning: boolean): void {
		if (!this.active || actionRunning) return;
		this.state.setHoldingSelection(true);
		try {
			this.editor.collapseSelection();
		} finally {
			this.state.setHoldingSelection(false);
		}
	}
	reportInsertions(points: Readonly<Record<string, number | 'lost'>>): void {
		if (!this.active) return;
		for (const [runId, point] of Object.entries(points)) {
			if (typeof point !== 'number' || this.state.reportedInsertions[runId] === point) continue;
			this.state.reportInsertion(runId, point);
			this.events.insertionMoved(runId as AgentRunId, point);
		}
	}
	getDocument(): ProseMirrorDocument {
		this.requireActive();
		return this.editor.getDocument();
	}
	getPlainText(): string {
		this.requireActive();
		return this.editor.getPlainText();
	}
	replaceDocument(document: ProseMirrorDocument, previous?: ProseMirrorDocument): void {
		this.requireActive();
		this.state.setInitialized(false);
		try {
			this.editor.setDocument(this.documents.editorContent(document));
		} finally {
			this.state.setInitialized(true);
		}
		if (previous) this.events.shimmer(previous, document);
	}
	focusStart(): void {
		if (this.active) this.editor.focus('start');
	}
	focusEnd(): void {
		if (this.active) this.editor.focus('end');
	}
	scrollToHeading(id: string): void {
		if (this.active) this.editor.scrollToHeading(id);
	}
	holdInsertionPoint(runId: string, at: number): void {
		if (this.active) this.editor.holdInsertionPoint(runId, at);
	}
	consumeInsertionPoint(runId: string): number | 'lost' | undefined {
		if (!this.active) return undefined;
		const point = this.editor.consumeInsertionPoint(runId);
		this.state.releaseInsertion(runId);
		return point;
	}
	insertMermaid(at: number, source: string): boolean {
		return this.active && this.editor.insertMermaid(at, source);
	}
	replaceMermaid(previous: string, source: string): boolean {
		return this.active && this.editor.replaceMermaid(previous, source);
	}
	completeDrawioConversion(suggestion: SuggestionId, diagram: DiagramId): void {
		this.requireActive();
		this.editor.completeDrawioConversion(suggestion, diagram);
	}
	private get active(): boolean {
		return this.state.active && this.editor.active;
	}
	private requireActive(): void {
		if (!this.active) throw new Error('The editor is no longer active.');
	}
}
