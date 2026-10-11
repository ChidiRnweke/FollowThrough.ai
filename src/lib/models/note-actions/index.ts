import { z } from 'zod';
import { suggestionSchema } from '$lib/models/suggestions';
import { todoRecordSchema } from '$lib/models/workspace-records';
import type { AgentEvent, StoredAgentRunEventRecord } from '$lib/models/agent';

/** Typed results crossing the note action event boundary. */
export const noteActionResultSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('promises'),
		output: z.object({
			suggestions: z.array(suggestionSchema),
			createdTodos: z.array(todoRecordSchema)
		})
	}),
	z.object({
		action: z.literal('relate'),
		output: z.object({ suggestions: z.array(suggestionSchema) })
	}),
	z.object({
		action: z.literal('reference'),
		output: z.discriminatedUnion('outcome', [
			z.object({ outcome: z.literal('found'), suggestions: z.array(suggestionSchema) }),
			z.object({ outcome: z.literal('nothing_relevant') })
		])
	}),
	z.object({ action: z.literal('diagram'), output: z.object({ suggestion: suggestionSchema }) }),
	z.object({ action: z.literal('convert'), output: z.object({ suggestion: suggestionSchema }) }),
	z.object({
		action: z.literal('revise'),
		output: z.object({ source: z.string(), title: z.string().optional() })
	})
]);
export type NoteActionResult = z.infer<typeof noteActionResultSchema>;
export type NoteActionEvent =
	| Exclude<AgentEvent, { readonly type: 'workflow_result' }>
	| { readonly type: 'workflow_result'; readonly result: NoteActionResult };
export type NoteActionEventRecord =
	| Extract<StoredAgentRunEventRecord, { readonly kind: 'unreadable' }>
	| (Omit<Extract<StoredAgentRunEventRecord, { readonly kind: 'readable' }>, 'event'> & {
			readonly event: NoteActionEvent;
	  });
