import type {
	AgentEvent,
	AgentExecutionMode,
	AgentRunId,
	AgentRunSnapshot,
	AgentRunStatus,
	ConversationId,
	Message,
	RunAgentInput,
	StoredMessage
} from '$lib/models/agent';
import { isAgentPayloadObject } from '$lib/models/agent/payload';
import type { NoteId } from '$lib/models/notes';
import type { SuggestionView } from '$lib/models/suggestions';
import type {
	AgentRunClientStorage,
	AgentRunEventConnection,
	AgentRunTransport
} from '$lib/client/agent/runs/contracts';
import { RemoteAgentRunTransport } from '$lib/client/agent/runs/remote-transport';
import { SessionAgentRunStorage } from '$lib/client/agent/runs/session-storage';
import { refreshStale } from '$lib/client/knowledge-search/resource-queries';
import {
	matchToolActivity,
	mergeToolActivity,
	readJournalledTool,
	toolArguments,
	type ChatToolActivity
} from './chat-tools';
import { appContext } from './app-context.svelte';
import type { ChatHandoff } from './chat-handoff';
import type { SelectionChip } from './selection-chip';
import { SvelteSet } from 'svelte/reactivity';

export type { ChatToolActivity } from './chat-tools';
export type { SelectionChip } from './selection-chip';

const STORAGE_KEY_PREFIX = 'followthrough.agent.conversation';
const browser = typeof window !== 'undefined';

/**
 * Identifies one chat session for its whole life.
 *
 * Minted on the client, because a new chat has no `ConversationId` until the
 * server assigns one on first submit. Re-keying the session at that moment
 * would have to rewrite the registry entry, the storage keys, the tab id and
 * the URL mid-run, so the key is fixed and the conversation id is recorded
 * alongside it instead.
 */
export type ChatSessionKey = string;

export const mintChatSessionKey = (): ChatSessionKey => crypto.randomUUID();

/**
 * Bind a session key to an existing conversation before anything mounts it.
 *
 * Opening a saved diagram beside the conversation that produced it needs a chat
 * tab that already knows which conversation it shows, and the tab id carries only
 * the session key. The pairing goes where a session's conversation always lives —
 * session storage — so the pane adopts it in `initialize`, without this having to
 * build a store, hydrate it and tear it down just to write one field.
 */
export const rememberConversation = (
	sessionKey: ChatSessionKey,
	conversationId: ConversationId
): void => {
	if (!browser) return;
	const key = `${STORAGE_KEY_PREFIX}.${sessionKey}`;
	sessionStorage.setItem(key, JSON.stringify({ ...persistedConversation(key), conversationId }));
};
const activeStatuses: readonly AgentRunStatus[] = [
	'queued',
	'running',
	'awaiting_approval',
	'cancelling'
];

/**
 * A rejected submission is only worth a reconnect prompt when it might still
 * have landed. A 4xx is a decided answer: retrying reproduces it, so report
 * what the server said instead of blaming the connection.
 */
function rejectionMessage(error: unknown): string | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const { status, body, message } = error as {
		status?: unknown;
		body?: { message?: unknown };
		message?: unknown;
	};
	if (typeof status !== 'number' || status < 400 || status >= 500) return undefined;
	const text = typeof body?.message === 'string' ? body.message : message;
	return typeof text === 'string' && text.length > 0 ? text : 'That request was rejected.';
}

interface PersistedConversationChoices {
	conversationId?: ConversationId;
	modelOverride?: string | null;
	visionModelOverride?: string | null;
	executionModeOverride?: AgentExecutionMode;
}

type PersistedConversationResult =
	| { readonly kind: 'missing' }
	| { readonly kind: 'valid'; readonly choices: PersistedConversationChoices }
	| { readonly kind: 'corrupt'; readonly message: string };

const persistedConversationSchema = z.object({
	conversationId: z
		.string()
		.uuid()
		.transform((value) => value as ConversationId)
		.optional(),
	modelOverride: z.string().nullable().optional(),
	visionModelOverride: z.string().nullable().optional(),
	executionModeOverride: z.enum(['approval_required', 'auto_accept']).optional()
});

const persistedConversation = (key: string): PersistedConversationResult => {
	if (!browser) return { kind: 'missing' };
	const stored = sessionStorage.getItem(key);
	if (stored === null) return { kind: 'missing' };
	try {
		return { kind: 'valid', choices: persistedConversationSchema.parse(JSON.parse(stored)) };
	} catch (error) {
		return {
			kind: 'corrupt',
			message: error instanceof Error ? error.message : 'Saved conversation state is unreadable'
		};
	}
};

