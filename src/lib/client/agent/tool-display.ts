import { isAgentPayloadObject, type AgentPayload } from '$lib/models/agent/payload';
import { toolResultFieldsSchema, type ToolResultFields } from '$lib/models/tool-display';

/** Read recorded controller envelopes; do not confuse their source with their subject. */
export function readToolResultFields(output: AgentPayload | undefined): ToolResultFields {
	if (output === undefined || !isAgentPayloadObject(output)) return {};
	const direct = toolResultFieldsSchema.parse(output);
	if (direct.skillNoteId) return { ...direct, noteId: direct.skillNoteId };
	for (const key of [
		'skill',
		'todo',
		'project',
		'artifact',
		'attachment',
		'entry',
		'diagram',
		'suggestion',
		'note',
		'policy'
	]) {
		const nested = output[key];
		if (!isAgentPayloadObject(nested)) continue;
		const fields = readToolResultFields(nested);
		if (key === 'note') return { ...fields, ...direct, noteId: fields.noteId ?? fields.id };
		return { ...fields, ...direct };
	}
	if (isAgentPayloadObject(output.payload)) {
		const payload = readToolResultFields(output.payload);
		return {
			...direct,
			title: direct.title ?? payload.title,
			content: direct.content ?? payload.content
		};
	}
	return direct;
}
