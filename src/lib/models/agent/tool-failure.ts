import { z } from 'zod';

/**
 * A tool result that reports its own failure instead of throwing.
 *
 * Some tools cannot throw. `edit_note` is the reason: a thrown error is
 * stringified into a bare message, which strips the occurrence counts and
 * nearest matches the model needs to correct itself on the next attempt. So it
 * returns the failure as a value, with the detail attached (ADR 0035).
 *
 * That left a result whose success was decided by whether a key was present.
 * Three readers each worked it out by hand and none agreed: the conversation
 * buffer matched a serialized prefix, the run's reasoning parser checked
 * `'failure' in output`, and the chat transcript checked nothing at all — so an
 * `edit_note` call that applied no edits rendered as "Edited note" in ordinary
 * colour and the user could not tell the work had not happened, which is what
 * ADR 0015 exists to prevent.
 *
 * `failure` is first in the object and must stay first: {@link FAILURE_PREFIX}
 * lets the conversation buffer recognise a failed call without parsing it.
 */
export interface ToolFailure {
	readonly failure: string;
}

/** How a failed result looks once serialized, so it can be spotted without parsing. */
export const FAILURE_PREFIX = '{"failure":';

/**
 * The detail a tool attaches to a failure: JSON, with keys open. Declared here
 * rather than borrowed from `payload.ts` because a model file may not import a
 * sibling — only the barrel may — and this shape is exactly the slice of
 * `AgentPayloadObject` a failure detail is.
 */
export type FailureDetail =
	| string
	| number
	| boolean
	| null
	| readonly FailureDetail[]
	| { readonly [key: string]: FailureDetail };

/**
 * Build a failed result. `detail` is whatever the tool can say about it — the
 * problems a patch hit, the recovery advice an adapter can give — spread after
 * `failure` so the key order the prefix depends on holds.
 */
export const toolFailure = (
	failure: string,
	detail?: { readonly [key: string]: FailureDetail }
): ToolFailure => ({ failure, ...detail });

/**
 * A tool result reaches a reader two ways: as the object the tool returned, or
 * as the JSON text the runner serialized it to. Both are the same value, so both
 * are one schema rather than a branch each caller writes for itself.
 */
const failed = z.object({ failure: z.string().trim().min(1) });

// Only text we produced is parsed. The prefix is the guard: it matches exactly what
// `JSON.stringify` wrote for a `toolFailure`, so there is no malformed-JSON case to
// invent an answer for, and any string that is not one falls out here rather than
// reaching a parse at all. If our own serialization ever is malformed, that is
// corruption and it should be loud.
const serialized = z
	.string()
	.refine((text) => text.trimStart().startsWith(FAILURE_PREFIX))
	.transform((text) => JSON.parse(text) as unknown);

const toolResult = z.union([failed, serialized.pipe(failed)]);

/** The failure a tool result carries, or `undefined` when it carries none. */
// audit-allow: no-unknown-type — Catalog section 3 exemplar: a schema at the point of use over an unread tool output.
export const readToolFailure = (output: unknown): string | undefined =>
	toolResult.safeParse(output).data?.failure;