/**
 * A whole resource attached by name. Its `@Name` token in the prompt is the source of truth:
 * typing the token away detaches the chip, and removing the chip deletes the token.
 */
export interface ResourceChip {
	readonly kind: 'note' | 'skill' | 'folder';
	readonly id: NoteId;
	readonly name: string;
	/** Folders only: how many notes the tag stands for, shown before sending. */
	readonly noteCount?: number;
}

/**
 * The two kinds of attachment differ in what holds them on. A resource chip is held by its
 * token in the sentence; a selection chip has no sayable name, so it is held only by having
 * been pinned — and is let go only by being dismissed.
 */
export type ContextChip = ResourceChip | SelectionChip;

export type ChatPart =
	| { kind: 'text'; text: string }
	| { kind: 'image'; id: string; dataUrl: string; name: string }
	| { kind: 'reasoning'; text: string }
	| { kind: 'tool'; tool: ChatToolActivity }
	/**
	 * A journalled row the transcript reader could not reconstruct.
	 *
	 * It is a part rather than a seventh `ChatToolActivity` status because it is
	 * not a tool call: nothing is known about it except that a row was there and
	 * could not be read. Modelling it as a tool call is what forced the invented
	 * `name: 'tool'` — a machine name, shown to a user, for a tool nobody called —
	 * and it is what kept `ChatToolActivity.name` a `string` while every persisted
	 * tool name closed over the catalog.
	 *
	 * Still a visible part, for the reason the fake tool row was: the work was
	 * attempted, and dropping the row reports a turn that did less than it did.
	 */
	| { kind: 'unreadable'; reason: string };

export interface ChatEntry {
	readonly id: string;
	readonly role: 'user' | 'assistant';
	parts: ChatPart[];
	suggestions: SuggestionView[];
	status?:
		| 'queued'
		| 'waiting'
		| 'streaming'
		| 'awaiting_approval'
		| 'cancelling'
		| 'completed'
		| 'failed'
		| 'cancelled';
	runId?: AgentRunId;
	attempt?: number;
	error?: string;
	retryable?: boolean;
}

/** The prose of a turn, with tool activity left out. */
export const entryText = (entry: ChatEntry): string =>
	entry.parts
		.filter((part) => part.kind === 'text')
		.map((part) => part.text)
		.join('\n');

/** Every tool call of one turn, in call order — what the turn's activity summary reads. */
export const entryTools = (entry: ChatEntry): ChatToolActivity[] =>
	entry.parts.filter((part) => part.kind === 'tool').map((part) => part.tool);

/**
 * Restored journal content is untyped JSON: only re-emit images whose shape we
 * recognise, so a malformed record degrades to the text-only turn it was before.
 */
const restoredImages = (value: unknown): ChatPart[] => {
	if (!Array.isArray(value)) return [];
	return value
		.filter(
			(item): item is { id: string; dataUrl: string; name: string } =>
				isAgentPayloadObject(item) &&
				typeof item.id === 'string' &&
				typeof item.dataUrl === 'string' &&
				typeof item.name === 'string'
		)
		.map((item) => ({
			kind: 'image' as const,
			id: item.id,
			dataUrl: item.dataUrl,
			name: item.name
		}));
};

/**
 * The cause, and only the cause. It used to read "This change was never carried
 * out — the run ended before you answered", which said the same thing twice: the
 * block above it already states that nothing was applied, and to how many things.
 * What is left is the one fact this line is for.
 *
 * It also does not guess *why* the run ended. Stopping it is the common path and
 * a crash is not, but nothing here can tell them apart — and the journal's own
 * sentence, which can, is preferred over this whenever there is one.
 */
const ABANDONED_APPROVAL = 'The run ended before you answered.';

/**
 * A parked call is only still parked if its own run is still waiting. A conversation has at
 * most one active run, so anything else journalled `approval_required` belongs to a run that
 * died holding the question — and replaying it verbatim put a live Approve/Reject card back
 * on screen for a run that could never answer it. Approving it failed client-side only,
 * nothing was re-journalled, and the card returned on the next reload, for good.
 *
 * `failed` is already a status the thread renders — `toolDisclosure` leads with the failure —
 * so this needs no new state and no rewrite of the rows already stored that way.
 *
 * A row the reader cannot reconstruct is not one of these. It answers with the
 * `unreadable` part instead, because nothing is known about it except that it was
 * there: it has no name, no arguments, and no outcome to report.
 */
