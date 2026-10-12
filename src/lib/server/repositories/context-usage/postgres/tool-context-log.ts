import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { ConversationId } from '$lib/models/agent';
import {
	getNoteOutputSchema,
	grepOutputSchema,
	journalledCallSchema,
	listProjectMemoryOutputSchema,
	loadSkillOutputSchema,
	searchInputSchema,
	searchOutputSchema,
	sedOutputSchema,
	type ContextTouch,
	type EmptySearch,
	type LoggedConversation,
	type ToolContextLog
} from '$lib/models/context-usage';
import type { AgentPayload, AgentPayloadObject } from '$lib/models/agent/payload';
import type { ActorContext } from '$lib/models/identity';
import type { NoteId } from '$lib/models/notes';
import type { ProjectId } from '$lib/models/projects';
import type { DateTime } from '$lib/models/workspace';
import type { Database } from '$lib/server/db';
import * as schema from '$lib/server/db/schema/agent';
import type { ToolContextLogRepository } from '..';

/**
 * The tools whose results are context the agent read. Anything else the journal holds is
 * either a write, which is not context, or mechanism, which is not the user's.
 */
const contextTools = [
	'search',
	'search_note',
	'grep',
	'sed',
	'get_note',
	'load_skill',
	'list_project_memory'
] as const;

/** One call, its rows folded together: the archive writes the input and the output apart. */
interface Call {
	readonly conversationId: ConversationId;
	/** The journal position of the call's first row; touches carry it as their call order. */
	readonly ordinal: number;
	readonly name: string;
	readonly at: DateTime;
	readonly input?: AgentPayloadObject;
	readonly output?: AgentPayload;
	readonly status: string;
}

/** Statuses a call passes through before it settles. */
const inFlight = new Set(['running', 'approval_required']);

const projectFile = /^\/projects\/([^/]+)\/(notes|attachments)\/([^/.]+)(?:[./].*)?$/;

/** A virtual file path names its project and its record; any other path is not one of ours. */
const fileTouch = (path: string, call: Call): ContextTouch | undefined => {
	const match = projectFile.exec(path);
	if (!match) return undefined;
	return {
		kind: match[2] === 'notes' ? 'note' : 'attachment',
		id: match[3],
		projectId: match[1] as ProjectId,
		conversationId: call.conversationId,
		at: call.at,
		call: call.ordinal
	};
};

type Reading =
	| { readonly kind: 'touches'; readonly touches: readonly ContextTouch[] }
	| { readonly kind: 'empty-search'; readonly search: EmptySearch }
	| { readonly kind: 'unreadable' };

/**
 * One call counts once per item. A search returns passages, and several passages of one
 * file are still one look at it.
 */
const touches = (list: readonly (ContextTouch | undefined)[]): Reading => {
	const seen = new Map<string, ContextTouch>();
	for (const touch of list) if (touch) seen.set(`${touch.kind}:${touch.id}`, touch);
	return { kind: 'touches', touches: [...seen.values()] };
};

/** What one settled call read, parsed from the shape its tool produces. */
function readCall(call: Call): Reading {
	const of = { conversationId: call.conversationId, at: call.at, call: call.ordinal };
	switch (call.name) {
		case 'search':
		case 'search_note': {
			const hits = searchOutputSchema.safeParse(call.output);
			if (!hits.success) return { kind: 'unreadable' };
			if (hits.data.length === 0) {
				const input = searchInputSchema.safeParse(call.input);
				if (!input.success) return { kind: 'unreadable' };
				return {
					kind: 'empty-search',
					search: {
						query: input.data.query,
						...(input.data.projectId ? { projectId: input.data.projectId as ProjectId } : {}),
						...of
					}
				};
			}
			return touches(
				hits.data.map(({ source }) =>
					source.kind === 'note' || source.kind === 'attachment' || source.kind === 'memory'
						? { kind: source.kind, id: source.id, projectId: source.projectId as ProjectId, ...of }
						: undefined
				)
			);
		}
		case 'grep': {
			const result = grepOutputSchema.safeParse(call.output);
			if (!result.success) return { kind: 'unreadable' };
			if (result.data.kind === 'no_matches') return touches([]);
			return touches(result.data.matches.map((match) => fileTouch(match.path, call)));
		}
		case 'sed': {
			const result = sedOutputSchema.safeParse(call.output);
			return result.success ? touches([fileTouch(result.data.path, call)]) : { kind: 'unreadable' };
		}
		case 'get_note': {
			const result = getNoteOutputSchema.safeParse(call.output);
			return result.success
				? touches([fileTouch(result.data.body.file.path, call)])
				: { kind: 'unreadable' };
		}
		case 'load_skill': {
			const result = loadSkillOutputSchema.safeParse(call.output);
			return result.success
				? touches([
						{ kind: 'skill', id: result.data.noteId as NoteId, title: result.data.name, ...of }
					])
				: { kind: 'unreadable' };
		}
		case 'list_project_memory': {
			const result = listProjectMemoryOutputSchema.safeParse(call.output);
			return result.success
				? touches(
						result.data.entries.map((entry) => ({
							kind: 'memory' as const,
							id: entry.id,
							projectId: entry.projectId as ProjectId,
							...of
						}))
					)
				: { kind: 'unreadable' };
		}
		default:
			return { kind: 'unreadable' };
	}
}

