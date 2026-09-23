import {
	diagramEtag,
	type Diagram,
	type DiagramEtag,
	type DiagramRevisionChange,
	type DiagramRevisionWrite,
	type DrawioDiagram
} from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';
import { StaleRevisionError, UnsupportedDiagramOperationError, ValidationError } from '$lib/errors';

/** A completed identical diagram write can be retried against its original base. */
export function decideDiagramRevision(
	command: {
		readonly kind: 'save' | 'publish';
		readonly baseMatches: boolean;
		readonly contentChanged: boolean;
	},
	current: { readonly currentRevision: number; readonly publishedRevision: number }
):
	| { readonly kind: 'unchanged' }
	| { readonly kind: 'conflict' }
	| {
			readonly kind: 'write';
			readonly currentRevision: number;
			readonly publishedRevision: number;
	  } {
	if (
		!command.contentChanged &&
		(command.kind === 'save' || current.currentRevision === current.publishedRevision)
	)
		return { kind: 'unchanged' };
	if (!command.baseMatches) return { kind: 'conflict' };
	const currentRevision = current.currentRevision + (command.contentChanged ? 1 : 0);
	return {
		kind: 'write',
		currentRevision,
		publishedRevision: command.kind === 'publish' ? currentRevision : current.publishedRevision
	};
}

export function prepareDiagramWrite(
	current: Diagram,
	change: DiagramRevisionChange,
	baseEtag: DiagramEtag,
	timestamp: DateTime
):
	| { readonly kind: 'unchanged'; readonly diagram: DrawioDiagram }
	| { readonly kind: 'write'; readonly write: DiagramRevisionWrite } {
	if (!baseEtag.startsWith(`diagram:${current.id}:r`))
		throw new ValidationError('The base ETag does not describe this diagram');
	if (current.kind !== 'drawio')
		throw new UnsupportedDiagramOperationError('Only draw.io diagrams can be edited here');
	if (current.archivedAt) throw new ValidationError('Archived diagrams cannot be edited');
	let changed: DrawioDiagram;
	switch (change.kind) {
		case 'rename': {
			const title = change.title.trim();
			if (!title) throw new ValidationError('Diagram title is required');
			changed = { ...current, title };
			break;
		}
		case 'restore':
			changed = {
				...current,
				title: change.revision.title,
				source: change.revision.source,
				searchableText: change.revision.searchableText
			};
			break;
		case 'save':
			changed = { ...current, source: change.source, searchableText: change.searchableText };
			break;
		case 'publish':
			changed = {
				...current,
				source: change.source,
				renderedSvg: change.renderedSvg,
				searchableText: change.searchableText,
				publishedAt: timestamp
			};
			break;
	}
	const decision = decideDiagramRevision(
		{
			kind: change.kind === 'publish' ? 'publish' : 'save',
			baseMatches: diagramEtag(current) === baseEtag,
			contentChanged: current.source !== changed.source || current.title !== changed.title
		},
		current
	);
	if (decision.kind === 'conflict')
		throw new StaleRevisionError('The diagram has changed since it was loaded');
	if (decision.kind === 'unchanged') return { kind: 'unchanged', diagram: current };
	return {
		kind: 'write',
		write: {
			diagram: {
				...changed,
				currentRevision: decision.currentRevision,
				publishedRevision: decision.publishedRevision,
				updatedAt: timestamp
			},
			expectedRevision: current.currentRevision,
			expectedPublishedRevision: current.publishedRevision
		}
	};
}