const restoredTool = (
	message: Message,
	awaitingRunId?: string
): ChatToolActivity | { readonly unreadable: string } => {
	const read = readJournalledTool(message.content, {
		...(message.runId ? { runId: message.runId } : {})
	});
	if (read.kind === 'unreadable')
		return {
			unreadable: `This tool call could not be read back from the transcript. ${read.reason}`
		};
	const { tool } = read;
	return tool.status === 'approval_required' && message.runId !== awaitingRunId
		? { ...tool, failure: ABANDONED_APPROVAL, status: 'failed' }
		: tool;
};

/** Where a message sat in its run's event stream. Messages without one keep their order. */
const cursorOf = (message: StoredMessage): number =>
	message.eventCursor === undefined ? Number.MAX_SAFE_INTEGER : Number(message.eventCursor);

const partsOfTurn = (messages: readonly StoredMessage[], awaitingRunId?: string): ChatPart[] => {
	const parts: ChatPart[] = [];
	// Sorted by cursor, because a turn's messages are not written in the order they happened:
	// tool activity is journalled as each call settles, while the agent's own output is
	// written when the run completes. Read back by insertion order, every turn looked like
	// all of the work followed by all of the words.
	for (const message of [...messages].sort((left, right) => cursorOf(left) - cursorOf(right))) {
		// A row whose stored content the server could not read. It keeps its place
		// in the turn — `eventCursor` is an ordinary column and survives — so the
		// reader sees where the gap is rather than a turn quietly missing a step.
		if (message.kind === 'unreadable') {
			parts.push({ kind: 'unreadable', reason: message.reason });
			continue;
		}
		if (message.role === 'tool') {
			const restored = restoredTool(message, awaitingRunId);
			if ('unreadable' in restored) parts.push({ kind: 'unreadable', reason: restored.unreadable });
			else applyToolActivity(parts, restored);
			continue;
		}
		const text = typeof message.content.text === 'string' ? message.content.text : '';
		if (!text) continue;
		parts.push(
			message.content.type === 'reasoning' ? { kind: 'reasoning', text } : { kind: 'text', text }
		);
	}
	return parts;
};

/**
 * A stored conversation, back as turns.
 *
 * One entry per turn rather than one per stored message: an assistant turn is now written as
 * several messages — a thought, a tool call, an answer — and each becoming its own entry
 * would caption the same turn "Agent" three times over.
 *
 * `awaitingRunId` is the run, if any, that is genuinely parked on an approval; see
 * `restoredTool` for why every other parked call is restored as abandoned.
 */
const restoreEntries = (
	messages: readonly StoredMessage[],
	awaitingRunId?: string
): ChatEntry[] => {
	const entries: ChatEntry[] = [];
	let turn: { runId?: string; messages: StoredMessage[] } | undefined;

	const flush = (): void => {
		if (!turn?.messages.length) return;
		const first = turn.messages[0] as StoredMessage;
		entries.push({
			id: first.id,
			role: 'assistant',
			parts: partsOfTurn(turn.messages, awaitingRunId),
			suggestions: [],
			status: 'completed',
			...(turn.runId ? { runId: turn.runId as ChatEntry['runId'] } : {})
		});
		turn = undefined;
	};

	for (const message of messages) {
		if (message.role === 'user') {
			flush();
			// The user's own turn, whether or not its content read: an unreadable
			// prompt is still a turn the reader took, and dropping it would leave
			// the agent's reply answering nothing.
			const parts: ChatPart[] =
				message.kind === 'unreadable'
					? [{ kind: 'unreadable', reason: message.reason }]
					: [
							...(typeof message.content.text === 'string' && message.content.text
								? [{ kind: 'text' as const, text: message.content.text }]
								: []),
							...restoredImages(message.content.images)
						];
			entries.push({
				id: message.id,
				role: 'user',
				parts,
				suggestions: [],
				status: 'completed',
				...(message.runId ? { runId: message.runId } : {})
			});
			continue;
		}
		// A run boundary starts a new turn; messages without one join whatever is open, which
		// is how conversations written before runs were journalled still read as turns.
		if (turn && message.runId && turn.runId && message.runId !== turn.runId) flush();
		if (!turn) turn = { ...(message.runId ? { runId: message.runId } : {}), messages: [] };
		else if (!turn.runId && message.runId) turn.runId = message.runId;
		turn.messages.push(message);
	}
	flush();
	return entries;
};

/**
 * Fold a tool event into the row that already holds its call, or open a new row.
 *
 * The *part* is what changes, not the activity inside it. A settled call is a
 * different arm of `ChatToolActivity` from a running one, so the row becomes a
 * new value rather than being edited into place — and writing it back through
 * the part is what makes it stick, since `entryTools` builds a fresh array and
 * assigning into that would update nothing.
 */
