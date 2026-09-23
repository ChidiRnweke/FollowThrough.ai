import type { Diagram } from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';

export function decideDiagramTrash(
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

export function diagramTrashChange(
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
