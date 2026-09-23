import { sessionOutputText, type PersistedSessionItem } from '$lib/models/agent';
import { diagramWriteResultSchema, type CanvasSessionResult } from '$lib/models/diagrams';

/** Decode diagram-write payloads; preserve corruption as an explicit read result. */
export const readCanvasSessionResult = (item: PersistedSessionItem): CanvasSessionResult => {
	if (
		item.type !== 'function_call_result' ||
		(item.name !== 'create_diagram' && item.name !== 'edit_diagram')
	)
		return { kind: 'unrelated' };
	const text = sessionOutputText(item);
	if (text === undefined) return { kind: 'unrelated' };
	try {
		const parsed = diagramWriteResultSchema.safeParse(JSON.parse(text));
		return parsed.success
			? { kind: 'written', diagramId: parsed.data.diagramId }
			: { kind: 'unrelated' };
	} catch (error) {
		return { kind: 'corrupt', reason: error instanceof Error ? error.message : String(error) };
	}
};