const applyToolActivity = (parts: ChatPart[], incoming: ChatToolActivity): void => {
	const toolParts = parts.filter((part) => part.kind === 'tool');
	const index = matchToolActivity(
		toolParts.map((part) => part.tool),
		incoming
	);
	if (index === undefined) {
		parts.push({ kind: 'tool', tool: incoming });
		return;
	}
	const part = toolParts[index]!;
	part.tool = mergeToolActivity(part.tool, incoming);
};

/** What a row keeps across a change of state: which call it is, and what it was asked. */
const toolIdentity = (tool: ChatToolActivity) => ({
	callId: tool.callId,
	name: tool.name,
	arguments: tool.arguments,
	...(tool.runId ? { runId: tool.runId } : {})
});

const appendText = (entry: ChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'text') last.text += text;
	else entry.parts.push({ kind: 'text', text });
};

const appendReasoning = (entry: ChatEntry, text: string): void => {
	const last = entry.parts.at(-1);
	if (last?.kind === 'reasoning') last.text += text;
	else entry.parts.push({ kind: 'reasoning', text });
};

export class ChatStore {
	entries = $state<ChatEntry[]>([]);
	/** True while a conversation's transcript is being fetched, so the thread can show a skeleton. */
	loading = $state(false);
	conversationId = $state<ConversationId | undefined>(undefined);
	modelOverride = $state<string | null>(null);
	visionModelOverride = $state<string | null>(null);
	executionModeOverride = $state<AgentExecutionMode>('approval_required');
	initialized = $state(false);
	/** True while a decision is in flight, so a bundle cannot be answered twice. */
	deciding = $state(false);
	chips = $state<ContextChip[]>([]);
	autoChipDismissedFor = $state<NoteId | undefined>(undefined);
	/**
	 * The one highlighted passage the user has waved off, by chip id. Not cleared on send:
	 * the text stays highlighted after a message goes out, and re-attaching a passage
	 * somebody explicitly detached would undo their decision behind their back.
	 */
	dismissedSelectionId = $state<string | undefined>(undefined);
	/**
	 * A prompt written by an invocation point elsewhere in the app, waiting for the
	 * composer to pick it up. `chat-handoff` covers the case where the panel has yet
	 * to mount; this covers the docked panel, which is mounted already and so never
	 * runs the `onMount` that consumes the handoff.
	 */
	staged = $state<ChatHandoff | undefined>(undefined);
	runId = $state<AgentRunId | undefined>(undefined);
	runStatus = $state<AgentRunStatus | undefined>(undefined);
	cursor = $state('0');
	attempt = $state(0);
	connection = $state<'detached' | 'connected' | 'reconnecting' | 'offline'>('detached');
	persistenceError = $state<string | undefined>(undefined);
	private hydratedConversationId?: ConversationId;
	private eventConnection?: AgentRunEventConnection;
	private activeReply?: ChatEntry;
	private readonly storageKey: string;

	constructor(
		readonly sessionKey: ChatSessionKey,
		private readonly transport: AgentRunTransport = new RemoteAgentRunTransport(),
		private readonly storage: AgentRunClientStorage = new SessionAgentRunStorage(sessionKey)
	) {
		this.storageKey = `${STORAGE_KEY_PREFIX}.${sessionKey}`;
	}

	get isStreaming(): boolean {
		return this.runStatus !== undefined && activeStatuses.includes(this.runStatus);
	}

	initialize(defaultMode: AgentExecutionMode): void {
		if (this.initialized) return;
		const persisted = persistedConversation(this.storageKey);
		if (persisted.kind === 'corrupt')
			this.persistenceError = `Saved chat settings were corrupt. Reset them to continue safely. ${persisted.message}`;
		const choices = persisted.kind === 'valid' ? persisted.choices : {};
		this.conversationId = choices.conversationId;
		this.modelOverride = choices.modelOverride ?? null;
		this.visionModelOverride = choices.visionModelOverride ?? null;
		this.executionModeOverride = choices.executionModeOverride ?? defaultMode;
		this.initialized = true;
	}

	/**
	 * Write a prompt into the composer without sending it. The sentence is the point:
	 * the user reads what the agent is about to be asked, edits it if they want, and
	 * presses Enter. Nothing runs until they do.
	 */
	stage(request: ChatHandoff): void {
		this.staged = request;
	}

