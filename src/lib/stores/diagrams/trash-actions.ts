import { toast } from 'svelte-sonner';
import type { DiagramId } from '$lib/models/diagrams';

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
		const result = await draft.stage({
			kind:
				action === 'archive'
					? 'archiveDiagram'
					: action === 'restore'
						? 'restoreDiagram'
						: 'deleteDiagram',
			diagramId
		});
		if (result.kind === 'failure') throw new Error(result.message);
	} catch (error) {
		toast.error(error instanceof Error ? error.message : 'The diagram change could not be saved');
		throw error;
	}
};
