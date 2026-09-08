import { toast } from 'svelte-sonner';
import type { DiagramId } from '$lib/models/diagrams';
import type { DateTime } from '$lib/models/workspace';
import { workspaceSession } from '$lib/stores/workspace/session.svelte';

/** Trash actions capture the visible copy and use the same durable write path as the editor. */
export const changeDiagramTrash = async (
	diagramId: DiagramId,
	action: 'archive' | 'restore' | 'delete'
): Promise<void> => {
	try {
		const session = workspaceSession.current;
		if (!session) throw new Error('Open the workspace before changing a diagram');
		const draft = session.resources.draft({ type: 'diagrams', id: [diagramId] });
		draft.capture();
		const diagram = draft.value;
		if (!diagram) throw new Error('The diagram is unavailable');
		if (action === 'archive' ? Boolean(diagram.archivedAt) : !diagram.archivedAt)
			throw new Error(
				action === 'archive'
					? 'The diagram is already in the trash'
					: 'The diagram is not in the trash'
			);
		const { archivedAt, ...restored } = diagram;
		void archivedAt;
		const result = await draft.stage({
			command: {
				kind:
					action === 'archive'
						? 'archiveDiagram'
						: action === 'restore'
							? 'restoreDiagram'
							: 'deleteDiagram',
				diagramId
			},
			local:
				action === 'delete'
					? null
					: {
							type: 'diagrams',
							value:
								action === 'archive'
									? { ...diagram, archivedAt: new Date().toISOString() as DateTime }
									: restored
						},
			coalesce: null,
			references: []
		});
		if (result.kind === 'failure') throw new Error(result.message);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : 'The diagram change could not be saved');
		throw error;
	}
};
