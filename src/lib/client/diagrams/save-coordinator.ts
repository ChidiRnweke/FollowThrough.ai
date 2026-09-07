import {
	diagramEtag,
	type DiagramWriteOutcome,
	type DrawioDiagram,
	type DiagramRevisionId,
	type SaveProjectDiagramDraftInput,
	type RenameProjectDiagramInput,
	type PublishProjectDiagramInput,
	type RestoreDiagramRevisionInput
} from '$lib/models/diagrams';
import { userFacingMessage } from '$lib/errors';

export interface DiagramSaveTransport {
	save(input: SaveProjectDiagramDraftInput): Promise<DiagramWriteOutcome>;
	rename(input: RenameProjectDiagramInput): Promise<DiagramWriteOutcome>;
	publish(input: PublishProjectDiagramInput): Promise<DiagramWriteOutcome>;
	restore(input: RestoreDiagramRevisionInput): Promise<DiagramWriteOutcome>;
}

export type DiagramSaveStatus =
	| { readonly kind: 'idle' | 'saving' }
	| { readonly kind: 'failure'; readonly message: string }
	| { readonly kind: 'conflict'; readonly base: DrawioDiagram; readonly remote: DrawioDiagram };

export interface DiagramSaveSnapshot {
	readonly diagram: DrawioDiagram;
	readonly local: DrawioDiagram;
	readonly status: DiagramSaveStatus;
	readonly dirty: boolean;
}

export type DiagramSaveResult =
	| { readonly kind: 'saved' }
	| { readonly kind: 'conflict' }
	| { readonly kind: 'failure'; readonly message: string };

type Mutation =
	| { kind: 'save'; source: string; edit: number; generation: number }
	| { kind: 'rename'; title: string; edit: number }
	| { kind: 'publish'; source: string; renderedSvg: string; edit: number; generation: number }
	| { kind: 'restore'; revisionId: DiagramRevisionId };

/** ADR 0010: the base belongs to the acknowledged document, never to a query refresh. */
export class DiagramSaveCoordinator {
	private diagram: DrawioDiagram;
	private local: DrawioDiagram;
	private status: DiagramSaveStatus = { kind: 'idle' };
	private queue: Mutation[] = [];
	private active: Promise<DiagramSaveResult> | undefined;
	private sourceEdit = 0;
	private titleEdit = 0;
	private savedSourceEdit = 0;
	private savedTitleEdit = 0;
	private generation = 0;
	private canvasDirty = false;

	constructor(
		diagram: DrawioDiagram,
		private readonly transport: DiagramSaveTransport,
		private readonly changed: (snapshot: DiagramSaveSnapshot) => void,
		private readonly replace: (diagram: DrawioDiagram) => void
	) {
		this.diagram = diagram;
		this.local = diagram;
		this.report();
	}

	get snapshot(): DiagramSaveSnapshot {
		return {
			diagram: this.diagram,
			local: this.local,
			status: this.status,
			dirty: this.canvasDirty || this.sourceEdit > this.savedSourceEdit || this.queue.length > 0
		};
	}

	modified(): void {
		this.generation += 1;
		this.canvasDirty = true;
		this.report();
	}

	/** Capture the live canvas for review without persisting or publishing it. */
	capture(source: string): void {
		if (source === this.local.source) return;
		this.local = { ...this.local, source };
		this.sourceEdit += 1;
		this.canvasDirty = true;
		this.report();
	}

	observe(remote: DrawioDiagram): void {
		if (
			remote.id !== this.diagram.id ||
			this.active ||
			this.snapshot.dirty ||
			this.status.kind !== 'idle'
		)
			return;
		if (
			remote.currentRevision < this.diagram.currentRevision ||
			(remote.currentRevision === this.diagram.currentRevision &&
				remote.publishedRevision <= this.diagram.publishedRevision)
		)
			return;
		this.adopt(remote);
	}

	save(source: string): Promise<DiagramSaveResult> {
		this.local = { ...this.local, source };
		const mutation: Mutation = {
			kind: 'save',
			source,
			edit: ++this.sourceEdit,
			generation: this.generation
		};
		// Only replace a waiting autosave, never the request whose acknowledgement is pending.
		// A save that failed is not pending, and it must be replaceable: a source the server
		// rejects stays at the head of the queue forever otherwise, so every later autosave
		// queues behind a write that can only fail again. The mutation carries the whole
		// document, so replacing one loses nothing.
		const last = this.queue.at(-1);
		if (last?.kind === 'save' && (!this.active || this.queue.length > 1))
			this.queue[this.queue.length - 1] = mutation;
		else this.queue.push(mutation);
		return this.flush();
	}

	rename(title: string): Promise<DiagramSaveResult> {
		this.local = { ...this.local, title };
		this.queue.push({ kind: 'rename', title, edit: ++this.titleEdit });
		return this.flush();
	}