export class ToolContextLogRecords implements ToolContextLogRepository {
	constructor(
		private readonly actor: ActorContext,
		private readonly database: Database
	) {}

	async read(): Promise<ToolContextLog> {
		const rows = await this.database
			.select({
				conversationId: schema.messages.conversationId,
				content: schema.messages.content,
				createdAt: schema.messages.createdAt,
				title: schema.conversations.title,
				contextProjectId: schema.conversations.contextProjectId
			})
			.from(schema.messages)
			.innerJoin(schema.conversations, eq(schema.conversations.id, schema.messages.conversationId))
			.where(
				and(
					eq(schema.conversations.userId, this.actor.userId),
					eq(schema.messages.role, 'tool'),
					inArray(sql<string>`${schema.messages.content}->>'name'`, [...contextTools])
				)
			)
			// Two calls can share a millisecond. The event cursor is one identity sequence across
			// every run, so it orders them; rows journalled without one fall back to their id,
			// which is stable but says nothing about which came first.
			.orderBy(
				asc(schema.messages.createdAt),
				sql`${schema.messages.eventCursor} asc nulls last`,
				asc(schema.messages.id)
			);

		const conversations = new Map<string, LoggedConversation>();
		const calls = new Map<string, Call>();
		let unreadableCalls = 0;
		rows.forEach((row, index) => {
			const conversationId = row.conversationId as ConversationId;
			if (!conversations.has(conversationId))
				conversations.set(conversationId, {
					id: conversationId,
					...(row.title ? { title: row.title } : {}),
					...(row.contextProjectId ? { projectId: row.contextProjectId as ProjectId } : {})
				});
			const parsed = journalledCallSchema.safeParse(row.content);
			if (!parsed.success) {
				unreadableCalls += 1;
				return;
			}
			const content = parsed.data;
			// A row with no call id cannot be paired, so it stands as its own call.
			const key = `${conversationId}:${content.callId ?? `row-${index}`}`;
			const earlier = calls.get(key);
			// The first row carries the arguments; the settled row repeats them as `{}`.
			const input =
				earlier?.input ??
				(content.input && Object.keys(content.input).length > 0 ? content.input : undefined);
			const output = content.output ?? earlier?.output;
			calls.set(key, {
				conversationId,
				ordinal: earlier?.ordinal ?? index,
				name: content.name,
				at: earlier?.at ?? (row.createdAt.toISOString() as DateTime),
				// A settled status wins whichever row arrives first: the two rows of one call can
				// share a timestamp, and ordering by it then says nothing about which came last.
				status: earlier && !inFlight.has(earlier.status) ? earlier.status : content.status,
				...(input ? { input } : {}),
				...(output !== undefined ? { output } : {})
			});
		});

		const found: ContextTouch[] = [];
		const emptySearches: EmptySearch[] = [];
		for (const call of calls.values()) {
			// Only a call that finished read anything; a failed or rejected one did not.
			if (call.status !== 'succeeded') continue;
			const reading = readCall(call);
			if (reading.kind === 'unreadable') unreadableCalls += 1;
			else if (reading.kind === 'empty-search') emptySearches.push(reading.search);
			else found.push(...reading.touches);
		}
		return {
			touches: found,
			emptySearches,
			conversations: [...conversations.values()],
			unreadableCalls
		};
	}
}
