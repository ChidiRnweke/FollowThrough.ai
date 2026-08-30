import { z } from 'zod';
import type { AgentPayload } from '$lib/models/agent/payload';

/**
 * The fields of a tool result that a transcript row can act on.
 *
 * Three surfaces read a result to answer two questions — what did this call act
 * on, and what is it called — and all three used to ask by indexing: `output.noteId`,
 * `output.title`, `output.id`. Indexing a JSON object type-checks for any key,
 * so a typo compiled and a renamed field went silently missing. Naming the
 * fields once puts them under the compiler.
 *
 * These are optional because the payload is a foreign shape being read at a
 * boundary, which is where optionality is honest: `create_todos` has no
 * `noteId`, `search` has no `id`. They are not a bag standing in for a state —
 * that is what {@link ChatToolActivity}'s arms are for.
 *
 * It is deliberately not one schema per tool. Which fields a given tool returns
 * is the tool contract map's job (TN-30), and until that exists a per-tool
 * schema here would be a guess maintained in the wrong file. What is true today
 * and independent of it: these are the field names the rows read, and reading
 * one that is absent or not a string yields nothing rather than a wrong value.
 */
export interface ToolResultFields {
	readonly noteId?: string;
	readonly todoId?: string;
	readonly diagramId?: string;
	readonly projectId?: string;
	readonly entryId?: string;
	readonly artifactId?: string;
	readonly suggestionId?: string;
	readonly id?: string;
	readonly title?: string;
	readonly name?: string;
	readonly content?: string;
	/** `edit_note` and `save_note` answer with the revision they wrote. */
	readonly currentRevision?: number;
}

/** Blank is absent. A row titled `""` is a row with no title, not a row named nothing. */
const label = z
	.string()
	.transform((value) => value.trim())
	.refine((value) => value.length > 0)
	.optional()
	.catch(undefined);

const revision = z.number().int().nonnegative().optional().catch(undefined);

/**
 * `.catch(undefined)` per field rather than a `safeParse` over the whole object.
 * A result carrying `{ noteId: 'abc', title: 42 }` still names a note; failing
 * the object whole would drop the id because a different field was the wrong
 * type, which is a worse answer than the one the reader asked for.
 */
const fieldsSchema = z.object({
	noteId: label,
	todoId: label,
	diagramId: label,
	projectId: label,
	entryId: label,
	artifactId: label,
	suggestionId: label,
	id: label,
	title: label,
	name: label,
	content: label,
	currentRevision: revision
});

const NONE: ToolResultFields = {};

/** What the result names, as far as it names anything a row can use. */
export const toolResultFields = (output: AgentPayload | undefined): ToolResultFields => {
	if (output === undefined || typeof output !== 'object' || output === null) return NONE;
	if (Array.isArray(output)) return NONE;
	return fieldsSchema.parse(output);
};
