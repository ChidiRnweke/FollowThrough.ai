import type { FunctionCallResultSessionItem } from '$lib/models/agent/session-item';
import { type PersistedSessionItem } from '$lib/models/agent';
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

/**
 * The text a tool result carries, whichever of the three shapes it arrived in.
 *
 * `'type' in output` rather than `!Array.isArray(output)`: `Array.isArray`
 * narrows to `any[]`, which a `readonly` array member is not assignable to, so
 * the array would survive into the object branch. The key test discriminates the
 * union the compiler can actually check.
 */
const sessionOutputText = (item: FunctionCallResultSessionItem): string | undefined => {
	const { output } = item;
	if (typeof output === 'string') return output;
	return 'type' in output ? output.text : undefined;
};