	async hydrate(): Promise<void> {
		if (!browser || !this.conversationId || this.hydratedConversationId === this.conversationId)
			return;
		const conversationId = this.conversationId;
		this.loading = true;
		try {
			const data = await this.transport.getSession(conversationId);
			// The latest run is the only one that can still be waiting on the user: a
			// conversation runs one at a time, so nothing older holds a live question.
			const awaiting =
				data.latestRun?.run.status === 'awaiting_approval' ? data.latestRun.run.id : undefined;
			this.entries = restoreEntries(data.messages, awaiting);
			if (data.latestRun) {
				const snapshot = data.latestRun;
				let reply = this.entries.findLast(
					(entry) => entry.role === 'assistant' && entry.runId === snapshot.run.id
				);
				if (!reply && snapshot.run.status !== 'completed') {
					this.entries.push({
						id: crypto.randomUUID(),
						role: 'assistant',
						parts: [],
						suggestions: [],
						status: 'waiting',
						runId: snapshot.run.id
					});
					// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
					reply = this.entries[this.entries.length - 1];
				}
				if (reply) {
					this.activeReply = reply;
					this.reconcileSnapshot(reply, snapshot);
				}
				if (activeStatuses.includes(snapshot.run.status) && reply) {
					const stored = this.storage.load();
					if (stored.kind === 'corrupt')
						this.persistenceError = `The saved run resume marker was corrupt. The run is being replayed from its durable server record. ${stored.message}`;
					const saved = stored.kind === 'valid' ? stored.state : undefined;
					const resumeCursor = saved?.runId === snapshot.run.id ? saved.cursor : '0';
					const resumeAttempt = saved?.runId === snapshot.run.id ? saved.attempt : 0;
					this.attach(reply, snapshot.run.id, resumeCursor, resumeAttempt);
				}
			}
			this.hydratedConversationId = conversationId;
			// audit-allow: silent-catch — hydration failure moves the store to an explicit reconnecting/offline state rather than an empty chat.
		} catch {
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		} finally {
			this.loading = false;
		}
	}

	resetCorruptPersistence(): void {
		if (browser) sessionStorage.removeItem(this.storageKey);
		this.storage.clear();
		this.persistenceError = undefined;
	}

	persistConversationChoices(): void {
		if (!browser || !this.initialized) return;
		sessionStorage.setItem(
			this.storageKey,
			JSON.stringify({
				conversationId: this.conversationId,
				modelOverride: this.modelOverride,
				visionModelOverride: this.visionModelOverride,
				executionModeOverride: this.executionModeOverride
			})
		);
	}

	addChip(chip: ContextChip): void {
		if (!this.chips.some((known) => known.kind === chip.kind && known.id === chip.id))
			this.chips = [...this.chips, chip];
	}

	removeChip(chip: ContextChip): void {
		this.chips = this.chips.filter((known) => known.kind !== chip.kind || known.id !== chip.id);
	}

	/**
	 * Drop a suggestion card once it has been accepted or rejected. The note tray
	 * does this through its own registry; a decision made from the panel with no
	 * note open has to say so here, or the card outlives the thing it proposed.
	 */
	resolveSuggestion(suggestionId: string): void {
		for (const entry of this.entries)
			entry.suggestions = entry.suggestions.filter((view) => view.suggestion.id !== suggestionId);
	}

