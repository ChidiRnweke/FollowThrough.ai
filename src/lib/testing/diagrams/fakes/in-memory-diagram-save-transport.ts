import type { DiagramSaveTransport } from '$lib/client/diagrams/save-coordinator';
import {
	diagramEtag,
	type DiagramEtag,
	type DiagramWriteOutcome,
	type DrawioDiagram,
	type DiagramRevision,
	type SaveProjectDiagramDraftInput,
	type RenameProjectDiagramInput,
	type PublishProjectDiagramInput,
	type RestoreDiagramRevisionInput
} from '$lib/models/diagrams';

/** A server document with conditional writes and immutable publication snapshots. */
export class InMemoryDiagramSaveTransport implements DiagramSaveTransport {
	revisions: DiagramRevision[] = [];
	failure: Error | undefined;
	beforeWrite: () => Promise<void> = async () => undefined;

	constructor(public diagram: DrawioDiagram) {}

	private async ready(): Promise<void> {
		await this.beforeWrite();
		if (this.failure) throw this.failure;
	}

	private saved(): DiagramWriteOutcome {
		return { outcome: 'saved', diagram: this.diagram, etag: diagramEtag(this.diagram) };
	}

	private conflict(baseEtag: DiagramEtag): DiagramWriteOutcome {
		return {
			outcome: 'conflict',
			baseEtag,
			remote: { diagram: this.diagram, etag: diagramEtag(this.diagram) }
		};
	}

	async save(input: SaveProjectDiagramDraftInput): Promise<DiagramWriteOutcome> {
		await this.ready();
		if (this.diagram.source === input.source) return this.saved();
		if (input.baseEtag !== diagramEtag(this.diagram)) return this.conflict(input.baseEtag);
		this.diagram = {
			...this.diagram,
			source: input.source,
			currentRevision: this.diagram.currentRevision + 1
		};
		return this.saved();
	}

	async rename(input: RenameProjectDiagramInput): Promise<DiagramWriteOutcome> {
		await this.ready();
		if (this.diagram.title === input.title) return this.saved();
		if (input.baseEtag !== diagramEtag(this.diagram)) return this.conflict(input.baseEtag);
		this.diagram = {
			...this.diagram,
			title: input.title,
			currentRevision: this.diagram.currentRevision + 1
		};
		return this.saved();
	}

	async publish(input: PublishProjectDiagramInput): Promise<DiagramWriteOutcome> {
		await this.ready();
		if (input.baseEtag !== diagramEtag(this.diagram)) return this.conflict(input.baseEtag);
		const revision = this.diagram.currentRevision + Number(this.diagram.source !== input.source);
		this.diagram = {
			...this.diagram,
			source: input.source,
			renderedSvg: input.renderedSvg,
			currentRevision: revision,
			publishedRevision: revision,
			publishedAt: this.diagram.updatedAt
		};
		if (!this.revisions.some((entry) => entry.revision === revision)) {
			this.revisions.push({
				...this.diagram,
				id: crypto.randomUUID() as DiagramRevision['id'],
				diagramId: this.diagram.id,
				revision
			});
		}
		return this.saved();
	}

	async restore(input: RestoreDiagramRevisionInput): Promise<DiagramWriteOutcome> {
		await this.ready();
		const revision = this.revisions.find((entry) => entry.id === input.revisionId);
		if (!revision) throw new Error('Version not found');
		if (input.baseEtag !== diagramEtag(this.diagram)) return this.conflict(input.baseEtag);
		this.diagram = {
			...this.diagram,
			source: revision.source,
			title: revision.title,
			currentRevision: this.diagram.currentRevision + 1
		};
		return this.saved();
	}
}
