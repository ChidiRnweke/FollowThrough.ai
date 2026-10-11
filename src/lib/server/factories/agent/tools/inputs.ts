import { ValidationError } from '$lib/errors';
import type {
	AgentMemoryProposalInput,
	AgentToolInput,
	AgentWidgetCreationInput,
	AgentWidgetDataEditInput,
	AgentWidgetDraftRead,
	AgentWidgetLayoutEditInput
} from '$lib/models/agent-tool-inputs';
import { memoryChangePayloadSchema } from '$lib/models/memory';
import { jsonPatchSchema, widgetDataSchema, widgetLayoutSchema } from '$lib/models/widgets';
import { z } from 'zod';
const jsonArgument = <T>(text: string, schema: z.ZodType<T>, name: string): T => {
	try {
		const parsed: unknown = JSON.parse(text);
		const result = schema.safeParse(parsed);
		if (result.success) return result.data;
		throw new ValidationError(`${name} is not valid: ${z.prettifyError(result.error)}`);
	} catch (error) {
		if (error instanceof SyntaxError)
			throw new ValidationError(`${name} is not valid JSON: ${error.message}`);
		throw error;
	}
};

const readDraft = (input: AgentToolInput<'create_widget'>): AgentWidgetDraftRead => {
	try {
		return {
			kind: 'ready',
			draft: {
				title: input.title,
				layout: jsonArgument(input.layout, widgetLayoutSchema, 'layout'),
				data: jsonArgument(input.data, widgetDataSchema, 'data')
			}
		};
	} catch (error) {
		if (error instanceof Error) return { kind: 'failure', error };
		throw error;
	}
};
export const readWidgetCreation = (
	input: AgentToolInput<'create_widget'>
): AgentWidgetCreationInput => ({
	...(input.projectId === undefined ? {} : { projectId: input.projectId }),
	...(input.noteId === undefined ? {} : { noteId: input.noteId }),
	draft: readDraft(input)
});
export const readWidgetDataEdit = (
	input: AgentToolInput<'edit_widget_data'>
): AgentWidgetDataEditInput => ({
	...input,
	patch: jsonArgument(input.patch, jsonPatchSchema, 'patch')
});
export const readWidgetLayoutEdit = (
	input: AgentToolInput<'edit_widget_layout'>
): AgentWidgetLayoutEditInput => ({
	...input,
	patch: jsonArgument(input.patch, jsonPatchSchema, 'patch')
});
export const readMemoryProposal = (
	input: AgentToolInput<'propose_memory_change'>
): AgentMemoryProposalInput => {
	const { confidence, ...payload } = input;
	return {
		...memoryChangePayloadSchema.parse(payload),
		...(confidence !== undefined ? { confidence } : {})
	};
};
