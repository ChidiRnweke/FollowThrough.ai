import type { EditorRange, NoteEditorState, NoteEditorView } from '$lib/models/browser-workspace';
export class NoteEditorOperationStore implements NoteEditorState {
	private live = true;
	private ready = false;
	private generation = 0;
	get documentGeneration(): number {
		return this.generation;
	}
	private holding = false;
	private range = $state<EditorRange | undefined>();
	private positions: Record<string, number> = {};
	readonly view: NoteEditorView;
	constructor() {
		const currentRange = () => this.range;
		const acceptsChanges = () => this.live && this.ready;
		this.view = {
			get acceptsChanges() {
				return acceptsChanges();
			},
			get canCopy() {
				return currentRange() !== undefined;
			}
		};
	}
	get active(): boolean {
		return this.live;
	}
	get initialized(): boolean {
		return this.ready;
	}
	get holdingSelection(): boolean {
		return this.holding;
	}
	get contextRange(): EditorRange | undefined {
		return this.range;
	}
	get reportedInsertions(): Readonly<Record<string, number>> {
		return this.positions;
	}
	initialize(): void {
		this.generation++;
		this.ready = true;
	}
	setInitialized(value: boolean): void {
		if (!value) this.generation++;
		this.ready = value;
	}
	setHoldingSelection(value: boolean): void {
		this.holding = value;
	}
	rememberRange(range: EditorRange | undefined): void {
		this.range = range;
	}
	reportInsertion(runId: string, position: number): void {
		this.positions[runId] = position;
	}
	releaseInsertion(runId: string): void {
		delete this.positions[runId];
	}
	release(): void {
		this.live = false;
		this.ready = false;
		this.range = undefined;
		this.positions = {};
	}
}