	async send(
		input: Omit<RunAgentInput, 'conversationId'> & { readonly retryUserOrdinal?: number }
	): Promise<void> {
		if (this.isStreaming) return;
		const requestId = crypto.randomUUID();
		const noteChips = this.chips
			.filter((chip): chip is ResourceChip => chip.kind === 'note')
			.map((chip) => chip.id);
		const skillChips = this.chips.filter((chip) => chip.kind === 'skill').map((chip) => chip.name);
		// The singular `selection` is derived here and nowhere else. It stays on the wire
		// because the selection-bound tools (extract_promises, relate_selection, …) are offered
		// only when the run input has one; the plural field is what the prompt actually quotes.
		//
		// Pinned passages come first, so a pin takes that singular slot ahead of the passage
		// merely highlighted at the moment of sending: pinning is deliberate, highlighting is
		// incidental, and the tools should act on the one the user meant.
		const selections = [
			...this.chips
				.filter((chip): chip is SelectionChip => chip.kind === 'selection')
				.map((chip) => chip.selection),
			...(input.selections ?? [])
		];
		this.storage.save({ cursor: '0', attempt: 0, pendingRequestId: requestId });
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'user',
			parts: [
				...(input.prompt ? [{ kind: 'text' as const, text: input.prompt }] : []),
				...(input.images ?? []).map((image) => ({
					kind: 'image' as const,
					id: image.id,
					dataUrl: image.dataUrl,
					name: image.name
				}))
			],
			suggestions: [],
			status: 'completed'
		});
		this.entries.push({
			id: crypto.randomUUID(),
			role: 'assistant',
			parts: [],
			suggestions: [],
			status: 'queued'
		});
		// Re-read through the $state proxy: mutating the raw pushed object bypasses reactivity.
		const reply = this.entries[this.entries.length - 1]!;
		this.activeReply = reply;
		this.runStatus = 'queued';
		try {
			const contextSnapshot = appContext.capture();
			const receipt = await this.transport.submit({
				requestId,
				input: input.prompt,
				...(input.images?.length ? { images: input.images } : {}),
				// Deliberately not echoed into `entries` above: the transcript shows
				// what the user sent, and this is context the app supplied.
				...(input.contextImages?.length ? { contextImages: input.contextImages } : {}),
				...(this.conversationId ? { conversationId: this.conversationId } : {}),
				model: this.modelOverride,
				visionModel: this.visionModelOverride,
				mode: this.executionModeOverride,
				appContext: contextSnapshot,
				...(input.projectId ? { projectId: input.projectId } : {}),
				...(input.noteId ? { noteId: input.noteId } : {}),
				...(selections.length ? { selections, selection: selections[0] } : {}),
				contextNoteIds: [...new SvelteSet([...(input.contextNoteIds ?? []), ...noteChips])],
				requestedSkillNames: [
					...new SvelteSet([...(input.requestedSkillNames ?? []), ...skillChips])
				],
				...(input.requestedSkillNoteIds
					? { requestedSkillNoteIds: input.requestedSkillNoteIds }
					: {}),
				...(input.retryUserOrdinal !== undefined
					? { retryUserOrdinal: input.retryUserOrdinal }
					: {})
			});
			this.conversationId = receipt.conversationId;
			reply.runId = receipt.runId;
			this.runStatus = receipt.status;
			this.persistConversationChoices();
			this.attach(reply, receipt.runId, receipt.latestCursor, 0);
			// audit-allow: silent-catch — submission failure is attached to the pending reply and connection state exposes uncertainty.
		} catch (error) {
			const rejected = rejectionMessage(error);
			reply.error = rejected ?? 'Submission could not be confirmed. Reconnect to check its status.';
			if (!rejected) this.connection = navigator.onLine ? 'reconnecting' : 'offline';
			this.runStatus = undefined;
		}
	}

	async stop(): Promise<void> {
		if (!this.runId) return;
		const runId = this.runId;
		const reply = this.activeReply;
		if (reply) reply.status = 'cancelling';
		this.runStatus = 'cancelling';
		try {
			const snapshot = await this.transport.cancel(runId);
			if (reply) this.reconcileSnapshot(reply, snapshot);
			// audit-allow: silent-catch — an unconfirmed cancel triggers an explicit server reconciliation attempt.
		} catch {
			// The cancel may still have landed server-side, so ask before giving up:
			// `cancelling` gates the composer and must never be a resting state here.
			try {
				const snapshot = await this.transport.get(runId);
				if (reply) this.reconcileSnapshot(reply, snapshot);
				// audit-allow: silent-catch — failed reconciliation marks cancellation unconfirmed instead of claiming success.
			} catch {
				if (reply) reply.error = 'Cancellation has not been confirmed yet.';
				this.runStatus = undefined;
			}
		}
	}

	/**
	 * The user turn a reply answers, so an answer can be asked again with the
	 * question that produced it.
	 */
	precedingUserEntry(reply: ChatEntry): ChatEntry | undefined {
		const index = this.entries.indexOf(reply);
		if (index < 0) return undefined;
		return this.entries.slice(0, index).findLast((entry) => entry.role === 'user');
	}

	/**
	 * One-based position of a user turn among the user turns. This, rather than an
	 * id, is how the server addresses the turn to rewind to: an optimistically sent
	 * entry carries a client uuid, not the message id the server assigned it.
	 */
	private userOrdinalOf(entry: ChatEntry): number | undefined {
		let ordinal = 0;
		for (const candidate of this.entries) {
			if (candidate.role !== 'user') continue;
			ordinal += 1;
			if (candidate === entry) return ordinal;
		}
		return undefined;
	}

	/**
	 * Replace a question and everything it led to. The turn and its successors leave
	 * the transcript here; the run carries the ordinal so the server discards the
	 * same span from its own record before the agent replays the conversation.
	 * Returns false when the resubmission could not be started at all.
	 */
	async resubmit(entry: ChatEntry, input: Omit<RunAgentInput, 'conversationId'>): Promise<boolean> {
		if (this.isStreaming || entry.role !== 'user' || !input.prompt.trim()) return false;
		const ordinal = this.userOrdinalOf(entry);
		const index = this.entries.indexOf(entry);
		if (ordinal === undefined || index < 0) return false;
		this.entries = this.entries.slice(0, index);
		await this.send({ ...input, retryUserOrdinal: ordinal });
		return true;
	}

	async retry(reply: ChatEntry): Promise<void> {
		if (this.isStreaming || !reply.runId) return;
		const receipt = await this.transport.retry(reply.runId, crypto.randomUUID());
		reply.status = 'queued';
		reply.error = undefined;
		reply.retryable = false;
		this.activeReply = reply;
		this.runStatus = receipt.status;
		this.attach(reply, receipt.runId, receipt.latestCursor, 0);
	}

	decide(reply: ChatEntry, tool: ChatToolActivity, decision: 'approve' | 'reject'): Promise<void> {
		return this.decideAll(reply, [tool], decision);
	}

	/**
	 * Answers every parked call in one request. Deciding them one at a time would requeue and
	 * resume the run between each, so the second decision would arrive at a run that is no
	 * longer awaiting approval and be rejected.
	 */
	async decideAll(
		reply: ChatEntry,
		tools: readonly ChatToolActivity[],
		decision: 'approve' | 'reject'
	): Promise<void> {
		if (this.deciding) return;
		const runId = tools.find((tool) => tool.runId)?.runId;
		// A call the run could not name is a call the server cannot match a decision
		// to, so it is not sent. Parked approvals always carry one.
		const callIds = tools
			.map((tool) => tool.callId)
			.filter((callId): callId is string => callId !== undefined);
		if (!runId || callIds.length === 0) return;
		this.deciding = true;
		try {
			const snapshot = await this.transport.decideMany({
				runId: runId as AgentRunId,
				callIds,
				decision
			});
			// Replaced, not edited: an approved call is `running` and a refused one is
			// `rejected`, and neither is the arm the parked row was in.
			for (const tool of tools)
				applyToolActivity(reply.parts, {
					...toolIdentity(tool),
					status: decision === 'approve' ? 'running' : 'rejected'
				});
			this.reconcileSnapshot(reply, snapshot);
			this.attach(reply, snapshot.run.id, this.cursor, this.attempt);
			// audit-allow: silent-catch — every affected tool is marked failed so the decision is never presented as applied.
		} catch {
			for (const tool of tools)
				applyToolActivity(reply.parts, {
					...toolIdentity(tool),
					failure: 'The decision could not be applied.',
					status: 'failed'
				});
		} finally {
			this.deciding = false;
		}
	}

	detach(): void {
		this.eventConnection?.close();
		this.eventConnection = undefined;
		this.connection = 'detached';
	}

	clear(): void {
		this.detach();
		this.entries = [];
		this.loading = false;
		this.conversationId = undefined;
		this.modelOverride = null;
		this.visionModelOverride = null;
		this.chips = [];
		this.autoChipDismissedFor = undefined;
		this.dismissedSelectionId = undefined;
		this.hydratedConversationId = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.cursor = '0';
		this.attempt = 0;
		this.activeReply = undefined;
		this.storage.clear();
		if (browser) sessionStorage.removeItem(this.storageKey);
	}

	async switchToConversation(id: ConversationId): Promise<void> {
		if (this.conversationId === id) return;
		this.detach();
		this.entries = [];
		this.conversationId = id;
		this.hydratedConversationId = undefined;
		this.chips = [];
		this.autoChipDismissedFor = undefined;
		this.dismissedSelectionId = undefined;
		this.runId = undefined;
		this.runStatus = undefined;
		this.activeReply = undefined;
		this.persistConversationChoices();
		await this.hydrate();
	}

	private attach(reply: ChatEntry, runId: AgentRunId, cursor: string, attempt: number): void {
		this.detach();
		this.activeReply = reply;
		this.runId = runId;
		this.cursor = cursor;
		this.attempt = attempt;
		this.connection = 'reconnecting';
		this.storage.save({ runId, cursor, attempt });
		this.eventConnection = this.transport.openEvents({
			runId,
			after: cursor,
			onOpen: () => (this.connection = 'connected'),
			onEvent: (record) => {
				if (BigInt(record.cursor) <= BigInt(this.cursor)) return;
				this.cursor = record.cursor;
				this.storage.save({ runId, cursor: this.cursor, attempt: this.attempt });
				this.apply(reply, record.event, record.attempt);
			},
			onError: () => void this.reconcileAfterDisconnect(reply, runId)
		});
	}

	private async reconcileAfterDisconnect(reply: ChatEntry, runId: AgentRunId): Promise<void> {
		this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		try {
			const snapshot = await this.transport.get(runId);
			this.reconcileSnapshot(reply, snapshot);
			if (!activeStatuses.includes(snapshot.run.status)) this.detach();
			// audit-allow: silent-catch — refresh failure moves the connection into its visible reconnecting/offline state.
		} catch {
			this.connection = navigator.onLine ? 'reconnecting' : 'offline';
		}
	}

	private reconcileSnapshot(reply: ChatEntry, snapshot: AgentRunSnapshot): void {
		this.runId = snapshot.run.id;
		this.runStatus = snapshot.run.status;
		reply.runId = snapshot.run.id;
		if (snapshot.run.status === 'queued') reply.status = 'queued';
		else if (snapshot.run.status === 'running') reply.status = 'streaming';
		else if (snapshot.run.status === 'awaiting_approval') {
			reply.status = 'awaiting_approval';
			for (const pending of snapshot.pendingDecisions)
				applyToolActivity(reply.parts, {
					callId: pending.callId,
					name: pending.toolName,
					arguments: toolArguments(pending.arguments),
					runId: snapshot.run.id,
					status: 'approval_required'
				});
		} else if (snapshot.run.status === 'cancelling') reply.status = 'cancelling';
		else if (snapshot.run.status === 'completed') reply.status = 'completed';
		else if (snapshot.run.status === 'cancelled') {
			reply.status = 'cancelled';
			reply.error = 'Generation stopped';
		} else {
			reply.status = 'failed';
			reply.error = snapshot.run.failure ?? 'The agent run failed.';
			reply.retryable = true;
		}
	}

	private apply(reply: ChatEntry, event: AgentEvent, attempt: number): void {
		if (event.type === 'run_queued') {
			this.runStatus = 'queued';
			reply.status = 'queued';
			if (event.reason === 'retry') reply.error = 'Retrying after a temporary provider failure.';
		} else if (event.type === 'run_started') {
			if (reply.runId !== event.runId || event.attempt > (reply.attempt ?? 0)) {
				reply.parts = [];
				reply.suggestions = [];
				reply.error = undefined;
			}
			reply.runId = event.runId;
			reply.attempt = event.attempt;
			this.attempt = event.attempt;
			this.runStatus = 'running';
			reply.status = 'waiting';
		} else if (event.type === 'text_delta') {
			reply.status = 'streaming';
			appendText(reply, event.text);
		} else if (event.type === 'reasoning_delta') {
			reply.status = 'streaming';
			appendReasoning(reply, event.text);
		} else if (event.type === 'tool_started') {
			reply.status = 'streaming';
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: toolArguments(event.arguments),
				status: 'running'
			});
		} else if (event.type === 'tool_succeeded') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				...(event.output === undefined ? {} : { output: event.output }),
				status: 'succeeded'
			});
		} else if (event.type === 'tool_reported_failure') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				output: event.output,
				status: 'reported_failure'
			});
		} else if (event.type === 'tool_failed') {
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: {},
				failure: event.failure,
				status: 'failed'
			});
		} else if (event.type === 'approval_required') {
			this.runStatus = 'awaiting_approval';
			reply.status = 'awaiting_approval';
			applyToolActivity(reply.parts, {
				callId: event.callId,
				name: event.name,
				arguments: toolArguments(event.arguments),
				runId: event.runId,
				status: 'approval_required'
			});
		} else if (event.type === 'failed') {
			reply.status = event.retryable ? 'queued' : 'failed';
			reply.runId = event.runId ?? reply.runId;
			reply.error = event.message;
			reply.retryable = event.retryable;
			if (!event.retryable) this.runStatus = 'failed';
		} else if (event.type === 'cancelled') {
			reply.status = 'cancelled';
			this.runStatus = 'cancelled';
			reply.error = event.message;
			this.detach();
		} else if (event.type === 'completed') {
			reply.status = 'completed';
			this.runStatus = 'completed';
			this.conversationId = event.conversationId;
			this.detach();
		} else if (event.type === 'resources_stale') refreshStale(event.resources);
		this.storage.save({
			...(this.runId ? { runId: this.runId } : {}),
			cursor: this.cursor,
			attempt
		});
	}
}
import { z } from 'zod';
