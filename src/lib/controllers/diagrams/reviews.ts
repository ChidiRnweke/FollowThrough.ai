import type { AgentPayloadObject } from '$lib/models/agent/payload';
import type {
	DiagramChange,
	DiagramReviewBaseline,
	DrawioLabelRead,
	DrawioLabelSourceReader
} from '$lib/models/diagrams/drawio-labels';
import type { DiagramLabelPresentation } from '$lib/services/diagrams/labels';

export interface DiagramReviewController {
	read(source: string): DrawioLabelRead;
	preview(name: string, args: AgentPayloadObject, baseline: DiagramReviewBaseline): DiagramChange;
}
/** Decode and compare the visible words in a proposed diagram without rendering it. */
export class DiagramReviews implements DiagramReviewController {
	constructor(
		private readonly reader: DrawioLabelSourceReader,
		private readonly labels: DiagramLabelPresentation
	) {}
	read(source: string): DrawioLabelRead {
		const read = this.reader.read(source);
		return read.kind === 'unreadable'
			? read
			: { kind: 'labels', labels: this.labels.labels(read.labels) };
	}
	preview(name: string, args: AgentPayloadObject, baseline: DiagramReviewBaseline): DiagramChange {
		const source = typeof args.source === 'string' ? args.source : '';
		const read = this.read(source);
		const title =
			typeof args.title === 'string' && args.title.trim()
				? args.title
				: baseline.kind === 'diagram'
					? baseline.title
					: 'Untitled diagram';
		if (read.kind === 'unreadable') return { kind: 'unreadable', title };
		if (name !== 'edit_diagram' || baseline.kind === 'none')
			return { kind: 'created', title, labels: read.labels };
		return { kind: 'edited', title, ...this.labels.compare(baseline.labels, read.labels) };
	}
}
