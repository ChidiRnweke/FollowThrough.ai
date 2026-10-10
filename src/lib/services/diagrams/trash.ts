import type { Diagram } from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';

function decideDiagramTrash(
	action: 'archive' | 'restore' | 'delete',
	current: Pick<Diagram, 'archivedAt'>
): { kind: 'allowed' } | { kind: 'invalid'; message: string } {
	if (action === 'archive' ? Boolean(current.archivedAt) : !current.archivedAt)
		return {
			kind: 'invalid',
			message:
				action === 'archive'
					? 'The diagram is already in the trash'
					: 'The diagram is not in the trash'
		};
	return { kind: 'allowed' };
}

function diagramTrashChange(
	action: 'archive' | 'restore',
	current: Diagram,
	timestamp: DateTime
): { kind: 'invalid'; message: string } | { kind: 'change'; diagram: Diagram } {
	const decision = decideDiagramTrash(action, current);
	if (decision.kind === 'invalid') return decision;
	const { archivedAt, ...rest } = current;
	void archivedAt;
	return {
		kind: 'change',
		diagram: {
			...rest,
			updatedAt: timestamp,
			...(action === 'archive' ? { archivedAt: timestamp } : {})
		}
	};
}

export interface DiagramLifecycleRules {
	decide(
		action: 'archive' | 'restore' | 'delete',
		current: Pick<Diagram, 'archivedAt'>
	): { kind: 'allowed' } | { kind: 'invalid'; message: string };
	change(
		action: 'archive' | 'restore',
		current: Diagram,
		timestamp: DateTime
	): { kind: 'invalid'; message: string } | { kind: 'change'; diagram: Diagram };
}
export class DiagramLifecycleService implements DiagramLifecycleRules {
	decide(
		action: 'archive' | 'restore' | 'delete',
		current: Pick<Diagram, 'archivedAt'>
	): { kind: 'allowed' } | { kind: 'invalid'; message: string } {
		return decideDiagramTrash(action, current);
	}
	change(
		action: 'archive' | 'restore',
		current: Diagram,
		timestamp: DateTime
	): { kind: 'invalid'; message: string } | { kind: 'change'; diagram: Diagram } {
		return diagramTrashChange(action, current, timestamp);
	}
}