	publish(source: string, renderedSvg: string): Promise<DiagramSaveResult> {
		this.local = { ...this.local, source };
		// A publish writes the source and marks it published, so a draft save still waiting
		// for the same document is work with no effect left in it. Dropping it also keeps a
		// rejected save from standing between the user and the publish they just asked for —
		// the queue would have sent the failing write first and never reached this one.
		if (!this.active) this.queue = this.queue.filter((mutation) => mutation.kind !== 'save');
		this.queue.push({
			kind: 'publish',
			source,
			renderedSvg,
			edit: ++this.sourceEdit,
			generation: this.generation
		});
		return this.flush();
	}

	restore(revisionId: DiagramRevisionId): Promise<DiagramSaveResult> {
		if (!this.active) this.queue = this.queue.filter((mutation) => mutation.kind !== 'restore');
		this.queue.push({ kind: 'restore', revisionId });
		return this.flush();
	}

	/**
	 * The explicit gesture. It is `flush` and nothing more, because clearing a stored failure
	 * is now what any new gesture does; this stays a named method so the header has something
	 * to call that says what the user meant by pressing it.
	 */
	retry(): Promise<DiagramSaveResult> {
		return this.flush();
	}

	useRemote(remote: DrawioDiagram): void {
		if (this.active || remote.id !== this.diagram.id)
			throw new Error('The diagram cannot be replaced during a save.');
		this.adopt(remote);
	}

	keepLocal(): Promise<DiagramSaveResult> {
		if (this.status.kind !== 'conflict') return this.flush();
		const local = this.local;
		this.diagram = this.status.remote;
		this.queue = [];
		this.status = { kind: 'idle' };
		this.queue.push({
			kind: 'save',
			source: local.source,
			edit: ++this.sourceEdit,
			generation: this.generation
		});
		if (local.title !== this.diagram.title && local.title !== undefined) {
			this.queue.push({ kind: 'rename', title: local.title, edit: ++this.titleEdit });
		}
		return this.flush();
	}

	private adopt(diagram: DrawioDiagram): void {
		this.diagram = diagram;
		this.local = diagram;
		this.queue = [];
		this.savedSourceEdit = this.sourceEdit;
		this.savedTitleEdit = this.titleEdit;
		this.canvasDirty = false;
		this.status = { kind: 'idle' };
		this.replace(diagram);
		this.report();
	}

	private flush(): Promise<DiagramSaveResult> {
		this.report();
		if (this.active) return this.active;
		// A conflict stays latched: the remote document has moved, and nothing should be sent
		// until the user has said which version wins.
		if (this.status.kind === 'conflict') return Promise.resolve({ kind: 'conflict' });
		// A failure does not. Answering a new save or publish from a stored message meant one
		// rejected write locked the pane for the rest of the session — every later gesture
		// came back with the first failure without reaching the server at all, so the editor
		// looked broken in a way no amount of retrying could clear. A new gesture is a new
		// intent, and it is entitled to be attempted.
		if (this.status.kind === 'failure') this.status = { kind: 'idle' };
		this.active = this.drain().finally(() => {
			this.active = undefined;
		});
		return this.active;
	}

	private async drain(): Promise<DiagramSaveResult> {
		while (this.queue.length > 0) {
			const mutation = this.queue[0]!;
			const base = this.diagram;
			this.status = { kind: 'saving' };
			this.report();
			try {
				const result = await this.write(mutation);
				if (result.outcome === 'conflict') {
					this.status = { kind: 'conflict', base, remote: result.remote.diagram };
					this.report();
					return { kind: 'conflict' };
				}
				this.queue.shift();
				if (mutation.kind === 'restore') {
					this.adopt(result.diagram);
					return { kind: 'saved' };
				}
				if (mutation.kind === 'save' || mutation.kind === 'publish') {
					this.savedSourceEdit = mutation.edit;
					if (mutation.generation === this.generation && mutation.edit === this.sourceEdit)
						this.canvasDirty = false;
				} else this.savedTitleEdit = mutation.edit;
				this.diagram = result.diagram;
				this.local = {
					...result.diagram,
					source:
						this.sourceEdit > this.savedSourceEdit ? this.local.source : result.diagram.source,
					title: this.titleEdit > this.savedTitleEdit ? this.local.title : result.diagram.title
				};
			} catch (error) {
				const message = userFacingMessage(error, 'The diagram could not be saved.');
				this.status = { kind: 'failure', message };
				this.report();
				return { kind: 'failure', message };
			}
		}
		this.status = { kind: 'idle' };
		this.report();
		return { kind: 'saved' };
	}

	private write(mutation: Mutation): Promise<DiagramWriteOutcome> {
		const base = { diagramId: this.diagram.id, baseEtag: diagramEtag(this.diagram) };
		switch (mutation.kind) {
			case 'save':
				return this.transport.save({ ...base, source: mutation.source });
			case 'rename':
				return this.transport.rename({ ...base, title: mutation.title });
			case 'publish':
				return this.transport.publish({
					...base,
					source: mutation.source,
					renderedSvg: mutation.renderedSvg
				});
			case 'restore':
				return this.transport.restore({ ...base, revisionId: mutation.revisionId });
		}
	}

	private report(): void {
		this.changed(this.snapshot);
	}
}
